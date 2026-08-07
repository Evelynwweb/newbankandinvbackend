const User = require('../models/User');

/**
 * Ensure an admin account exists. Runs only when SEED_ADMIN=true.
 *
 * Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD so a real deployment
 * never ships with a password that's published in source. If ADMIN_PASSWORD
 * is missing the seed is skipped rather than falling back to a default —
 * a guessable admin login on a banking API is not an acceptable default.
 */
module.exports = async function seedAdmin() {
  try {
    const existing = await User.findOne({ role: 'admin' });
    if (existing) return;

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      console.warn('⚠️  SEED_ADMIN=true but ADMIN_EMAIL / ADMIN_PASSWORD are not set — skipping admin seed');
      return;
    }
    if (password.length < 10) {
      console.warn('⚠️  ADMIN_PASSWORD is shorter than 10 characters — skipping admin seed');
      return;
    }

    const admin = await User.create({
      name: process.env.ADMIN_NAME || 'Administrator',
      email,
      password,
      role: 'admin',
      emailVerified: true,
    });
    console.log(`🔑 Seeded admin ${admin.email}`);
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
};
