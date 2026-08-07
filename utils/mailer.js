const nodemailer = require('nodemailer');

/* ============================================================
   Transactional email — one branded layout, sent over whatever
   SMTP the env provides (Brevo, Mailjet, any provider).

   Env:
     SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
     EMAIL_FROM   e.g. "Aurivest <no-reply@yourdomain.com>"

   Without SMTP config the mailer logs instead of sending, so
   local dev never breaks and no route ever fails on email.
   ============================================================ */

const BRAND = 'Aurivest';
const SITE_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

const COLORS = {
  bg: '#0E0904',
  card: '#1B1108',
  cardSoft: '#26190C',
  line: '#48311A',
  amber: '#F59E0B',
  ember: '#EA580C',
  cream: '#FFF7EC',
  muted: '#C6AC86',
  mutedDim: '#8B7355',
  ink: '#2B1706',
  up: '#34D399',
  down: '#FB7185',
};

let transport = null;
function getTransport() {
  if (transport) return transport;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
    });
  } else {
    transport = nodemailer.createTransport({ jsonTransport: true });
    console.warn('📭 SMTP not configured — emails are logged to the console, not sent');
  }
  return transport;
}

/* ---------- building blocks (email-safe inline styles) ---------- */

function button(label, url) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 8px;">
    <tr><td style="border-radius:9999px;background:linear-gradient(135deg,${COLORS.amber},${COLORS.ember});">
      <a href="${url}" target="_blank"
         style="display:inline-block;padding:14px 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${COLORS.ink};text-decoration:none;border-radius:9999px;">
        ${label}
      </a>
    </td></tr>
  </table>`;
}

function codeBox(code) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto;">
    <tr><td style="background:${COLORS.cardSoft};border:1px solid ${COLORS.line};border-radius:14px;padding:20px 34px;">
      <div style="font-family:'Courier New',monospace;font-size:32px;letter-spacing:12px;color:${COLORS.cream};font-weight:bold;">${code}</div>
    </td></tr>
  </table>`;
}

function detailTable(rows) {
  const body = rows.map(([k, v]) => `
    <tr>
      <td style="padding:9px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${COLORS.mutedDim};">${k}</td>
      <td style="padding:9px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${COLORS.cream};text-align:right;">${v}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;border-top:1px solid ${COLORS.line};">${body}</table>`;
}

function pill(text, tone = 'amber') {
  const color = tone === 'up' ? COLORS.up : tone === 'down' ? COLORS.down : COLORS.amber;
  return `<span style="display:inline-block;padding:5px 13px;border-radius:9999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:${color};background:rgba(245,158,11,0.12);">${text}</span>`;
}

/* ---------- layout ---------- */

function layout({ preheader = '', heading, intro, content = '', outro = '' }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${COLORS.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:20px;overflow:hidden;">
        <tr><td style="padding:26px 32px;border-bottom:1px solid ${COLORS.line};">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:bold;color:${COLORS.cream};">Auri<span style="color:${COLORS.amber};">vest</span></span>
        </td></tr>
        <tr><td style="padding:32px;text-align:center;">
          <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:22px;color:${COLORS.cream};">${heading}</h1>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:${COLORS.muted};">${intro}</p>
          ${content}
          ${outro ? `<p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.6;color:${COLORS.mutedDim};">${outro}</p>` : ''}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid ${COLORS.line};text-align:center;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${COLORS.mutedDim};">
            &copy; ${new Date().getFullYear()} ${BRAND} Bank &amp; Trust. Deposits insured to the applicable statutory limit.<br>
            Investment products are not deposits, are not insured, and may lose value.<br>
            We will never ask you for your password or a verification code.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* Never throws — a failed email must not fail the request that triggered it. */
async function sendMail({ to, subject, ...rest }) {
  try {
    await getTransport().sendMail({
      from: process.env.EMAIL_FROM || `${BRAND} <no-reply@aurivest.com>`,
      to,
      subject,
      html: layout(rest),
    });
  } catch (err) {
    console.error(`✉️  Email to ${to} failed:`, err.message);
  }
}

module.exports = { sendMail, button, codeBox, detailTable, pill, layout, COLORS, SITE_URL, BRAND };
