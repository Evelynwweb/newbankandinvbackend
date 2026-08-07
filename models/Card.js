const mongoose = require('mongoose');

const TYPES = ['physical', 'virtual'];
const COLORS = ['amber', 'dark'];

/* A payment card. The full PAN is never stored — only the last four digits,
   which is all any screen is allowed to show. A real deployment issues the
   card through a processor and stores nothing but the processor's token. */
const cardSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    label: { type: String, required: true, trim: true },
    network: { type: String, default: 'Mastercard' },
    type: { type: String, enum: TYPES, default: 'virtual' },
    last4: { type: String, required: true },
    expiry: { type: String, required: true },
    frozen: { type: Boolean, default: false },
    monthlyLimit: { type: Number, default: 2000, min: 0 },
    spent: { type: Number, default: 0, min: 0 },
    color: { type: String, enum: COLORS, default: 'dark' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Card', cardSchema);
module.exports.TYPES = TYPES;
