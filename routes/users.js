const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Account = require('../models/Account');
const { protect } = require('../middleware/auth');
const sanitizeUser = require('../utils/sanitizeUser');
const { round2, credit, primaryAccount } = require('../utils/banking');
const { getSettings } = require('../config/settings');
const emails = require('../utils/emails');

// @route   PUT /api/users/me
// @desc    Update profile fields and notification preferences
router.put('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { name, phone, country, twoFactor, transactionAlerts, statements, marketing } = req.body;

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (trimmed.length < 2) return res.status(400).json({ message: 'Enter your full name' });
      user.name = trimmed;
    }
    if (phone !== undefined) user.phone = String(phone).slice(0, 40);
    if (country !== undefined) user.country = String(country).slice(0, 80);

    for (const [key, value] of Object.entries({ twoFactor, transactionAlerts, statements, marketing })) {
      if (value !== undefined) user.settings[key] = !!value;
    }

    await user.save();
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/me/password
router.put('/me/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ message: 'Use at least 8 characters' });
    }
    const user = await User.findById(req.user._id);
    if (!(await user.matchPassword(currentPassword || ''))) {
      return res.status(400).json({ message: 'Your current password isn’t right.' });
    }
    user.password = newPassword;
    await user.save();
    await emails.passwordChangedEmail(user);
    res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/users/me/transfer-profit
// @desc    Sweep the earnings wallet into the checking account
router.post('/me/transfer-profit', protect, async (req, res) => {
  try {
    const amount = round2(req.user.profitBalance || 0);
    if (amount < 0.01) return res.status(400).json({ message: 'There’s nothing to move yet.' });

    // Zero the wallet atomically before crediting, so a repeated request
    // can't pay out the same earnings twice.
    const user = await User.findOneAndUpdate(
      { _id: req.user._id, profitBalance: { $gte: amount } },
      { $inc: { profitBalance: -amount } },
      { new: true }
    );
    if (!user) return res.status(409).json({ message: 'Those earnings have already been moved.' });

    const account = await primaryAccount(user._id);
    if (!account) return res.status(400).json({ message: 'No checking account to pay into.' });

    await credit(account, amount, {
      type: 'interest',
      label: 'Earnings moved to checking',
      detail: 'From earnings wallet',
      method: 'Internal',
    });

    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Sweep earnings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
