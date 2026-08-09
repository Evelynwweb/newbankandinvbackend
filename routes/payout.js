const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const sanitizeUser = require('../utils/sanitizeUser');

/* The client's crypto payout address — where withdrawals are sent. */

// @route   GET /api/payout
router.get('/', protect, (req, res) => res.json(sanitizeUser(req.user).payout));

// @route   PUT /api/payout
router.put('/', protect, async (req, res) => {
  try {
    const { asset, network, address, memo, label } = req.body;
    if (!asset || !network || !address) {
      return res.status(400).json({ message: 'Asset, network and wallet address are required.' });
    }
    if (String(address).trim().length < 20) {
      return res.status(400).json({ message: 'That does not look like a valid wallet address.' });
    }

    const user = await User.findById(req.user._id);
    const clean = (v, n) => String(v || '').trim().slice(0, n);
    user.payout = {
      asset: clean(asset, 12).toUpperCase(),
      network: clean(network, 40),
      address: clean(address, 140),
      memo: clean(memo, 60),
      label: clean(label, 60),
      // Any edit sends it back for review before the next payout.
      verified: false,
      updatedAt: new Date(),
    };
    await user.save();
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Payout save error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
