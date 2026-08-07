const mongoose = require('mongoose');

/* A saved external recipient. Only the account number's last digits are ever
   surfaced back to the client (see routes/accounts.js). */
const beneficiarySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    bank: { type: String, default: 'External bank', trim: true },
    number: { type: String, required: true },
    nickname: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Beneficiary', beneficiarySchema);
