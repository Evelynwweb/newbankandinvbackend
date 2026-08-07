const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const Investment = require('../models/Investment');
const Loan = require('../models/Loan');
const { protect } = require('../middleware/auth');
const { round2, accruedOn } = require('../utils/banking');

// @route   GET /api/portfolio
router.get('/', protect, async (req, res) => {
  try {
    const [accounts, raw, loans] = await Promise.all([
      Account.find({ user: req.user._id }).lean(),
      Investment.find({ user: req.user._id, status: 'active' }).sort({ createdAt: -1 }).lean(),
      Loan.find({ user: req.user._id, status: 'active' }).lean(),
    ]);

    const investments = raw.map((i) => ({ ...i, accrued: accruedOn(i) }));
    const assets = accounts.reduce((s, a) => s + a.balance, 0);
    const debt = loans.reduce((s, l) => s + l.outstanding, 0);

    res.json({
      accounts,
      investments,
      totalPrincipal: round2(investments.reduce((s, i) => s + i.principal, 0)),
      totalAccrued: round2(investments.reduce((s, i) => s + i.accrued, 0)),
      netWorth: round2(assets - debt),
    });
  } catch (err) {
    console.error('Portfolio error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
