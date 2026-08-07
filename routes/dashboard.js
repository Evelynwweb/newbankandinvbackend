const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');
const Loan = require('../models/Loan');
const { protect } = require('../middleware/auth');
const { round2 } = require('../utils/banking');
const { getSettings } = require('../config/settings');

const DAY = 24 * 60 * 60 * 1000;
// Range → { window in ms, number of samples }
const RANGES = {
  '1D': { window: DAY, points: 24 },
  '1W': { window: 7 * DAY, points: 14 },
  '1M': { window: 30 * DAY, points: 30 },
  '1Y': { window: 365 * DAY, points: 24 },
};

/**
 * Reconstruct the total-value curve from the ledger by walking backwards from
 * today's figure: value(t) = today − sum(amounts posted after t). Only settled
 * rows count, so a pending withdrawal doesn't dent the history.
 */
function buildSeries(currentValue, txns, windowMs, points) {
  const now = Date.now();
  const series = [];
  for (let i = 0; i < points; i++) {
    const t = now - windowMs * (1 - i / (points - 1));
    let value = currentValue;
    for (const txn of txns) {
      if (new Date(txn.createdAt).getTime() > t) value -= txn.amount;
    }
    series.push(Math.max(0, round2(value)));
  }
  return series;
}

const ACCOUNT_COLOR = {
  checking: 'var(--gold-bright)',
  savings: 'var(--ember)',
  investment: 'var(--rose)',
};
const ACCOUNT_LABEL = {
  checking: 'Cash & checking',
  savings: 'Savings',
  investment: 'Investments',
};

// @route   GET /api/dashboard/overview
// @desc    Everything the dashboard home screen needs in one call
router.get('/overview', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const [accounts, txns, activity, investments, loans, settings] = await Promise.all([
      Account.find({ user: userId }).lean(),
      Transaction.find({ user: userId, status: 'completed' })
        .sort({ createdAt: 1 }).select('amount createdAt').lean(),
      Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(7).lean(),
      Investment.find({ user: userId, status: 'active' }).lean(),
      Loan.find({ user: userId, status: 'active' }).lean(),
      getSettings(),
    ]);

    const byKind = (k) => accounts.find((a) => a.kind === k);
    const accountValue = round2(accounts.reduce((s, a) => s + a.balance, 0));
    const profitBalance = round2(req.user.profitBalance || 0);

    const performance = {};
    const changePct = {};
    for (const [key, { window, points }] of Object.entries(RANGES)) {
      const series = buildSeries(accountValue, txns, window, points);
      performance[key] = series;
      const first = series[0];
      const last = series[series.length - 1];
      changePct[key] = first > 0
        ? Math.round(((last - first) / first) * 10000) / 100
        : last > 0 ? 100 : 0;
    }

    const holdings = accounts
      .map((a) => ({
        sym: ACCOUNT_LABEL[a.kind] || a.name,
        value: round2(a.balance),
        color: ACCOUNT_COLOR[a.kind] || 'var(--gold-bright)',
      }))
      .filter((h) => h.value > 0);

    res.json({
      accountValue,
      balance: round2(byKind('checking')?.balance || 0),
      savingsBalance: round2(byKind('savings')?.balance || 0),
      investedBalance: round2(byKind('investment')?.balance || 0),
      profitBalance,
      totalInvested: round2(investments.reduce((s, i) => s + i.principal, 0)),
      activeInvestments: investments.length,
      outstandingDebt: round2(loans.reduce((s, l) => s + l.outstanding, 0)),
      referralEarnings: round2(req.user.referralEarnings || 0),
      interestYtd: round2(
        activity.filter((a) => a.type === 'interest' && a.amount > 0).reduce((s, a) => s + a.amount, 0)
      ),
      kycStatus: req.user.kyc?.status || 'unverified',
      minTransfer: settings.minTransfer,
      minDeposit: settings.minDeposit,
      minWithdrawal: settings.minWithdrawal,
      performance,
      changePct,
      holdings,
      activity: activity.map((a) => ({
        _id: a._id,
        type: a.type,
        label: a.label,
        detail: a.detail,
        amount: a.amount,
        status: a.status,
        createdAt: a.createdAt,
      })),
      updatedAt: new Date(),
    });
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
