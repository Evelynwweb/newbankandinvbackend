const express = require('express');
const router = express.Router();
const { getSettings } = require('../config/settings');

// @route   GET /api/settings
// @desc    The public slice of platform settings the client app needs
router.get('/', async (req, res) => {
  try {
    const s = await getSettings();
    res.json({
      minDeposit: s.minDeposit,
      minWithdrawal: s.minWithdrawal,
      minTransfer: s.minTransfer,
      referralReward: s.referralReward,
      supportEmail: s.supportEmail,
    });
  } catch (err) {
    console.error('Settings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
