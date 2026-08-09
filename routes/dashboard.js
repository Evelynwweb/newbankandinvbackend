const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');
const Holding = require('../models/Holding');
const { protect } = require('../middleware/auth');
const { round2, accruedOn: accruedOnLocal } = require('../utils/banking');
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
  cash: 'var(--accent)',
  brokerage: 'var(--accent-warm)',
  retirement: 'var(--gold-leaf)',
};
const ACCOUNT_LABEL = {
  cash: 'Cash & liquidity',
  brokerage: 'Brokerage',
  retirement: 'Retirement',
};

// @route   GET /api/dashboard/overview
// @desc    Everything the dashboard home screen needs in one call
router.get('/overview', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const [accounts, txns, activity, investments, holdings, settings] = await Promise.all([
      Account.find({ user: userId }).lean(),
      Transaction.find({ user: userId, status: 'completed' })
        .sort({ createdAt: 1 }).select('amount createdAt').lean(),
      Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(7).lean(),
      Investment.find({ user: userId, status: 'active' }).lean(),
      Holding.find({ user: userId }).lean(),
      getSettings(),
    ]);

    const byKind = (k) => accounts.find((a) => a.kind === k);
    const holdingsValue = holdings.reduce((s, h) => s + h.units * h.price, 0);
    const accountValue = round2(accounts.reduce((s, a) => s + a.balance, 0) + holdingsValue);
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

    const allocation = accounts
      .map((a) => ({
        sym: ACCOUNT_LABEL[a.kind] || a.name,
        value: round2(a.balance),
        color: ACCOUNT_COLOR[a.kind] || 'var(--gold-bright)',
      }))
      .filter((h) => h.value > 0);

    /* The three figures the overview leads with. Deposits and profit are
       summed from the ledger so they always reconcile with Activity. */
    const completed = await Transaction.find({ user: userId, status: 'completed' })
      .select('type amount').lean();
    const totalDeposits = round2(
      completed.filter((t) => t.type === 'deposit' && t.amount > 0).reduce((s, t) => s + t.amount, 0)
    );
    const totalProfit = round2(
      completed.filter((t) => ['interest', 'dividend'].includes(t.type) && t.amount > 0)
        .reduce((s, t) => s + t.amount, 0)
      + (req.user.profitBalance || 0)
      + investments.reduce((s, i) => s + accruedOnLocal(i), 0)
    );
    const totalInvestment = round2(investments.reduce((s, i) => s + i.principal, 0) + holdingsValue);

    res.json({
      totalProfit,
      totalDeposits,
      totalInvestment,
      accountValue,
      balance: round2(byKind('cash')?.balance || 0),
      brokerageBalance: round2(byKind('brokerage')?.balance || 0),
      retirementBalance: round2(byKind('retirement')?.balance || 0),
      holdingsValue: round2(holdingsValue),
      profitBalance,
      totalInvested: round2(investments.reduce((s, i) => s + i.principal, 0)),
      activeInvestments: investments.length,
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
      holdings: allocation,
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
