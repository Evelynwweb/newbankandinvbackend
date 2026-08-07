const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const Investment = require('../models/Investment');
const { protect, kycSubmitted } = require('../middleware/auth');
const { round2, credit, debit, accruedOn } = require('../utils/banking');
const { PLAN_CATALOGUE } = require('../config/constants');
const emails = require('../utils/emails');

// @route   GET /api/investments/plans
router.get('/plans', (req, res) => res.json(PLAN_CATALOGUE));

// @route   GET /api/investments
// @desc    The client's mandates, each with interest accrued to today
router.get('/', protect, async (req, res) => {
  try {
    const mine = await Investment.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json(mine.map((i) => ({ ...i, accrued: accruedOn(i) })));
  } catch (err) {
    console.error('Investments error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/investments
// @desc    Subscribe to a mandate, funded from a deposit account
router.post('/', protect, kycSubmitted, async (req, res) => {
  try {
    const { planId, amount, fromAccountId } = req.body;
    const plan = PLAN_CATALOGUE.find((p) => p.id === planId);
    if (!plan) return res.status(404).json({ message: 'That plan is no longer available.' });

    const value = round2(amount);
    if (!Number.isFinite(value) || value < plan.min) {
      return res.status(400).json({ message: `${plan.name} starts at $${plan.min.toLocaleString()}.` });
    }

    const [from, investAccount] = await Promise.all([
      fromAccountId
        ? Account.findOne({ _id: fromAccountId, user: req.user._id })
        : Account.findOne({ user: req.user._id, kind: 'checking' }),
      Account.findOne({ user: req.user._id, kind: 'investment' }),
    ]);
    if (!from) return res.status(400).json({ message: 'Choose an account to fund this from.' });
    if (from.kind === 'investment') {
      return res.status(400).json({ message: 'Fund a mandate from checking or savings.' });
    }
    if (from.balance < value) {
      return res.status(400).json({ message: 'Not enough available balance to fund that.' });
    }

    // Money leaves the deposit account and shows up in the investment account.
    await debit(from, value, {
      type: 'investment',
      label: plan.name,
      detail: `Subscribed from ${from.name}`,
      method: 'Internal',
    });
    if (investAccount) {
      await credit(investAccount, value, {
        type: 'investment',
        label: `${plan.name} funded`,
        detail: `From ${from.name}`,
        method: 'Internal',
      });
    }

    const investment = await Investment.create({
      user: req.user._id,
      planId: plan.id,
      planName: plan.name,
      principal: value,
      rate: plan.rate,
      termMonths: plan.termMonths,
      startedAt: new Date(),
      maturesAt: plan.termMonths
        ? new Date(Date.now() + plan.termMonths * 30 * 86400000)
        : null,
    });

    await emails.investmentEmail(req.user, {
      planName: plan.name, principal: value, rate: plan.rate, maturesAt: investment.maturesAt,
    });

    res.status(201).json({ ...investment.toObject(), accrued: 0 });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Subscribe error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/investments/:id/withdraw
// @desc    Close a mandate early or at maturity
router.post('/:id/withdraw', protect, async (req, res) => {
  try {
    const investment = await Investment.findOne({ _id: req.params.id, user: req.user._id });
    if (!investment) return res.status(404).json({ message: 'Mandate not found' });
    if (investment.status !== 'active') return res.status(400).json({ message: 'That mandate is already closed.' });

    const matured = !investment.maturesAt || investment.maturesAt <= new Date();
    // Early exit on a fixed-term mandate returns principal only — the term
    // was the price of the rate. Flexible mandates always pay the accrual.
    const accrued = matured ? accruedOn(investment) : 0;
    const payout = round2(investment.principal + accrued);

    const [investAccount, checking] = await Promise.all([
      Account.findOne({ user: req.user._id, kind: 'investment' }),
      Account.findOne({ user: req.user._id, kind: 'checking' }),
    ]);
    if (!checking) return res.status(400).json({ message: 'No checking account to pay into.' });

    if (investAccount && investAccount.balance >= investment.principal) {
      await debit(investAccount, investment.principal, {
        type: 'investment',
        label: `${investment.planName} closed`,
        detail: matured ? 'Matured' : 'Closed early — principal returned',
        method: 'Internal',
      });
    }
    await credit(checking, payout, {
      type: 'investment',
      label: `${investment.planName} payout`,
      detail: matured ? 'Principal and accrued returns' : 'Early closure — principal only',
      method: 'Internal',
    });

    investment.status = matured ? 'matured' : 'withdrawn';
    investment.payout = payout;
    await investment.save();

    res.json({ ok: true, payout, matured });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Mandate withdraw error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
