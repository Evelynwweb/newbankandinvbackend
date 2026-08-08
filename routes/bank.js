const express = require('express');
const router = express.Router();
const User = require('../models/User');
const BankInstruction = require('../models/BankInstruction');
const { protect } = require('../middleware/auth');
const sanitizeUser = require('../utils/sanitizeUser');

/* ============================================================
   The only banking surface in the product.

   Inbound  — GET /api/bank/instructions: the platform's receiving
              wire details, shown when a client funds an account.
   Outbound — PUT /api/bank/account: the client's own bank account,
              where withdrawals are sent.

   Editing the outbound account clears its verified flag, so an admin
   has to re-approve before the next payout leaves.
   ============================================================ */

// @route   GET /api/bank/instructions
router.get('/instructions', protect, async (req, res) => {
  try {
    const rows = await BankInstruction.find({ isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .select('-__v')
      .lean();
    // Each client wires with their own reference so we can match the credit.
    res.json(rows.map((r) => ({
      ...r,
      reference: r.reference || `AV-${req.user.referralCode || String(req.user._id).slice(-6).toUpperCase()}`,
    })));
  } catch (err) {
    console.error('Bank instructions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/bank/account
router.get('/account', protect, (req, res) => {
  res.json(sanitizeUser(req.user).bankAccount);
});

// @route   PUT /api/bank/account
// @desc    Save or replace the client's payout bank account
router.put('/account', protect, async (req, res) => {
  try {
    const {
      accountName, bankName, accountNumber, routingNumber,
      swiftCode, bankAddress, homeAddress, currency,
    } = req.body;

    if (!accountName || !bankName || !accountNumber) {
      return res.status(400).json({ message: 'Account name, bank name and account number are required.' });
    }
    if (!routingNumber && !swiftCode) {
      return res.status(400).json({ message: 'Provide a routing number or a SWIFT code.' });
    }
    if (!homeAddress || String(homeAddress).trim().length < 6) {
      return res.status(400).json({ message: 'Your home address is required for the wire.' });
    }

    const user = await User.findById(req.user._id);
    const clean = (v, n) => String(v || '').trim().slice(0, n);

    user.bankAccount = {
      accountName: clean(accountName, 140),
      bankName: clean(bankName, 140),
      accountNumber: clean(accountNumber, 40),
      routingNumber: clean(routingNumber, 20),
      swiftCode: clean(swiftCode, 16).toUpperCase(),
      bankAddress: clean(bankAddress, 240),
      homeAddress: clean(homeAddress, 240),
      currency: clean(currency || 'USD', 3).toUpperCase(),
      // Any edit sends it back for review before the next payout.
      verified: false,
      updatedAt: new Date(),
    };
    await user.save();

    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Bank account save error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
