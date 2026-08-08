const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const Investment = require('../models/Investment');
const { protect, kycSubmitted } = require('../middleware/auth');
const { round2, credit, debit, accruedOn } = require('../utils/banking');
const { PRODUCT_FAMILIES } = require('../config/constants');
const emails = require('../utils/emails');

/* Flat lookup over the family tree, so a product id resolves in one step. */
const ALL_PRODUCTS = PRODUCT_FAMILIES.flatMap((f) =>
  f.products.map((p) => ({ ...p, familyId: f.id, familyName: f.name, account: f.account, premium: !!f.premium }))
);
const findProduct = (id) => ALL_PRODUCTS.find((p) => p.id === id);

// @route   GET /api/investments/families
// @desc    The whole product taxonomy, grouped as the UI renders it
router.get('/families', (req, res) => res.json(PRODUCT_FAMILIES));

// @route   GET /api/investments/products
// @desc    The same products, flattened — handy for pickers and admin
router.get('/products', (req, res) => res.json(ALL_PRODUCTS));

// @route   GET /api/investments
router.get('/', protect, async (req, res) => {
  try {
    const mine = await Investment.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json(mine.map((i) => ({ ...i, accrued: accruedOn(i) })));
  } catch (err) {
    console.error('Investments error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/investments
// @desc    Subscribe to a product, funded from the cash account
router.post('/', protect, kycSubmitted, async (req, res) => {
  try {
    const { productId, planId, amount } = req.body;
    const product = findProduct(productId || planId);
    if (!product) return res.status(404).json({ message: 'That product is no longer available.' });

    const value = round2(amount);
    if (!Number.isFinite(value) || value < product.min) {
      return res.status(400).json({ message: `${product.name} starts at $${product.min.toLocaleString()}.` });
    }

    // Everything is funded from cash; the destination depends on the family.
    const [cash, destination] = await Promise.all([
      Account.findOne({ user: req.user._id, kind: 'cash' }),
      Account.findOne({ user: req.user._id, kind: product.account }),
    ]);
    if (!cash) return res.status(400).json({ message: 'No cash account to fund this from.' });
    if (cash.balance < value) {
      return res.status(400).json({ message: 'Not enough available cash to fund that.' });
    }

    await debit(cash, value, {
      type: 'investment',
      label: product.name,
      detail: `${product.familyName} · funded from ${cash.name}`,
      method: 'Internal',
    });
    // Cash products stay in the cash account; everything else moves across.
    if (destination && String(destination._id) !== String(cash._id)) {
      await credit(destination, value, {
        type: 'investment',
        label: `${product.name} funded`,
        detail: `Into ${destination.name}`,
        method: 'Internal',
      });
    }

    const investment = await Investment.create({
      user: req.user._id,
      planId: product.id,
      planName: product.name,
      familyId: product.familyId,
      kind: product.kind,
      principal: value,
      rate: product.rate,
      termMonths: product.termMonths,
      startedAt: new Date(),
      maturesAt: product.termMonths ? new Date(Date.now() + product.termMonths * 30 * 86400000) : null,
    });

    await emails.investmentEmail(req.user, {
      planName: product.name, principal: value, rate: product.rate, maturesAt: investment.maturesAt,
    });

    res.status(201).json({ ...investment.toObject(), accrued: 0 });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Subscribe error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/investments/:id/withdraw
// @desc    Close a position and return the proceeds to cash
router.post('/:id/withdraw', protect, async (req, res) => {
  try {
    const investment = await Investment.findOne({ _id: req.params.id, user: req.user._id });
    if (!investment) return res.status(404).json({ message: 'Position not found' });
    if (investment.status !== 'active') return res.status(400).json({ message: 'That position is already closed.' });

    const matured = !investment.maturesAt || investment.maturesAt <= new Date();
    // Breaking a fixed term returns principal only — the term bought the rate.
    const accrued = matured ? accruedOn(investment) : 0;
    const payout = round2(investment.principal + accrued);

    const product = findProduct(investment.planId);
    const [source, cash] = await Promise.all([
      Account.findOne({ user: req.user._id, kind: product?.account || 'brokerage' }),
      Account.findOne({ user: req.user._id, kind: 'cash' }),
    ]);
    if (!cash) return res.status(400).json({ message: 'No cash account to pay into.' });

    if (source && String(source._id) !== String(cash._id) && source.balance >= investment.principal) {
      await debit(source, investment.principal, {
        type: 'investment',
        label: `${investment.planName} closed`,
        detail: matured ? 'Matured' : 'Closed early — principal returned',
        method: 'Internal',
      });
    }
    await credit(cash, payout, {
      type: 'investment',
      label: `${investment.planName} proceeds`,
      detail: matured ? 'Principal and accrued return' : 'Early closure — principal only',
      method: 'Internal',
    });

    investment.status = matured ? 'matured' : 'withdrawn';
    investment.payout = payout;
    await investment.save();

    res.json({ ok: true, payout, matured });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Position close error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
