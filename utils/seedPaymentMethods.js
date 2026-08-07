const PaymentMethod = require('../models/PaymentMethod');
const { PAYMENT_RAILS } = require('../config/constants');

/**
 * Make sure the funding rails from config/constants exist.
 *
 * Only inserts what's missing — an admin's later edits to instructions,
 * fees or ordering are never overwritten on boot.
 */
module.exports = async function seedPaymentMethods() {
  try {
    for (const [i, rail] of PAYMENT_RAILS.entries()) {
      const exists = await PaymentMethod.findOne({ label: rail.label });
      if (exists) continue;
      await PaymentMethod.create({ ...rail, sortOrder: i });
    }
  } catch (err) {
    console.error('Payment method seed error:', err.message);
  }
};
