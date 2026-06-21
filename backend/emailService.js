const nodemailer = require('nodemailer');

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 6000,
  });
}

async function sendInviteEmail({ toEmail, toName, inviteUrl, label }) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('Email not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to your .env file.');
  }

  const displayName = toName || label || toEmail;
  const baseUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'http://localhost:3001';

  await transporter.sendMail({
    from: `"FELLITO · Eclat Universe" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Your FELLITO Access Link — 10 Minutes',
    html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FELLITO Invite</title></head>
<body style="margin:0;padding:0;background:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0F;min-height:100vh;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#12121A;border-radius:20px;border:1px solid #1E1E2E;overflow:hidden;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#001A2C,#002A40);padding:32px;text-align:center;">
    <div style="font-size:32px;font-weight:900;color:#00E5FF;letter-spacing:6px;margin-bottom:4px;">FELLITO</div>
    <div style="font-size:11px;color:#8A8AA0;letter-spacing:3px;">ECLAT UNIVERSE · EPIC ATE SUPPORT</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px;">
    <p style="color:#fff;font-size:16px;font-weight:600;margin:0 0 8px;">Hey ${displayName},</p>
    <p style="color:#8A8AA0;font-size:14px;line-height:1.6;margin:0 0 28px;">
      You've been invited to access <strong style="color:#fff;">FELLITO</strong> — your Epic ATE Go-Live support consultant. Click the button below to start your session.
    </p>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:28px;">
      <a href="${inviteUrl}" style="display:inline-block;background:#00E5FF;color:#000;font-size:15px;font-weight:800;letter-spacing:1px;text-decoration:none;border-radius:14px;padding:16px 40px;">
        Open FELLITO →
      </a>
    </td></tr></table>

    <!-- Warning box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:12px;margin-bottom:20px;">
    <tr><td style="padding:16px;">
      <div style="font-size:11px;color:#FFB800;font-weight:700;letter-spacing:2px;margin-bottom:8px;">⏱ SESSION RULES</div>
      <ul style="margin:0;padding-left:18px;color:#8A8AA0;font-size:13px;line-height:1.8;">
        <li>Link expires <strong style="color:#fff;">10 minutes</strong> from now</li>
        <li>Once opened, you have <strong style="color:#fff;">10 minutes</strong> of chat access</li>
        <li>Session is <strong style="color:#fff;">locked to your device</strong> — do not share</li>
        <li>Opens directly in your browser — no app needed</li>
      </ul>
    </td></tr></table>

    <p style="color:#8A8AA0;font-size:12px;line-height:1.6;margin:0;">
      If the button doesn't work, copy this link into your browser:<br>
      <span style="color:#00E5FF;word-break:break-all;">${inviteUrl}</span>
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0A0A0F;padding:20px 32px;text-align:center;border-top:1px solid #1E1E2E;">
    <p style="color:#8A8AA0;font-size:11px;margin:0;letter-spacing:1px;">POWERED BY ECLAT UNIVERSE · DO NOT REPLY TO THIS EMAIL</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`,
  });
}

module.exports = { sendInviteEmail };
