const Setting = require('../models/Setting');

/* Cached accessor for the platform settings singleton. The cache keeps the
   hot paths (deposits, transfers) off the DB on every request; updates bust
   it immediately. */
const TTL = 10 * 1000;
let cache = null;
let cachedAt = 0;

const NUMERIC_FIELDS = [
  'minDeposit', 'minWithdrawal', 'minTransfer',
  'referralReward', 'autoApproveDepositUnder',
];

async function getSettings() {
  if (cache && Date.now() - cachedAt < TTL) return cache;
  let doc = await Setting.findOne({ key: 'platform' });
  if (!doc) doc = await Setting.create({ key: 'platform' });
  cache = doc;
  cachedAt = Date.now();
  return doc;
}

async function updateSettings(patch) {
  const doc = await getSettings();
  for (const f of NUMERIC_FIELDS) {
    if (patch[f] !== undefined) {
      const n = Number(patch[f]);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${f} must be a non-negative number`);
      doc[f] = n;
    }
  }
  if (patch.supportEmail !== undefined) doc.supportEmail = String(patch.supportEmail).trim();
  await doc.save();
  cache = doc;
  cachedAt = Date.now();
  return doc;
}

/* Called after any direct write to the Setting document. */
function bustSettingsCache() {
  cache = null;
  cachedAt = 0;
}

module.exports = { getSettings, updateSettings, bustSettingsCache };
