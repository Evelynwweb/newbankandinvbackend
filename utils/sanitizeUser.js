/* The user payload every auth/user endpoint returns. Never includes the
   password hash, the live email code, or KYC document images. */
module.exports = function sanitizeUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    country: user.country,
    role: user.role,
    isActive: user.isActive,
    emailVerified: !!user.emailVerified,
    profitBalance: user.profitBalance || 0,
    referralEarnings: user.referralEarnings || 0,
    referralCode: user.referralCode,
    twoFactor: !!user.settings?.twoFactor,
    kyc: {
      status: user.kyc?.status || 'unverified',
      submittedAt: user.kyc?.submittedAt || null,
      documentType: user.kyc?.documentType || null,
      rejectionReason: user.kyc?.rejectionReason || null,
    },
    payout: user.payout?.address
      ? {
          asset: user.payout.asset,
          network: user.payout.network,
          // Only the ends of the address leave the server.
          addressMasked: String(user.payout.address).slice(0, 6) + '…' + String(user.payout.address).slice(-6),
          memo: user.payout.memo,
          label: user.payout.label,
          verified: !!user.payout.verified,
          updatedAt: user.payout.updatedAt || null,
        }
      : null,
    settings: user.settings,
    createdAt: user.createdAt,
  };
};
