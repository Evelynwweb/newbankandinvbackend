const mongoose = require('mongoose');

const TYPES = ['deposit', 'withdraw', 'transfer', 'interest', 'investment', 'card', 'loan', 'bonus', 'referral', 'fee'];
const STATUSES = ['pending', 'processing', 'completed', 'failed', 'reversed'];

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
    type: { type: String, enum: TYPES, required: true },
    label: { type: String, required: true },
    detail: { type: String, default: '' },
    // Signed USD amount: positive credits the account, negative debits it.
    amount: { type: Number, required: true },
    fee: { type: Number, default: 0 },
    status: { type: String, enum: STATUSES, default: 'completed' },
    method: { type: String, default: null },       // ACH | Wire | SWIFT | Linked bank …
    counterparty: { type: String, default: null }, // recipient name / merchant
    destination: { type: String, default: null },  // external account number (last 4 kept)
    reference: { type: String, default: '' },      // client's own memo
    // For referral rewards: which referred client generated it
    refUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Payment proof for deposits — a data URL image uploaded by the client
    proof: { type: String, default: null },
    proofUploadedAt: { type: Date, default: null },
    // Set when an admin approves/rejects a pending item
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
module.exports.TYPES = TYPES;
module.exports.STATUSES = STATUSES;
