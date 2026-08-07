const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const Beneficiary = require('../models/Beneficiary');
const { protect, kycSubmitted, kycVerified } = require('../middleware/auth');
const { round2, credit, debit } = require('../utils/banking');
const { getSettings } = require('../config/settings');
const { TRANSFER_RAILS } = require('../config/constants');
const emails = require('../utils/emails');

/* Beneficiaries are returned with the account number masked — the client
   already knows who they are, and a full number on screen is a phishing gift. */
const publicBeneficiary = (b) => ({
  _id: b._id,
  name: b.name,
  bank: b.bank,
  number: `••••${String(b.number).slice(-4)}`,
  nickname: b.nickname,
});

// @route   GET /api/accounts
// @desc    The client's accounts plus their saved recipients
router.get('/', protect, async (req, res) => {
  try {
    const [accounts, beneficiaries] = await Promise.all([
      Account.find({ user: req.user._id }).sort({ kind: 1 }).lean(),
      Beneficiary.find({ user: req.user._id }).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({ accounts, beneficiaries: beneficiaries.map(publicBeneficiary) });
  } catch (err) {
    console.error('Accounts error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/accounts/rails
// @desc    Transfer rails with their fees, so the UI can quote before sending
router.get('/rails', protect, (req, res) => res.json(TRANSFER_RAILS));

// @route   POST /api/accounts/transfer
// @desc    Move money between own accounts (instant) or out to a third party
router.post('/transfer', protect, kycSubmitted, async (req, res) => {
  try {
    const {
      scope = 'internal', fromAccountId, toAccountId, amount,
      rail = 'ACH', reference = '', note = '',
      recipientName, recipientBank, recipientNumber, nickname, saveBeneficiary,
    } = req.body;

    const settings = await getSettings();
    const value = round2(amount);
    if (!Number.isFinite(value) || value < settings.minTransfer) {
      return res.status(400).json({ message: `The minimum transfer is $${settings.minTransfer}.` });
    }

    const from = await Account.findOne({ _id: fromAccountId, user: req.user._id });
    if (!from) return res.status(400).json({ message: 'Pick an account to send from.' });
    if (from.isFrozen) return res.status(403).json({ message: 'That account is frozen. Contact support.' });

    const memo = String(reference || note || '').slice(0, 140);

    /* ---------- internal: instant, free, both legs written ---------- */
    if (scope === 'internal') {
      const to = await Account.findOne({ _id: toAccountId, user: req.user._id });
      if (!to) return res.status(400).json({ message: 'Pick an account to send to.' });
      if (String(to._id) === String(from._id)) {
        return res.status(400).json({ message: 'Choose two different accounts.' });
      }
      if (from.balance < value) {
        return res.status(400).json({ message: 'That transfer is larger than the available balance.' });
      }

      await debit(from, value, {
        type: 'transfer', label: `Transfer to ${to.name}`,
        detail: `From ${from.name} · instant`, method: 'Internal', reference: memo,
      });
      await credit(to, value, {
        type: 'transfer', label: `Transfer from ${from.name}`,
        detail: `To ${to.name} · instant`, method: 'Internal', reference: memo,
      });

      const accounts = await Account.find({ user: req.user._id }).sort({ kind: 1 }).lean();
      return res.json({ ok: true, accounts });
    }

    /* ---------- external: KYC-approved only, fee applied, queued ---------- */
    if ((req.user.kyc?.status || 'unverified') !== 'verified') {
      return res.status(403).json({
        message: 'Identity verification must be approved before sending money externally.',
        code: 'KYC_NOT_VERIFIED',
      });
    }
    if (!recipientName || !recipientNumber) {
      return res.status(400).json({ message: 'Add the recipient’s name and account number.' });
    }

    const railInfo = TRANSFER_RAILS.find((r) => r.id === rail) || TRANSFER_RAILS[0];
    const total = round2(value + railInfo.fee);
    if (from.balance < total) {
      return res.status(400).json({ message: 'That transfer is larger than the available balance, including the fee.' });
    }

    // Debited now, settled by an admin — the ledger row stays pending until then.
    await debit(from, total, {
      type: 'transfer',
      label: `Transfer to ${recipientName}`,
      detail: `${recipientBank || 'External bank'} ····${String(recipientNumber).slice(-4)} · ${railInfo.label}`,
      status: 'pending',
      method: railInfo.id,
      fee: railInfo.fee,
      counterparty: String(recipientName).slice(0, 120),
      destination: String(recipientNumber),
      reference: memo,
    });

    if (saveBeneficiary) {
      await Beneficiary.create({
        user: req.user._id,
        name: String(recipientName).slice(0, 120),
        bank: String(recipientBank || 'External bank').slice(0, 120),
        number: String(recipientNumber),
        nickname: String(nickname || '').slice(0, 60),
      });
    }

    await emails.transferEmail(req.user, {
      amount: value, to: recipientName, method: railInfo.label, fee: railInfo.fee,
    });

    const accounts = await Account.find({ user: req.user._id }).sort({ kind: 1 }).lean();
    res.json({ ok: true, accounts });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Transfer error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/accounts/beneficiaries
router.post('/beneficiaries', protect, async (req, res) => {
  try {
    const { name, bank, number, nickname } = req.body;
    if (!name || !number) return res.status(400).json({ message: 'Name and account number are required' });
    const b = await Beneficiary.create({
      user: req.user._id,
      name: String(name).slice(0, 120),
      bank: String(bank || 'External bank').slice(0, 120),
      number: String(number),
      nickname: String(nickname || '').slice(0, 60),
    });
    res.status(201).json(publicBeneficiary(b));
  } catch (err) {
    console.error('Beneficiary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/accounts/beneficiaries/:id
router.delete('/beneficiaries/:id', protect, async (req, res) => {
  try {
    const removed = await Beneficiary.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!removed) return res.status(404).json({ message: 'Recipient not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Beneficiary delete error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
