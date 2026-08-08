const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const Investment = require('../models/Investment');
const Holding = require('../models/Holding');
const { protect } = require('../middleware/auth');
const { round2, accruedOn } = require('../utils/banking');

// @route   GET /api/portfolio
router.get('/', protect, async (req, res) => {
  try {
    const [accounts, raw, holdings] = await Promise.all([
      Account.find({ user: req.user._id }).lean(),
      Investment.find({ user: req.user._id, status: 'active' }).sort({ createdAt: -1 }).lean(),
      Holding.find({ user: req.user._id }).lean(),
    ]);

    const investments = raw.map((i) => ({ ...i, accrued: accruedOn(i) }));
    const assets = accounts.reduce((s, a) => s + a.balance, 0);
    const holdingsValue = holdings.reduce((s, h) => s + h.units * h.price, 0);

    res.json({
      accounts,
      investments,
      totalPrincipal: round2(investments.reduce((s, i) => s + i.principal, 0)),
      totalAccrued: round2(investments.reduce((s, i) => s + i.accrued, 0)),
      holdings: holdings.map((h) => ({ ...h, marketValue: round2(h.units * h.price) })),
      holdingsValue: round2(holdingsValue),
      totalValue: round2(assets + holdingsValue),
    });
  } catch (err) {
    console.error('Portfolio error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
