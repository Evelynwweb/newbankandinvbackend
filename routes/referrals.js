const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const { getSettings } = require('../config/settings');

// @route   GET /api/referrals
router.get('/', protect, async (req, res) => {
  try {
    const [rows, invited, settings] = await Promise.all([
      Transaction.find({ user: req.user._id, type: 'referral' }).sort({ createdAt: -1 }).lean(),
      User.countDocuments({ referredBy: req.user._id }),
      getSettings(),
    ]);
    const site = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

    res.json({
      code: req.user.referralCode,
      link: `${site}/register?ref=${req.user.referralCode}`,
      invited,
      earned: Math.round(rows.reduce((s, t) => s + t.amount, 0) * 100) / 100,
      rewardPerSignup: settings.referralReward,
      history: rows,
    });
  } catch (err) {
    console.error('Referrals error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
