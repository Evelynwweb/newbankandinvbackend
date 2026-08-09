const express = require('express');
const router = express.Router();
const Wallet = require('../models/Wallet');
const { protect } = require('../middleware/auth');

/* ============================================================
   Receiving wallets, client-facing.

   Read-only here — admins maintain the addresses (routes/admin.js).
   Only active wallets in the requested scope are ever returned, so a
   retired address can never be shown to someone about to send funds.
   ============================================================ */

// @route   GET /api/wallets?scope=deposit|withdraw
router.get('/', protect, async (req, res) => {
  try {
    const scope = req.query.scope === 'withdraw' ? 'withdraw' : 'deposit';
    const rows = await Wallet.find({ isActive: true, scope: { $in: [scope, 'both'] } })
      .sort({ sortOrder: 1, asset: 1 })
      .select('-__v -notes')
      .lean();
    res.json(rows);
  } catch (err) {
    console.error('Wallets error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
