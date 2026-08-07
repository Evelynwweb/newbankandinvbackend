const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { ACCOUNT_DEFAULTS } = require('../config/constants');

/* ============================================================
   Shared money primitives. Every balance change in the API goes
   through here so rounding, the no-overdraft rule and the ledger
   entry stay in one place.
   ============================================================ */

/* Money is stored to the cent. Floating point drift on repeated
   credits/debits is the classic ledger bug — round on every write. */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const randomDigits = (n) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/* Account numbers must be unique bank-wide; retry on the rare collision. */
async function generateAccountNumber() {
  for (let i = 0; i < 10; i++) {
    const number = `${Math.floor(1 + Math.random() * 8)}${randomDigits(9)}`;
    if (!(await Account.exists({ number }))) return number;
  }
  throw new Error('Could not allocate an account number');
}

/* Open the standard set of accounts for a newly registered client. */
async function openAccountsFor(userId) {
  const kinds = ['checking', 'savings', 'investment'];
  const accounts = [];
  for (const kind of kinds) {
    const def = ACCOUNT_DEFAULTS[kind];
    accounts.push({
      user: userId,
      kind,
      name: def.name,
      number: await generateAccountNumber(),
      balance: 0,
      apy: def.apy,
    });
  }
  return Account.insertMany(accounts);
}

const primaryAccount = (userId) => Account.findOne({ user: userId, kind: 'checking' });

/* Credit an account and write the matching ledger row. */
async function credit(account, amount, entry) {
  const value = round2(amount);
  if (value <= 0) throw new Error('Credit amount must be positive');
  account.balance = round2(account.balance + value);
  await account.save();
  return Transaction.create({
    user: account.user,
    account: account._id,
    amount: value,
    ...entry,
  });
}

/* Debit an account and write the matching ledger row.
   Refuses to take a balance negative — the bank does not do overdrafts. */
async function debit(account, amount, entry) {
  const value = round2(amount);
  if (value <= 0) throw new Error('Debit amount must be positive');
  if (account.balance < value) {
    const err = new Error('That is more than the available balance');
    err.status = 400;
    throw err;
  }
  account.balance = round2(account.balance - value);
  await account.save();
  return Transaction.create({
    user: account.user,
    account: account._id,
    amount: -value,
    ...entry,
  });
}

/* Standard amortising payment: P·r / (1 − (1+r)^−n). Interest-free
   products (apr 0) fall back to straight-line repayment. */
function monthlyPayment(principal, apr, months) {
  if (!principal || !months) return 0;
  const r = apr / 100 / 12;
  if (r === 0) return round2(principal / months);
  return round2((principal * r) / (1 - Math.pow(1 + r, -months)));
}

/* Simple annualised accrual, prorated across the elapsed term. Flexible
   mandates (termMonths 0) accrue on the same basis with no end date. */
function accruedOn(investment) {
  const elapsedDays = (Date.now() - new Date(investment.startedAt).getTime()) / 86400000;
  return round2(investment.principal * (investment.rate / 100) * (elapsedDays / 365));
}

module.exports = {
  round2,
  generateAccountNumber,
  openAccountsFor,
  primaryAccount,
  credit,
  debit,
  monthlyPayment,
  accruedOn,
};
