const express = require('express');
const router = express.Router();
const Holding = require('../models/Holding');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { protect, kycSubmitted } = require('../middleware/auth');
const { round2, debit, credit } = require('../utils/banking');
const { INSTRUMENTS } = require('../config/constants');

/* ============================================================
   Self-directed, fractional and crypto positions.

   Holdings-only: there is no order book and no market feed. A client
   places a buy or sell request, cash moves immediately at the
   admin-maintained mark, and the position is adjusted. Admins can
   re-mark prices at any time (see routes/admin.js).
   ============================================================ */

const findInstrument = (symbol) =>
  INSTRUMENTS.find((i) => i.symbol === String(symbol || '').toUpperCase());

const value = (h) => round2(h.units * h.price);

// @route   GET /api/holdings/instruments
router.get('/instruments', protect, (req, res) => res.json(INSTRUMENTS));

// @route   GET /api/holdings
router.get('/', protect, async (req, res) => {
  try {
    const rows = await Holding.find({ user: req.user._id }).sort({ symbol: 1 }).lean();
    const holdings = rows.map((h) => {
      const mv = value(h);
      return {
        ...h,
        marketValue: mv,
        gain: round2(mv - h.costBasis),
        gainPct: h.costBasis > 0 ? Math.round(((mv - h.costBasis) / h.costBasis) * 10000) / 100 : 0,
      };
    });
    res.json({
      holdings,
      marketValue: round2(holdings.reduce((s, h) => s + h.marketValue, 0)),
      costBasis: round2(holdings.reduce((s, h) => s + h.costBasis, 0)),
    });
  } catch (err) {
    console.error('Holdings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/holdings/buy
// @desc    Buy by dollar amount (fractional) or by units
router.post('/buy', protect, kycSubmitted, async (req, res) => {
  try {
    const instrument = findInstrument(req.body.symbol);
    if (!instrument) return res.status(404).json({ message: 'We do not carry that symbol.' });

    const amount = req.body.amount !== undefined ? round2(req.body.amount) : null;
    const units = req.body.units !== undefined ? Number(req.body.units) : null;
    if (!(amount > 0) && !(units > 0)) {
      return res.status(400).json({ message: 'Enter an amount or a number of units.' });
    }

    const buyUnits = units > 0 ? units : amount / instrument.price;
    const cost = round2(units > 0 ? units * instrument.price : amount);
    if (cost < 5) return res.status(400).json({ message: 'The minimum order is $5.' });

    const [cash, brokerage] = await Promise.all([
      Account.findOne({ user: req.user._id, kind: 'cash' }),
      Account.findOne({ user: req.user._id, kind: 'brokerage' }),
    ]);
    if (!cash) return res.status(400).json({ message: 'No cash account to settle from.' });
    if (!brokerage) return res.status(400).json({ message: 'No brokerage account open.' });
    if (cash.balance < cost) return res.status(400).json({ message: 'Not enough available cash for that order.' });

    await debit(cash, cost, {
      type: 'trade',
      label: `Buy ${instrument.symbol}`,
      detail: `${buyUnits.toFixed(6)} units at $${instrument.price.toLocaleString()}`,
      method: 'Internal',
    });

    // Average up into an existing lot rather than opening a second one.
    let holding = await Holding.findOne({ user: req.user._id, symbol: instrument.symbol });
    if (holding) {
      holding.units = holding.units + buyUnits;
      holding.costBasis = round2(holding.costBasis + cost);
      holding.price = instrument.price;
      await holding.save();
    } else {
      holding = await Holding.create({
        user: req.user._id,
        account: brokerage._id,
        symbol: instrument.symbol,
        name: instrument.name,
        kind: instrument.kind,
        units: buyUnits,
        costBasis: cost,
        price: instrument.price,
      });
    }

    res.status(201).json(holding);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Buy error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/holdings/sell
router.post('/sell', protect, kycSubmitted, async (req, res) => {
  try {
    const holding = await Holding.findOne({
      user: req.user._id,
      symbol: String(req.body.symbol || '').toUpperCase(),
    });
    if (!holding) return res.status(404).json({ message: 'You do not hold that symbol.' });

    const units = req.body.all ? holding.units : Number(req.body.units);
    if (!(units > 0)) return res.status(400).json({ message: 'Enter how many units to sell.' });
    if (units > holding.units + 1e-9) {
      return res.status(400).json({ message: 'That is more than you hold.' });
    }

    const proceeds = round2(units * holding.price);
    const cash = await Account.findOne({ user: req.user._id, kind: 'cash' });
    if (!cash) return res.status(400).json({ message: 'No cash account to settle into.' });

    // Relieve cost basis proportionally so the remaining lot stays honest.
    const share = units / holding.units;
    const basisOut = round2(holding.costBasis * share);

    await credit(cash, proceeds, {
      type: 'trade',
      label: `Sell ${holding.symbol}`,
      detail: `${units.toFixed(6)} units at $${holding.price.toLocaleString()}`,
      method: 'Internal',
    });

    holding.units = holding.units - units;
    holding.costBasis = round2(Math.max(0, holding.costBasis - basisOut));
    if (holding.units <= 1e-9) await holding.deleteOne();
    else await holding.save();

    res.json({ ok: true, proceeds, realised: round2(proceeds - basisOut) });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Sell error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
