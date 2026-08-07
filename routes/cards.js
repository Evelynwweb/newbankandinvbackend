const express = require('express');
const router = express.Router();
const Card = require('../models/Card');
const Account = require('../models/Account');
const { protect, kycSubmitted } = require('../middleware/auth');
const { primaryAccount } = require('../utils/banking');

/* Only the last four digits of a card are ever generated or stored. A real
   deployment issues through a processor and keeps nothing but its token. */
const last4 = () => String(Math.floor(1000 + Math.random() * 9000));
const expiry = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 4);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
};

// @route   GET /api/cards
router.get('/', protect, async (req, res) => {
  try {
    const cards = await Card.find({ user: req.user._id }).sort({ createdAt: 1 }).lean();
    res.json(cards);
  } catch (err) {
    console.error('Cards error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/cards
// @desc    Issue a virtual card against a deposit account
router.post('/', protect, kycSubmitted, async (req, res) => {
  try {
    const { label, monthlyLimit, accountId } = req.body;
    const account = accountId
      ? await Account.findOne({ _id: accountId, user: req.user._id })
      : await primaryAccount(req.user._id);
    if (!account) return res.status(400).json({ message: 'No account to attach the card to.' });

    const count = await Card.countDocuments({ user: req.user._id });
    if (count >= 20) return res.status(400).json({ message: 'You have reached the 20-card limit.' });

    const card = await Card.create({
      user: req.user._id,
      account: account._id,
      label: String(label || 'Virtual card').slice(0, 40),
      network: 'Mastercard',
      type: 'virtual',
      last4: last4(),
      expiry: expiry(),
      monthlyLimit: Math.max(0, Number(monthlyLimit) || 2000),
      color: 'dark',
    });
    res.status(201).json(card);
  } catch (err) {
    console.error('Card create error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/cards/:id/freeze
router.patch('/:id/freeze', protect, async (req, res) => {
  try {
    const card = await Card.findOne({ _id: req.params.id, user: req.user._id });
    if (!card) return res.status(404).json({ message: 'Card not found' });
    card.frozen = !card.frozen;
    await card.save();
    res.json(card);
  } catch (err) {
    console.error('Card freeze error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/cards/:id
// @desc    Rename a card or change its monthly limit
router.patch('/:id', protect, async (req, res) => {
  try {
    const card = await Card.findOne({ _id: req.params.id, user: req.user._id });
    if (!card) return res.status(404).json({ message: 'Card not found' });
    if (req.body.label !== undefined) card.label = String(req.body.label).slice(0, 40);
    if (req.body.monthlyLimit !== undefined) {
      const n = Number(req.body.monthlyLimit);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: 'Limit must be a positive number' });
      card.monthlyLimit = n;
    }
    await card.save();
    res.json(card);
  } catch (err) {
    console.error('Card update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/cards/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const card = await Card.findOne({ _id: req.params.id, user: req.user._id });
    if (!card) return res.status(404).json({ message: 'Card not found' });
    if (card.type === 'physical') {
      return res.status(400).json({ message: 'Physical cards must be cancelled by support.' });
    }
    await card.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    console.error('Card delete error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
