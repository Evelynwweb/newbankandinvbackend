const mongoose = require('mongoose');

const STATUSES = ['open', 'read', 'resolved'];

const supportMessageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, default: 'Support request', trim: true },
    body: { type: String, required: true },
    status: { type: String, enum: STATUSES, default: 'open' },
    reply: { type: String, default: '' },
    repliedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
module.exports.STATUSES = STATUSES;
