/* ============================================================
   Platform economics and product catalogue.

   Aurivest is an investment platform. The only banking surface it
   keeps is the pair of wire-instruction blocks used to move cash in
   and out — see models/Wallet.js for receiving addresses and the
   client's own payout wallet on models/User.js. There are no cards,
   no bank rails and no consumer lending.

   PRODUCT_FAMILIES is the single source of truth for the product
   taxonomy: the marketing site, the Invest screen and the admin panel
   all render from it.
   ============================================================ */

module.exports = {
  MIN_DEPOSIT: 100,
  MIN_WITHDRAWAL: 100,
  MIN_TRANSFER: 50,
  REFERRAL_REWARD: 100,

  /* The three account types a client holds. Cash funds everything;
     brokerage holds self-directed and ETF positions; retirement is
     the tax-advantaged wrapper. */
  ACCOUNT_DEFAULTS: {
    cash: { name: 'Cash Management', apy: 4.65 },
    brokerage: { name: 'Brokerage Account', apy: 0 },
    retirement: { name: 'Retirement Account', apy: 0 },
  },

  /* ------------------------------------------------------------
     PRODUCT FAMILIES
     `rate` is an annualised target; `termMonths: 0` means no lock-up.
     `kind` drives how the app treats a subscription:
        'yield'    — accrues at a stated rate (cash, fixed income)
        'managed'  — a mandate the committee runs (ETF portfolios)
        'holding'  — client holds positions (self-directed, crypto)
        'wrapper'  — a retirement or trust wrapper, not a return
        'facility' — margin, a line rather than a deposit
     ------------------------------------------------------------ */
  PRODUCT_FAMILIES: [
    {
      id: 'cash',
      name: 'Cash & Liquidity',
      blurb: 'Somewhere for money that has to stay reachable — still earning while it waits.',
      account: 'cash',
      products: [
        { id: 'hy-cash', name: 'High-Yield Cash Management', kind: 'yield', rate: 4.65, termMonths: 0, min: 100, risk: 'Very low', blurb: 'Withdraw any day, no penalty. Interest credited monthly.' },
        { id: 'mmf', name: 'Money Market Fund', kind: 'yield', rate: 5.02, termMonths: 0, min: 1000, risk: 'Very low', blurb: 'A government money market fund, priced daily, settling T+1.' },
        { id: 'treasury', name: 'Treasury-Backed Account', kind: 'yield', rate: 5.18, termMonths: 3, min: 1000, risk: 'Very low', blurb: 'Held directly in short-dated government bills, rolled at maturity.' },
      ],
    },
    {
      id: 'fixed-income',
      name: 'Fixed Income',
      blurb: 'Predictable income with a defined maturity, for the part of a portfolio that should not surprise you.',
      account: 'brokerage',
      products: [
        { id: 'bond-ladder', name: 'Bond Ladder', kind: 'yield', rate: 5.45, termMonths: 12, min: 5000, risk: 'Low', blurb: 'Staggered maturities so a rung comes due every quarter.' },
        { id: 'muni', name: 'Municipal Bonds', kind: 'yield', rate: 4.28, termMonths: 24, min: 10000, risk: 'Low', blurb: 'Investment-grade municipal issues, generally tax-advantaged.' },
        { id: 'preferred', name: 'Preferred Stock', kind: 'yield', rate: 6.6, termMonths: 12, min: 5000, risk: 'Moderate', blurb: 'Senior to common equity, with a fixed dividend schedule.' },
      ],
    },
    {
      id: 'portfolios',
      name: 'Portfolios',
      blurb: 'ETF-built portfolios, run for you or run by you — the same shelf either way.',
      account: 'brokerage',
      products: [
        { id: 'core-etf', name: 'Core ETF Portfolio', kind: 'managed', rate: 7.8, termMonths: 12, min: 2500, risk: 'Moderate', blurb: '60/40 global equity and investment-grade credit, rebalanced quarterly.' },
        { id: 'growth-etf', name: 'Growth ETF Portfolio', kind: 'managed', rate: 11.2, termMonths: 24, min: 10000, risk: 'Elevated', blurb: 'Equity-tilted for capital with a horizon beyond two years.' },
        { id: 'self-directed', name: 'Self-Directed Brokerage', kind: 'holding', rate: 0, termMonths: 0, min: 500, risk: 'Self-managed', blurb: 'Your own positions, your own calls. Commission-free on US equities and ETFs.' },
        { id: 'fractional', name: 'Fractional Shares', kind: 'holding', rate: 0, termMonths: 0, min: 5, risk: 'Self-managed', blurb: 'Own a slice of any listed name from five dollars up.' },
      ],
    },
    {
      id: 'retirement',
      name: 'Retirement',
      blurb: 'The tax-advantaged wrappers, opened and administered without the paperwork.',
      account: 'retirement',
      products: [
        { id: 'trad-ira', name: 'Traditional IRA', kind: 'wrapper', rate: 7.4, termMonths: 0, min: 500, risk: 'Moderate', blurb: 'Pre-tax contributions, taxed on withdrawal in retirement.' },
        { id: 'roth-ira', name: 'Roth IRA', kind: 'wrapper', rate: 7.4, termMonths: 0, min: 500, risk: 'Moderate', blurb: 'Post-tax contributions; qualified withdrawals come out tax-free.' },
        { id: 'sep-ira', name: 'SEP IRA', kind: 'wrapper', rate: 7.4, termMonths: 0, min: 1000, risk: 'Moderate', blurb: 'For the self-employed and small firms, with higher contribution room.' },
        { id: 'simple-ira', name: 'SIMPLE IRA', kind: 'wrapper', rate: 7.4, termMonths: 0, min: 1000, risk: 'Moderate', blurb: 'A straightforward employer plan for teams under 100 people.' },
        { id: 'rollover-401k', name: '401(k) Rollover', kind: 'wrapper', rate: 7.4, termMonths: 0, min: 0, risk: 'Moderate', blurb: 'We chase the outgoing provider so an old plan stops drifting.' },
        { id: 'solo-401k', name: 'Solo 401(k)', kind: 'wrapper', rate: 7.4, termMonths: 0, min: 1000, risk: 'Moderate', blurb: 'For owner-only businesses, with both employer and employee room.' },
      ],
    },
    {
      id: 'alternatives',
      name: 'Higher-Yield Add-Ons',
      blurb: 'Where the returns get larger and so does the range of outcomes. Sized as a slice, never the whole.',
      account: 'brokerage',
      products: [
        { id: 'margin', name: 'Margin Lending', kind: 'facility', rate: 8.75, termMonths: 0, min: 5000, risk: 'High', blurb: 'Borrow against eligible positions from 8.75%. Positions can be sold to meet a call.' },
        { id: 'real-estate', name: 'Private Real Estate', kind: 'yield', rate: 12.4, termMonths: 36, min: 25000, risk: 'High', blurb: 'Income-producing property held through a private vehicle. Illiquid.' },
        { id: 'private-credit', name: 'Private Credit', kind: 'yield', rate: 13.8, termMonths: 24, min: 25000, risk: 'High', blurb: 'Direct lending to mid-market borrowers. Capital is locked for the term.' },
        { id: 'crypto', name: 'Crypto Trading & Custody', kind: 'holding', rate: 0, termMonths: 0, min: 100, risk: 'Very high', blurb: 'Major digital assets held in segregated institutional custody.' },
      ],
    },
    {
      id: 'private',
      name: 'Private Access',
      blurb: 'The premium tier, for balances and situations that have outgrown a product sheet.',
      account: 'brokerage',
      premium: true,
      products: [
        { id: 'estate', name: 'Estate Planning Tools', kind: 'wrapper', rate: 0, termMonths: 0, min: 50000, risk: 'n/a', blurb: 'Wills, beneficiary alignment and the tax consequences mapped before you sign.' },
        { id: 'trust', name: 'Trust Account Services', kind: 'wrapper', rate: 0, termMonths: 0, min: 100000, risk: 'n/a', blurb: 'Trust formation and administration, with a named officer on the account.' },
      ],
    },
  ],

  /* Symbols the self-directed, fractional and crypto sleeves can hold.
     Prices are admin-maintained — the platform carries no market feed. */
  INSTRUMENTS: [
    { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', kind: 'etf', price: 512.40 },
    { symbol: 'VTI', name: 'Vanguard Total Market ETF', kind: 'etf', price: 284.15 },
    { symbol: 'AGG', name: 'iShares Core US Aggregate Bond', kind: 'etf', price: 98.72 },
    { symbol: 'AAPL', name: 'Apple Inc.', kind: 'equity', price: 231.80 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', kind: 'equity', price: 428.60 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', kind: 'equity', price: 138.25 },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway B', kind: 'equity', price: 468.90 },
    { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', price: 68420.00 },
    { symbol: 'ETH', name: 'Ethereum', kind: 'crypto', price: 3285.50 },
  ],

  /* Placeholder receiving wallets, inserted only when the collection is
     empty so a fresh deploy has a Funding screen. THESE ARE NOT REAL
     TREASURY ADDRESSES — replace every one in Admin → Receiving Wallets
     before taking a live deposit. */
  DEFAULT_WALLETS: [
    { asset: 'BTC', name: 'Bitcoin', network: 'Bitcoin', address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      confirmations: '2–3 confirmations · ~30 min', minDeposit: 100, sortOrder: 0 },
    { asset: 'ETH', name: 'Ethereum', network: 'ERC-20', address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      confirmations: '12 confirmations · ~5 min', minDeposit: 100, sortOrder: 1 },
    { asset: 'USDT', name: 'Tether', network: 'TRC-20', address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
      confirmations: '20 confirmations · ~3 min', minDeposit: 50, sortOrder: 2,
      notes: 'TRC-20 only. Sending ERC-20 USDT to this address will lose the funds.' },
    { asset: 'USDT', name: 'Tether', network: 'ERC-20', address: '0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2',
      confirmations: '12 confirmations · ~5 min', minDeposit: 100, sortOrder: 3 },
    { asset: 'USDC', name: 'USD Coin', network: 'ERC-20', address: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE',
      confirmations: '12 confirmations · ~5 min', minDeposit: 100, sortOrder: 4 },
  ],
};
