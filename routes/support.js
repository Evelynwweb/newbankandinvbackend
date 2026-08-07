const express = require('express');
const router = express.Router();
const SupportMessage = require('../models/SupportMessage');
const { protect } = require('../middleware/auth');

// @route   GET /api/support
// @desc    The client's own tickets
router.get('/', protect, async (req, res) => {
  try {
    const rows = await SupportMessage.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json(rows);
  } catch (err) {
    console.error('Support list error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/support
router.post('/', protect, async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    if (body.length < 5) return res.status(400).json({ message: 'Tell us a little more about the issue.' });

    // Simple flood guard — a handful of open tickets is plenty.
    const open = await SupportMessage.countDocuments({ user: req.user._id, status: 'open' });
    if (open >= 5) {
      return res.status(429).json({ message: 'You already have several open tickets — we will get to them shortly.' });
    }

    const msg = await SupportMessage.create({
      user: req.user._id,
      subject: String(req.body.subject || 'Support request').slice(0, 120),
      body: body.slice(0, 4000),
    });
    res.status(201).json(msg);
  } catch (err) {
    console.error('Support create error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
