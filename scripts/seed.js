require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Account = require('../models/Account');
const Investment = require('../models/Investment');
const Holding = require('../models/Holding');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const SupportMessage = require('../models/SupportMessage');
const { openAccountsFor } = require('../utils/banking');
const { INSTRUMENTS, DEFAULT_WALLETS } = require('../config/constants');

/* ============================================================
   Seeds the receiving wallets, a real administrator, and an
   optional demo client with a populated investment book.

     npm run seed                  wallets + admin, skip what exists
     npm run seed -- --demo        also create the demo client
     npm run seed -- --reset-demo  rebuild the demo client
     npm run seed -- --admin       force a new admin password

   The admin password is generated, printed once, and never stored
   anywhere but the hashed field. Copy it when you see it.
   ============================================================ */

const DEMO_EMAIL = 'demo@betamentmgt.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@betamentmgt.com';
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysAhead = (n) => new Date(Date.now() + n * 86400000);

/* Ambiguous characters removed so the password survives being read aloud. */
function strongPassword(len = 20) {
  const set = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  return Array.from(crypto.randomFillSync(new Uint32Array(len)))
    .map((n) => set[n % set.length])
    .join('');
}

async function seedWallets() {
  if (await Wallet.countDocuments()) {
    console.log('↷ Wallets already present — edit them in the admin panel');
    return;
  }
  await Wallet.insertMany(DEFAULT_WALLETS);
  console.log(`₿ Seeded ${DEFAULT_WALLETS.length} placeholder receiving wallets — replace the addresses in the admin panel`);
}

async function seedAdmin(force) {
  let admin = await User.findOne({ email: ADMIN_EMAIL });
  const password = process.env.ADMIN_PASSWORD || strongPassword();

  if (admin && !force) {
    console.log(`↷ Admin ${ADMIN_EMAIL} already exists — pass --admin to reset the password`);
    return null;
  }
  if (admin) {
    admin.password = password;          // pre-save hook hashes it
    admin.role = 'admin';
    admin.isActive = true;
    await admin.save();
    return { email: ADMIN_EMAIL, password, reset: true };
  }

  admin = await User.create({
    name: process.env.ADMIN_NAME || 'Betament Administrator',
    email: ADMIN_EMAIL,
    password,
    role: 'admin',
    emailVerified: true,
    kyc: { status: 'verified' },
  });
  return { email: ADMIN_EMAIL, password, reset: false };
}

async function seedDemo(reset) {
  let user = await User.findOne({ email: DEMO_EMAIL });

  if (user && reset) {
    await Promise.all([
      Account.deleteMany({ user: user._id }),
      Investment.deleteMany({ user: user._id }),
      Holding.deleteMany({ user: user._id }),
      Transaction.deleteMany({ user: user._id }),
      SupportMessage.deleteMany({ user: user._id }),
    ]);
    await user.deleteOne();
    user = null;
    console.log('🧹 Cleared the previous demo client');
  }
  if (user) {
    console.log(`↷ ${DEMO_EMAIL} already exists — pass --reset-demo to rebuild`);
    return;
  }

  user = await User.create({
    name: 'Alexandra Reyes',
    email: DEMO_EMAIL,
    password: process.env.SEED_DEMO_PASSWORD || 'demo1234',
    phone: '+1 415 555 0142',
    country: 'United States',
    emailVerified: true,
    kyc: { status: 'verified', submittedAt: daysAgo(40), reviewedAt: daysAgo(39), documentType: 'passport' },
    payout: {
      asset: 'USDT', network: 'TRC-20',
      address: 'TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC',
      label: 'Main payout wallet', verified: true, updatedAt: daysAgo(38),
    },
    profitBalance: 2140.85,
  });

  await openAccountsFor(user._id);
  const accounts = await Account.find({ user: user._id });
  const byKind = (k) => accounts.find((a) => a.kind === k);
  const cash = byKind('cash');
  const brokerage = byKind('brokerage');
  const retirement = byKind('retirement');

  cash.balance = 48250.4;
  brokerage.balance = 96500;
  retirement.balance = 132400;
  await Promise.all([cash.save(), brokerage.save(), retirement.save()]);

  await Investment.insertMany([
    { user: user._id, planId: 'treasury', planName: 'Treasury-Backed Account', familyId: 'cash', kind: 'yield', principal: 25000, rate: 5.18, termMonths: 3, startedAt: daysAgo(40), maturesAt: daysAhead(50) },
    { user: user._id, planId: 'bond-ladder', planName: 'Bond Ladder', familyId: 'fixed-income', kind: 'yield', principal: 30000, rate: 5.45, termMonths: 12, startedAt: daysAgo(150), maturesAt: daysAhead(215) },
    { user: user._id, planId: 'core-etf', planName: 'Core ETF Portfolio', familyId: 'portfolios', kind: 'managed', principal: 40000, rate: 7.8, termMonths: 12, startedAt: daysAgo(200), maturesAt: daysAhead(165) },
    { user: user._id, planId: 'roth-ira', planName: 'Roth IRA', familyId: 'retirement', kind: 'wrapper', principal: 92000, rate: 7.4, termMonths: 0, startedAt: daysAgo(620), maturesAt: null },
    { user: user._id, planId: 'private-credit', planName: 'Private Credit', familyId: 'alternatives', kind: 'yield', principal: 25000, rate: 13.8, termMonths: 24, startedAt: daysAgo(120), maturesAt: daysAhead(600) },
  ]);

  const pick = (s) => INSTRUMENTS.find((i) => i.symbol === s);
  await Holding.insertMany([
    { user: user._id, account: brokerage._id, symbol: 'VOO', name: pick('VOO').name, kind: 'etf', units: 42.5, costBasis: 19800, price: pick('VOO').price },
    { user: user._id, account: brokerage._id, symbol: 'AAPL', name: pick('AAPL').name, kind: 'equity', units: 60, costBasis: 12400, price: pick('AAPL').price },
    { user: user._id, account: brokerage._id, symbol: 'NVDA', name: pick('NVDA').name, kind: 'equity', units: 85.25, costBasis: 9600, price: pick('NVDA').price },
    { user: user._id, account: brokerage._id, symbol: 'BTC', name: pick('BTC').name, kind: 'crypto', units: 0.42, costBasis: 24100, price: pick('BTC').price },
  ]);

  const tx = [
    { type: 'interest', label: 'Monthly interest', detail: 'Cash Management · 4.65% APY', amount: 186.4, account: cash._id, at: 2 },
    { type: 'trade', label: 'Buy NVDA', detail: '12.000000 units at $138.25', amount: -1659, account: cash._id, at: 4 },
    { type: 'dividend', label: 'VOO distribution', detail: 'Quarterly dividend', amount: 214.8, account: brokerage._id, at: 9 },
    { type: 'deposit', label: 'Deposit received', detail: 'USDT · TRC-20', amount: 25000, account: cash._id, at: 14 },
    { type: 'deposit', label: 'Deposit received', detail: 'BTC · Bitcoin', amount: 40000, account: cash._id, at: 96 },
    { type: 'investment', label: 'Private Credit', detail: 'Higher-Yield Add-Ons · funded from Cash Management', amount: -25000, account: cash._id, at: 120 },
    { type: 'referral', label: 'Referral reward', detail: 'Mira Solberg opened an account', amount: 100, account: cash._id, at: 30 },
  ];
  await Transaction.insertMany(tx.map((t) => ({
    user: user._id, type: t.type, label: t.label, detail: t.detail,
    amount: t.amount, status: 'completed', account: t.account, createdAt: daysAgo(t.at),
  })));

  console.log(`✅ Seeded ${DEMO_EMAIL} with an investment book`);
}

async function run() {
  await connectDB();
  const arg = (f) => process.argv.includes(f);

  await seedWallets();
  const admin = await seedAdmin(arg('--admin'));
  if (arg('--demo') || arg('--reset-demo')) await seedDemo(arg('--reset-demo'));

  if (admin) {
    console.log('\n' + '═'.repeat(58));
    console.log(admin.reset ? '  ADMIN PASSWORD RESET' : '  ADMINISTRATOR CREATED');
    console.log('═'.repeat(58));
    console.log(`  Email     ${admin.email}`);
    console.log(`  Password  ${admin.password}`);
    console.log('═'.repeat(58));
    console.log('  Shown once. Store it in a password manager and change');
    console.log('  it after the first sign-in.\n');
  }

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('Seed failed:', err);
  await mongoose.connection.close();
  process.exit(1);
});
