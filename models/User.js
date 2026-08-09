const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const KYC_STATUSES = ['unverified', 'skipped', 'pending', 'verified', 'rejected'];
const DOC_TYPES = ['passport', 'drivers-license', 'national-id', null];

const kycSchema = new mongoose.Schema(
  {
    status: { type: String, enum: KYC_STATUSES, default: 'unverified' },
    fullName: String,
    dob: String,
    address: String,
    documentType: { type: String, enum: DOC_TYPES, default: null },
    // Document photo (compact JPEG data URL). Never returned to the client
    // by sanitizeUser — only the admin KYC review endpoint exposes it.
    documentFront: { type: String, default: null },
    documentBack: { type: String, default: null },
    submittedAt: Date,
    reviewedAt: Date,
    rejectionReason: String,
  },
  { _id: false }
);

/* Where withdrawals are sent. Crypto only — the platform does not pay
   out to bank rails. Editing it clears `verified`, so an admin has to
   re-approve before the next payout leaves. */
const payoutSchema = new mongoose.Schema(
  {
    asset: { type: String, default: '', trim: true, uppercase: true },
    network: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    memo: { type: String, default: '', trim: true },
    label: { type: String, default: '', trim: true },
    verified: { type: Boolean, default: false },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    twoFactor: { type: Boolean, default: false },
    transactionAlerts: { type: Boolean, default: true },
    statements: { type: Boolean, default: true },
    marketing: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    country: { type: String, default: '' },
    password: { type: String, required: true, minlength: 6 },

    // Email verification — a 6-digit code is sent on registration
    emailVerified: { type: Boolean, default: false },
    emailCode: { type: String, default: null },
    emailCodeExpires: { type: Date, default: null },

    role: { type: String, enum: ['client', 'admin'], default: 'client' },
    isActive: { type: Boolean, default: true },

    /* Earnings wallet — interest and mandate gains credited by the bank
       accrue here; the client sweeps it into their checking account.
       Spendable balances live on Account documents, not on the user. */
    profitBalance: { type: Number, default: 0, min: 0 },
    referralEarnings: { type: Number, default: 0, min: 0 },
    welcomeBonusClaimed: { type: Boolean, default: false },

    referralCode: { type: String, unique: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Set once the referral reward has been paid, so it can only pay once.
    referralRewarded: { type: Boolean, default: false },

    kyc: { type: kycSchema, default: () => ({}) },
    payout: { type: payoutSchema, default: () => ({}) },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// Generate a referral code like "AURI-4821" from the name.
userSchema.pre('validate', function () {
  if (!this.referralCode) {
    const stem = (this.name || '').replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'AURI';
    this.referralCode = `${stem}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
});

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
module.exports.KYC_STATUSES = KYC_STATUSES;
