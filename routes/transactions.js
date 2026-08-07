const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

// @route   GET /api/transactions
// @desc    The client's full ledger. Optional ?type= and ?limit= filters.
router.get('/', protect, async (req, res) => {
  try {
    const { type, limit } = req.query;
    const query = { user: req.user._id };
    if (type && type !== 'all') query.type = type;

    const rows = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 500, 1000))
      .lean();

    // Payment proofs can be megabytes of base64 — never ship them in a list.
    res.json(rows.map(({ proof, ...t }) => ({ ...t, hasProof: !!proof })));
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
