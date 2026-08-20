const express = require('express');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const { protect, kycSubmitted, kycVerified } = require('../middleware/auth');
const { round2, debit, primaryAccount } = require('../utils/banking');
const { getSettings } = require('../config/settings');
const emails = require('../utils/emails');

/* ============================================================
   Deposits and withdrawals — two routers, one file, because the
   rules they share (account resolution, minimums, the no-overdraft
   guarantee) are easier to keep honest side by side.
   ============================================================ */

const deposits = express.Router();
const withdrawals = express.Router();

/* Proof images travel as base64 data URLs in the JSON body. Base64 inflates
   by ~4/3, so this caps the original file at roughly 4MB — comfortably inside
   the 8mb express.json limit in server.js. */
const MAX_PROOF_CHARS = 5_600_000;

/* ------------------------------------------------------------
   Withdrawal destinations. Two rails only: crypto to a wallet the
   client names on the request, or a wire to their bank. The fields
   below are exactly what the desk needs to execute the payout, so
   every one of them is required — a wire that is missing a SWIFT or
   a routing number is a wire that bounces days later.
   ------------------------------------------------------------ */
const WIRE_FIELDS = [
  ['accountName', 'Account name'],
  ['bankName', 'Bank name'],
  ['accountNumber', 'Account number'],
  ['swiftCode', 'Swift code'],
  ['homeAddress', 'Home address'],
  ['routingNumber', 'Routing number'],
  ['bankAddress', 'Bank address'],
];

const trim = (v, max) => String(v ?? '').trim().slice(0, max);

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/* Validate the destination block and return everything the ledger row,
   the email and the reviewer need. Throws a 400 with the field name the
   client still has to fill in. */
function resolveDestination(body) {
  const method = body.method === 'wire' ? 'wire' : body.method === 'crypto' ? 'crypto' : null;
  if (!method) throw badRequest('Choose whether to withdraw by crypto or by wire.');

  if (method === 'crypto') {
    const walletType = trim(body.walletType, 40);
    const address = trim(body.walletAddress, 140);
    if (!walletType) throw badRequest('Choose the crypto wallet type to be paid in.');
    if (!address) throw badRequest('Enter the wallet address to be paid to.');
    if (address.length < 20) throw badRequest('That does not look like a valid wallet address.');
    return {
      payoutMethod: 'crypto',
      payoutDetails: { walletType, address },
      method: `Crypto · ${walletType}`,
      destination: address,
      counterparty: null,
      detail: `${walletType} · ${address.slice(0, 6)}…${address.slice(-6)}`,
    };
  }

  const wire = {};
  for (const [key, label] of WIRE_FIELDS) {
    const value = trim(body[key], key.endsWith('Address') ? 240 : 120);
    if (!value) throw badRequest(`${label} is required for a wire withdrawal.`);
    wire[key] = value;
  }
  return {
    payoutMethod: 'wire',
    payoutDetails: wire,
    method: 'Wire transfer',
    destination: wire.accountNumber,
    counterparty: wire.accountName,
    detail: `${wire.bankName} · ····${wire.accountNumber.slice(-4)}`,
  };
}

/* Resolve the account a movement applies to: the one named in the body,
   or the client's checking account. Never an investment account — mandates
   are funded through /api/investments so the mandate row is always written. */
async function resolveAccount(user, accountId) {
  const account = accountId
    ? await Account.findOne({ _id: accountId, user: user._id })
    : await primaryAccount(user._id);
  if (!account) {
    const err = new Error('Choose an account to use.');
    err.status = 400;
    throw err;
  }
  if (account.kind !== 'cash') {
    const err = new Error('Use a deposit account — mandates are funded from the Invest screen.');
    err.status = 400;
    throw err;
  }
  if (account.isFrozen) {
    const err = new Error('That account is frozen. Contact support.');
    err.status = 403;
    throw err;
  }
  return account;
}

function fail(res, err, context) {
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error(`${context} error:`, err);
  return res.status(500).json({ message: 'Server error' });
}


/* ============================================================
   POST /api/deposits
   The client sends crypto to a published wallet, then files the receipt
   here. Every deposit queues for review — a reviewer opens the proof in
   the admin panel and approving it is what credits the account.
   ============================================================ */
deposits.post('/', protect, kycSubmitted, async (req, res) => {
  try {
    const { amount, walletId, reference, accountId, proof } = req.body;
    const settings = await getSettings();
    const value = round2(amount);

    if (!Number.isFinite(value) || value < settings.minDeposit) {
      return res.status(400).json({ message: `The minimum deposit is $${settings.minDeposit}.` });
    }

    const account = await resolveAccount(req.user, accountId);
    const wallet = walletId ? await Wallet.findById(walletId) : null;
    const method = wallet ? `${wallet.asset} · ${wallet.network}` : 'Crypto transfer';

    // The proof of payment is the whole basis for approval, so it is required
    // and has to actually be an image the reviewer can open.
    if (!proof || !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(proof)) {
      return res.status(400).json({ message: 'Attach a screenshot or photo of your payment receipt.' });
    }
    if (proof.length > MAX_PROOF_CHARS) {
      return res.status(413).json({ message: 'That image is too large — please upload one under 4MB.' });
    }

    // Never auto-credited. A reviewer opens the proof and approves it.
    await Transaction.create({
      user: req.user._id,
      account: account._id,
      type: 'deposit',
      label: 'Deposit pending review',
      detail: `${method} → ${account.name}`,
      amount: value,
      status: 'pending',
      method,
      reference: reference ? String(reference).trim().slice(0, 120) : '',
      proof,
      proofUploadedAt: new Date(),
    });

    await emails.depositEmail(req.user, {
      amount: value, method, accountName: account.name, status: 'pending',
    });

    const fresh = await Account.findById(account._id).lean();
    res.status(201).json({ ok: true, account: fresh, status: 'pending' });
  } catch (err) {
    fail(res, err, 'Deposit');
  }
});

/* ============================================================
   POST /api/withdrawals
   Requires APPROVED identity verification. Funds are held on request
   so the same balance can't be withdrawn twice while one is in review.
   The destination — a crypto wallet or a bank wire — comes in on the
   request and is stored on the ledger row for the reviewer to execute.
   ============================================================ */
withdrawals.post('/', protect, kycVerified, async (req, res) => {
  try {
    const { amount, accountId } = req.body;
    const settings = await getSettings();
    const value = round2(amount);

    if (!Number.isFinite(value) || value < settings.minWithdrawal) {
      return res.status(400).json({ message: `The minimum withdrawal is $${settings.minWithdrawal}.` });
    }

    const dest = resolveDestination(req.body);
    const account = await resolveAccount(req.user, accountId);

    await debit(account, value, {
      type: 'withdraw',
      label: 'Withdrawal requested',
      detail: dest.detail,
      status: 'pending',
      method: dest.method,
      counterparty: dest.counterparty,
      destination: dest.destination,
      payoutMethod: dest.payoutMethod,
      payoutDetails: dest.payoutDetails,
    });

    await emails.withdrawalEmail(req.user, {
      amount: value, method: dest.method, destination: dest.destination, status: 'pending',
    });

    const fresh = await Account.findById(account._id).lean();
    res.status(201).json({ ok: true, account: fresh, status: 'pending' });
  } catch (err) {
    fail(res, err, 'Withdrawal');
  }
});

module.exports = { deposits, withdrawals };
