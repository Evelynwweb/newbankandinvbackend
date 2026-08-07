const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const sanitizeUser = require('../utils/sanitizeUser');
const emails = require('../utils/emails');

const DOC_TYPES = ['passport', 'drivers-license', 'national-id'];
// Documents arrive as base64 data URLs; cap them so a huge upload can't
// blow past the body limit or bloat the user document.
const MAX_DOC_CHARS = 3_000_000; // ~2.2 MB of binary

// @route   GET /api/kyc
// @desc    The client's own verification status (never the images)
router.get('/', protect, (req, res) => {
  res.json({
    status: req.user.kyc?.status || 'unverified',
    documentType: req.user.kyc?.documentType || null,
    submittedAt: req.user.kyc?.submittedAt || null,
    reviewedAt: req.user.kyc?.reviewedAt || null,
    rejectionReason: req.user.kyc?.rejectionReason || null,
  });
});

// @route   POST /api/kyc
// @desc    Submit identity documents for review
router.post('/', protect, async (req, res) => {
  try {
    const { documentType, fullName, dob, address, documentFront, documentBack } = req.body;

    const status = req.user.kyc?.status || 'unverified';
    if (status === 'pending') {
      return res.status(409).json({ message: 'Your documents are already under review.' });
    }
    if (status === 'verified') {
      return res.status(409).json({ message: 'Your identity is already verified.' });
    }
    if (!DOC_TYPES.includes(documentType)) {
      return res.status(400).json({ message: 'Choose a valid document type.' });
    }
    if (!fullName || !dob || !address) {
      return res.status(400).json({ message: 'Full name, date of birth and address are required.' });
    }
    for (const img of [documentFront, documentBack]) {
      if (img && String(img).length > MAX_DOC_CHARS) {
        return res.status(413).json({ message: 'That image is too large — keep it under 2 MB.' });
      }
    }

    const user = await User.findById(req.user._id);
    user.kyc = {
      status: 'pending',
      documentType,
      fullName: String(fullName).slice(0, 160),
      dob: String(dob).slice(0, 40),
      address: String(address).slice(0, 300),
      documentFront: documentFront || null,
      documentBack: documentBack || null,
      submittedAt: new Date(),
      reviewedAt: null,
      rejectionReason: null,
    };
    await user.save();

    await emails.kycSubmittedEmail(user);
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('KYC submit error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/kyc/skip
// @desc    Defer verification — the dashboard stays gated until it's done
router.post('/skip', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const status = user.kyc?.status || 'unverified';
    if (['pending', 'verified'].includes(status)) return res.json(sanitizeUser(user));
    user.kyc.status = 'skipped';
    await user.save();
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('KYC skip error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
