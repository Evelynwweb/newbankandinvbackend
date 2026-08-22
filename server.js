require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

// Middleware
app.use(cors({
  origin: true,        // reflects the request origin
  credentials: true,
}));
// Larger limit so KYC document images and deposit proofs (base64 data URLs) fit.
app.use(express.json({ limit: '8mb' }));

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Betament API is running' });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/users', require('./routes/users'));
app.use('/api/kyc', require('./routes/kyc'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/holdings', require('./routes/holdings'));
app.use('/api/investments', require('./routes/investments'));
app.use('/api/portfolio', require('./routes/portfolio'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/wallets', require('./routes/wallets'));
app.use('/api/payout', require('./routes/payout'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/support', require('./routes/support'));
app.use('/api/admin', require('./routes/admin'));

// Deposits and withdrawals live in one file but mount as separate routers.
const money = require('./routes/money');
app.use('/api/deposits', money.deposits);
app.use('/api/withdrawals', money.withdrawals);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// Connect to MongoDB Atlas, then make sure the baseline documents exist
connectDB().then(() => {
  require('./utils/seedWallets')();
  if (process.env.SEED_ADMIN === 'true') require('./utils/seedAdmin')();
});

// Export for Vercel (serverless)
module.exports = app;

// Only listen when NOT on Vercel (local dev)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
