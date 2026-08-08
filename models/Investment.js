const mongoose = require('mongoose');

const STATUSES = ['active', 'matured', 'withdrawn'];

/* A subscription to one of the mandates in config/constants PLAN_CATALOGUE.
   `rate` and `termMonths` are copied in at subscription time so a later
   change to the catalogue never rewrites an existing client's terms. */
const investmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: String, required: true },
    planName: { type: String, required: true },
    // Which family of the taxonomy this came from, and how it behaves.
    familyId: { type: String, default: '' },
    kind: { type: String, default: 'yield' },
    principal: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true },
    termMonths: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    maturesAt: { type: Date, default: null },
    // Credited at maturity or when the client withdraws early.
    payout: { type: Number, default: 0 },
    status: { type: String, enum: STATUSES, default: 'active' },
  },
  { timestamps: true }
);

investmentSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Investment', investmentSchema);
module.exports.STATUSES = STATUSES;
