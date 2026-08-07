const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }
    if (!req.user.isActive) {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }
    next();
  } catch {
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ message: 'Not authorized as admin' });
};

/* KYC must be at least SUBMITTED (pending or verified) before any money
   moves — deposits, transfers, investments, loan applications. */
const KYC_GATED = ['unverified', 'skipped', 'rejected'];
const kycSubmitted = (req, res, next) => {
  const status = req.user.kyc?.status || 'unverified';
  if (req.user.role === 'admin' || !KYC_GATED.includes(status)) return next();
  return res.status(403).json({
    message: 'Complete identity verification before making transactions.',
    code: 'KYC_REQUIRED',
  });
};

/* Withdrawals and outbound external transfers need KYC fully APPROVED,
   not merely submitted. */
const kycVerified = (req, res, next) => {
  const status = req.user.kyc?.status || 'unverified';
  if (req.user.role === 'admin' || status === 'verified') return next();
  return res.status(403).json({
    message: 'Identity verification must be approved before withdrawing.',
    code: 'KYC_NOT_VERIFIED',
  });
};

module.exports = { protect, admin, kycSubmitted, kycVerified };
