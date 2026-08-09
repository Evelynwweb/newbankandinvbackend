const Wallet = require('../models/Wallet');
const { DEFAULT_WALLETS } = require('../config/constants');

/**
 * Make sure a fresh deploy has receiving wallets, so the client Funding
 * screen is never empty.
 *
 * Runs once and only once: if any wallet exists, the admin owns the list
 * and nothing here touches it. The seeded addresses are placeholders —
 * they must be replaced in Admin → Receiving Wallets before real deposits.
 */
module.exports = async function seedWallets() {
  try {
    if (await Wallet.countDocuments()) return;
    await Wallet.insertMany(DEFAULT_WALLETS);
    console.warn('₿ Seeded placeholder receiving wallets — replace the addresses in the admin panel.');
  } catch (err) {
    console.error('Wallet seed error:', err.message);
  }
};
