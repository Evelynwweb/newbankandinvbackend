const express = require('express');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const PaymentMethod = require('../models/PaymentMethod');
const { protect, kycSubmitted, kycVerified } = require('../middleware/auth');
const { round2, credit, debit, primaryAccount } = require('../utils/banking');
const { getSettings } = require('../config/settings');
const emails = require('../utils/emails');

/* ============================================================
   Deposits and withdrawals — two routers, one file, because the
   rules they share (account resolution, minimums, the no-overdraft
   guarantee) are easier to keep honest side by side.
   ============================================================ */

const deposits = express.Router();
const withdrawals = express.Router();

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

/* Shared: the funding rails an admin has enabled for this direction. */
function methodsHandler(scope) {
  return async (req, res) => {
    try {
      const methods = await PaymentMethod.find({
        isActive: true,
        scope: { $in: [scope, 'both'] },
      }).sort({ sortOrder: 1, createdAt: 1 }).lean();
      res.json(methods);
    } catch (err) {
      fail(res, err, 'Methods');
    }
  };
}

deposits.get('/methods', protect, methodsHandler('deposit'));
withdrawals.get('/methods', protect, methodsHandler('withdraw'));

/* ============================================================
   POST /api/deposits
   Small deposits clear immediately; larger ones queue for an admin
   (settings.autoApproveDepositUnder, 0 = always review).
   ============================================================ */
deposits.post('/', protect, kycSubmitted, async (req, res) => {
  try {
    const { amount, method = 'Linked bank', accountId, proof } = req.body;
    const settings = await getSettings();
    const value = round2(amount);

    if (!Number.isFinite(value) || value < settings.minDeposit) {
      return res.status(400).json({ message: `The minimum deposit is $${settings.minDeposit}.` });
    }

    const account = await resolveAccount(req.user, accountId);
    const autoClear = settings.autoApproveDepositUnder > 0 && value < settings.autoApproveDepositUnder;

    if (autoClear) {
      await credit(account, value, {
        type: 'deposit',
        label: 'Deposit received',
        detail: `${method} → ${account.name}`,
        method,
        proof: proof || null,
        proofUploadedAt: proof ? new Date() : null,
      });
    } else {
      // A pending deposit must NOT move the balance — the money isn't ours
      // until it settles. Approving it in the admin panel is what credits it.
      await Transaction.create({
        user: req.user._id,
        account: account._id,
        type: 'deposit',
        label: 'Deposit pending review',
        detail: `${method} → ${account.name}`,
        amount: value,
        status: 'pending',
        method,
        proof: proof || null,
        proofUploadedAt: proof ? new Date() : null,
      });
    }

    await emails.depositEmail(req.user, {
      amount: value, method, accountName: account.name,
      status: autoClear ? 'completed' : 'pending',
    });

    const fresh = await Account.findById(account._id).lean();
    res.status(201).json({ ok: true, account: fresh, status: autoClear ? 'completed' : 'pending' });
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
    const { amount, method = 'Bank transfer', destination, accountId } = req.body;
    const settings = await getSettings();
    const value = round2(amount);

    if (!Number.isFinite(value) || value < settings.minWithdrawal) {
      return res.status(400).json({ message: `The minimum withdrawal is $${settings.minWithdrawal}.` });
    }
    if (!destination || String(destination).length < 6) {
      return res.status(400).json({ message: 'Enter the destination account number.' });
    }

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
