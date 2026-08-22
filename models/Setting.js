const mongoose = require('mongoose');
const { MIN_DEPOSIT, MIN_WITHDRAWAL, MIN_TRANSFER, REFERRAL_REWARD } = require('../config/constants');

/* Platform-wide settings the admin can change at runtime. A single document
   (key: 'platform') holds everything — see config/settings.js for access. */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'platform' },
    minDeposit: { type: Number, default: MIN_DEPOSIT, min: 0 },
    minWithdrawal: { type: Number, default: MIN_WITHDRAWAL, min: 0 },
    minTransfer: { type: Number, default: MIN_TRANSFER, min: 0 },
    referralReward: { type: Number, default: REFERRAL_REWARD, min: 0 },
    // Deposits below this clear automatically; at or above it an admin must approve.
    autoApproveDepositUnder: { type: Number, default: 0, min: 0 },
    supportEmail: { type: String, default: 'support@betamentmgt.com' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
