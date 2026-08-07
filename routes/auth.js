const express = require('express');
const router = express.Router();
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const sanitizeUser = require('../utils/sanitizeUser');
const emails = require('../utils/emails');
const { openAccountsFor } = require('../utils/banking');
const { protect } = require('../middleware/auth');

/* Email verification is switched off. Accounts are usable the moment they're
   opened. To reintroduce it: set emailVerified false here, restore the
   verify-email / resend-code routes, and re-add the gate in middleware/auth.js. */

// @route   POST /api/auth/register
// @desc    Open an account — creates the client and their three accounts
router.post('/register', async (req, res) => {
  try {
    const { name, fullName, email, phone, password, country, referral } = req.body;
    const displayName = (fullName || name || '').trim();

    if (!displayName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const taken = await User.findOne({ email: String(email).toLowerCase() });
    if (taken) return res.status(409).json({ message: 'An account with this email already exists' });

    // Optional referral code — invalid codes are ignored rather than rejected.
    let referredBy = null;
    if (referral && String(referral).trim()) {
      const referrer = await User.findOne({ referralCode: String(referral).trim().toUpperCase() });
      if (referrer) referredBy = referrer._id;
    }

    const user = await User.create({
      name: displayName,
      email,
      phone: phone || '',
      country: country || '',
      password,
      referredBy,
      emailVerified: true,
    });

    // Every client gets checking, savings and an investment account on day one.
    await openAccountsFor(user._id);

    await emails.welcomeEmail(user);

    res.status(201).json({ user: sanitizeUser(user), token: generateToken(user._id) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'An account with these details already exists' });
    }
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = String(email || '').toLowerCase().trim();
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: identifier });
    if (!user || !(await user.matchPassword(password))) {
      // Same message either way — don't reveal whether the email exists.
      return res.status(401).json({ message: 'Those credentials don’t match an account' });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }

    await emails.loginAlertEmail(user, {
      when: new Date(),
      ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip,
    });

    res.json({ user: sanitizeUser(user), token: generateToken(user._id) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json(sanitizeUser(req.user));
});

module.exports = router;
