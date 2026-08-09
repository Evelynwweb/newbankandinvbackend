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
   ============================================================ */
withdrawals.post('/', protect, kycVerified, async (req, res) => {
  try {
    const { amount, accountId } = req.body;
    const settings = await getSettings();
    const value = round2(amount);

    if (!Number.isFinite(value) || value < settings.minWithdrawal) {
      return res.status(400).json({ message: `The minimum withdrawal is $${settings.minWithdrawal}.` });
    }
    // Payouts only ever go to the address saved on the profile, never to
    // one supplied in the request — that is the whole point of verifying it.
    const payout = req.user.payout;
    if (!payout?.address) {
      return res.status(400).json({ message: 'Add a payout wallet in Settings before withdrawing.', code: 'NO_PAYOUT_WALLET' });
    }
    if (!payout.verified) {
      return res.status(403).json({ message: 'Your payout wallet is awaiting approval.', code: 'PAYOUT_UNVERIFIED' });
    }
    const method = `${payout.asset} · ${payout.network}`;
    const destination = payout.address;

    const account = await resolveAccount(req.user, accountId);

    await debit(account, value, {
      type: 'withdraw',
      label: 'Withdrawal requested',
      detail: `${method} · ····${String(destination).slice(-4)}`,
      status: 'pending',
      method,
      destination: String(destination),
    });

    await emails.withdrawalEmail(req.user, { amount: value, method, destination, status: 'pending' });

    const fresh = await Account.findById(account._id).lean();
    res.status(201).json({ ok: true, account: fresh, status: 'pending' });
  } catch (err) {
    fail(res, err, 'Withdrawal');
  }
});

module.exports = { deposits, withdrawals };
