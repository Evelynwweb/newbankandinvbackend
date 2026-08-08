const mongoose = require('mongoose');

/* cash       — the settlement account everything funds from
   brokerage  — self-directed, ETF and alternative positions
   retirement — the tax-advantaged wrapper (IRA / 401k) */
const KINDS = ['cash', 'brokerage', 'retirement'];

const accountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: KINDS, required: true },
    name: { type: String, required: true, trim: true },
    // 10-digit account reference, unique platform-wide.
    number: { type: String, required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    // Stated yield on the cash account; 0 on brokerage and retirement,
    // whose return comes from what they hold rather than a rate.
    apy: { type: Number, default: 0 },
    isFrozen: { type: Boolean, default: false },
    openedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

accountSchema.index({ user: 1, kind: 1 });

module.exports = mongoose.model('Account', accountSchema);
module.exports.KINDS = KINDS;
