// Resend HTTP API — works on Render free tier (no SMTP port blocking)
// Fallback to nodemailer for local dev if RESEND_API_KEY not set

async function resendSend({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set');
  const from = process.env.RESEND_FROM || 'FELLITO · Eclat Universe <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error ${res.status}: ${err}`);
  }
}

async function nodemailerSend({ to, subject, html }) {
  const nodemailer = require('nodemailer');
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  if (!user || !pass) throw new Error('Email not configured. Set RESEND_API_KEY or GMAIL_USER + GMAIL_APP_PASSWORD.');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  await transporter.sendMail({ from: `"FELLITO · Eclat Universe" <${user}>`, to, subject, html });
}

async function send({ to, subject, html }) {
  if (process.env.RESEND_API_KEY) return resendSend({ to, subject, html });
  return nodemailerSend({ to, subject, html });
}

async function sendInviteEmail({ toEmail, toName, inviteUrl, label }) {
  const displayName = toName || label || toEmail;
  await send({
    to: toEmail,
    subject: 'Your FELLITO Access Link',
    html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FELLITO Invite</title></head>
<body style="margin:0;padding:0;background:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0F;min-height:100vh;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#12121A;border-radius:20px;border:1px solid #1E1E2E;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#001A2C,#002A40);padding:32px;text-align:center;">
    <div style="font-size:32px;font-weight:900;color:#00E5FF;letter-spacing:6px;margin-bottom:4px;">FELLITO</div>
    <div style="font-size:11px;color:#8A8AA0;letter-spacing:3px;">ECLAT UNIVERSE · EPIC ATE SUPPORT</div>
  </td></tr>
  <tr><td style="padding:32px;">
    <p style="color:#fff;font-size:16px;font-weight:600;margin:0 0 8px;">Hey ${displayName},</p>
    <p style="color:#8A8AA0;font-size:14px;line-height:1.6;margin:0 0 28px;">
      You've been invited to access <strong style="color:#fff;">FELLITO</strong> — your Epic ATE Go-Live support consultant. Click the button below to open your session.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:28px;">
      <a href="${inviteUrl}" style="display:inline-block;background:#00E5FF;color:#000;font-size:15px;font-weight:800;letter-spacing:1px;text-decoration:none;border-radius:14px;padding:16px 40px;">
        Open FELLITO →
      </a>
    </td></tr></table>
    <p style="color:#8A8AA0;font-size:12px;line-height:1.6;margin:0;">
      If the button doesn't work, copy this link into your browser:<br>
      <span style="color:#00E5FF;word-break:break-all;">${inviteUrl}</span>
    </p>
  </td></tr>
  <tr><td style="background:#0A0A0F;padding:20px 32px;text-align:center;border-top:1px solid #1E1E2E;">
    <p style="color:#8A8AA0;font-size:11px;margin:0;letter-spacing:1px;">POWERED BY ECLAT UNIVERSE · DO NOT REPLY TO THIS EMAIL</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
  });
}

async function sendShiftEmail({ toEmail, consultant, goLive, dept, module: mod, date, questionsAnswered, issuesEscalated, issues, summary, pmName }) {
  const displayPM = pmName || toEmail;
  const issueRows = (issues || []).map(i =>
    `<tr><td style="padding:6px 10px;color:#fff;font-size:13px;border-bottom:1px solid #1E1E2E;">${i.title}</td>
     <td style="padding:6px 10px;color:#8A8AA0;font-size:12px;border-bottom:1px solid #1E1E2E;">${i.module || mod || '—'}</td>
     <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid #1E1E2E;">
       <span style="background:${i.severity==='high'?'#FF3B5C22':'#00E5FF22'};color:${i.severity==='high'?'#FF3B5C':'#00E5FF'};padding:2px 8px;border-radius:8px;">${i.severity||'med'}</span>
     </td></tr>`
  ).join('');

  await send({
    to: toEmail,
    subject: `FELLITO Shift Log — ${consultant} · ${goLive} · ${date}`,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0F;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#12121A;border-radius:20px;border:1px solid #1E1E2E;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#001A2C,#002A40);padding:28px 32px;">
    <div style="font-size:28px;font-weight:900;color:#00E5FF;letter-spacing:6px;">FELLITO</div>
    <div style="font-size:11px;color:#8A8AA0;letter-spacing:3px;margin-top:4px;">SHIFT LOG · ECLAT UNIVERSE</div>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="color:#8A8AA0;font-size:13px;margin:0 0 4px;">Hey ${displayPM},</p>
    <p style="color:#fff;font-size:15px;font-weight:700;margin:0 0 24px;">Here's the shift wrap-up from <span style="color:#00E5FF;">${consultant}</span>.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:12px;padding:14px 18px;text-align:center;width:33%;">
          <div style="font-size:26px;font-weight:900;color:#00E5FF;">${questionsAnswered}</div>
          <div style="font-size:10px;color:#8A8AA0;letter-spacing:1px;margin-top:2px;">QUESTIONS</div>
        </td>
        <td style="width:12px;"></td>
        <td style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:12px;padding:14px 18px;text-align:center;width:33%;">
          <div style="font-size:26px;font-weight:900;color:#FF3B5C;">${issuesEscalated}</div>
          <div style="font-size:10px;color:#8A8AA0;letter-spacing:1px;margin-top:2px;">ESCALATED</div>
        </td>
        <td style="width:12px;"></td>
        <td style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:12px;padding:14px 18px;text-align:center;width:33%;">
          <div style="font-size:13px;font-weight:800;color:#fff;">${mod||'—'}</div>
          <div style="font-size:10px;color:#8A8AA0;letter-spacing:1px;margin-top:2px;">MODULE</div>
        </td>
      </tr>
    </table>
    <table width="100%" style="margin-bottom:24px;border:1px solid #1E1E2E;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:10px 14px;background:#0A0A0F;border-bottom:1px solid #1E1E2E;">
        <span style="color:#8A8AA0;font-size:11px;letter-spacing:1px;">GO-LIVE</span>
        <span style="color:#fff;font-size:13px;font-weight:700;margin-left:12px;">${goLive}</span>
      </td></tr>
      <tr><td style="padding:10px 14px;background:#0A0A0F;border-bottom:1px solid #1E1E2E;">
        <span style="color:#8A8AA0;font-size:11px;letter-spacing:1px;">DEPT</span>
        <span style="color:#fff;font-size:13px;font-weight:700;margin-left:24px;">${dept||'—'}</span>
      </td></tr>
      <tr><td style="padding:10px 14px;background:#0A0A0F;">
        <span style="color:#8A8AA0;font-size:11px;letter-spacing:1px;">DATE</span>
        <span style="color:#fff;font-size:13px;font-weight:700;margin-left:24px;">${date}</span>
      </td></tr>
    </table>
    ${summary ? `<div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:12px;padding:16px 18px;margin-bottom:24px;">
      <div style="font-size:11px;color:#8A8AA0;letter-spacing:1px;margin-bottom:8px;">SHIFT NOTES</div>
      <div style="color:#fff;font-size:13px;line-height:1.7;">${summary.replace(/\n/g,'<br>')}</div>
    </div>` : ''}
    ${issueRows ? `<div style="font-size:11px;color:#8A8AA0;letter-spacing:1px;margin-bottom:8px;">ESCALATED ISSUES</div>
    <table width="100%" style="border:1px solid #1E1E2E;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#0A0A0F;">
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#8A8AA0;font-weight:600;">ISSUE</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#8A8AA0;font-weight:600;">MODULE</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#8A8AA0;font-weight:600;">SEV</th>
      </tr>
      ${issueRows}
    </table>` : ''}
  </td></tr>
  <tr><td style="background:#0A0A0F;padding:16px 32px;text-align:center;border-top:1px solid #1E1E2E;">
    <p style="color:#8A8AA0;font-size:11px;margin:0;letter-spacing:1px;">POWERED BY ECLAT UNIVERSE · FELLITO ATE AGENT</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
  });
}

async function sendGoLiveOpportunityEmail({ toEmail, toName, opportunities, sentBy }) {
  const confColor = c => c === 'high' ? '#00E5FF' : c === 'medium' ? '#F5A623' : '#8A8AA0';
  const cards = opportunities.map(o => {
    const modules = (o.modules || []).join(', ') || 'TBD';
    const conf = (o.confidence || 'low').toUpperCase();
    const color = confColor(o.confidence);
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:14px;overflow:hidden;margin-bottom:14px;">
      <tr><td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="color:#F0F0FF;font-size:15px;font-weight:700;">${o.hospital}</td>
          <td align="right"><span style="font-size:10px;font-weight:700;color:${color};border:1px solid ${color};border-radius:20px;padding:2px 8px;">${conf}</span></td>
        </tr></table>
        <div style="color:#8A8AA0;font-size:12px;margin-top:8px;">📍 ${o.city || ''}${o.city && o.state ? ', ' : ''}${o.state || 'US'}</div>
        <div style="color:#8A8AA0;font-size:12px;margin-top:4px;">📅 ${o.expectedDate || 'TBD'}</div>
        <div style="color:#8A8AA0;font-size:12px;margin-top:4px;">🏥 ${modules}</div>
        ${o.notes ? `<div style="color:#8A8AA0;font-size:12px;font-style:italic;margin-top:6px;">${o.notes}</div>` : ''}
        ${o.source && !o.source.startsWith('http') ? `<div style="color:#8A8AA0;font-size:11px;margin-top:4px;">📰 ${o.source}</div>` : ''}
      </td></tr>
    </table>`;
  }).join('');

  const plural = opportunities.length > 1 ? `${opportunities.length} Go-Live Opportunities` : 'a Go-Live Opportunity';

  await send({
    to: toEmail,
    subject: `FELLITO — ${plural} for You`,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0F;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;">
  <tr><td style="background:linear-gradient(135deg,#001A2C,#002A40);padding:32px;text-align:center;border-radius:20px 20px 0 0;border:1px solid #1E1E2E;border-bottom:none;">
    <div style="font-size:32px;font-weight:900;color:#00E5FF;letter-spacing:6px;margin-bottom:4px;">FELLITO</div>
    <div style="font-size:11px;color:#8A8AA0;letter-spacing:3px;">ECLAT UNIVERSE · EPIC GO-LIVE INTELLIGENCE</div>
  </td></tr>
  <tr><td style="background:#12121A;border:1px solid #1E1E2E;border-top:none;border-bottom:none;padding:28px 28px 8px;">
    <p style="color:#fff;font-size:16px;font-weight:600;margin:0 0 6px;">Hey ${toName || toEmail},</p>
    <p style="color:#8A8AA0;font-size:13px;line-height:1.6;margin:0 0 24px;">
      ${sentBy ? `<strong style="color:#fff;">${sentBy}</strong> sent you` : 'Here are'} ${plural} that may be a great fit for your skills. Review the details below.
    </p>
    ${cards}
    <p style="color:#8A8AA0;font-size:12px;line-height:1.6;margin:16px 0 8px;">
      Log in to FELLITO to apply for any of these opportunities or reach out to your project manager directly.
    </p>
  </td></tr>
  <tr><td style="background:#0A0A0F;padding:18px 28px;text-align:center;border:1px solid #1E1E2E;border-top:none;border-radius:0 0 20px 20px;">
    <p style="color:#8A8AA0;font-size:11px;margin:0;letter-spacing:1px;">POWERED BY ECLAT UNIVERSE · DO NOT REPLY TO THIS EMAIL</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
  });
}

module.exports = { sendInviteEmail, sendShiftEmail, sendGoLiveOpportunityEmail };
