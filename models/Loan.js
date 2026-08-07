const mongoose = require('mongoose');

const STATUSES = ['pending', 'approved', 'active', 'rejected', 'closed'];

const loanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: String, required: true },
    product: { type: String, required: true },
    principal: { type: Number, required: true, min: 0 },
    apr: { type: Number, required: true },
    termMonths: { type: Number, required: true },
    monthlyPayment: { type: Number, required: true },
    outstanding: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: STATUSES, default: 'pending' },
    appliedAt: { type: Date, default: Date.now },
    decidedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

loanSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Loan', loanSchema);
module.exports.STATUSES = STATUSES;
