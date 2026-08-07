const mongoose = require('mongoose');

const KINDS = ['checking', 'savings', 'investment'];

/* A deposit or investment account. Spendable money lives here, never on the
   User document — so every balance change is attributable to one account. */
const accountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: KINDS, required: true },
    name: { type: String, required: true, trim: true },
    // 10-digit account number, unique across the bank.
    number: { type: String, required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    // Deposit APY for checking/savings; trailing return for investment accounts.
    apy: { type: Number, default: 0 },
    isFrozen: { type: Boolean, default: false },
    openedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

accountSchema.index({ user: 1, kind: 1 });

module.exports = mongoose.model('Account', accountSchema);
module.exports.KINDS = KINDS;
