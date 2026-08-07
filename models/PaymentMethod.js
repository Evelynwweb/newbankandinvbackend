const mongoose = require('mongoose');

const KINDS = ['bank', 'wire', 'check', 'card', 'other'];
const SCOPES = ['deposit', 'withdraw', 'both'];

/* A funding rail managed by admins. Deposits show `instructions`; withdrawals
   only use the rail's label (the client supplies their own destination). */
const paymentMethodSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    kind: { type: String, enum: KINDS, default: 'bank' },
    scope: { type: String, enum: SCOPES, default: 'both' },
    instructions: { type: String, default: '' },
    processing: { type: String, default: '1–2 business days' },
    fee: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
module.exports.KINDS = KINDS;
module.exports.SCOPES = SCOPES;
