const { sendMail, button, detailTable, pill, SITE_URL } = require('./mailer');

/* ============================================================
   Every transactional email the platform sends. Each function
   is fire-safe: sendMail never throws, so callers just await.
   ============================================================ */

const fmt = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d = new Date()) =>
  new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const first = (user) => (user.name || 'there').split(' ')[0];
const dash = `${SITE_URL}/dashboard`;
const last4 = (s) => `••••${String(s || '').slice(-4)}`;

/* ---------- auth ---------- */

exports.welcomeEmail = (user) =>
  sendMail({
    to: user.email,
    subject: 'Your Aurivest account is open',
    preheader: 'Welcome aboard — your accounts are ready.',
    heading: `Welcome to Aurivest, ${first(user)}!`,
    intro: 'Your cash, brokerage and retirement accounts are open and ready to fund. Cash Management earns 4.65% from the day money lands in it.',
    content: button('Open my dashboard', dash),
    outro: 'If you did not open an Aurivest account, contact us immediately.',
  });

exports.loginAlertEmail = (user, { when = new Date(), ip } = {}) =>
  sendMail({
    to: user.email,
    subject: 'New sign-in to your Aurivest account',
    preheader: `Your account was signed in on ${fmtDate(when)}.`,
    heading: 'New sign-in detected',
    intro: `Hi ${first(user)}, your Aurivest account was just signed in. If this was you, there's nothing to do.`,
    content: detailTable([
      ['Time', fmtDate(when)],
      ['IP address', ip || 'Unavailable'],
      ['Account', user.email],
    ]),
    outro: 'Didn\'t sign in? Change your password immediately from Account Settings and contact us from the dashboard.',
  });

exports.passwordChangedEmail = (user) =>
  sendMail({
    to: user.email,
    subject: 'Your Aurivest password was changed',
    preheader: 'Confirming a password change on your account.',
    heading: 'Password changed',
    intro: `Hi ${first(user)}, the password on your Aurivest account was just changed.`,
    content: detailTable([['Time', fmtDate()], ['Account', user.email]]),
    outro: 'If this wasn\'t you, contact us immediately — your account may be compromised.',
  });

/* ---------- money movement ---------- */

exports.depositEmail = (user, { amount, method, accountName, status }) =>
  sendMail({
    to: user.email,
    subject: status === 'completed' ? `${fmt(amount)} added to your account` : `We received your ${fmt(amount)} deposit`,
    preheader: `Deposit of ${fmt(amount)} via ${method}.`,
    heading: status === 'completed' ? 'Deposit credited' : 'Deposit received',
    intro: status === 'completed'
      ? `Hi ${first(user)}, ${fmt(amount)} is now available in your ${accountName}.`
      : `Hi ${first(user)}, we've received your deposit and it's being reviewed. We'll email you the moment it clears.`,
    content: detailTable([
      ['Amount', fmt(amount)],
      ['Method', method],
      ['Into', accountName],
      ['Status', status === 'completed' ? 'Completed' : 'Pending review'],
      ['Time', fmtDate()],
    ]) + button('View my accounts', `${dash}/accounts`),
  });

exports.withdrawalEmail = (user, { amount, method, destination, status }) =>
  sendMail({
    to: user.email,
    subject: `Withdrawal of ${fmt(amount)} ${status === 'completed' ? 'sent' : 'requested'}`,
    preheader: `Withdrawal of ${fmt(amount)} via ${method}.`,
    heading: status === 'completed' ? 'Withdrawal sent' : 'Withdrawal requested',
    intro: status === 'completed'
      ? `Hi ${first(user)}, ${fmt(amount)} is on its way to ${last4(destination)}.`
      : `Hi ${first(user)}, we've received your withdrawal request and it's being reviewed.`,
    content: detailTable([
      ['Amount', fmt(amount)],
      ['Method', method],
      ['Destination', last4(destination)],
      ['Status', status === 'completed' ? 'Sent' : 'Pending review'],
      ['Time', fmtDate()],
    ]),
    outro: 'Didn\'t request this? Contact us immediately from your dashboard.',
  });

exports.transferEmail = (user, { amount, to, method, fee = 0 }) =>
  sendMail({
    to: user.email,
    subject: `${fmt(amount)} sent to ${to}`,
    preheader: `Transfer of ${fmt(amount)} via ${method}.`,
    heading: 'Transfer sent',
    intro: `Hi ${first(user)}, your transfer has been submitted.`,
    content: detailTable([
      ['Amount', fmt(amount)],
      ['To', to],
      ['Method', method],
      ['Fee', fee ? fmt(fee) : 'Free'],
      ['Time', fmtDate()],
    ]),
    outro: 'Didn\'t authorise this? Contact us immediately.',
  });

/* ---------- products ---------- */

exports.investmentEmail = (user, { planName, principal, rate, maturesAt }) =>
  sendMail({
    to: user.email,
    subject: `You're subscribed to ${planName}`,
    preheader: `${fmt(principal)} invested at ${rate}%.`,
    heading: 'Subscription confirmed',
    intro: `Hi ${first(user)}, your ${planName} mandate is active and already earning.`,
    content: detailTable([
      ['Mandate', planName],
      ['Principal', fmt(principal)],
      ['Rate', `${rate}%`],
      ['Matures', maturesAt ? fmtDate(maturesAt) : 'Flexible — no lock-up'],
    ]) + button('View my portfolio', `${dash}/portfolio`),
    outro: 'Target rates are objectives, not guarantees. Market-linked mandates are not deposits, are not insured, and may lose value.',
  });

/* ---------- compliance ---------- */

exports.kycSubmittedEmail = (user) =>
  sendMail({
    to: user.email,
    subject: 'We received your verification documents',
    preheader: 'Your identity documents are under review.',
    heading: 'Documents received',
    intro: `Hi ${first(user)}, your identity documents are with our compliance team. Most reviews finish within 24 hours.`,
    content: pill('In review'),
    outro: 'We\'ll email you the moment it clears. No action is needed from you.',
  });

exports.kycDecisionEmail = (user, approved, reason) =>
  sendMail({
    to: user.email,
    subject: approved ? 'Your identity is verified' : 'We need another look at your documents',
    preheader: approved ? 'Verification approved.' : 'Verification could not be completed.',
    heading: approved ? 'You\'re verified' : 'Verification unsuccessful',
    intro: approved
      ? `Hi ${first(user)}, your identity has been verified. Withdrawals, wires and higher limits are now open.`
      : `Hi ${first(user)}, we couldn't verify your identity from the documents provided.`,
    content: approved
      ? pill('Verified', 'up') + button('Open my dashboard', dash)
      : detailTable([['Reason', reason || 'Documents were unclear or incomplete']]) + button('Resubmit documents', `${dash}/kyc`),
    outro: approved ? '' : 'Please resubmit a clear, uncropped photo of a valid government-issued document.',
  });

/* ---------- rewards ---------- */

exports.referralRewardEmail = (user, { amount, referredName }) =>
  sendMail({
    to: user.email,
    subject: `You earned ${fmt(amount)} from a referral`,
    preheader: `${referredName} joined Aurivest.`,
    heading: 'Referral reward credited',
    intro: `Hi ${first(user)}, ${referredName} opened and funded an Aurivest account using your link.`,
    content: detailTable([['Reward', fmt(amount)], ['Referred', referredName], ['Time', fmtDate()]])
      + button('View referrals', `${dash}/referrals`),
  });

exports.supportReplyEmail = (user, { subject, reply }) =>
  sendMail({
    to: user.email,
    subject: `Re: ${subject}`,
    preheader: 'A reply from the Aurivest support desk.',
    heading: 'Reply from support',
    intro: `Hi ${first(user)}, here's the answer to your question.`,
    content: `<p style="margin:22px 0;padding:16px;border-radius:12px;background:rgba(245,158,11,0.08);font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#FFF7EC;text-align:left;">${reply}</p>`,
    outro: 'Reply from your dashboard if you need anything else.',
  });
