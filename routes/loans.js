const express = require('express');
const router = express.Router();
const Loan = require('../models/Loan');
const { protect, kycSubmitted } = require('../middleware/auth');
const { round2, monthlyPayment } = require('../utils/banking');
const { LOAN_PRODUCTS } = require('../config/constants');

// @route   GET /api/loans/products
router.get('/products', (req, res) => res.json(LOAN_PRODUCTS));

// @route   GET /api/loans
router.get('/', protect, async (req, res) => {
  try {
    const loans = await Loan.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json(loans);
  } catch (err) {
    console.error('Loans error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/loans
// @desc    Apply for credit. Nothing is drawn until an admin approves —
//          approval is what moves money (see routes/admin.js).
router.post('/', protect, kycSubmitted, async (req, res) => {
  try {
    const { productId, amount, termMonths } = req.body;
    const product = LOAN_PRODUCTS.find((p) => p.id === productId);
    if (!product) return res.status(404).json({ message: 'Unknown loan product.' });

    const principal = round2(amount);
    if (!Number.isFinite(principal) || principal <= 0 || principal > product.maxAmount) {
      return res.status(400).json({
        message: `${product.name} is available up to $${product.maxAmount.toLocaleString()}.`,
      });
    }

    const term = Number(termMonths) || product.termMonths;
    if (term <= 0 || term > product.termMonths) {
      return res.status(400).json({ message: `Choose a term up to ${product.termMonths} months.` });
    }

    // One open application per product at a time keeps the queue honest.
    const existing = await Loan.findOne({
      user: req.user._id, productId: product.id, status: { $in: ['pending', 'approved'] },
    });
    if (existing) {
      return res.status(409).json({ message: `You already have a ${product.name} application in progress.` });
    }

    const loan = await Loan.create({
      user: req.user._id,
      productId: product.id,
      product: product.name,
      principal,
      apr: product.apr,
      termMonths: term,
      monthlyPayment: monthlyPayment(principal, product.apr, term),
      outstanding: 0, // nothing is owed until the loan is drawn down
      status: 'pending',
    });

    res.status(201).json(loan);
  } catch (err) {
    console.error('Loan apply error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
