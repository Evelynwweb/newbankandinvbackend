const mongoose = require('mongoose');

const KINDS = ['equity', 'etf', 'crypto'];

/* A position in the self-directed, fractional or crypto sleeve.

   Holdings-only by design: the platform carries no market feed and no
   order book. Units are set when an admin fills a client's buy/sell
   request, and `price` is the admin-maintained mark used to value the
   position. `costBasis` is the total paid, so unrealised P/L is just
   units × price − costBasis. */
const holdingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: KINDS, default: 'equity' },
    // Fractional by nature — never round this to an integer.
    units: { type: Number, required: true, min: 0 },
    costBasis: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

holdingSchema.index({ user: 1, symbol: 1 });

module.exports = mongoose.model('Holding', holdingSchema);
module.exports.KINDS = KINDS;
