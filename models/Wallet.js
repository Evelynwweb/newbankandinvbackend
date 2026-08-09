const mongoose = require('mongoose');

/* ============================================================
   A receiving crypto wallet, managed by an admin.

   This is how money enters the platform. Each row is one asset on
   one network — USDT on TRC-20 and USDT on ERC-20 are two rows,
   because sending to the wrong one loses the funds.

   `memo` covers chains that need a destination tag (XRP, XLM) or a
   memo (some exchanges). Leaving it blank hides the field client-side.
   ============================================================ */
const walletSchema = new mongoose.Schema(
  {
    asset: { type: String, required: true, trim: true, uppercase: true },   // BTC, ETH, USDT
    name: { type: String, required: true, trim: true },                      // Bitcoin, Tether
    network: { type: String, required: true, trim: true },                   // Bitcoin, ERC-20, TRC-20
    address: { type: String, required: true, trim: true },
    memo: { type: String, default: '', trim: true },
    memoLabel: { type: String, default: '', trim: true },                    // "Destination tag"
    // Roughly how long a credit takes once the client has sent.
    confirmations: { type: String, default: '2–6 confirmations' },
    minDeposit: { type: Number, default: 50, min: 0 },
    // Shown on the withdrawal side too, unless this is deposit-only.
    scope: { type: String, enum: ['deposit', 'withdraw', 'both'], default: 'both' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

walletSchema.index({ asset: 1, network: 1 }, { unique: true });

module.exports = mongoose.model('Wallet', walletSchema);
