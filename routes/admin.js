const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');
const BankInstruction = require('../models/BankInstruction');
const Holding = require('../models/Holding');
const PaymentMethod = require('../models/PaymentMethod');
const SupportMessage = require('../models/SupportMessage');
const { protect, admin } = require('../middleware/auth');
const sanitizeUser = require('../utils/sanitizeUser');
const { round2, credit, debit, primaryAccount, accruedOn, openAccountsFor } = require('../utils/banking');
const { getSettings, updateSettings } = require('../config/settings');
const { INSTRUMENTS } = require('../config/constants');
const emails = require('../utils/emails');

// Every route below is admin-only.
router.use(protect, admin);

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ============================================================
   Dashboard
   ============================================================ */

// @route   GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [
      clients, activeClients, accounts, pendingDeposits, pendingWithdrawals,
      pendingKyc, openTickets, investments, holdings, recent,
    ] = await Promise.all([
      User.countDocuments({ role: 'client' }),
      User.countDocuments({ role: 'client', isActive: true }),
      Account.find().select('kind balance').lean(),
      Transaction.countDocuments({ type: 'deposit', status: 'pending' }),
      Transaction.countDocuments({ type: 'withdraw', status: 'pending' }),
      User.countDocuments({ 'kyc.status': 'pending' }),
      SupportMessage.countDocuments({ status: 'open' }),
      Investment.find({ status: 'active' }).select('principal').lean(),
      Holding.find().select("units price").lean(),
      Transaction.find().sort({ createdAt: -1 }).limit(10).populate('user', 'name email').lean(),
    ]);

    const byKind = (k) => round2(accounts.filter((a) => a.kind === k).reduce((s, a) => s + a.balance, 0));

    res.json({
      clients,
      activeClients,
      // round2 again after adding two already-rounded sums, or the cents drift
      cashTotal: byKind('cash'),
      brokerageTotal: byKind('brokerage'),
      retirementTotal: byKind('retirement'),
      holdingsValue: round2(holdings.reduce((s, h) => s + h.units * h.price, 0)),
      aum: round2(accounts.reduce((s, a) => s + a.balance, 0)),
      mandates: investments.length,
      mandatePrincipal: round2(investments.reduce((s, i) => s + i.principal, 0)),
      queue: {
        deposits: pendingDeposits,
        withdrawals: pendingWithdrawals,
        kyc: pendingKyc,
        tickets: openTickets,
      },
      recent: recent.map(({ proof, ...t }) => ({ ...t, hasProof: !!proof })),
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ============================================================
   Clients
   ============================================================ */

// @route   GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { q, role, status, limit } = req.query;
    const query = {};
    if (role) query.role = role;
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      query.$or = [{ name: rx }, { email: rx }, { referralCode: rx }];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 200, 500))
      .lean();

    // Attach each client's balances in one extra query, not N.
    const ids = users.map((u) => u._id);
    const accounts = await Account.find({ user: { $in: ids } }).select('user kind balance').lean();
    const totals = {};
    for (const a of accounts) {
      const key = String(a.user);
      totals[key] = totals[key] || { checking: 0, savings: 0, investment: 0, total: 0 };
      totals[key][a.kind] = round2(a.balance);
      totals[key].total = round2(totals[key].total + a.balance);
    }

    res.json(users.map((u) => ({
      ...sanitizeUser(u),
      balances: totals[String(u._id)] || { checking: 0, savings: 0, investment: 0, total: 0 },
    })));
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/admin/users/:id
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ message: 'Client not found' });

    const [accounts, transactions, investments, holdings] = await Promise.all([
      Account.find({ user: user._id }).lean(),
      Transaction.find({ user: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
      Investment.find({ user: user._id }).sort({ createdAt: -1 }).lean(),
      Holding.find({ user: user._id }).sort({ symbol: 1 }).lean(),
    ]);

    res.json({
      user: sanitizeUser(user),
      accounts,
      transactions: transactions.map(({ proof, ...t }) => ({ ...t, hasProof: !!proof })),
      investments: investments.map((i) => ({ ...i, accrued: accruedOn(i) })),
      holdings: holdings.map((h) => ({ ...h, marketValue: round2(h.units * h.price) })),
    });
  } catch (err) {
    console.error('Admin user detail error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/admin/users/:id
// @desc    Activate/deactivate, promote, or correct profile details
router.patch('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Client not found' });

    const { isActive, role, name, phone, country, emailVerified } = req.body;

    // Guard against an admin locking themselves — or the last admin — out.
    if (role === 'client' && user.role === 'admin') {
      const admins = await User.countDocuments({ role: 'admin' });
      if (admins <= 1) return res.status(400).json({ message: 'You cannot demote the last admin.' });
    }
    if (isActive === false && String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    if (isActive !== undefined) user.isActive = !!isActive;
    if (role && ['client', 'admin'].includes(role)) user.role = role;
    if (emailVerified !== undefined) user.emailVerified = !!emailVerified;
    if (name !== undefined) user.name = String(name).trim().slice(0, 120);
    if (phone !== undefined) user.phone = String(phone).slice(0, 40);
    if (country !== undefined) user.country = String(country).slice(0, 80);

    await user.save();
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Admin user update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/admin/users
// @desc    Open an account on a client's behalf (branch/phone onboarding)
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role = 'client', phone, country } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (await User.findOne({ email: String(email).toLowerCase() })) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const user = await User.create({
      name: String(name).trim(),
      email,
      password,
      phone: phone || '',
      country: country || '',
      role: ['client', 'admin'].includes(role) ? role : 'client',
      emailVerified: true, // opened in person — the email is already known good
    });
    await openAccountsFor(user._id);

    res.status(201).json(sanitizeUser(user));
  } catch (err) {
    console.error('Admin user create error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ============================================================
   Balance adjustments
   ============================================================ */

// @route   POST /api/admin/users/:id/adjust
// @desc    Credit or debit an account directly. Always writes a ledger row —
//          money never changes hands without a trace.
router.post('/users/:id/adjust', async (req, res) => {
  try {
    const { accountId, amount, reason, type = 'interest' } = req.body;
    const value = round2(amount);
    if (!Number.isFinite(value) || value === 0) {
      return res.status(400).json({ message: 'Enter a non-zero amount.' });
    }
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({ message: 'A reason is required for every adjustment.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Client not found' });

    const account = accountId
      ? await Account.findOne({ _id: accountId, user: user._id })
      : await primaryAccount(user._id);
    if (!account) return res.status(400).json({ message: 'Account not found' });

    const entry = {
      type,
      label: value > 0 ? 'Credit applied' : 'Debit applied',
      detail: String(reason).slice(0, 200),
      reviewedAt: new Date(),
      reviewedBy: req.user._id,
    };

    if (value > 0) await credit(account, value, entry);
    else await debit(account, Math.abs(value), entry);

    const fresh = await Account.findById(account._id).lean();
    res.json({ ok: true, account: fresh });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Adjust error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/admin/users/:id/earnings
// @desc    Credit the earnings wallet (interest / mandate gains the client
//          then sweeps into checking themselves).
router.post('/users/:id/earnings', async (req, res) => {
  try {
    const value = round2(req.body.amount);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ message: 'Enter a positive amount.' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $inc: { profitBalance: value } },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Client not found' });

    await Transaction.create({
      user: user._id,
      type: 'interest',
      label: 'Earnings credited',
      detail: String(req.body.reason || 'Periodic return').slice(0, 200),
      amount: value,
      status: 'completed',
      reviewedAt: new Date(),
      reviewedBy: req.user._id,
    });

    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Earnings credit error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ============================================================
   Approvals — deposits, withdrawals, external transfers
   ============================================================ */

// @route   GET /api/admin/transactions
router.get('/transactions', async (req, res) => {
  try {
    const { status, type, limit } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (type && type !== 'all') query.type = type;

    const rows = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 200, 500))
      .populate('user', 'name email')
      .lean();

    res.json(rows.map(({ proof, ...t }) => ({ ...t, hasProof: !!proof })));
  } catch (err) {
    console.error('Admin transactions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/admin/transactions/:id/proof
// @desc    The payment-proof image, fetched only when a reviewer opens it
router.get('/transactions/:id/proof', async (req, res) => {
  try {
    const t = await Transaction.findById(req.params.id).select('proof proofUploadedAt').lean();
    if (!t || !t.proof) return res.status(404).json({ message: 'No proof attached' });
    res.json({ proof: t.proof, uploadedAt: t.proofUploadedAt });
  } catch (err) {
    console.error('Proof fetch error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/admin/transactions/:id/approve
router.post('/transactions/:id/approve', async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id);
    if (!txn) return res.status(404).json({ message: 'Transaction not found' });
    if (txn.status !== 'pending') {
      return res.status(409).json({ message: `That item is already ${txn.status}.` });
    }

    const account = txn.account ? await Account.findById(txn.account) : await primaryAccount(txn.user);
    const client = await User.findById(txn.user);

    if (txn.type === 'deposit') {
      // Pending deposits never moved the balance — approving is what credits it.
      if (!account) return res.status(400).json({ message: 'The target account no longer exists.' });
      account.balance = round2(account.balance + Math.abs(txn.amount));
      await account.save();

      // First funded deposit pays the referrer, once.
      await payReferralIfDue(client, req.user._id);
    }
    // Withdrawals and external transfers already debited on request —
    // approving only settles the ledger row.

    txn.status = 'completed';
    txn.reviewedAt = new Date();
    txn.reviewedBy = req.user._id;
    if (txn.type === 'deposit') txn.label = 'Deposit received';
    if (txn.type === 'withdraw') txn.label = 'Withdrawal sent';
    await txn.save();

    if (client && txn.type === 'deposit') {
      await emails.depositEmail(client, {
        amount: Math.abs(txn.amount), method: txn.method || 'Bank transfer',
        accountName: account?.name || 'your account', status: 'completed',
      });
    }
    if (client && txn.type === 'withdraw') {
      await emails.withdrawalEmail(client, {
        amount: Math.abs(txn.amount), method: txn.method || 'Bank transfer',
        destination: txn.destination, status: 'completed',
      });
    }

    res.json({ ok: true, transaction: txn });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/admin/transactions/:id/reject
router.post('/transactions/:id/reject', async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id);
    if (!txn) return res.status(404).json({ message: 'Transaction not found' });
    if (txn.status !== 'pending') {
      return res.status(409).json({ message: `That item is already ${txn.status}.` });
    }

    // Withdrawals and outbound transfers held the money on request — a
    // rejection has to hand it back, or the client is simply short.
    if (txn.amount < 0) {
      const account = txn.account ? await Account.findById(txn.account) : await primaryAccount(txn.user);
      if (account) {
        account.balance = round2(account.balance + Math.abs(txn.amount));
        await account.save();
        await Transaction.create({
          user: txn.user,
          account: account._id,
          type: txn.type,
          label: 'Reversal — request declined',
          detail: String(req.body.reason || 'Declined by the bank').slice(0, 200),
          amount: Math.abs(txn.amount),
          status: 'completed',
          reviewedAt: new Date(),
          reviewedBy: req.user._id,
        });
      }
    }

    txn.status = 'failed';
    txn.detail = String(req.body.reason || txn.detail).slice(0, 200);
    txn.reviewedAt = new Date();
    txn.reviewedBy = req.user._id;
    await txn.save();

    res.json({ ok: true, transaction: txn });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* Pay the referral reward the first time a referred client funds their
   account. Guarded by referralRewarded so it can only ever fire once. */
async function payReferralIfDue(client, adminId) {
  if (!client?.referredBy || client.referralRewarded) return;
  const settings = await getSettings();
  const reward = settings.referralReward;
  if (!(reward > 0)) return;

  const referrer = await User.findById(client.referredBy);
  if (!referrer) return;

  client.referralRewarded = true;
  await client.save();

  referrer.referralEarnings = round2((referrer.referralEarnings || 0) + reward);
  await referrer.save();

  const account = await primaryAccount(referrer._id);
  if (account) {
    await credit(account, reward, {
      type: 'referral',
      label: 'Referral reward',
      detail: `${client.name} joined Aurivest`,
      refUser: client._id,
      reviewedAt: new Date(),
      reviewedBy: adminId,
    });
  }
  await emails.referralRewardEmail(referrer, { amount: reward, referredName: client.name });
}

/* ============================================================
   KYC review
   ============================================================ */

// @route   GET /api/admin/kyc
router.get('/kyc', async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const query = status === 'all' ? { 'kyc.status': { $ne: 'unverified' } } : { 'kyc.status': status };
    const users = await User.find(query).sort({ 'kyc.submittedAt': -1 }).limit(200).lean();

    res.json(users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      country: u.country,
      kyc: {
        status: u.kyc?.status,
        fullName: u.kyc?.fullName,
        dob: u.kyc?.dob,
        address: u.kyc?.address,
        documentType: u.kyc?.documentType,
        submittedAt: u.kyc?.submittedAt,
        reviewedAt: u.kyc?.reviewedAt,
        rejectionReason: u.kyc?.rejectionReason,
        hasFront: !!u.kyc?.documentFront,
        hasBack: !!u.kyc?.documentBack,
      },
    })));
  } catch (err) {
    console.error('Admin KYC list error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/admin/kyc/:id/documents
// @desc    The document images — fetched only when a reviewer opens the case
router.get('/kyc/:id/documents', async (req, res) => {
  try {
    const u = await User.findById(req.params.id).select('kyc.documentFront kyc.documentBack').lean();
    if (!u) return res.status(404).json({ message: 'Client not found' });
    res.json({ front: u.kyc?.documentFront || null, back: u.kyc?.documentBack || null });
  } catch (err) {
    console.error('KYC documents error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/admin/kyc/:id/decide
router.post('/kyc/:id/decide', async (req, res) => {
  try {
    const { approve, reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Client not found' });
    if (!approve && (!reason || String(reason).trim().length < 3)) {
      return res.status(400).json({ message: 'Give a reason so the client knows what to fix.' });
    }

    user.kyc.status = approve ? 'verified' : 'rejected';
    user.kyc.reviewedAt = new Date();
    user.kyc.rejectionReason = approve ? null : String(reason).slice(0, 300);
    if (approve) {
      // Approved documents have served their purpose — don't keep the images.
      user.kyc.documentFront = null;
      user.kyc.documentBack = null;
    }
    await user.save();

    await emails.kycDecisionEmail(user, !!approve, reason);
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('KYC decide error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ============================================================
   Positions
   ============================================================ */

// @route   GET /api/admin/investments
router.get('/investments', async (req, res) => {
  try {
    const { status } = req.query;
    const query = status && status !== 'all' ? { status } : {};
    const rows = await Investment.find(query).sort({ createdAt: -1 }).limit(300)
      .populate('user', 'name email').lean();
    res.json(rows.map((i) => ({ ...i, accrued: accruedOn(i) })));
  } catch (err) {
    console.error('Admin investments error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ============================================================
   Payment methods
   ============================================================ */

router.get('/payment-methods', async (req, res) => {
  try {
    const rows = await PaymentMethod.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
    res.json(rows);
  } catch (err) {
    console.error('Payment methods error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/payment-methods', async (req, res) => {
  try {
    const { label } = req.body;
    if (!label) return res.status(400).json({ message: 'A label is required' });
    const created = await PaymentMethod.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    console.error('Payment method create error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/payment-methods/:id', async (req, res) => {
  try {
    const updated = await PaymentMethod.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!updated) return res.status(404).json({ message: 'Method not found' });
    res.json(updated);
  } catch (err) {
    console.error('Payment method update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/payment-methods/:id', async (req, res) => {
  try {
    const removed = await PaymentMethod.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Method not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Payment method delete error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ============================================================
   Support
   ============================================================ */

router.get('/support', async (req, res) => {
  try {
    const { status } = req.query;
    const query = status && status !== 'all' ? { status } : {};
    const [messages, openCount] = await Promise.all([
      SupportMessage.find(query).sort({ createdAt: -1 }).limit(200).populate('user', 'name email').lean(),
      SupportMessage.countDocuments({ status: 'open' }),
    ]);
    res.json({ messages, openCount });
  } catch (err) {
    console.error('Admin support error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/support/:id/reply', async (req, res) => {
  try {
    const reply = String(req.body.reply || '').trim();
    if (reply.length < 2) return res.status(400).json({ message: 'Write a reply first.' });

    const msg = await SupportMessage.findById(req.params.id).populate('user', 'name email');
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    msg.reply = reply.slice(0, 4000);
    msg.repliedAt = new Date();
    msg.status = 'resolved';
    await msg.save();

    if (msg.user) await emails.supportReplyEmail(msg.user, { subject: msg.subject, reply: msg.reply });
    res.json(msg);
  } catch (err) {
    console.error('Support reply error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/support/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'read', 'resolved'].includes(status)) {
      return res.status(400).json({ message: 'Unknown status' });
    }
    const msg = await SupportMessage.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    res.json(msg);
  } catch (err) {
    console.error('Support update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ============================================================
   Receiving wires — the inbound funding details clients are shown
   ============================================================ */

router.get('/bank-instructions', async (req, res) => {
  try {
    res.json(await BankInstruction.find().sort({ sortOrder: 1, createdAt: 1 }).lean());
  } catch (err) {
    console.error('Wires list error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/bank-instructions', async (req, res) => {
  try {
    const { label, accountName, bankName, accountNumber } = req.body;
    if (!label || !accountName || !bankName || !accountNumber) {
      return res.status(400).json({ message: 'Label, account name, bank name and account number are required.' });
    }
    res.status(201).json(await BankInstruction.create(req.body));
  } catch (err) {
    console.error('Wire create error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/bank-instructions/:id', async (req, res) => {
  try {
    const updated = await BankInstruction.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Route not found' });
    res.json(updated);
  } catch (err) {
    console.error('Wire update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/bank-instructions/:id', async (req, res) => {
  try {
    const removed = await BankInstruction.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Route not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Wire delete error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ============================================================
   Platform settings
   ============================================================ */

router.get('/settings', async (req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    console.error('Admin settings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    res.json(await updateSettings(req.body));
  } catch (err) {
    res.status(400).json({ message: err.message || 'Could not save settings' });
  }
});

module.exports = router;
