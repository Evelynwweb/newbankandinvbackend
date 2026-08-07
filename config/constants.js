/* ============================================================
   Platform economics and product catalogue.

   MIN_* values here are only the seed defaults for the
   admin-editable Setting document (config/settings.js) — the live
   values come from there.

   PLAN_CATALOGUE and LOAN_PRODUCTS must stay in step with the copy on
   the marketing site (invandbankfrontend/src/pages/topics.js and
   PricingPage.jsx). The frontend renders whatever this returns.
   ============================================================ */
module.exports = {
  MIN_DEPOSIT: 50,
  MIN_WITHDRAWAL: 25,
  MIN_TRANSFER: 10,
  REFERRAL_REWARD: 75,        // flat USD per referred client who funds an account
  OVERDRAFT_ALLOWED: false,   // balances may never go negative

  // Deposit-account rates, applied when an account is opened.
  ACCOUNT_DEFAULTS: {
    checking: { name: 'Everyday Checking', apy: 0.75 },
    savings: { name: 'Reserve Savings', apy: 4.65 },
    investment: { name: 'Wealth Portfolio', apy: 0 },
  },

  /* Investment mandates. `termMonths: 0` means flexible / no lock-up.
     `rate` is an annualised target (or APY for the flexible savings tier). */
  PLAN_CATALOGUE: [
    {
      id: 'reserve', name: 'Reserve Savings', horizon: 'Flexible', termMonths: 0,
      rate: 4.65, min: 100, risk: 'Insured',
      blurb: 'High-yield insured savings. Withdraw any day, no penalty.',
    },
    {
      id: 'treasury', name: 'Treasury Ladder', horizon: '6 Months', termMonths: 6,
      rate: 5.1, min: 1000, risk: 'Very low',
      blurb: 'A laddered government-bill portfolio rolled every 4 weeks.',
    },
    {
      id: 'balanced', name: 'Balanced Portfolio', horizon: '12 Months', termMonths: 12,
      rate: 7.8, min: 2500, risk: 'Moderate',
      blurb: '60/40 global equity and investment-grade credit, rebalanced quarterly.',
    },
    {
      id: 'growth', name: 'Growth Portfolio', horizon: '24 Months', termMonths: 24,
      rate: 11.2, min: 10000, risk: 'Elevated',
      blurb: 'Equity-tilted mandate for long-horizon capital with quarterly reviews.',
    },
    {
      id: 'private', name: 'Private Wealth Mandate', horizon: '36 Months', termMonths: 36,
      rate: 14.5, min: 50000, risk: 'High',
      blurb: 'Bespoke multi-asset mandate with a named advisor and estate planning.',
    },
  ],

  LOAN_PRODUCTS: [
    { id: 'personal', name: 'Personal Loan', apr: 8.9, maxAmount: 50000, termMonths: 36, blurb: 'Fixed-rate, no collateral, funded same day once approved.' },
    { id: 'auto', name: 'Auto Loan', apr: 6.4, maxAmount: 120000, termMonths: 60, blurb: 'Competitive rates on new and used vehicles up to 7 years old.' },
    { id: 'mortgage', name: 'Home Mortgage', apr: 5.75, maxAmount: 1500000, termMonths: 360, blurb: '30-year fixed with no lender origination fee on Aurivest accounts.' },
    { id: 'business', name: 'Business Line', apr: 9.75, maxAmount: 250000, termMonths: 24, blurb: 'Revolving credit that draws and repays with your cash cycle.' },
  ],

  /* Transfer rails for money leaving the bank. Fees are quoted to the client
     before confirmation — see routes/accounts.js. */
  TRANSFER_RAILS: [
    { id: 'ACH', label: 'ACH transfer', fee: 0, speed: '1–2 business days' },
    { id: 'Wire', label: 'Same-day wire', fee: 15, speed: 'Today, by 5pm' },
    { id: 'SWIFT', label: 'International wire', fee: 25, speed: '2–4 business days' },
  ],

  /* How clients can fund an account. Seeded into the PaymentMethod
     collection on boot; admins edit the real receiving details in the
     admin panel and those edits stick. */
  PAYMENT_RAILS: [
    { label: 'Linked bank', kind: 'bank', instructions: 'Pull funds from a bank account linked to Aurivest.', processing: '1–2 business days', scope: 'both' },
    { label: 'Incoming wire', kind: 'wire', instructions: 'Aurivest Bank & Trust · Routing 021000021', processing: 'Same business day', scope: 'both' },
    { label: 'Direct deposit', kind: 'bank', instructions: 'Route your salary here and get paid up to two days early.', processing: 'Up to 2 days early', scope: 'deposit' },
    { label: 'Mobile check', kind: 'check', instructions: 'Photograph a paper check and deposit it from your phone.', processing: '1–3 business days', scope: 'deposit' },
  ],
};
