require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Account = require('../models/Account');
const Investment = require('../models/Investment');
const Holding = require('../models/Holding');
const Transaction = require('../models/Transaction');
const BankInstruction = require('../models/BankInstruction');
const SupportMessage = require('../models/SupportMessage');
const { openAccountsFor, round2 } = require('../utils/banking');
const { INSTRUMENTS } = require('../config/constants');

/* ============================================================
   Seeds a demo client with a realistic investment book, plus the
   platform's receiving-wire instructions.

     npm run seed              add if missing
     npm run seed -- --reset   wipe the demo client first
   ============================================================ */

const DEMO_EMAIL = 'demo@aurivest.com';
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysAhead = (n) => new Date(Date.now() + n * 86400000);

async function seedBankInstructions() {
  if (await BankInstruction.countDocuments()) return;
  await BankInstruction.insertMany([
    {
      label: 'USD domestic wire / ACH',
      accountName: 'Aurivest Securities LLC — Client Funds',
      bankName: 'First Meridian Trust',
      accountNumber: '4402117836',
      routingNumber: '021000021',
      swiftCode: 'FMTRUS33',
      bankAddress: '400 Lexington Avenue, New York, NY 10017, United States',
      beneficiaryAddress: 'Aurivest Securities LLC, 1 Bay Plaza, Suite 900, New York, NY 10004',
      currency: 'USD',
      notes: 'Include your reference in the wire memo so the credit can be matched to your account.',
      sortOrder: 0,
    },
    {
      label: 'International SWIFT',
      accountName: 'Aurivest Securities LLC — Client Funds',
      bankName: 'First Meridian Trust',
      accountNumber: 'GB29FMTR60161331926819',
      routingNumber: '',
      swiftCode: 'FMTRGB2L',
      bankAddress: '18 Threadneedle Street, London EC2R 8AR, United Kingdom',
      beneficiaryAddress: 'Aurivest Securities LLC, 1 Bay Plaza, Suite 900, New York, NY 10004',
      currency: 'USD',
      notes: 'Correspondent charges are shared (SHA). Allow two to four business days.',
      sortOrder: 1,
    },
  ]);
  console.log('🏦 Seeded receiving-wire instructions');
}

async function run() {
  await connectDB();
  await seedBankInstructions();

  const reset = process.argv.includes('--reset');
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
    console.log(`✔ ${DEMO_EMAIL} already exists — pass --reset to rebuild it`);
    return mongoose.connection.close();
  }

  user = await User.create({
    name: 'Alexandra Reyes',
    email: DEMO_EMAIL,
    password: process.env.SEED_DEMO_PASSWORD || 'demo1234',
    phone: '+1 415 555 0142',
    country: 'United States',
    emailVerified: true,
    kyc: { status: 'verified', submittedAt: daysAgo(40), reviewedAt: daysAgo(39), documentType: 'passport' },
    bankAccount: {
      accountName: 'Alexandra Reyes',
      bankName: 'Pacific Union Bank',
      accountNumber: '8820114937',
      routingNumber: '121000358',
      swiftCode: 'PACUUS6S',
      bankAddress: '55 Market Street, San Francisco, CA 94105, United States',
      homeAddress: '1420 Sansome Street, Apt 6B, San Francisco, CA 94111',
      currency: 'USD',
      verified: true,
      updatedAt: daysAgo(38),
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
    { type: 'deposit', label: 'Deposit received', detail: 'Bank wire → Cash Management', amount: 25000, account: cash._id, at: 14 },
    { type: 'investment', label: 'Private Credit', detail: 'Higher-Yield Add-Ons · funded from Cash Management', amount: -25000, account: cash._id, at: 120 },
    { type: 'trade', label: 'Buy BTC', detail: '0.420000 units at $57,380.95', amount: -24100, account: cash._id, at: 180 },
    { type: 'referral', label: 'Referral reward', detail: 'Mira Solberg opened an account', amount: 100, account: cash._id, at: 30 },
  ];
  await Transaction.insertMany(tx.map((t) => ({
    user: user._id, type: t.type, label: t.label, detail: t.detail,
    amount: t.amount, status: 'completed', account: t.account, createdAt: daysAgo(t.at),
  })));

  console.log(`✅ Seeded ${DEMO_EMAIL} with an investment book`);
  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('Seed failed:', err);
  await mongoose.connection.close();
  process.exit(1);
});
