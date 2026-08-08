const mongoose = require('mongoose');

/* The platform's own receiving-wire details — what a client is shown
   when they fund an account. Admin-managed, and there may be more than
   one (a domestic ACH set and an international SWIFT set, say).

   This is the inbound half of the only banking left in the product.
   The outbound half lives on User.bankAccount. */
const bankInstructionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },   // "USD domestic wire"
    accountName: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    routingNumber: { type: String, default: '', trim: true },
    swiftCode: { type: String, default: '', trim: true, uppercase: true },
    bankAddress: { type: String, default: '', trim: true },
    // Some correspondent banks require the beneficiary's address on the wire.
    beneficiaryAddress: { type: String, default: '', trim: true },
    currency: { type: String, default: 'USD', uppercase: true, trim: true },
    reference: { type: String, default: '', trim: true },  // what the client must put in the memo
    notes: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BankInstruction', bankInstructionSchema);
