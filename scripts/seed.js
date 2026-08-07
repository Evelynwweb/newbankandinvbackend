#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');
const Loan = require('../models/Loan');
const Card = require('../models/Card');
const Beneficiary = require('../models/Beneficiary');
const seedPaymentMethods = require('../utils/seedPaymentMethods');
const { openAccountsFor, round2, monthlyPayment } = require('../utils/banking');

/* ============================================================
   Development seed — one demo client with a realistic history so
   the dashboard and admin panel have something to render.

     node scripts/seed.js

   Set SEED_DEMO_PASSWORD to choose the demo password (default demo1234).
   Refuses to run when NODE_ENV=production.
   ============================================================ */

const DEMO_EMAIL = 'demo@aurivest.com';
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysAhead = (n) => new Date(Date.now() + n * 86400000);

async function run() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo data with NODE_ENV=production');
    process.exit(1);
  }

  await connectDB();
  await seedPaymentMethods();

  // Start clean so re-running the seed is idempotent.
  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    await Promise.all([
      Account.deleteMany({ user: existing._id }),
      Transaction.deleteMany({ user: existing._id }),
      Investment.deleteMany({ user: existing._id }),
      Loan.deleteMany({ user: existing._id }),
      Card.deleteMany({ user: existing._id }),
      Beneficiary.deleteMany({ user: existing._id }),
    ]);
    await existing.deleteOne();
    console.log('↻ Removed the previous demo client');
  }

  const user = await User.create({
    name: 'Alexandra Reyes',
    email: DEMO_EMAIL,
    password: process.env.SEED_DEMO_PASSWORD || 'demo1234',
    phone: '+1 415 555 0142',
    country: 'United States',
    emailVerified: true,
    profitBalance: 1284.62,
    welcomeBonusClaimed: true,
    kyc: { status: 'verified', documentType: 'passport', submittedAt: daysAgo(40), reviewedAt: daysAgo(39) },
  });

  await openAccountsFor(user._id);
  const accounts = await Account.find({ user: user._id });
  const byKind = (k) => accounts.find((a) => a.kind === k);
  const checking = byKind('checking');
  const savings = byKind('savings');
  const invest = byKind('investment');

  checking.balance = 18452.86;
  savings.balance = 64200.4;
  invest.balance = 128740.15;
  await Promise.all([checking.save(), savings.save(), invest.save()]);

  await Card.insertMany([
    { user: user._id, account: checking._id, label: 'Aurivest Reserve', network: 'Visa Infinite', type: 'physical', last4: '4821', expiry: '09/29', monthlyLimit: 12000, spent: 3184.22, color: 'amber' },
    { user: user._id, account: checking._id, label: 'Online Virtual', network: 'Mastercard', type: 'virtual', last4: '9037', expiry: '02/28', monthlyLimit: 3000, spent: 412.9, color: 'dark' },
  ]);

  await Beneficiary.insertMany([
    { user: user._id, name: 'Daniel Okafor', bank: 'Chase Bank', number: '5540118293', nickname: 'Rent' },
    { user: user._id, name: 'Mira Solberg', bank: 'Aurivest', number: savings.number, nickname: 'Sister' },
  ]);

  await Investment.insertMany([
    { user: user._id, planId: 'balanced', planName: 'Balanced Portfolio', principal: 45000, rate: 7.8, termMonths: 12, startedAt: daysAgo(190), maturesAt: daysAhead(175) },
    { user: user._id, planId: 'treasury', planName: 'Treasury Ladder', principal: 20000, rate: 5.1, termMonths: 6, startedAt: daysAgo(70), maturesAt: daysAhead(110) },
    { user: user._id, planId: 'growth', planName: 'Growth Portfolio', principal: 60000, rate: 11.2, termMonths: 24, startedAt: daysAgo(310), maturesAt: daysAhead(420) },
  ]);

  await Loan.create({
    user: user._id, productId: 'auto', product: 'Auto Loan',
    principal: 32000, apr: 6.4, termMonths: 60,
    monthlyPayment: monthlyPayment(32000, 6.4, 60),
    outstanding: 21440.8, status: 'active', appliedAt: daysAgo(300), decidedAt: daysAgo(299),
  });

  const ledger = [
    { type: 'interest', label: 'Monthly interest', detail: 'Reserve Savings · 4.65% APY', amount: 248.9, account: savings._id, at: 2 },
    { type: 'card', label: 'Aurivest Reserve card', detail: 'Blue Bottle Coffee · San Francisco', amount: -18.4, account: checking._id, at: 2 },
    { type: 'transfer', label: 'Transfer to Daniel Okafor', detail: 'Chase Bank ····8293 · Rent', amount: -2400, account: checking._id, at: 4 },
    { type: 'deposit', label: 'Payroll deposit', detail: 'Northwind Studios · ACH', amount: 8420, account: checking._id, at: 6 },
    { type: 'investment', label: 'Growth Portfolio', detail: 'Quarterly gain credited', amount: 1682.4, account: invest._id, at: 9 },
    { type: 'card', label: 'Online Virtual card', detail: 'Adobe Creative Cloud', amount: -59.99, account: checking._id, at: 12 },
    { type: 'loan', label: 'Auto loan payment', detail: 'Instalment 41 of 60', amount: -624.11, account: checking._id, at: 14 },
    { type: 'withdraw', label: 'ATM withdrawal', detail: 'Market St · San Francisco', amount: -300, account: checking._id, at: 18 },
    { type: 'investment', label: 'Balanced Portfolio', detail: 'Top-up subscription', amount: -5000, account: invest._id, at: 24 },
    { type: 'referral', label: 'Referral reward', detail: 'Mira Solberg joined Aurivest', amount: 75, account: checking._id, at: 30 },
  ];
  await Transaction.insertMany(ledger.map((t) => ({
    user: user._id, account: t.account, type: t.type, label: t.label,
    detail: t.detail, amount: round2(t.amount), status: 'completed', createdAt: daysAgo(t.at),
  })));

  console.log(`✅ Demo client seeded: ${DEMO_EMAIL} / ${process.env.SEED_DEMO_PASSWORD || 'demo1234'}`);
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
