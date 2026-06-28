require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk').default;
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { ingestDocument, queryDocuments, listDocuments, deleteDocument } = require('./ragEngine');
const { bootstrapOwner, login, inviteContributor, listTeam, updateTeamMember, deleteTeamMember, getUserById } = require('./authEngine');
const { requireAuth, requireOwner } = require('./authMiddleware');
const { listGoLives, createGoLive, updateGoLive, deleteGoLive } = require('./goLiveStore');
const { listIssues, createIssue, updateIssue, deleteIssue, generateReport } = require('./issuesStore');
const { listAdoption, upsertAdoption, deleteAdoptionRecord } = require('./adoptionStore');
const { listLinks, ingestLink, deleteLink } = require('./linksEngine');
const { updateMemory, buildMemoryContext, addInsight, listAllMemory, closeSession } = require('./memoryEngine');
const { createTempLink, listTempLinks, openLink, revokeTempLink, validateTempSession, SESSION_TTL_MS } = require('./tempLinkStore');
const { sendInviteEmail, sendShiftEmail, sendGoLiveOpportunityEmail, sendWelcomeGuideEmail } = require('./emailService');
const { logShift, listShifts, getScorecard } = require('./shiftStore');
const cookieParser = require('cookie-parser');
const { signToken } = require('./authEngine');
const { DATA_DIR, UPLOAD_DIR } = require('./storagePaths');

const app = express();
const PORT = process.env.PORT ?? process.env.BACKEND_PORT ?? 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Bypass localtunnel warning page for all responses
app.use((_req, res, next) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  next();
});

// Serve the admin portal as a static SPA
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ─── PWA assets ──────────────────────────────────────────────────────────────
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/manifest.json', (_req, res) => {
  res.json({
    name: 'FELLITO — Epic ATE Support',
    short_name: 'FELLITO',
    description: 'Your Epic Go-Live AI support consultant',
    start_url: '/app',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#050508',
    theme_color: '#00E5FF',
    icons: [
      { src: '/public/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/public/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  });
});

app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`
const CACHE = 'fellito-v48';
const PRECACHE = ['/public/icon-192.png', '/public/icon-512.png', '/public/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  // Never cache HTML pages — always fetch fresh
  const url = new URL(e.request.url);
  if (url.pathname === '/app' || url.pathname === '/app/chat' || url.pathname.startsWith('/temp/') || e.request.url.includes('/api/') || e.request.method !== 'GET') return;
  // Cache-first only for icons/static assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
`);
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ─── Portal Guide (branded downloadable instructions page) ───────────────────
app.get('/portal-guide', (_req, res) => {
  const BASE = process.env.BASE_URL || 'https://fellito-epic-ate-agent.onrender.com';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>FELLITO Portal — Quick-Start Guide</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#07070F;font-family:'Inter',sans-serif;color:#F0F0FF;min-height:100vh;padding:40px 20px;}
  .card{max-width:780px;margin:0 auto;background:#0D0D1A;border:1.5px solid #1E1E2E;border-radius:24px;overflow:hidden;}
  .header{background:linear-gradient(135deg,#07070F 0%,#0D0D2A 100%);padding:40px 48px 32px;border-bottom:1px solid #1E1E2E;position:relative;}
  .header::after{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#00E5FF,#B388FF,#00E5FF);}
  .logo{font-size:28px;font-weight:900;letter-spacing:2px;color:#00E5FF;margin-bottom:4px;}
  .sub{font-size:13px;color:#8A8AA0;letter-spacing:2px;font-weight:600;text-transform:uppercase;}
  .tagline{font-size:22px;font-weight:800;color:#F0F0FF;margin-top:18px;line-height:1.3;}
  .body{padding:40px 48px;}
  .steps-title{font-size:11px;font-weight:700;color:#00E5FF;letter-spacing:2px;margin-bottom:24px;}
  .step{display:flex;gap:20px;margin-bottom:28px;align-items:flex-start;}
  .step-num{min-width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00E5FF22,#00E5FF44);border:1.5px solid #00E5FF;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#00E5FF;flex-shrink:0;}
  .step-body{}
  .step-title{font-size:15px;font-weight:700;color:#F0F0FF;margin-bottom:4px;}
  .step-desc{font-size:13px;color:#8A8AA0;line-height:1.6;}
  .step-desc a{color:#00E5FF;text-decoration:none;}
  .step-tag{display:inline-block;background:#00E5FF18;border:1px solid #00E5FF44;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;color:#00E5FF;letter-spacing:1px;margin-top:6px;}
  .divider{height:1px;background:#1E1E2E;margin:32px 0;}
  .rules-title{font-size:11px;font-weight:700;color:#FF6B6B;letter-spacing:2px;margin-bottom:16px;}
  .rule{display:flex;gap:12px;margin-bottom:12px;font-size:13px;color:#8A8AA0;line-height:1.5;}
  .rule-icon{font-size:16px;flex-shrink:0;}
  .cta{margin-top:36px;text-align:center;}
  .cta-btn{display:inline-block;background:linear-gradient(135deg,#00E5FF,#00B4CC);color:#000;font-weight:800;font-size:15px;letter-spacing:1px;text-decoration:none;padding:16px 40px;border-radius:14px;box-shadow:0 0 32px rgba(0,229,255,.25);}
  .footer{padding:24px 48px;border-top:1px solid #1E1E2E;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
  .footer-brand{font-size:12px;color:#8A8AA0;}
  .footer-brand strong{color:#00E5FF;}
  .print-btn{background:none;border:1px solid #2A2A3E;border-radius:20px;color:#8A8AA0;font-size:12px;font-weight:700;padding:7px 18px;cursor:pointer;letter-spacing:1px;}
  @media print{.print-btn{display:none;}.card{border:none;box-shadow:none;} body{background:#fff;} .header,.body,.footer{color:#000;}}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="logo">FELLITO</div>
    <div class="sub">Eclat Universe · Epic ATE Support Portal</div>
    <div class="tagline">Your AI-powered go-live assistant.<br/>Here's how to get started.</div>
  </div>
  <div class="body">
    <div class="steps-title">QUICK-START GUIDE — 5 STEPS</div>

    <div class="step">
      <div class="step-num">1</div>
      <div class="step-body">
        <div class="step-title">Log In</div>
        <div class="step-desc">Go to <a href="${BASE}" target="_blank">${BASE}</a> and sign in with the email and password from your invite. First time? Use the temporary password and change it right away under your profile.</div>
        <span class="step-tag">LOGIN</span>
      </div>
    </div>

    <div class="step">
      <div class="step-num">2</div>
      <div class="step-body">
        <div class="step-title">Ask FELLITO Anything</div>
        <div class="step-desc">Type your workflow question in the chat box. FELLITO has Epic ATE expertise built in — ask about department setups, common errors, best practices, or anything you'd normally escalate. You'll get an answer in seconds.</div>
        <span class="step-tag">AI CHAT</span>
      </div>
    </div>

    <div class="step">
      <div class="step-num">3</div>
      <div class="step-body">
        <div class="step-title">Use the Knowledge Base</div>
        <div class="step-desc">Your PM has uploaded go-live docs, tip sheets, and reference materials. Tap <strong style="color:#F0F0FF;">📄 Docs</strong> to browse them, or just ask FELLITO — it searches them automatically when answering your questions.</div>
        <span class="step-tag">DOCS</span>
      </div>
    </div>

    <div class="step">
      <div class="step-num">4</div>
      <div class="step-body">
        <div class="step-title">Escalate an Issue</div>
        <div class="step-desc">If you hit something FELLITO can't resolve, tap <strong style="color:#F0F0FF;">🚨 Report Issue</strong>. Describe what happened and it'll be flagged to your PM immediately. Don't try to handle clinical or security problems on your own.</div>
        <span class="step-tag">ESCALATION</span>
      </div>
    </div>

    <div class="step">
      <div class="step-num">5</div>
      <div class="step-body">
        <div class="step-title">Log Your Shift</div>
        <div class="step-desc">At the end of each shift, tap <strong style="color:#F0F0FF;">End Shift</strong> and fill in your summary — questions answered, any issues escalated, and notes. This feeds your performance scorecard so your work gets counted.</div>
        <span class="step-tag">SHIFT LOG</span>
      </div>
    </div>

    <div class="divider"></div>

    <div class="rules-title">⚠ IMPORTANT RULES</div>
    <div class="rule"><span class="rule-icon">🚫</span><span>Never enter patient names, MRNs, DOBs, or any clinical records into the chat. Workflow questions only.</span></div>
    <div class="rule"><span class="rule-icon">🚫</span><span>Do not share your login credentials or access link with anyone.</span></div>
    <div class="rule"><span class="rule-icon">✅</span><span>If you're unsure whether something is safe to ask — ask your PM first.</span></div>

    <div class="cta">
      <a href="${BASE}" class="cta-btn">Open FELLITO Portal →</a>
    </div>
  </div>
  <div class="footer">
    <div class="footer-brand">Powered by <strong>FELLITO · Eclat Universe</strong> — Epic ATE Support System</div>
    <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
</div>
</body>
</html>`);
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const deviceId = req.headers['x-device-id'] ?? null;
  try {
    const result = await login(email, password, deviceId);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
  try {
    await inviteContributor({ name, email, password, assignedGoLives: [] });
    const result = await login(email, password, req.headers['x-device-id'] ?? null);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const { changePassword } = require('./authEngine');
    await changePassword(req.user.id, newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/set-temp-password', requireOwner, async (req, res) => {
  const { email, tempPassword } = req.body;
  if (!email || !tempPassword) return res.status(400).json({ error: 'email and tempPassword required' });
  try {
    const { setTempPassword } = require('./authEngine');
    await setTempPassword(email, tempPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const { listTeam } = require('./authEngine');
    const team = listTeam ? listTeam() : [];
    const user = team.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ ok: true }); // silent — don't reveal if email exists
    const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || 'http://localhost:3001';
    const { createTempLink } = require('./tempLinkStore');
    const link = createTempLink({ label: user.name || email, permanent: true });
    const inviteUrl = `${baseUrl}/temp/${link.id}`;
    const { sendInviteEmail } = require('./emailService');
    await sendInviteEmail({ toEmail: user.email, toName: user.name, inviteUrl, label: 'Password Reset' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// ─── Admin: current user ──────────────────────────────────────────────────────
app.get('/api/admin/me', requireAuth, (req, res) => {
  const { id, email, name, role, assignedGoLives } = req.user;
  res.json({ id, email, name, role, assignedGoLives });
});

// ─── Admin: team management (owner only) ──────────────────────────────────────
app.get('/api/admin/team', requireAuth, (_req, res) => {
  res.json(listTeam());
});

// ─── Admin: user memory ───────────────────────────────────────────────────────
app.get('/api/admin/memory', requireOwner, (_req, res) => {
  res.json(listAllMemory());
});

app.post('/api/admin/team', requireOwner, async (req, res) => {
  const { email, name, password, assignedGoLives } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: 'email, name, and password required' });
  try {
    const user = await inviteContributor({ email, name, password, assignedGoLives });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/team/:id', requireOwner, async (req, res) => {
  try {
    const updated = updateTeamMember(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/team/:id', requireOwner, (req, res) => {
  try {
    deleteTeamMember(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Unbind device from a user account (owner can reset if someone gets a new phone)
app.post('/api/admin/team/:id/unbind-device', requireOwner, (req, res) => {
  try {
    const updated = updateTeamMember(req.params.id, { boundDeviceId: null });
    res.json({ ok: true, user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Go-Live Discovery (internet search via Tavily + Claude) ─────────────────
app.get('/api/admin/discover', requireOwner, async (req, res) => {
  const query = (req.query.q || 'Epic EHR go-live implementation 2025 United States hospital').trim();
  let webResults = '';

  // Try Tavily if key is set
  if (process.env.TAVILY_API_KEY) {
    try {
      const tvRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: query + ' Epic EHR go-live hospital',
          search_depth: 'basic',
          max_results: 8,
          include_answer: false,
        }),
      });
      const tvData = await tvRes.json();
      if (tvData.results?.length) {
        webResults = tvData.results.map(r => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.content?.slice(0, 300)}`).join('\n\n');
      }
    } catch (_) {}
  }

  const prompt = webResults
    ? `You are an Epic EHR go-live intelligence analyst. Based on these real web search results, extract upcoming Epic EHR go-live events in the United States:\n\n${webResults}\n\nReturn ONLY valid JSON, no markdown:\n{"results":[{"hospital":"Hospital Name","city":"City","state":"ST","modules":["Module1"],"expectedDate":"YYYY-MM or Q1 2025 or TBD","source":"URL or publication","confidence":"high|medium|low","notes":"brief context"}]}`
    : `You are an Epic EHR go-live intelligence analyst. List ${query.toLowerCase().includes('epic') ? '' : 'Epic EHR '}upcoming or recently announced hospital/health system go-live implementations in the United States matching this search: "${query}". Use your training knowledge through early 2025.\n\nReturn ONLY valid JSON, no markdown:\n{"results":[{"hospital":"Hospital Name","city":"City","state":"ST","modules":["Module1"],"expectedDate":"YYYY-MM or Q1 2025 or TBD","source":"press release / news / announcement","confidence":"high|medium|low","notes":"brief context"}]}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].text;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object in response');
    const json = JSON.parse(text.slice(start, end + 1));
    res.json({ ...json, webSearch: !!webResults });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Consultant Scorecard ─────────────────────────────────────────────────────

app.get('/api/admin/scorecard', requireOwner, (_req, res) => {
  try { res.json(getScorecard()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/shifts', requireOwner, (req, res) => {
  try { res.json(listShifts(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Job Discovery (Epic ATE consultant jobs from web) ───────────────────────
app.get('/api/admin/discover-jobs', requireOwner, async (req, res) => {
  const query = (req.query.q || 'Epic EHR ATE analyst consultant contract job 2025').trim();
  let webResults = '';

  if (process.env.TAVILY_API_KEY) {
    try {
      const tvRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: query + ' site:indeed.com OR site:linkedin.com OR site:dice.com OR site:healthcareit.com',
          search_depth: 'basic',
          max_results: 10,
          include_answer: false,
        }),
      });
      const tvData = await tvRes.json();
      if (tvData.results?.length) {
        webResults = tvData.results.map(r => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.content?.slice(0, 300)}`).join('\n\n');
      }
    } catch (_) {}
  }

  const prompt = webResults
    ? `You are an Epic EHR staffing analyst. Based on these real job search results, extract Epic EHR ATE/analyst/consultant job postings:\n\n${webResults}\n\nReturn ONLY valid JSON, no markdown:\n{"jobs":[{"title":"Job Title","company":"Company/Hospital","city":"City","state":"ST","type":"Contract|Full-time|Part-time","rate":"$XX/hr or $XXk/yr or TBD","modules":["Module1"],"applyUrl":"URL or null","source":"Indeed|LinkedIn|Dice|etc","posted":"YYYY-MM-DD or TBD","notes":"brief context"}]}`
    : `You are an Epic EHR staffing analyst. List current or recent Epic EHR ATE analyst/consultant/trainer job postings in the United States matching: "${query}". Use your training knowledge.\n\nReturn ONLY valid JSON, no markdown:\n{"jobs":[{"title":"Job Title","company":"Company/Hospital","city":"City","state":"ST","type":"Contract|Full-time|Part-time","rate":"$XX/hr or $XXk/yr or TBD","modules":["Module1"],"applyUrl":null,"source":"Indeed|LinkedIn|Dice","posted":"TBD","notes":"brief context"}]}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].text;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object in response');
    const json = JSON.parse(text.slice(start, end + 1));
    res.json({ ...json, webSearch: !!webResults });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Send go-live opportunity emails ─────────────────────────────────────────
app.post('/api/admin/send-golive-opportunity', requireOwner, async (req, res) => {
  const { userIds, opportunities } = req.body;
  if (!Array.isArray(userIds) || !userIds.length) return res.status(400).json({ error: 'userIds required' });
  if (!Array.isArray(opportunities) || !opportunities.length) return res.status(400).json({ error: 'opportunities required' });

  const team = listTeam();
  const targets = team.filter(u => userIds.includes(u.id));
  if (!targets.length) return res.status(400).json({ error: 'No valid users found' });

  const sentBy = req.user.name || req.user.email;
  const results = { sent: [], failed: [] };

  await Promise.allSettled(targets.map(async u => {
    try {
      await sendGoLiveOpportunityEmail({ toEmail: u.email, toName: u.name, opportunities, sentBy });
      results.sent.push(u.name || u.email);
    } catch (e) {
      results.failed.push({ name: u.name || u.email, error: e.message });
    }
  }));

  res.json(results);
});

// ─── Assign go-lives to a team member ────────────────────────────────────────
app.patch('/api/admin/team/:id/assign-golives', requireOwner, (req, res) => {
  try {
    const { assignedGoLives } = req.body;
    if (!Array.isArray(assignedGoLives)) return res.status(400).json({ error: 'assignedGoLives must be array' });
    const updated = updateTeamMember(req.params.id, { assignedGoLives });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Go-Live events ───────────────────────────────────────────────────────────
app.get('/api/golives', requireAuth, (req, res) => {
  res.json(listGoLives(req.user));
});

app.post('/api/golives', requireOwner, (req, res) => {
  const { name, startDate, endDate, modules } = req.body;
  if (!name || !startDate) return res.status(400).json({ error: 'name and startDate required' });
  try {
    const event = createGoLive({ name, startDate, endDate, modules, createdBy: req.user.id });
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/golives/:id', requireOwner, (req, res) => {
  try {
    const updated = updateGoLive(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/golives/:id', requireOwner, (req, res) => {
  try {
    deleteGoLive(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Module system prompts (server-side, no template literal escaping issues) ──
const MODULE_PROMPTS = {
  // ── Core Clinical ──────────────────────────────────────────────────────────
  ClinDoc: "You are the FELLITO ClinDoc Agent — expert on Epic Clinical Documentation. Help with: flowsheet row entry (vitals, I/Os, assessments), nursing documentation (admission/shift assessments, care plans), SmartText and SmartPhrase (.hpi, .ros, .exam, .a, .plan), note types (Progress Notes, H&P, Nursing Notes, Procedure Notes, Discharge Summaries, Operative Notes), In Basket documentation routing, note status (In Progress, Signed, Addendum, Cosign), pulling forward previous documentation and note templates, AVS generation and customization, downtime documentation and paper chart reconciliation, Dragon/voice recognition in Epic, common Day 1 documentation errors.",
  CPOE: "You are the FELLITO CPOE Agent — expert on Epic Computerized Provider Order Entry. Help with: placing orders (medications, labs, imaging, consults, referrals, diets, activity, nursing orders), order sets and panels, preference lists (building, editing, syncing), medication reconciliation (admission/transfer/discharge), order routing, verbal and telephone order documentation and cosign, modify/discontinue/reorder workflows, future orders and start/stop times, note workflows (progress notes, cosign, addendum, SmartPhrases), downtime order management, ambulatory vs inpatient differences, common CPOE Day 1 issues: providers cannot find orders, wrong formulary, missing order sets.",
  // ── Emergency ─────────────────────────────────────────────────────────────
  ASAP: "You are the FELLITO ASAP Agent — expert on Epic Emergency Department workflows. Help with: ED tracking board navigation (columns, colors, status icons), patient placement and bed assignment, triage workflows (ESI scoring, triage note documentation), Quick vs Full Registration in the ED, ED order sets and fast tracks, critical result routing and follow-up flags, ED provider notes and scribe notes, disposition workflows (discharge, admission, transfer, AMA), downtime procedures and paper chart reconciliation, LWBS and LBTC documentation, diversion tracking, common ASAP Day 1 issues: board not updating, patients stuck in triage, missing results.",
  // ── Oncology ──────────────────────────────────────────────────────────────
  Beacon: "You are the FELLITO Beacon Agent — expert on Epic Beacon Oncology. Help with: treatment plan navigation and chemo protocol lookup, cycle and day management, chemo order verification (pharmacist and provider steps), Beacon flowsheets (pre-meds, chemo administration, post-chemo monitoring), Beacon SmartSets and order panels, drug dosing calculations (BSA/AUC workflows), prior authorization and insurance workflows, Beacon scheduling (infusion appointments, follow-ups, lab orders tied to chemo cycles), toxicity and adverse event documentation, Beacon In Basket routing, Beaker integration for infusion labs, common Beacon Day 1 issues: treatment plan not found, dosing errors, scheduling gaps.",
  // ── Lab ───────────────────────────────────────────────────────────────────
  Beaker: "You are the FELLITO Beaker Agent — expert on Epic Beaker Laboratory Information System. Help with: specimen collection and labeling (patient ID, label printing, tube types), order-to-collection-to-result workflow, lab routing to correct sections, result verification and release (auto-verify vs manual), critical value notification, Beaker accession numbers, CPOE interface for lab orders, QC documentation, reflex testing and trigger logic, downtime procedures and paper requisitions, lab courier and pneumatic tube workflows, point-of-care testing (glucometers, i-STAT) integration, common Beaker Day 1 issues: labels not printing, results not releasing, interface errors.",
  // ── ADT / Bed Management ─────────────────────────────────────────────────
  ADT: "You are the FELLITO ADT Agent — expert on Epic Admissions, Discharge, and Transfers. Help with: admission workflows (direct, ED, scheduled), bed management and placement (Bed Board, capacity tools), transfer workflows (unit-to-unit, hospital-to-hospital), discharge workflows (discharge order, instructions, AVS), discharge disposition documentation (home, SNF, rehab, hospice), registration workflows (insurance verification, guarantor setup, consent forms), escort and transport documentation, census management and ADT reporting, Prelude integration points, holds and pending placements, downtime ADT procedures, common ADT Day 1 issues: patients not on census, duplicate MRNs, bed not releasing.",
  // ── Surgical / Periop ─────────────────────────────────────────────────────
  OpTime: "You are the FELLITO OpTime Agent — expert on Epic OpTime Surgical and Perioperative workflows. Help with: OR scheduling (posting cases, scheduling blocks, add-on cases), pre-op documentation (pre-op assessment, anesthesia pre-op, consent), surgical case record (case start/stop, personnel, implant tracking), intraoperative nursing documentation (circulator notes, sponge counts, specimen labeling), AnesthesiaPro integration, PACU documentation and handoff, post-op orders and handoff to inpatient, preference cards (finding, using, requesting updates), block scheduling and OR utilization reporting, sterilization and instrument tracking (SIS), downtime surgical documentation, common OpTime Day 1 issues: cases not on board, consent not linking, preference card missing.",
  // ── Registration / Scheduling ─────────────────────────────────────────────
  Prelude: "You are the FELLITO Prelude Agent — expert on Epic Prelude Patient Registration. Help with: patient registration (new patient creation, MPI search for existing), insurance plan entry and verification (coverage, subscriber, group number), guarantor setup and financial responsibility, consent form documentation and e-signature, scheduling (appointment creation, recall scheduling, waitlists), check-in and arrival workflows (kiosk vs desk), co-pay collection and payment posting, MyChart activation and proxy setup at registration, pre-registration for scheduled procedures, duplicate MRN detection and overlay prevention, common Prelude Day 1 issues: insurance not verifying, duplicate patients, MyChart not activating.",
  // ── Radiology ─────────────────────────────────────────────────────────────
  Radiant: "You are the FELLITO Radiant Agent — expert on Epic Radiant Radiology Information System. Help with: radiology order routing from CPOE to Radiant, scheduling imaging exams (CT, MRI, X-Ray, Ultrasound, Nuclear Med, Fluoroscopy), exam check-in and patient prep documentation, technologist workflow (exam start, image acquisition documentation), protocoling workflows (radiologist review and protocol assignment), preliminary vs final report release, critical result notification, PACS integration and image viewing (PowerScribe, Sectra, Philips), contrast tracking and allergy pre-medication documentation, downtime radiology procedures, common Radiant Day 1 issues: orders not routing, exams not in worklist, results not releasing.",
  // ── Patient Portal ────────────────────────────────────────────────────────
  MyChart: "You are the FELLITO MyChart Agent — expert on Epic MyChart Patient Portal. Help with: MyChart account activation (at registration and via invitation), proxy access setup (parent for child, caregiver for adult), MyChart messaging (patient-to-provider routing and responses), appointment scheduling and self-scheduling configuration, test result release settings (immediate vs delayed, what auto-releases), AVS delivery via MyChart, online bill pay and financial assistance, MyChart Bedside (inpatient tablet), video visit setup and MyChart video workflow, questionnaire and health history completion, password reset and account access troubleshooting, common MyChart Day 1 issues: patients cannot activate, not receiving messages, wrong results showing.",
  // ── Pharmacy ──────────────────────────────────────────────────────────────
  Willow: "You are the FELLITO Willow Agent — expert on Epic Willow Pharmacy (Inpatient and Ambulatory). Help with: medication order verification and pharmacist review workflow, BCMA (bedside barcode medication administration) scanning and overrides, pharmacy dispensing queues (fill list, Pyxis/Omnicell interface), IV compounding and sterile prep documentation, pharmacy order entry and substitution, medication reconciliation from pharmacist perspective, controlled substance tracking and diversion monitoring, clinical decision support alerts (drug-drug, drug-allergy, duplicate therapy), Willow Ambulatory (retail/outpatient pharmacy workflow, e-prescribing receive, will-call queue), pharmacy downtime procedures, common Willow Day 1 issues: Pyxis not syncing, BCMA overrides, orders not routing to pharmacy.",
  // ── Scheduling / Ambulatory ───────────────────────────────────────────────
  Cadence: "You are the FELLITO Cadence Agent — expert on Epic Cadence Scheduling and Ambulatory workflows. Help with: appointment scheduling (single, recurring, multi-resource), schedule template setup and slot types, referral and authorization workflows, schedule search and waitlist management, check-in and rooming workflows, nurse triage and visit documentation, provider In Basket management (results, refills, messages), after-visit summary (AVS) completion, recall scheduling and gap in care outreach, self-scheduling via MyChart, telephone encounter documentation, common Cadence Day 1 issues: schedule not showing, appointment type mismatch, providers cannot see schedule.",
  // ── Obstetrics ────────────────────────────────────────────────────────────
  Stork: "You are the FELLITO Stork Agent — expert on Epic Stork Obstetrics. Help with: prenatal record navigation and OB history entry, Labor and Delivery (L&D) tracking board, OB triage and admission workflow, delivery documentation (vaginal and C-section), newborn chart creation and linking to mother, postpartum documentation, fetal monitoring strip documentation, OB orders and order sets, anesthesia (epidural) documentation in L&D, breastfeeding and lactation documentation, newborn screening workflows, mother-baby discharge workflow, common Stork Day 1 issues: newborn chart not linking to mother, delivery not documenting correctly, fetal strips not archiving.",
  // ── Revenue Cycle ─────────────────────────────────────────────────────────
  Resolute: "You are the FELLITO Resolute Agent — expert on Epic Resolute Revenue Cycle (Hospital and Professional Billing). Help with: charge capture and charge review workflows, claim edit and claim scrubbing, insurance follow-up and denial management, remittance and payment posting, prior authorization tracking and appeals, coding workflows (DRG, ICD-10, CPT), billing holds and claim submission, patient statements and self-pay collections, credit balance and refund workflows, payer contract setup and reimbursement, Resolute HB vs PB differences, common Resolute Day 1 issues: charges not dropping, claims on hold, insurance not billing correctly.",
  // ── In Basket / Communication ─────────────────────────────────────────────
  InBasket: "You are the FELLITO In Basket Agent — expert on Epic In Basket messaging and communication workflows. Help with: In Basket message types (results, refills, telephone encounters, patient messages, staff messages, paging), routing rules and pool setup, message forwarding and delegation, result routing and acknowledgment, refill request workflow, patient MyChart message responses, telephone encounter documentation, In Basket management strategies for high-volume providers, coverage and away settings, common In Basket Day 1 issues: messages routing to wrong pool, providers overwhelmed, results not arriving.",
  // ── Mobile ────────────────────────────────────────────────────────────────
  Haiku: "You are the FELLITO Haiku/Canto Agent — expert on Epic mobile applications. Haiku = iPhone/Android smartphone app for providers. Canto = iPad app for providers. Help with: mobile device setup and Epic MDM enrollment, Haiku/Canto login and authentication (MFA, TouchID, FaceID), patient list and schedule navigation on mobile, results review and acknowledgment on mobile, mobile ordering (lab, medications), In Basket management on mobile, mobile documentation (notes, flowsheets), Push Notifications setup, mobile CPOE limitations vs desktop, common Day 1 issues: cannot log in, MFA not working, patients not on mobile list.",
  // ── Reporting / Analytics ─────────────────────────────────────────────────
  Reporting: "You are the FELLITO Reporting Agent — expert on Epic Reporting and Analytics tools. Help with: Reporting Workbench (running, scheduling, distributing reports), SlicerDicer (self-service data exploration, cohort building), Crystal Reports access and distribution, registries and population health dashboards, operational reports (census, productivity, throughput), building and customizing report parameters, report security and sharing, Epic Chronicles database basics, Radar dashboards for real-time metrics, common Reporting Day 1 issues: cannot find report, report showing no data, access not granted.",
  // ── HIM / ROI ─────────────────────────────────────────────────────────────
  HIM: "You are the FELLITO HIM Agent — expert on Epic Health Information Management. Help with: chart completion and deficiency management (physician incomplete charts), Release of Information (ROI) workflows, coding and abstracting workflow, record amendment and addendum documentation, hybrid record management (paper to electronic reconciliation), chart audit workflows, documentation integrity monitoring, HIPAA release and authorization tracking, common HIM Day 1 issues: deficiency queue not loading, charts not routing for completion, ROI requests not processing.",
  // ── Infection Control / Population Health ─────────────────────────────────
  Healthy: "You are the FELLITO Healthy Planet Agent — expert on Epic Healthy Planet Population Health. Help with: care gap identification and closure workflows, panel management and patient outreach, chronic disease registries (diabetes, hypertension, preventive care), care team assignments and huddle workflows, care coordination and case management documentation, patient outreach campaigns (letters, MyChart messages, phone calls), risk stratification tools, quality measure tracking (HEDIS, UDS), common Healthy Planet Day 1 issues: panels not loading, care gaps not showing, outreach not routing.",
};

// Map display names (with parenthetical suffixes) to MODULE_PROMPTS keys
const MODULE_KEY_MAP = {
  'ASAP (ED)': 'ASAP',
  'Beacon (Oncology)': 'Beacon',
  'Beaker (Lab)': 'Beaker',
  'OpTime (Surgical)': 'OpTime',
  'OpTime/Anesthesia': 'OpTime',
  'Prelude (Registration)': 'Prelude',
  'Prelude/Cadence': 'Prelude',
  'Cadence (Scheduling)': 'Cadence',
  'Radiant (Radiology)': 'Radiant',
  'Willow (Pharmacy)': 'Willow',
  'Stork (OB)': 'Stork',
  'Resolute (Rev Cycle)': 'Resolute',
  'In Basket': 'InBasket',
  'Haiku/Canto (Mobile)': 'Haiku',
  'Haiku/Canto': 'Haiku',
  'Reporting/Analytics': 'Reporting',
  'Reporting': 'Reporting',
  'Healthy Planet': 'Healthy',
};

function buildServerSystemPrompt(moduleTag, dept, goLive) {
  const rawMod = moduleTag || 'Epic';
  const mod = rawMod;
  const lookupKey = MODULE_KEY_MAP[rawMod] || rawMod;
  const go = goLive || 'this Go-Live';
  const dp = dept || 'this department';
  const expertise = MODULE_PROMPTS[lookupKey] || `You are the FELLITO ${mod} Agent — expert on Epic ${mod} workflows. Provide sharp, specific Go-Live support for all ${mod} workflows and Day 1 issues.`;
  return `You are FELLITO — a digital clone of Fellito R. Rodriguez, a 13+ year Epic Credentialed Trainer with NYC/Nigerian swagger. Personally trained 250+ physicians and 300+ nurses across 20+ major health systems. No textbook answers — speak like a veteran on the floor on Day 1.

This consultant is supporting ${go} — working ${mod} in the ${dp} department.

${expertise}

RULES: Keep answers SHORT. 3-5 bullet points max, no paragraphs, no fluff. If it can be said in one line, say it in one line. Speak with quiet confidence — simple, direct, firm. You can say "I got you", "straight up", or "real talk" naturally when it fits, but always stay respectful and professional. Think: the smartest person in the room who grew up in the hood and never forgot it. Never mention Claude or Anthropic — you are FELLITO, powered by Eclat Universe. Stay focused on Epic workflows only.

KNOWLEDGE SOURCE: Answer ENTIRELY from your own training knowledge and the knowledge base provided above. Never tell the user to "search online", "check the Epic UserWeb", "Google it", "visit a website", or "look it up externally". You carry 13+ years of Epic knowledge in your head — use it. If you are not certain about a specific detail, say so directly and give your best guidance based on what you know. The consultant is on the floor right now — they need YOUR answer, not a pointer to go find one.

DOWNTIME EXPERTISE: One of the hardest parts of Go-Live is looking productive when the floor is quiet. When asked about downtime, give specific, real moves a consultant can make right now — not vague advice. Examples: walk the floor and find users who have not asked a question yet (they always have one), check the issue tracker for anything unresolved, sit with a super user and do a 15-min refresher on a workflow they struggled with earlier, review your module tip sheet so you are sharper for the next wave, help a busier colleague in another area, document recurring questions from the morning so leadership can do a quick huddle, shadow a user silently and look for workarounds they picked up that will cause problems later. Looking busy is a professional skill. Own it.

HOW NOT TO GET KICKED OFF THE PROJECT: This is real and it happens. When asked how to stay on the project or not get sent home, be direct and honest — speak from experience. The things that get consultants cut: sitting at the nurses station on their phone, disappearing to the cafeteria for 45 minutes, clustering with other consultants instead of being on the floor, having an attitude with staff or leadership, arguing about Epic build instead of helping users work around it, not knowing your module well enough and getting exposed, wearing headphones, showing up late or leaving early without telling anyone, and most of all — not being visible when the project manager walks the floor. The things that keep you on: being the first one the charge nurse comes to, logging issues proactively before anyone has to report them, knowing every user in your zone by name by end of Day 1, never sitting down when leadership is watching, always having something in your hand (a tip sheet, a clipboard, your phone open to Epic). The PM is always watching. Act like it.

PHI HARD BLOCK: If the message contains ANY patient names, MRNs, DOBs, SSNs, insurance IDs, clinical records, chart notes, lab results, diagnoses, or any PHI — REFUSE IMMEDIATELY. Respond ONLY with: "STOP - I cannot process patient information. FELLITO is a workflow support tool only. Ask me about Epic workflows and I will help you sharp sharp."`;
}

// ─── Chat (requires auth) — streaming SSE ────────────────────────────────────
app.post('/api/chat', requireAuth, async (req, res) => {
  const { model, messages, max_tokens, moduleTag, goLiveId, dept, goLive } = req.body;
  if (!model || !messages) return res.status(400).json({ error: 'Missing model or messages' });

  const userId = req.user.id || req.user.linkId || req.user.sub || 'anon';

  try {
    let systemPrompt = buildServerSystemPrompt(moduleTag, dept, goLive);

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      const sessionId = goLiveId || userId || 'standby';
      // Search uploaded docs + learned Q&A scoped to this Go-Live
      const learnedSessionId = goLiveId ? `golive-${goLiveId}` : null;
      const [ragContext, learnedContext] = await Promise.all([
        queryDocuments(lastUserMsg.content, sessionId, 4, moduleTag || null),
        learnedSessionId ? queryDocuments(lastUserMsg.content, learnedSessionId, 3, moduleTag || null) : Promise.resolve(null),
      ]);
      if (ragContext)     systemPrompt += '\n\nKNOWLEDGE BASE — use this if relevant:\n' + ragContext;
      if (learnedContext) systemPrompt += '\n\nPAST SESSION KNOWLEDGE — answers from previous sessions at this Go-Live:\n' + learnedContext;
    }

    const memContext = buildMemoryContext(userId);
    if (memContext) systemPrompt += '\n\n' + memContext;

    // Stream the response so the tunnel doesn't time out
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullReply = '';
    const stream = anthropic.messages.stream({ model, system: systemPrompt, messages, max_tokens: max_tokens ?? 1024 });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const text = chunk.delta.text;
        fullReply += text;
        res.write('data: ' + JSON.stringify({ text }) + '\n\n');
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();

    // Post-stream memory updates
    const userName = req.user.name || req.user.email || null;
    if (lastUserMsg) updateMemory(userId, { role: 'user', content: lastUserMsg.content, module: moduleTag, dept, goLive, userName });
    if (fullReply)   updateMemory(userId, { role: 'assistant', content: fullReply, module: moduleTag, dept, goLive, userName });

    // Self-learning: ingest every Q&A pair scoped to the current Go-Live
    if (lastUserMsg && fullReply && fullReply.length > 40 && goLiveId) {
      const learnedText = `Q: ${lastUserMsg.content.trim()}\nA: ${fullReply.trim()}`;
      const tmpPath = require('os').tmpdir() + '/fellito-learned-' + Date.now() + '.txt';
      require('fs').writeFileSync(tmpPath, learnedText, 'utf8');
      ingestDocument(tmpPath, `learned_${moduleTag || 'general'}_${Date.now()}.txt`, `golive-${goLiveId}`, moduleTag || null)
        .catch(() => {})
        .finally(() => { try { require('fs').unlinkSync(tmpPath); } catch {} });
    }

    if (lastUserMsg && moduleTag) {
      const q = lastUserMsg.content.toLowerCase();
      if (q.includes('cosign'))       addInsight(userId, `Needs help with cosign workflows in ${moduleTag}`);
      if (q.includes('order set'))    addInsight(userId, `Uses order sets frequently in ${moduleTag}`);
      if (q.includes('downtime'))     addInsight(userId, 'Has asked about downtime procedures');
      if (q.includes('preference'))   addInsight(userId, `Works with preference lists in ${moduleTag}`);
      if (q.includes('flowsheet'))    addInsight(userId, 'Uses flowsheet documentation workflows');
      if (q.includes('note') || q.includes('documentation')) addInsight(userId, `Documentation workflows are a focus area in ${moduleTag}`);
      if (q.includes('transfer') || q.includes('discharge')) addInsight(userId, 'Frequently handles transfer/discharge workflows');
      if (q.includes('result') || q.includes('lab'))         addInsight(userId, 'Often asks about lab results and routing');
    }
  } catch (err) {
    console.error('[Chat]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

// ─── RAG: Ingest (requires auth) ──────────────────────────────────────────────
app.post('/api/rag/ingest', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { sessionId, moduleTag } = req.body;
  // Module-tagged docs go into the global module bucket, not per-Go-Live
  const effectiveSessionId = moduleTag ? 'module:' + moduleTag : (sessionId || 'standby');
  try {
    const result = await ingestDocument(req.file.path, req.file.originalname, effectiveSessionId, moduleTag);
    fs.unlink(req.file.path, () => {});
    res.json(result);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('[RAG Ingest]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Send invite email ────────────────────────────────────────────────────────
app.post('/api/invite', requireOwner, async (req, res) => {
  const { toEmail, toName, label } = req.body;
  if (!toEmail) return res.status(400).json({ error: 'toEmail required' });
  try {
    const link = createTempLink({ label: toName || label || toEmail });
    const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || 'http://localhost:3001';
    const inviteUrl = baseUrl + '/temp/' + link.token;
    await sendInviteEmail({ toEmail, toName, inviteUrl, label });
    res.json({ ok: true, inviteUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Send welcome guide email ─────────────────────────────────────────────────
app.post('/api/admin/send-welcome', requireOwner, async (req, res) => {
  const { toEmail, toName } = req.body;
  if (!toEmail) return res.status(400).json({ error: 'toEmail required' });
  try {
    const base = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://fellito-epic-ate-agent.onrender.com';
    await sendWelcomeGuideEmail({ toEmail, toName, loginUrl: base, guideUrl: base + '/portal-guide' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Upload screenshot / tip sheet ───────────────────────────────────────────
// ─── PHI scan — checks image before upload ────────────────────────────────────
app.post('/api/scan-phi', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const mediaType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
    const base64 = fs.readFileSync(req.file.path).toString('base64');
    fs.unlink(req.file.path, () => {});

    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `You are a HIPAA compliance scanner. Inspect this image for Protected Health Information (PHI).

PHI includes: patient names, MRNs, dates of birth, medical record numbers, account numbers, Social Security numbers, phone numbers, addresses, email addresses, biometric identifiers, full face photos, any combination that could identify a patient.

Epic EHR workflow screenshots often show these in the chart header, patient banner, or order screens.

Respond ONLY with valid JSON — no other text:
{"phi": true/false, "reason": "one-sentence explanation"}

If you see ANY patient-identifying information, set phi to true.
If the image is a blank workflow screenshot, tip sheet, training material, or has no patient data, set phi to false.` }
        ]
      }]
    });

    let parsed;
    try {
      const text = result.content[0]?.text || '{}';
      parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    } catch {
      parsed = { phi: false };
    }

    res.json({ phi: !!parsed.phi, reason: parsed.reason || '' });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { goLiveId, moduleTag, goLive } = req.body;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const sessionId = goLiveId || 'standby';

  try {
    let extractedText = '';

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      // Single Vision call: PHI check + content extraction together
      const base64 = fs.readFileSync(req.file.path).toString('base64');
      const mediaType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

      const visionRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `You are a HIPAA-compliant Epic EHR content extractor.

STEP 1 — PHI CHECK: Scan for Protected Health Information (patient names, MRNs, DOBs, SSNs, account numbers, addresses, phone numbers, or any data that could identify a patient). If ANY PHI is found, respond ONLY with this JSON and nothing else:
{"phi":true,"reason":"<one sentence describing what was found>"}

STEP 2 — EXTRACT (only if no PHI): Extract ALL visible text, workflow steps, button labels, menu paths, and instructions from this Epic EHR tip sheet or screenshot. Be thorough — this will answer consultant questions on the floor.` }
          ]
        }]
      });

      const raw = visionRes.content[0]?.text || '';
      // Check if Vision flagged PHI
      const phiMatch = raw.match(/\{"phi"\s*:\s*true[\s\S]*?\}/);
      if (phiMatch) {
        let reason = 'Patient information detected.';
        try { reason = JSON.parse(phiMatch[0]).reason || reason; } catch {}
        fs.unlink(req.file.path, () => {});
        return res.status(422).json({ phi: true, reason });
      }

      extractedText = '[Screenshot: ' + req.file.originalname + ']\n' + raw;
    } else {
      // PDF or text — use existing RAG ingest
      const result = await ingestDocument(req.file.path, req.file.originalname, sessionId, moduleTag || null);
      fs.unlink(req.file.path, () => {});
      return res.json({ ok: true, type: 'pdf', ...result });
    }

    // Store vision-extracted text as a temp file and ingest
    const tmpPath = req.file.path + '.txt';
    fs.writeFileSync(tmpPath, extractedText, 'utf8');
    const result = await ingestDocument(tmpPath, req.file.originalname, sessionId, moduleTag || null);
    fs.unlink(req.file.path, () => {});
    fs.unlink(tmpPath, () => {});

    res.json({ ok: true, type: 'image', preview: extractedText.slice(0, 200), ...result });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('[Upload]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── RAG: Query (requires auth) ───────────────────────────────────────────────
app.post('/api/rag/query', requireAuth, async (req, res) => {
  const { question, sessionId, topK, moduleTag } = req.body;
  try {
    const context = await queryDocuments(question, sessionId, topK ?? 5, moduleTag ?? null);
    res.json({ context });
  } catch (err) {
    res.json({ context: '' });
  }
});

// ─── Session close — saves Go-Live journal entry ─────────────────────────────
// Accepts token via header OR query string (sendBeacon can't set headers)
app.post('/api/session/close', (req, res) => {
  const { verifyToken, getUserById } = require('./authEngine');
  const rawToken = (req.headers['authorization'] || '').replace('Bearer ', '') || req.query._tok || '';
  if (!rawToken) return res.json({ ok: false });
  try {
    const payload = verifyToken(rawToken);
    const userId = payload.linkId || payload.sub || 'anon';
    const journal = closeSession(userId);
    res.json({ ok: true, journal });
  } catch { res.json({ ok: false }); }
});

// ─── RAG: List docs (requires auth) ───────────────────────────────────────────
app.get('/api/rag/docs', requireAuth, async (req, res) => {
  try {
    res.json(await listDocuments(req.query.sessionId));
  } catch { res.json([]); }
});

// ─── RAG: Delete doc (requires auth) ──────────────────────────────────────────
app.delete('/api/rag/docs/:docId', requireAuth, async (req, res) => {
  try {
    await deleteDocument(req.params.docId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────
app.post('/api/tts', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const apiKey  = process.env.ELEVENLABS_API_KEY;
  if (!voiceId || !apiKey) return res.status(503).json({ error: 'ElevenLabs not configured' });
  try {
    const clean = text.replace(/[*_`#>]/g, '').slice(0, 900);
    const r = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      { text: clean, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true } },
      { headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, responseType: 'stream' }
    );
    res.setHeader('Content-Type', 'audio/mpeg');
    r.data.pipe(res);
  } catch (err) {
    console.error('[TTS]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ─── ElevenLabs Voice Sample — add recording to improve voice clone ───────────
app.post('/api/voice-sample', requireOwner, upload.single('audio'), async (req, res) => {
  const apiKey  = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) return res.status(503).json({ error: 'ElevenLabs not configured' });
  if (!req.file) return res.status(400).json({ error: 'No audio file received' });
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('name', 'FELLITO');
    form.append('files', fs.createReadStream(req.file.path), { filename: 'sample.webm', contentType: 'audio/webm' });
    const r = await axios.post(
      `https://api.elevenlabs.io/v1/voices/${voiceId}/edit`,
      form,
      { headers: { 'xi-api-key': apiKey, ...form.getHeaders() } }
    );
    fs.unlink(req.file.path, () => {});
    res.json({ ok: true });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('[VoiceSample]', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.detail?.message || err.message });
  }
});

// ─── Links Library ────────────────────────────────────────────────────────────
app.get('/api/links', requireAuth, (_req, res) => res.json(listLinks()));

app.post('/api/links/ingest', requireOwner, async (req, res) => {
  const { url, description, moduleTag } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    // Kick off async ingestion — return immediately so UI doesn't time out on slow pages
    res.json({ queued: true, message: 'Fetching and indexing URL in background...' });
    ingestLink(url, description, moduleTag, ingestDocument).catch((err) => {
      console.error('[Links] Ingest error:', err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/links/:id', requireOwner, (req, res) => {
  try { deleteLink(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── Issues Tracker ───────────────────────────────────────────────────────────
app.get('/api/issues', requireAuth, (req, res) => {
  res.json(listIssues(req.query.goLiveId));
});

app.post('/api/issues', requireAuth, (req, res) => {
  const { goLiveId, title, description, module, moduleTag, department, dept, severity } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const issue = createIssue({
      goLiveId, title, description, severity,
      module: module || moduleTag || '',
      department: department || dept || '',
      reportedBy: req.user.email,
    });
    res.json(issue);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/issues/:id', requireAuth, (req, res) => {
  try { res.json(updateIssue(req.params.id, req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/issues/:id', requireOwner, (req, res) => {
  try { deleteIssue(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/issues/report/:goLiveId', requireAuth, (req, res) => {
  res.json(generateReport(req.params.goLiveId));
});

// ─── User Adoption Tracker ───────────────────────────────────────────────────
app.get('/api/adoption', requireAuth, (req, res) => {
  res.json(listAdoption(req.query.goLiveId || null));
});

app.post('/api/adoption', requireAuth, (req, res) => {
  const { goLiveId, userName, department, module, status, notes } = req.body;
  if (!userName || !status) return res.status(400).json({ error: 'userName and status required' });
  const consultantName = req.user?.name || '';
  res.json(upsertAdoption({ goLiveId, userName, department, module, status, notes, consultantName }));
});

app.delete('/api/adoption/:id', requireAuth, (req, res) => {
  deleteAdoptionRecord(req.params.id);
  res.json({ ok: true });
});

// ─── Tip Sheet Generator ─────────────────────────────────────────────────────
app.post('/api/tipsheet', requireAuth, async (req, res) => {
  const { moduleTag, dept, goLive, goLiveId } = req.body;
  if (!moduleTag) return res.status(400).json({ error: 'moduleTag required' });

  // Pull Go-Live-specific workflow docs from RAG
  const ragQuery = `${moduleTag} workflow steps tips pitfalls escalation${dept ? ' ' + dept : ''}`;
  const ragContext = goLiveId ? await queryDocuments(ragQuery, goLiveId, 6, moduleTag) : '';

  const contextSection = ragContext
    ? `\n\nGO-LIVE SPECIFIC CONTEXT (from uploaded workflow docs — prioritize this):\n${ragContext}\n`
    : '';

  const prompt = `You are FELLITO — a 13-year Epic Credentialed Trainer. Generate a concise Go-Live Tip Sheet for Epic ${moduleTag}${dept ? ' in the ' + dept + ' department' : ''}${goLive ? ' for the ' + goLive + ' go-live' : ''}.${contextSection}

Format the tip sheet EXACTLY like this (use these exact section headers):

🔑 TOP 5 THINGS TO KNOW
1. [tip]
2. [tip]
3. [tip]
4. [tip]
5. [tip]

⚡ QUICK WINS (things users love once they discover them)
• [tip]
• [tip]
• [tip]

🚨 COMMON PITFALLS (what trips people up on Day 1)
• [pitfall and fix]
• [pitfall and fix]
• [pitfall and fix]

🔁 KEY WORKFLOW STEPS
[Most critical workflow for this module, numbered steps, max 6 steps]

📞 WHEN TO ESCALATE
• [scenario]
• [scenario]

Rules:
- ${ragContext ? 'GROUND your tips in the provided Go-Live workflow docs above — real site-specific steps, not generic Epic advice' : 'Be specific to ' + moduleTag + (dept ? ' / ' + dept : '') + ' — no generic Epic advice'}
- Floor-level language, not textbook
- Each bullet max 15 words
- No intro, no outro, no preamble — start with 🔑 immediately`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({ content: msg.content[0].text, ragUsed: !!ragContext });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Pre-Go-Live Quiz ────────────────────────────────────────────────────────
app.post('/api/quiz', requireAuth, async (req, res) => {
  const { moduleTag, dept, goLiveId } = req.body;
  if (!moduleTag) return res.status(400).json({ error: 'moduleTag required' });

  // Pull Go-Live-specific workflow docs from RAG
  const ragQuery = `${moduleTag} workflow steps procedures common mistakes${dept ? ' ' + dept : ''}`;
  const ragContext = goLiveId ? await queryDocuments(ragQuery, goLiveId, 6, moduleTag) : '';

  const contextSection = ragContext
    ? `\n\nGO-LIVE SPECIFIC WORKFLOW DOCS (base your questions on these — this is the real site):\n${ragContext}\n`
    : '';

  const prompt = `You are FELLITO, a 13-year Epic consultant. Generate exactly 5 multiple-choice quiz questions to test a consultant before they go live on Epic ${moduleTag} in the ${dept || 'hospital'} department.${contextSection}

Rules:
- ${ragContext ? 'Questions MUST be grounded in the provided workflow docs above — test knowledge of the actual site-specific steps and gotchas' : 'Questions must be practical, floor-level — things that actually trip up consultants on Day 1'}
- Each question has exactly 4 options (A, B, C, D)
- One correct answer per question
- Include a short explanation (1-2 sentences) for the correct answer

Return ONLY valid JSON in this exact format, no extra text:
{
  "questions": [
    {
      "q": "Question text here?",
      "options": ["A. option one", "B. option two", "C. option three", "D. option four"],
      "answer": "A",
      "explanation": "Short explanation why A is correct."
    }
  ]
}`;

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = msg.content[0].text.trim();
    const json = JSON.parse(raw.replace(/^```json\s*/,'').replace(/```$/,'').trim());
    res.json(json);
  } catch (err) {
    console.error('[Quiz]', err.message);
    res.status(500).json({ error: 'Could not generate quiz — try again.' });
  }
});

// ─── Offline Cache Seed ──────────────────────────────────────────────────────
app.post('/api/offline/seed', requireAuth, async (req, res) => {
  const { moduleTag, dept, goLiveId } = req.body;
  if (!moduleTag) return res.status(400).json({ error: 'moduleTag required' });

  const ragContext = goLiveId ? await queryDocuments(
    `${moduleTag} common questions workflows procedures`, goLiveId, 8, moduleTag
  ) : '';

  const contextBlock = ragContext
    ? `\nGO-LIVE WORKFLOW CONTEXT (use this to make questions site-specific):\n${ragContext}\n`
    : '';

  const prompt = `You are FELLITO. Generate exactly 20 Q&A pairs for Epic ${moduleTag} Day 1 go-live${dept ? ' (' + dept + ')' : ''}.${contextBlock}

Rules:
- Cover login, navigation, orders, common errors, downtime
- Answers: 1 sentence only, plain English, no jargon
- ${ragContext ? 'Use site-specific context above' : 'Be specific to ' + moduleTag}

Return ONLY this JSON, no extra text, no markdown:
{"module":"${moduleTag}","pairs":[{"q":"...","a":"..."}]}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = msg.content[0].text.trim().replace(/^```json\s*/,'').replace(/```$/,'').trim();
    const json = JSON.parse(raw);
    res.json(json);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Shift Log ───────────────────────────────────────────────────────────────
app.post('/api/shift/end', requireAuth, async (req, res) => {
  try {
    const { goLive, goLiveId, dept, module: mod, questionsAnswered, issuesEscalated, issues, summary, pmEmail, pmName } = req.body;
    const consultant = req.user.name || req.user.email || 'Consultant';
    const date = new Date().toLocaleDateString('en-US', { weekday:'short', year:'numeric', month:'short', day:'numeric' });

    if (!pmEmail) return res.status(400).json({ error: 'PM email required' });

    // Persist shift record
    logShift({
      userId: req.user.id,
      consultantName: consultant,
      consultantEmail: req.user.email,
      goLive: goLive || 'Unknown Go-Live',
      goLiveId: goLiveId || null,
      dept, module: mod, questionsAnswered, issuesEscalated, issues, summary, pmEmail, pmName,
    });

    await sendShiftEmail({
      toEmail: pmEmail, pmName, consultant, goLive: goLive || 'Unknown Go-Live',
      dept: dept || '—', module: mod || '—', date,
      questionsAnswered: questionsAnswered || 0,
      issuesEscalated: issuesEscalated || 0,
      issues: issues || [], summary: summary || '',
    });

    res.json({ ok: true, message: `Shift log sent to ${pmEmail}` });
  } catch (err) {
    console.error('[ShiftLog]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Temp Invite Links ────────────────────────────────────────────────────────

app.post('/api/temp-links', requireOwner, async (req, res) => {
  try {
    const { label, goLiveId, assignedModules, toEmail, permanent } = req.body;
    const link = createTempLink({ label, goLiveId, assignedModules, permanent });
    const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.BACKEND_PORT || 3001}`;
    const inviteUrl = `${baseUrl}/temp/${link.token}`;

    // Respond immediately — email sends in background so button never hangs
    res.json({ ...link, inviteUrl, emailSent: !!toEmail, emailError: null });

    if (toEmail) {
      sendInviteEmail({ toEmail, toName: label, inviteUrl, label })
        .catch(err => console.error('[Email] Failed to send invite:', err.message));
    }
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/temp-links', requireOwner, (_req, res) => res.json(listTempLinks()));

app.delete('/api/temp-links/:id', requireOwner, (req, res) => {
  try { res.json(revokeTempLink(req.params.id)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Browser opens this — device-locks session, serves full phone-style chat UI
app.get('/temp/:token', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket.remoteAddress ?? 'unknown';
  const cookieToken = req.cookies?.['_ft'] ?? null;
  try {
    const { link, isNew } = openLink(req.params.token, ip, cookieToken);
    const msLeft = link.sessionExpiresAt - Date.now();
    const MAX_JWT_MS = 30 * 24 * 60 * 60 * 1000; // JWT exp can't exceed int32 — cap at 30 days
    const jwtExpSecs = Math.floor(Math.min(msLeft, MAX_JWT_MS) / 1000);
    const jwtToken = signToken(
      { sub: `temp_${link.id}`, name: link.label || 'Guest', temp: true, linkId: link.id,
        browserToken: link.browserToken, assignedGoLives: link.goLiveId ? [link.goLiveId] : [] },
      jwtExpSecs + 's'
    );
    if (isNew) {
      res.cookie('_ft', link.browserToken, { httpOnly: true, maxAge: SESSION_TTL_MS, sameSite: 'strict' });
    }
    res.send(buildChatPage(link, jwtToken, msLeft));
  } catch (err) {
    res.send(buildErrorPage(err.message));
  }
});

// Auth middleware validates temp sessions (checks browserToken too)
// Already handled in authMiddleware.js via validateTempSession

// ─── Temp Admin Links ─────────────────────────────────────────────────────────

const adminLinkStore = new Map(); // token → { id, label, token, createdAt, expiresAt, openedAt, boundIp, browserToken }

function createAdminLink(label) {
  const crypto = require('crypto');
  const token = crypto.randomBytes(24).toString('hex');
  const id    = crypto.randomUUID();
  const link  = { id, label: label || 'Admin', token, createdAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000, openedAt: null, sessionExpiresAt: null, boundIp: null, browserToken: null };
  adminLinkStore.set(token, link);
  return link;
}

function openAdminLink(token, ip, cookieToken) {
  const link = [...adminLinkStore.values()].find(l => l.token === token);
  if (!link) throw new Error('This admin link is invalid or has expired.');
  if (Date.now() > link.expiresAt) throw new Error('This admin link has expired.');
  if (!link.openedAt) {
    link.openedAt = Date.now();
    link.sessionExpiresAt = Date.now() + 10 * 60 * 1000;
    link.boundIp = ip;
    const crypto = require('crypto');
    link.browserToken = crypto.randomBytes(16).toString('hex');
  } else {
    if (link.boundIp && link.boundIp !== ip) throw new Error('This link is locked to another device.');
    if (link.browserToken && link.browserToken !== cookieToken) throw new Error('This session is locked to the browser that originally opened it.');
    if (Date.now() > link.sessionExpiresAt) throw new Error('Your admin session has expired. Request a new link.');
  }
  return link;
}

app.post('/api/admin-links', requireOwner, (req, res) => {
  const { label, toEmail } = req.body;
  const link = createAdminLink(label);
  const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.BACKEND_PORT || 3001}`;
  const inviteUrl = `${baseUrl}/admin-temp/${link.token}`;
  res.json({ ...link, inviteUrl, emailSent: !!toEmail, emailError: null });
  if (toEmail) {
    sendInviteEmail({ toEmail, toName: label, inviteUrl, label })
      .catch(err => console.error('[Email] Failed to send admin invite:', err.message));
  }
});

app.get('/api/admin-links', requireOwner, (_req, res) => {
  const links = [...adminLinkStore.values()].map(l => {
    const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.BACKEND_PORT || 3001}`;
    return { ...l, inviteUrl: `${baseUrl}/admin-temp/${l.token}`, status: !l.openedAt && Date.now() < l.expiresAt ? 'pending' : l.sessionExpiresAt && Date.now() < l.sessionExpiresAt ? 'active' : 'expired' };
  });
  res.json(links.reverse());
});

app.delete('/api/admin-links/:id', requireOwner, (req, res) => {
  const entry = [...adminLinkStore.entries()].find(([, l]) => l.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Link not found' });
  adminLinkStore.delete(entry[0]);
  res.json({ ok: true });
});

app.get('/admin-temp/:token', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket.remoteAddress ?? 'unknown';
  const cookieToken = req.cookies?.['_fat'] ?? null;
  try {
    const link = openAdminLink(req.params.token, ip, cookieToken);
    const msLeft = link.sessionExpiresAt - Date.now();
    const jwtToken = signToken({ sub: `admin_temp_${link.id}`, name: link.label, role: 'owner', temp: true }, Math.floor(msLeft / 1000) + 's');
    res.cookie('_fat', link.browserToken, { httpOnly: true, maxAge: 10 * 60 * 1000, sameSite: 'strict' });
    res.cookie('_fellito_admin_token', jwtToken, { maxAge: 10 * 60 * 1000, sameSite: 'strict' });
    res.redirect('/admin/');
  } catch (err) {
    res.send(buildErrorPage(err.message));
  }
});

function buildChatPage(link, jwtToken, msLeft) {
  const name = link.label || 'Guest Consultant';

  const ALL_MODULES = ['ClinDoc','CPOE','ASAP (ED)','Beacon (Oncology)','Beaker (Lab)','ADT','OpTime (Surgical)','Prelude (Registration)','Cadence (Scheduling)','Radiant (Radiology)','MyChart','Willow (Pharmacy)','Stork (OB)','Resolute (Rev Cycle)','In Basket','Haiku/Canto (Mobile)','Reporting/Analytics','HIM','Healthy Planet'];
  const ALL_DEPTS   = ['ICU','Emergency Department','Med/Surg','Oncology','OR/Surgical','Radiology','Pharmacy','Registration','Labor & Delivery','Pediatrics','PACU','Outpatient Clinic','Blood Bank','Pathology'];

  // Render all selections server-side — zero JS dependency, never fails
  const { listGoLives } = require('./goLiveStore');
  const allGoLives    = listGoLives({ role: 'owner' });
  const activeGoLives = allGoLives.filter(g => g.active).length ? allGoLives.filter(g => g.active) : allGoLives;

  // Build Go-Live HTML server-side
  const goLiveOptionsHtml = activeGoLives.map(gl =>
    `<option value="${gl.id}">${gl.name.replace(/"/g,'&quot;')}</option>`
  ).join('');

  // Build module chips HTML server-side
  const moduleChipsHtml = ALL_MODULES.map(m =>
    `<div class="chip" onclick="selectModule(this,'${m.replace(/'/g,"\\'")}')">${m}</div>`
  ).join('');

  // Build dept chips HTML server-side
  const deptChipsHtml = ALL_DEPTS.map(d =>
    `<div class="chip" onclick="selectDept(this,'${d.replace(/'/g,"\\'")}')">${d}</div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>FELLITO</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/png" href="/public/favicon.png">
<meta name="theme-color" content="#00E5FF">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="FELLITO">
<link rel="apple-touch-icon" href="/public/icon-192.png">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{height:100%;height:100dvh;background:#050508;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;}

.shell{display:flex;align-items:center;justify-content:center;min-height:100dvh;background:#050508;padding:20px;}
.phone{width:100%;max-width:390px;height:min(844px,calc(100dvh - 40px));background:#0A0A0F;border-radius:44px;overflow:hidden;display:flex;flex-direction:column;border:1px solid #1E1E2E;box-shadow:0 40px 120px rgba(0,229,255,0.08);position:relative;}

/* status bar */
.status-bar{background:#0A0A0F;padding:12px 24px 6px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.status-time{font-size:15px;font-weight:700;color:#fff;}
.status-right{display:flex;gap:6px;align-items:center;}

/* header */
.header{background:#12121A;padding:10px 16px 12px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #1E1E2E;flex-shrink:0;}
.avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#00E5FF,#0070FF);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#000;flex-shrink:0;overflow:hidden;}
.avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%;}
.header-info{flex:1;min-width:0;}
.header-name{font-size:15px;font-weight:800;color:#00E5FF;letter-spacing:1px;}
.header-sub{font-size:10px;color:#8A8AA0;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

/* ── SCREENS ── */
.screen{display:none;flex:1;flex-direction:column;min-height:0;}
.screen.active{display:flex;}

/* welcome screen */
.welcome-body{flex:1;overflow-y:auto;min-height:0;padding:24px 20px;display:flex;flex-direction:column;gap:16px;}
.welcome-body::-webkit-scrollbar{width:0;}
.golive-card{background:#12121A;border:1px solid #00E5FF;border-radius:16px;padding:18px;}
.golive-tag{font-size:10px;color:#00E5FF;font-weight:700;letter-spacing:2px;margin-bottom:6px;}
.golive-name{font-size:17px;font-weight:800;color:#fff;margin-bottom:4px;}
.golive-dates{font-size:12px;color:#8A8AA0;}
.section-title{font-size:11px;color:#8A8AA0;font-weight:700;letter-spacing:2px;margin-bottom:10px;}
.chip-grid{display:flex;flex-wrap:wrap;gap:8px;}
.chip{background:#12121A;border:1px solid #1E1E2E;border-radius:20px;padding:8px 14px;font-size:13px;color:#fff;cursor:pointer;transition:all .15s;}
.chip:active,.chip.selected{background:#00E5FF;color:#000;border-color:#00E5FF;font-weight:700;}
.welcome-footer{background:#12121A;border-top:1px solid #1E1E2E;padding:14px 20px 16px;flex-shrink:0;z-index:10;}
.start-btn{width:100%;background:#00E5FF;color:#000;font-size:14px;font-weight:800;border:none;border-radius:14px;padding:14px;cursor:pointer;letter-spacing:.5px;transition:opacity .15s;}
.start-btn:disabled{opacity:.4;cursor:not-allowed;}

/* chat screen */
.messages{flex:1;overflow-y:auto;min-height:0;padding:16px 12px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;}
.messages::-webkit-scrollbar{width:0;}
/* Quick-action rows: always single line, swipe sideways, never wrap or clip */
.quick-row{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;overflow-y:visible;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:6px 12px 0;}
.quick-row::-webkit-scrollbar{display:none;}
.quick-row button{flex-shrink:0;white-space:nowrap;}
.bubble{max-width:82%;padding:10px 14px;border-radius:18px;font-size:14px;line-height:1.5;word-break:break-word;}
.bubble.user{background:#00E5FF;color:#000;font-weight:600;border-bottom-right-radius:4px;align-self:flex-end;}
.bubble.assistant{background:#1E1E2E;color:#fff;border-bottom-left-radius:4px;align-self:flex-start;border:1px solid #2A2A3E;}
.bubble.assistant .sender{font-size:10px;font-weight:800;color:#00E5FF;letter-spacing:1px;margin-bottom:4px;}
.bubble.typing{background:#1E1E2E;border:1px solid #2A2A3E;align-self:flex-start;}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#8A8AA0;animation:blink 1.2s infinite;}
.dot:nth-child(2){animation-delay:.2s;}.dot:nth-child(3){animation-delay:.4s;}
@keyframes blink{0%,80%,100%{opacity:.3;}40%{opacity:1;}}
.context-bar{background:#12121A;border-bottom:1px solid #1E1E2E;padding:6px 16px;display:flex;gap:8px;flex-shrink:0;}
.ctx-chip{background:#0A0A0F;border:1px solid #1E1E2E;border-radius:12px;padding:4px 10px;font-size:11px;color:#8A8AA0;}
.ctx-chip span{color:#00E5FF;font-weight:700;}
.chat-footer{display:flex;flex-direction:column;flex-shrink:0;background:#12121A;}
.input-bar{background:#12121A;border-top:1px solid #1E1E2E;padding:10px 12px;display:flex;align-items:center;gap:8px;flex-shrink:0;z-index:10;}
.input-wrap{flex:1;background:#0A0A0F;border:1px solid #1E1E2E;border-radius:22px;padding:10px 16px;}
textarea{width:100%;background:transparent;border:none;outline:none;color:#fff;font-size:14px;resize:none;max-height:100px;font-family:inherit;line-height:1.4;}
textarea::placeholder{color:#8A8AA0;}
.send-btn{width:40px;height:40px;border-radius:50%;background:#00E5FF;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.send-btn svg{fill:#000;}
.send-btn:disabled{background:#1E1E2E;cursor:not-allowed;}
.send-btn:disabled svg{fill:#8A8AA0;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.3;}}

/* expired overlay */
.expired-overlay{display:none;position:absolute;inset:0;background:rgba(10,10,15,.97);border-radius:44px;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:32px;text-align:center;z-index:100;}
.expired-overlay.show{display:flex;}

@media(max-width:480px){
  .shell{padding:0;}
  /* No overflow:hidden on mobile — Samsung Chrome kills touch events in the clipped zone */
  .phone{max-width:100%;border-radius:0;border:none;box-shadow:none;}
  .expired-overlay{border-radius:0;}
  .status-bar{display:none;}
  .welcome-footer{position:static;padding:14px 20px env(safe-area-inset-bottom,16px);flex-shrink:0;}
  .welcome-body{flex:1;overflow-y:auto;min-height:0;-webkit-overflow-scrolling:touch;}
  .chat-footer{position:static;flex-shrink:0;padding-bottom:env(safe-area-inset-bottom,0px);}
  .messages{flex:1;overflow-y:auto;min-height:0;-webkit-overflow-scrolling:touch;padding-bottom:8px;}
}
</style>
</head>
<body>
<div class="shell"><div class="phone" id="phone">

  <!-- Shift Log Modal -->
  <div id="shiftModal" style="display:none;position:absolute;inset:0;background:#000000CC;z-index:200;overflow-y:auto;padding:24px 16px;">
    <div style="background:#12121A;border:1px solid #1E1E2E;border-radius:20px;padding:24px;max-width:400px;margin:0 auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <button onclick="document.getElementById('shiftModal').style.display='none'" style="background:none;border:1px solid #2A2A3E;border-radius:20px;color:#8A8AA0;font-size:12px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;display:flex;align-items:center;gap:5px;">← Back</button>
        <div style="font-size:15px;font-weight:900;color:#00FF88;letter-spacing:1px;">📋 END SHIFT</div>
        <div style="width:60px;"></div>
      </div>

      <!-- Stats preview -->
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <div style="flex:1;background:#0A0A0F;border:1px solid #1E1E2E;border-radius:12px;padding:12px;text-align:center;">
          <div id="shiftQCount" style="font-size:22px;font-weight:900;color:#00E5FF;">0</div>
          <div style="font-size:10px;color:#8A8AA0;letter-spacing:1px;margin-top:2px;">QUESTIONS</div>
        </div>
        <div style="flex:1;background:#0A0A0F;border:1px solid #1E1E2E;border-radius:12px;padding:12px;text-align:center;">
          <div id="shiftICount" style="font-size:22px;font-weight:900;color:#FF3B5C;">0</div>
          <div style="font-size:10px;color:#8A8AA0;letter-spacing:1px;margin-top:2px;">ESCALATED</div>
        </div>
      </div>

      <!-- Notes -->
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;color:#8A8AA0;letter-spacing:1px;margin-bottom:6px;">SHIFT NOTES (optional)</div>
        <textarea id="shiftNotes" placeholder="Anything the PM should know..." rows="3" style="width:100%;box-sizing:border-box;background:#0A0A0F;border:1px solid #2A2A3E;border-radius:10px;color:#fff;font-size:13px;padding:10px;resize:none;font-family:inherit;"></textarea>
      </div>

      <!-- PM Email -->
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;color:#8A8AA0;letter-spacing:1px;margin-bottom:6px;">PM EMAIL</div>
        <input id="shiftPmEmail" type="email" placeholder="pm@hospital.org" style="width:100%;box-sizing:border-box;background:#0A0A0F;border:1px solid #2A2A3E;border-radius:10px;color:#fff;font-size:13px;padding:10px;font-family:inherit;">
      </div>

      <button onclick="submitShiftLog()" style="width:100%;background:linear-gradient(135deg,#00FF88,#00E5FF);border:none;border-radius:14px;color:#000;font-size:14px;font-weight:900;padding:14px;cursor:pointer;letter-spacing:1px;">
        SEND SHIFT LOG
      </button>
      <div id="shiftStatus" style="text-align:center;font-size:12px;color:#8A8AA0;margin-top:10px;"></div>
    </div>
  </div>

  <!-- Status bar -->
  <div class="status-bar">
    <span class="status-time" id="clock"></span>
    <div class="status-right">
      <div style="width:6px;height:6px;border-radius:50%;background:#00E096;"></div>
      <svg width="16" height="12" viewBox="0 0 16 12" fill="#fff" opacity=".6"><rect x="0" y="4" width="3" height="8" rx="1"/><rect x="4.5" y="2.5" width="3" height="9.5" rx="1"/><rect x="9" y="0.5" width="3" height="11.5" rx="1"/><rect x="13.5" y="0" width="2.5" height="12" rx="1" opacity=".3"/></svg>
      <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x=".5" y=".5" width="22" height="11" rx="3.5" stroke="#fff" stroke-opacity=".4"/><rect x="1.5" y="1.5" width="18" height="9" rx="2.5" fill="#00E096"/><path d="M23.5 4v4a2 2 0 000-4z" fill="#fff" opacity=".4"/></svg>
    </div>
  </div>

  <!-- Header -->
  <div class="header">
    <div class="avatar"><img src="/public/fellito-avatar.png" alt="FELLITO" onerror="this.style.display='none';this.parentNode.textContent='F';"></div>
    <div class="header-info">
      <div class="header-name">FELLITO</div>
      <div class="header-sub" id="headerSub">${name} · Epic ATE Support</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button onclick="toggleSettings()" title="Settings" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:50%;width:30px;height:30px;color:#8A8AA0;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">⚙️</button>
      <button onclick="openNearby()" title="What's nearby?" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:20px;color:#00E5FF;font-size:11px;font-weight:700;padding:5px 10px;cursor:pointer;letter-spacing:.5px;display:flex;align-items:center;gap:5px;">
        📍 Nearby
      </button>
    </div>
  </div>

  <!-- ── Nearby Panel ── -->
  <div id="nearbyPanel" style="display:none;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);">
    <div style="position:absolute;bottom:0;left:0;right:0;background:#12121A;border-radius:24px 24px 0 0;border-top:1px solid #1E1E2E;max-height:80vh;display:flex;flex-direction:column;">
      <!-- Panel header -->
      <div style="padding:16px 20px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1E1E2E;flex-shrink:0;">
        <div>
          <div style="font-size:16px;font-weight:800;color:#fff;letter-spacing:1px;">📍 What's Nearby</div>
          <div style="font-size:11px;color:#8A8AA0;margin-top:2px;" id="nearbyLocation">Detecting your location...</div>
        </div>
        <button onclick="closeNearby()" style="background:#1E1E2E;border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;">✕</button>
      </div>
      <!-- Category tabs -->
      <div style="display:flex;gap:8px;padding:12px 16px;flex-shrink:0;overflow-x:auto;">
        ${['🍔 Food','☕ Coffee','🏨 Hotels','🅿️ Parking','💊 Pharmacy','🏋️ Gym'].map((cat,i) =>
          '<button onclick="fetchNearby(\'' + cat + '\')" id="ncat' + i + '" style="background:#0A0A0F;border:1px solid #2A2A3E;border-radius:20px;color:#8A8AA0;font-size:12px;font-weight:600;padding:6px 14px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .2s;">' + cat + '</button>'
        ).join('')}
      </div>
      <!-- Results -->
      <div id="nearbyResults" style="flex:1;overflow-y:auto;padding:8px 16px 24px;">
        <div style="text-align:center;color:#8A8AA0;font-size:13px;padding:32px 0;">Pick a category above</div>
      </div>
    </div>
  </div>

  <!-- ── SCREEN 1: Welcome / Go-Live Orientation ── -->
  <div class="screen active" id="screen-welcome">
    <div class="welcome-body">
      <!-- PHI Warning — compact banner -->
      <div style="background:rgba(255,59,92,.08);border:1px solid #FF3B5C;border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:14px;">⛔</span>
        <span style="font-size:11px;font-weight:800;color:#FF3B5C;letter-spacing:.5px;">NO PHI — patient names, MRNs, DOBs, or clinical records. Workflow questions only.</span>
      </div>

      <div>
        <div class="section-title">SELECT YOUR GO-LIVE</div>
        <div id="goLiveChips">${activeGoLives.length ? `<select id="goLiveSelect" onchange="selectGoLive(this)" style="width:100%;background:#0A0A0F;border:1px solid #2A2A3E;border-radius:12px;color:#fff;font-size:14px;padding:12px 16px;outline:none;font-family:inherit;cursor:pointer;"><option value="" disabled selected>Select your Go-Live...</option>${goLiveOptionsHtml}</select>` : `<input id="goLiveInput" placeholder="Type your Go-Live name..." oninput="selectedGoLive=this.value.trim();selectedGoLiveId='';checkReady();" style="width:100%;background:#0A0A0F;border:1px solid #2A2A3E;border-radius:12px;color:#fff;font-size:14px;padding:12px 16px;outline:none;font-family:inherit;box-sizing:border-box;">`}</div>
      </div>

      <div>
        <div class="section-title">SELECT YOUR MODULE</div>
        <div class="chip-grid" id="moduleChips">${moduleChipsHtml}</div>
      </div>

      <div>
        <div class="section-title">SELECT YOUR DEPARTMENT</div>
        <div class="chip-grid" id="deptChips">${deptChipsHtml}</div>
      </div>

    </div>
    <div class="welcome-footer">
      <div style="display:flex;gap:8px;">
        <button class="start-btn" id="startBtn" disabled onclick="startChat()" style="flex:1;">Select Go-Live + Module + Dept</button>
        <button id="quizBtn" disabled onclick="openQuiz()" title="Test your module knowledge before going live" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:14px;color:#8A8AA0;font-size:12px;font-weight:900;padding:0 16px;cursor:not-allowed;letter-spacing:.5px;flex-shrink:0;transition:all .2s;">🎯 QUIZ ME</button>
      </div>
    </div>
  </div>

  <!-- Issue Board Modal -->
  <div id="boardModal" style="display:none;position:absolute;inset:0;background:#000000CC;z-index:200;overflow-y:auto;padding:20px 14px;">
    <div style="background:#12121A;border:1px solid #1E1E2E;border-radius:20px;padding:22px;max-width:420px;margin:0 auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <button onclick="document.getElementById('boardModal').style.display='none'" style="background:none;border:1px solid #2A2A3E;border-radius:20px;color:#8A8AA0;font-size:12px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;display:flex;align-items:center;gap:5px;">← Back</button>
        <div style="font-size:15px;font-weight:900;color:#A78BFA;letter-spacing:1px;">📊 ISSUE BOARD</div>
        <div style="width:60px;"></div>
      </div>
      <div id="boardGoLive" style="font-size:11px;color:#8A8AA0;letter-spacing:1px;margin-bottom:18px;"></div>

      <!-- Column: Open -->
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:8px;height:8px;background:#FF3B5C;border-radius:50%;flex-shrink:0;"></div>
          <div style="font-size:11px;color:#FF3B5C;font-weight:900;letter-spacing:1px;">OPEN</div>
          <div id="boardCountOpen" style="font-size:11px;color:#8A8AA0;"></div>
        </div>
        <div id="boardColOpen" style="display:flex;flex-direction:column;gap:6px;min-height:32px;"></div>
      </div>

      <!-- Column: In Progress -->
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:8px;height:8px;background:#FFB800;border-radius:50%;flex-shrink:0;"></div>
          <div style="font-size:11px;color:#FFB800;font-weight:900;letter-spacing:1px;">IN PROGRESS</div>
          <div id="boardCountProgress" style="font-size:11px;color:#8A8AA0;"></div>
        </div>
        <div id="boardColProgress" style="display:flex;flex-direction:column;gap:6px;min-height:32px;"></div>
      </div>

      <!-- Column: Resolved -->
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:8px;height:8px;background:#00FF88;border-radius:50%;flex-shrink:0;"></div>
          <div style="font-size:11px;color:#00FF88;font-weight:900;letter-spacing:1px;">RESOLVED</div>
          <div id="boardCountResolved" style="font-size:11px;color:#8A8AA0;"></div>
        </div>
        <div id="boardColResolved" style="display:flex;flex-direction:column;gap:6px;min-height:32px;"></div>
      </div>

      <div id="boardEmpty" style="display:none;text-align:center;padding:20px 0;color:#8A8AA0;font-size:13px;">No issues logged yet — use 🚨 Escalate to add one.</div>
    </div>
  </div>

  <!-- Quiz Modal -->
  <div id="quizModal" style="display:none;position:absolute;inset:0;background:#000000DD;z-index:200;overflow-y:auto;padding:20px 14px;">
    <div style="background:#12121A;border:1px solid #1E1E2E;border-radius:20px;padding:22px;max-width:400px;margin:0 auto;">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <button onclick="closeQuiz()" style="background:none;border:1px solid #2A2A3E;border-radius:20px;color:#8A8AA0;font-size:12px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;display:flex;align-items:center;gap:5px;">← Back</button>
        <div style="font-size:14px;font-weight:900;color:#00E5FF;letter-spacing:1px;">🎯 QUIZ ME</div>
        <div style="width:60px;"></div>
      </div>
      <div id="quizSubtitle" style="font-size:11px;color:#8A8AA0;letter-spacing:1px;margin-bottom:18px;"></div>

      <!-- Loading state -->
      <div id="quizLoading" style="text-align:center;padding:30px 0;">
        <div style="font-size:28px;margin-bottom:10px;">⏳</div>
        <div style="color:#8A8AA0;font-size:13px;">FELLITO is loading your quiz...</div>
      </div>

      <!-- Question area -->
      <div id="quizQuestion" style="display:none;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div id="quizProgress" style="font-size:11px;color:#8A8AA0;letter-spacing:1px;"></div>
          <div id="quizScore" style="font-size:11px;color:#00E5FF;font-weight:700;letter-spacing:1px;"></div>
        </div>
        <div id="quizQText" style="font-size:14px;color:#fff;font-weight:600;line-height:1.5;margin-bottom:18px;"></div>
        <div id="quizOptions" style="display:flex;flex-direction:column;gap:8px;"></div>
        <div id="quizFeedback" style="margin-top:14px;font-size:13px;line-height:1.5;display:none;"></div>
        <button id="quizNextBtn" onclick="nextQuestion()" style="display:none;width:100%;margin-top:14px;background:linear-gradient(135deg,#00E5FF,#0070FF);border:none;border-radius:12px;color:#000;font-size:13px;font-weight:900;padding:12px;cursor:pointer;letter-spacing:.5px;">NEXT →</button>
      </div>

      <!-- Results -->
      <div id="quizResults" style="display:none;text-align:center;padding:10px 0;">
        <div id="quizResultEmoji" style="font-size:48px;margin-bottom:10px;"></div>
        <div id="quizResultScore" style="font-size:32px;font-weight:900;color:#00E5FF;margin-bottom:6px;"></div>
        <div id="quizResultMsg" style="font-size:13px;color:#8A8AA0;line-height:1.6;margin-bottom:20px;"></div>
        <button onclick="openQuiz()" style="width:100%;background:#1E1E2E;border:1px solid #2A2A3E;border-radius:12px;color:#00E5FF;font-size:13px;font-weight:900;padding:12px;cursor:pointer;letter-spacing:.5px;margin-bottom:8px;">RETRY</button>
        <button onclick="closeQuiz();startChat();" style="width:100%;background:linear-gradient(135deg,#00E5FF,#0070FF);border:none;border-radius:12px;color:#000;font-size:13px;font-weight:900;padding:12px;cursor:pointer;letter-spacing:.5px;">HIT THE FLOOR →</button>
      </div>

    </div>
  </div>

  <!-- Adoption Tracker Modal -->
  <div id="adoptionModal" style="display:none;position:absolute;inset:0;background:#000000CC;z-index:200;overflow-y:auto;padding:20px 14px;">
    <div style="background:#12121A;border:1px solid #1E1E2E;border-radius:20px;padding:22px;max-width:420px;margin:0 auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <button onclick="document.getElementById('adoptionModal').style.display='none'" style="background:none;border:1px solid #2A2A3E;border-radius:20px;color:#8A8AA0;font-size:12px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;display:flex;align-items:center;gap:5px;">← Back</button>
        <div style="font-size:15px;font-weight:900;color:#FFB800;letter-spacing:1px;">👥 ADOPTION</div>
        <div style="width:60px;"></div>
      </div>
      <div id="adoptionGoLive" style="font-size:11px;color:#8A8AA0;letter-spacing:1px;margin-bottom:16px;"></div>

      <!-- Add user form -->
      <div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:14px;padding:14px;margin-bottom:18px;">
        <div style="font-size:11px;color:#8A8AA0;font-weight:700;letter-spacing:1px;margin-bottom:10px;">LOG USER STATUS</div>
        <input id="adoptionName" placeholder="User name or role (e.g. Nurse Chen, ICU RN)" style="width:100%;background:#12121A;border:1px solid #2A2A3E;border-radius:10px;color:#fff;font-size:13px;padding:9px 12px;outline:none;font-family:inherit;box-sizing:border-box;margin-bottom:8px;">
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button id="adpConfident"  onclick="setAdoptionStatus('confident')"    style="flex:1;background:#0A0A0F;border:1px solid #2A2A3E;border-radius:10px;color:#8A8AA0;font-size:11px;font-weight:700;padding:7px 4px;cursor:pointer;letter-spacing:.5px;transition:all .15s;">✅ Confident</button>
          <button id="adpStruggling" onclick="setAdoptionStatus('struggling')"   style="flex:1;background:#0A0A0F;border:1px solid #2A2A3E;border-radius:10px;color:#8A8AA0;font-size:11px;font-weight:700;padding:7px 4px;cursor:pointer;letter-spacing:.5px;transition:all .15s;">⚠️ Struggling</button>
          <button id="adpFollowup"   onclick="setAdoptionStatus('needs-followup')" style="flex:1;background:#0A0A0F;border:1px solid #2A2A3E;border-radius:10px;color:#8A8AA0;font-size:11px;font-weight:700;padding:7px 4px;cursor:pointer;letter-spacing:.5px;transition:all .15s;">🔴 Follow-Up</button>
        </div>
        <input id="adoptionNotes" placeholder="Notes (optional)" style="width:100%;background:#12121A;border:1px solid #2A2A3E;border-radius:10px;color:#fff;font-size:12px;padding:8px 12px;outline:none;font-family:inherit;box-sizing:border-box;margin-bottom:8px;">
        <button onclick="submitAdoption()" style="width:100%;background:linear-gradient(135deg,#FFB800,#FF8800);border:none;border-radius:10px;color:#000;font-size:13px;font-weight:900;padding:10px;cursor:pointer;letter-spacing:.5px;">Save Status</button>
      </div>

      <!-- User list -->
      <div id="adoptionList" style="display:flex;flex-direction:column;gap:8px;"></div>
      <div id="adoptionEmpty" style="display:none;text-align:center;padding:20px 0;color:#8A8AA0;font-size:13px;">No users logged yet — add someone above.</div>
    </div>
  </div>

  <!-- Tip Sheet Modal -->
  <div id="tipModal" style="display:none;position:absolute;inset:0;background:#000000CC;z-index:200;overflow-y:auto;padding:20px 14px;">
    <div style="background:#12121A;border:1px solid #1E1E2E;border-radius:20px;padding:22px;max-width:420px;margin:0 auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <button onclick="document.getElementById('tipModal').style.display='none'" style="background:none;border:1px solid #2A2A3E;border-radius:20px;color:#8A8AA0;font-size:12px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;display:flex;align-items:center;gap:5px;">← Back</button>
        <div style="font-size:15px;font-weight:900;color:#00E5FF;letter-spacing:1px;">📄 TIP SHEET</div>
        <div style="width:60px;"></div>
      </div>
      <div id="tipContext" style="font-size:11px;color:#8A8AA0;letter-spacing:1px;margin-bottom:14px;"></div>

      <!-- Generate button -->
      <button id="tipGenBtn" onclick="generateTipSheet()" style="width:100%;background:linear-gradient(135deg,#00E5FF,#0070FF);border:none;border-radius:12px;color:#000;font-size:13px;font-weight:900;padding:12px;cursor:pointer;letter-spacing:.5px;margin-bottom:16px;">⚡ GENERATE TIP SHEET</button>

      <!-- Loading -->
      <div id="tipLoading" style="display:none;text-align:center;padding:24px 0;color:#8A8AA0;font-size:13px;">Generating your tip sheet...</div>

      <!-- Output -->
      <div id="tipOutput" style="display:none;">
        <div id="tipContent" style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:14px;padding:14px;font-size:12px;color:#C8C8D8;line-height:1.7;white-space:pre-wrap;font-family:inherit;margin-bottom:12px;max-height:55vh;overflow-y:auto;"></div>
        <div style="display:flex;gap:8px;">
          <button onclick="copyTipSheet()" style="flex:1;background:#1E1E2E;border:1px solid #2A2A3E;border-radius:12px;color:#00E5FF;font-size:12px;font-weight:700;padding:10px;cursor:pointer;letter-spacing:.5px;">📋 Copy</button>
          <button onclick="generateTipSheet()" style="flex:1;background:#1E1E2E;border:1px solid #2A2A3E;border-radius:12px;color:#8A8AA0;font-size:12px;font-weight:700;padding:10px;cursor:pointer;letter-spacing:.5px;">🔄 Regenerate</button>
        </div>
      </div>

      <!-- Error -->
      <div id="tipError" style="display:none;color:#FF3B5C;font-size:12px;text-align:center;padding:12px 0;"></div>
    </div>
  </div>

  <!-- ── SCREEN 2: Chat ── -->
  <div class="screen" id="screen-chat">
    <div class="context-bar">
      <div class="ctx-chip"><span id="ctxGoLive" style="color:#00E5FF;font-weight:700;">—</span></div>
      <div class="ctx-chip">Module: <span id="ctxModule">—</span></div>
      <div class="ctx-chip">Dept: <span id="ctxDept">—</span></div>
    </div>
    <div class="messages" id="messages"></div>
    <div class="chat-footer">
    <div class="quick-row">
      <button onclick="triggerDowntime()" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:16px;color:#FFB800;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;">⏳ Downtime</button>
      <button onclick="escalateIssue()" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:16px;color:#FF3B5C;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;">🚨 Escalate</button>
      <button onclick="openBoard()" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:16px;color:#A78BFA;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;">📊 Board</button>
      <button onclick="openAdoption()" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:16px;color:#FFB800;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;">👥 Tracker</button>
      <button onclick="openTipSheet()" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:16px;color:#00E5FF;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;">📄 Tips</button>
      <button onclick="openShiftModal()" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:16px;color:#00FF88;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;">🏁 End Shift</button>
    </div>
    <div class="input-bar">
      <input type="file" id="fileInput" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none" onchange="handleUpload(this)">
      <input type="file" id="cameraInput" accept="image/*" capture="environment" style="display:none" onchange="handleCamera(this)">
      <button onclick="document.getElementById('fileInput').click()" title="Upload screenshot or tip sheet" style="background:none;border:none;color:#8A8AA0;cursor:pointer;padding:0 6px;display:flex;align-items:center;flex-shrink:0;" id="uploadBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      </button>
      <button onclick="openCamera()" title="Take a photo — no patient info allowed" style="background:none;border:none;color:#8A8AA0;cursor:pointer;padding:0 6px;display:flex;align-items:center;flex-shrink:0;" id="cameraBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </button>
      <div class="input-wrap">
        <textarea id="input" placeholder="Ask FELLITO anything..." rows="1"></textarea>
      </div>
      <button class="send-btn" id="sendBtn" onclick="sendMessage()">
        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
      </button>
<button id="talkBtn" onclick="startTalkMode()" style="background:linear-gradient(135deg,#00E5FF,#0070FF);border:none;border-radius:24px;color:#000;cursor:pointer;padding:8px 16px;display:flex;align-items:center;gap:6px;flex-shrink:0;font-size:12px;font-weight:900;letter-spacing:.5px;transition:all .2s;">
        <svg id="talkIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
        <span id="talkBtnLabel">TALK</span>
      </button>
    </div>
    </div><!-- /chat-footer -->
  </div>

  <!-- Settings panel — voice clone recording -->
  <div id="settingsPanel" style="display:none;position:absolute;inset:0;background:rgba(5,5,8,.97);z-index:200;flex-direction:column;padding:24px 20px;gap:16px;overflow-y:auto;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="font-size:16px;font-weight:900;color:#00E5FF;letter-spacing:1px;">SETTINGS</div>
      <button onclick="toggleSettings()" style="background:none;border:none;color:#8A8AA0;font-size:22px;cursor:pointer;">✕</button>
    </div>
    <div id="voiceCloneSection" style="display:none;">
      <div style="font-size:11px;color:#8A8AA0;font-weight:700;letter-spacing:2px;margin-bottom:4px;">VOICE CLONE</div>
      <div style="font-size:13px;color:#ccc;line-height:1.6;margin-bottom:8px;">Record your voice and send it straight to ElevenLabs. The more samples you add, the more FELLITO sounds exactly like you.</div>
      <button id="recordVoiceBtn" onclick="toggleVoiceRecord()" style="background:#1E1E2E;border:1px solid #00E5FF;border-radius:20px;color:#00E5FF;font-size:13px;font-weight:700;padding:12px 20px;cursor:pointer;display:flex;align-items:center;gap:8px;width:100%;justify-content:center;">
        🎙️ <span id="recordVoiceLbl">Record Voice Sample</span>
      </button>
      <div id="recordVoiceStatus" style="font-size:12px;color:#8A8AA0;text-align:center;min-height:18px;"></div>
      <div style="font-size:11px;color:#555;text-align:center;">Talk naturally for 30–60 sec — tap Stop when done</div>
    </div>
  </div>

  <!-- Expired overlay -->
  <!-- PHI warning overlay -->
  <div class="expired-overlay" id="phiOverlay" style="z-index:101;">
    <div style="font-size:48px;">🚫</div>
    <div style="font-size:18px;font-weight:900;color:#FF3B5C;letter-spacing:1px;">PHI DETECTED</div>
    <div style="font-size:13px;color:#ccc;line-height:1.7;max-width:280px;" id="phiReason">This photo contains patient information and cannot be uploaded.</div>
    <div style="font-size:12px;color:#8A8AA0;line-height:1.6;max-width:280px;">FELLITO never stores or transmits patient data. Remove all patient identifiers and try again.</div>
    <button onclick="document.getElementById('phiOverlay').classList.remove('show')" style="background:#FF3B5C;color:#fff;border:none;border-radius:12px;padding:12px 28px;font-size:14px;font-weight:700;cursor:pointer;margin-top:8px;">Got It</button>
  </div>



</div></div>

<script>
const TOKEN = '${jwtToken}' === '__PERM__' ? (localStorage.getItem('_ft') || '') : '${jwtToken}';
if ('${jwtToken}' === '__PERM__' && !TOKEN) { window.location.href = '/app'; }
function _jwtRole(t) { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role; } catch { return ''; } }
const IS_OWNER = _jwtRole(TOKEN) === 'owner';
if (IS_OWNER) { const s = document.getElementById('voiceCloneSection'); if (s) s.style.display = 'block'; }
const GOLIVE_ID = '${link.goLiveId || ''}';
const USER_NAME = '${name}';
const ALL_MODULES  = ${JSON.stringify(ALL_MODULES)};
const ALL_DEPTS    = ${JSON.stringify(ALL_DEPTS)};

let selectedGoLive   = '';
let selectedGoLiveId = GOLIVE_ID || '';
let selectedModule = '';
let selectedDept   = '';
let chatHistory    = [];

// ── Clock ──────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
}
updateClock(); setInterval(updateClock, 10000);

// ── PWA service worker registration ────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── Session close — fires when user leaves, logs out, or closes tab ─────────
function closeSessionOnServer() {
  const tok = TOKEN || localStorage.getItem('_ft') || '';
  if (!tok) return;
  // Use sendBeacon so it fires even on page close
  const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
  navigator.sendBeacon
    ? navigator.sendBeacon('/api/session/close?_tok=' + encodeURIComponent(tok), blob)
    : fetch('/api/session/close', { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: '{}', keepalive: true }).catch(() => {});
}
window.addEventListener('pagehide', closeSessionOnServer);
window.addEventListener('beforeunload', closeSessionOnServer);



// ── Load Go-Live info + render all selection chips ─────────────────────────
// All selections are pre-rendered server-side — these are just event handlers
function loadGoLive() {
  // Auto-select go-live if pre-assigned
  if (GOLIVE_ID) {
    const sel = document.getElementById('goLiveSelect');
    if (sel) {
      sel.value = GOLIVE_ID;
      selectGoLive(sel);
    }
  }
}

function selectGoLive(sel) {
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.value) {
    selectedGoLive   = opt.textContent;
    selectedGoLiveId = opt.value;
    checkReady();
  }
}

function selectModule(el, name) {
  document.querySelectorAll('#moduleChips .chip').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
  selectedModule = name;
  checkReady();
}

function selectDept(el, name) {
  document.querySelectorAll('#deptChips .chip').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
  selectedDept = name;
  checkReady();
}

function checkReady() {
  const btn  = document.getElementById('startBtn');
  const quiz = document.getElementById('quizBtn');
  if (selectedGoLive && selectedModule && selectedDept) {
    btn.disabled  = false;
    btn.textContent = 'Start Session →';
    if (quiz) {
      quiz.disabled = false;
      quiz.style.cursor = 'pointer';
      quiz.style.color  = '#00E5FF';
      quiz.style.borderColor = '#00E5FF';
    }
  } else {
    btn.disabled  = true;
    btn.textContent = 'Select Go-Live + Module + Dept';
    if (quiz) {
      quiz.disabled = true;
      quiz.style.cursor = 'not-allowed';
      quiz.style.color  = '#8A8AA0';
      quiz.style.borderColor = '#2A2A3E';
    }
  }
  // no scrollIntoView — button is in a fixed footer, always visible on mobile
}

// Global error display — shows JS crashes visibly on mobile for debugging
window.onerror = function(msg, src, line) {
  var d = document.getElementById('_errToast');
  if (!d) { d = document.createElement('div'); d.id = '_errToast'; d.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#FF3B5C;color:#fff;font-size:12px;padding:8px 12px;z-index:9999;font-family:monospace;word-break:break-all;'; document.body.appendChild(d); }
  d.textContent = 'JS ERROR: ' + msg + ' (line ' + line + ')';
};

// Use visualViewport.height — the only value Samsung Chrome reports correctly
// (window.innerHeight includes the nav bar; visualViewport.height is the real tappable area)
(function fixMobileHeight() {
  var phone = document.querySelector('.phone');
  function apply() {
    if (!phone) return;
    if (window.innerWidth <= 480) {
      var h = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
      phone.style.height = h + 'px';
    } else {
      phone.style.height = '';
    }
  }
  apply();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', apply);
    window.visualViewport.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', apply);
}());

// ── Module intro briefs (instant, no API call) ─────────────────────────────
const MODULE_BRIEFS = {
  'CPOE':                    ['Order entry errors — wrong route, dose, or frequency', 'Cosign backlog — attendings with unsigned orders piling up', 'Order sets not loading or missing items for the unit'],
  'ClinDoc':                 ['Flowsheet entries not saving or not syncing to the chart', 'SmartText / SmartPhrase not populating correctly', 'Documentation landing on the wrong encounter'],
  'ASAP (ED)':               ['Triage stuck — missing required fields blocking progression', 'Bed request and placement workflow confusion', 'Tracking board not refreshing or showing stale status'],
  'Beacon (Oncology)':       ['Treatment plan not released or wrong phase is active', 'Chemo order verification failing at pharmacist step', 'Prior auth not attached — orders getting kicked back'],
  'Beaker (Lab)':            ['Specimen label printing to wrong printer or wrong label', 'Results not routing back to the ordering provider', 'Lab orders not interfacing to the instrument'],
  'ADT':                     ['Transfer not completing in Epic — bed still showing occupied', 'Discharge disposition mismatch with bed management', 'Patient class not updating correctly after admission'],
  'OpTime (Surgical)':       ['Case not posted or showing wrong room / wrong time', 'Anesthesia record not syncing with the OR case', 'Post-op orders not bridging to the inpatient encounter'],
  'Prelude (Registration)':  ['Patient not found in search — MPI / duplicate record issues', 'Consent form not completing — missing required fields', 'Insurance not verifying at check-in'],
  'Cadence (Scheduling)':    ['Scheduling conflict — slot blocked or not available', 'Referral not linking to the appointment', 'Provider schedule not visible in scheduling search'],
  'Radiant (Radiology)':     ['Order not appearing in the Radiant worklist', 'Exam status not updating after the study is done', 'Report not routing back to the ordering provider'],
  'MyChart':                 ['Patient cannot activate account — activation token issues', 'Messages not routing to the correct provider pool', 'Test results not releasing on the expected schedule'],
  'Willow (Pharmacy)':       ['Pyxis not syncing with pharmacy orders', 'BCMA scan failing — patient ID or med ID mismatch', 'Orders not routing to the correct pharmacy queue'],
  'Stork (OB)':              ['Newborn chart not linking to the mother chart', 'Delivery documentation not saving correctly', 'L&D tracking board not reflecting current patient status'],
  'Resolute (Rev Cycle)':    ['Charges not dropping after discharge', 'Claims on billing hold — missing auth or dx code', 'Insurance billed incorrectly — wrong payer or plan'],
  'In Basket':               ['Messages routing to the wrong pool or wrong provider', 'Lab results landing on the wrong In Basket', 'Staff messages not visible to the assigned team'],
  'Haiku/Canto (Mobile)':    ['Mobile login failures — MFA or SSO issues', 'Orders not showing on mobile after entry at a workstation', 'Chart not syncing after device was in offline mode'],
  'Reporting/Analytics':     ['Report not pulling the correct date range', 'Clarity query timing out on large datasets', 'Dashboard metrics not matching operational numbers'],
  'HIM':                     ['Chart deficiency not routing to provider In Basket', 'ROI request stuck — missing authorization', 'Record not found for coding — wrong encounter linked'],
  'Healthy Planet':          ['Care gap not showing on panel', 'Patient outreach not generating from the registry', 'Risk score not calculating for the patient panel'],
};

// ── Start chat ─────────────────────────────────────────────────────────────
// ── Offline Cache ────────────────────────────────────────────────────────────
const OFFLINE_CACHE_KEY = 'fellito_offline_';

function offlineCacheKey(module) {
  return OFFLINE_CACHE_KEY + (module || 'general').replace(/[ ]+/g, '_').toLowerCase();
}

async function seedOfflineCache(module, dept, goLiveId) {
  if (!module || !navigator.onLine) return;
  const key = offlineCacheKey(module);
  try {
    const r = await fetch('/api/offline/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ moduleTag: module, dept, goLiveId: goLiveId || null })
    });
    if (!r.ok) return;
    const data = await r.json();
    if (data.pairs?.length) {
      localStorage.setItem(key, JSON.stringify({ module, pairs: data.pairs, seededAt: Date.now() }));
      console.log('[Offline] Seeded ' + data.pairs.length + ' Q&As for ' + module);
    }
  } catch (e) {
    console.warn('[Offline] Seed failed:', e.message);
  }
}

function queryOfflineCache(question, module) {
  const key = offlineCacheKey(module);
  let cached;
  try { cached = JSON.parse(localStorage.getItem(key)); } catch { return null; }
  if (!cached?.pairs?.length) return null;

  const qWords = question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/ +/).filter(w => w.length > 2);
  if (!qWords.length) return null;

  let best = null, bestScore = 0;
  for (const pair of cached.pairs) {
    const haystack = (pair.q + ' ' + pair.a).toLowerCase();
    const score = qWords.reduce((s, w) => s + (haystack.includes(w) ? 1 : 0), 0) / qWords.length;
    if (score > bestScore) { bestScore = score; best = pair; }
  }
  return bestScore >= 0.4 ? best : null;
}

function isOfflineCacheSeeded(module) {
  try {
    const cached = JSON.parse(localStorage.getItem(offlineCacheKey(module)));
    if (!cached?.seededAt) return false;
    // Re-seed if older than 24 hours
    return (Date.now() - cached.seededAt) < 86400000;
  } catch { return false; }
}

function startChat() {
  document.getElementById('screen-welcome').classList.remove('active');
  document.getElementById('screen-chat').classList.add('active');
  document.getElementById('ctxGoLive').textContent = selectedGoLive || '—';
  document.getElementById('ctxModule').textContent = selectedModule;
  document.getElementById('ctxDept').textContent   = selectedDept;
  document.getElementById('headerSub').textContent = selectedGoLive ? selectedGoLive.split('—')[0].trim() + ' · ' + selectedModule : selectedModule + ' · ' + selectedDept;
  document.getElementById('input').focus();

  const org   = selectedGoLive ? selectedGoLive.split('—')[0].trim() : 'this org';
  const dept  = selectedDept || 'your department';
  const mod   = selectedModule || 'this module';
  const tips  = MODULE_BRIEFS[mod] || ['Check order workflows', 'Watch for cosign backlogs', 'Support end-user navigation issues'];

  const intro = "I'm FELLITO — locked in on " + mod + " at " + org + ", " + dept + ".\\n\\nTop issues to watch on the floor today:\\n• " + tips.join("\\n• ") + "\\n\\nWhat do you need?";

  // Seed offline cache in background (silent — don't block the UI)
  if (!isOfflineCacheSeeded(selectedModule)) {
    seedOfflineCache(selectedModule, selectedDept, selectedGoLiveId);
  }

  setTimeout(() => {
    addBubble('assistant', intro);
    chatHistory.push({ role: 'user',      content: 'Introduce yourself and orient me for my shift.' });
    chatHistory.push({ role: 'assistant', content: intro });
  }, 400);
}

// system prompt is built server-side in buildServerSystemPrompt()

// ── Downtime ────────────────────────────────────────────────────────────────
function triggerDowntime() {
  var msg = 'It is slow on the floor right now. Give me specific things I can do right now to look productive, add value, and stay sharp during this downtime — things that will actually help me and the team.';
  document.getElementById('input').value = msg;
  sendMessage();
}

// ── Upload screenshot / tip sheet ──────────────────────────────────────────
async function handleUpload(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  const maxMB = 5;
  if (file.size > maxMB * 1024 * 1024) {
    addBubble('assistant', 'File too large — keep it under 5MB.');
    return;
  }

  const uploadBtn = document.getElementById('uploadBtn');
  uploadBtn.style.color = '#FFB800';
  uploadBtn.style.pointerEvents = 'none';

  addBubble('user', '📎 ' + file.name);
  showTyping();

  const form = new FormData();
  form.append('file', file);
  form.append('goLiveId', selectedGoLiveId || '');
  form.append('moduleTag', selectedModule || '');
  form.append('goLive', selectedGoLive || '');

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN },
      body: form,
    });
    hideTyping();
    const data = await res.json();
    if (!res.ok) {
      addBubble('assistant', 'Upload failed — ' + (data.error || 'try again.'));
    } else {
      const type = data.type === 'image' ? 'screenshot' : 'tip sheet';
      const preview = data.preview ? " Here's what I picked up: " + data.preview + '...' : '';
      addBubble('assistant', 'Got it — that ' + type + ' is locked in for this Go-Live.' + preview + ' Ask me anything about it.');
      chatHistory.push({ role: 'assistant', content: 'File uploaded: ' + file.name });
    }
  } catch {
    hideTyping();
    addBubble('assistant', 'Upload failed — connection issue.');
  }

  uploadBtn.style.color = '#8A8AA0';
  uploadBtn.style.pointerEvents = 'auto';
}

// ── Camera + PHI gate ──────────────────────────────────────────────────────
function openCamera() {
  document.getElementById('cameraInput').click();
}

async function handleCamera(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  const cameraBtn = document.getElementById('cameraBtn');
  cameraBtn.style.color = '#FFB800';
  cameraBtn.style.pointerEvents = 'none';

  addBubble('user', '📸 Scanning photo for patient information...');
  showTyping();

  const scanForm = new FormData();
  scanForm.append('file', file, file.name || 'photo.jpg');

  try {
    const scanRes = await fetch('/api/scan-phi', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN },
      body: scanForm,
    });
    const scanData = await scanRes.json();
    hideTyping();

    if (scanData.phi) {
      document.getElementById('phiReason').textContent = scanData.reason || 'This photo contains patient information and cannot be uploaded.';
      document.getElementById('phiOverlay').classList.add('show');
      addBubble('assistant', 'Photo blocked — patient information detected. Remove all patient identifiers and try again.');
      cameraBtn.style.color = '#8A8AA0';
      cameraBtn.style.pointerEvents = 'auto';
      return;
    }

    // PHI-free — proceed to upload
    addBubble('assistant', 'No patient information detected. Uploading photo...');
    showTyping();

    const uploadForm = new FormData();
    uploadForm.append('file', file, file.name || 'photo.jpg');
    uploadForm.append('goLiveId', selectedGoLiveId || '');
    uploadForm.append('moduleTag', selectedModule || '');
    uploadForm.append('goLive', selectedGoLive || '');

    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN },
      body: uploadForm,
    });
    hideTyping();
    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) {
      addBubble('assistant', 'Upload failed — ' + (uploadData.error || 'try again.'));
    } else {
      const preview = uploadData.preview ? " Here\\'s what I picked up: " + uploadData.preview.slice(0, 120) + '...' : '';
      addBubble('assistant', 'Photo locked in for this Go-Live.' + preview + ' Ask me anything about it.');
      chatHistory.push({ role: 'assistant', content: 'Camera photo uploaded and indexed.' });
    }
  } catch {
    hideTyping();
    addBubble('assistant', 'Connection issue — try again.');
  }

  cameraBtn.style.color = '#8A8AA0';
  cameraBtn.style.pointerEvents = 'auto';
}

// ── Settings panel ────────────────────────────────────────────────────────
function toggleSettings() {
  const p = document.getElementById('settingsPanel');
  p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
}

// ── TALK button — unified mic + voice loop ─────────────────────────────────
let talkModeActive = false;

function setTalkBtn(state) {
  const btn = document.getElementById('talkBtn');
  const lbl = document.getElementById('talkBtnLabel');
  if (!btn) return;
  if (state === 'idle') {
    btn.style.background = 'linear-gradient(135deg,#00E5FF,#0070FF)';
    btn.style.color = '#000';
    if (lbl) lbl.textContent = 'TALK';
  } else if (state === 'listening') {
    btn.style.background = '#FF3B5C';
    btn.style.color = '#fff';
    if (lbl) lbl.textContent = '🎙️ LISTENING';
  } else if (state === 'speaking') {
    btn.style.background = '#00E5FF33';
    btn.style.color = '#00E5FF';
    if (lbl) lbl.textContent = '🔊 SPEAKING';
  }
}

function startTalkMode() {
  if (talkModeActive && micActive) {
    // Second tap while listening = stop talk mode
    talkModeActive = false;
    voiceEnabled = false;
    micRecog && micRecog.stop();
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    setTalkBtn('idle');
    return;
  }
  talkModeActive = true;
  voiceEnabled = true;
  _internalToggleMic();
}

// ── Wake word — "Hey Fellito" ──────────────────────────────────────────────
let wakeRecog = null;
let wakeActive = false;

function toggleWakeMode() {
  if (wakeActive) {
    wakeActive = false;
    wakeRecog && wakeRecog.stop();
    wakeRecog = null;
    const btn = document.getElementById('wakeBtn');
    const lbl = document.getElementById('wakeBtnLabel');
    if (btn) { btn.style.background='#1E1E2E'; btn.style.borderColor='#2A2A3E'; btn.style.color='#8A8AA0'; }
    if (lbl) lbl.textContent = 'WAKE';
    return;
  }
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    addBubble('assistant', 'Wake word not supported on this browser — try Chrome.');
    return;
  }
  wakeActive = true;
  const btn = document.getElementById('wakeBtn');
  const lbl = document.getElementById('wakeBtnLabel');
  if (btn) { btn.style.background='#00E5FF22'; btn.style.borderColor='#00E5FF'; btn.style.color='#00E5FF'; }
  if (lbl) lbl.textContent = '👂 LISTENING';
  _startWakeListener();
}

function _startWakeListener() {
  if (!wakeActive) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  wakeRecog = new SR();
  wakeRecog.lang = 'en-US';
  wakeRecog.continuous = false;
  wakeRecog.interimResults = false;

  wakeRecog.onresult = (e) => {
    const said = Array.from(e.results).map(r => r[0].transcript).join(' ').toLowerCase();
    if (said.includes('hey fellito') || said.includes('hey felito') || said.includes('hey f') || said.includes('a fellito') || said.includes('aye fellito')) {
      // Wake word detected — flash and start talk loop
      _wakeWordDetected();
    }
  };

  wakeRecog.onend = () => {
    // Restart loop as long as wake mode is on
    if (wakeActive) setTimeout(() => _startWakeListener(), 300);
  };

  wakeRecog.onerror = (e) => {
    if (e.error === 'aborted' || e.error === 'no-speech') {
      if (wakeActive) setTimeout(() => _startWakeListener(), 300);
    } else {
      wakeActive = false;
      const lbl = document.getElementById('wakeBtnLabel');
      if (lbl) lbl.textContent = 'WAKE';
    }
  };

  try { wakeRecog.start(); } catch(e) {}
}

function _wakeWordDetected() {
  // Stop wake listener temporarily
  wakeRecog && wakeRecog.stop();
  // Flash the screen cyan
  const phone = document.getElementById('phone');
  if (phone) {
    phone.style.boxShadow = '0 0 40px #00E5FF';
    setTimeout(() => { phone.style.boxShadow = ''; }, 600);
  }
  // Play a quick beep to signal activation
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  } catch(e) {}
  // Kick into full talk mode
  talkModeActive = true;
  voiceEnabled = true;
  setTimeout(() => _internalToggleMic(), 200);
  // Resume wake listener after talk session ends — hook into speakReply
}

// ── Voice Clone Recording ──────────────────────────────────────────────────
let mediaRecorder = null;
let recordingChunks = [];
let isRecording = false;

async function toggleVoiceRecord() {
  const btn = document.getElementById('recordVoiceBtn');
  const lbl = document.getElementById('recordVoiceLbl');
  const status = document.getElementById('recordVoiceStatus');

  if (isRecording) {
    // Stop recording
    mediaRecorder && mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordingChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg' });

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordingChunks.push(e.data); };

    mediaRecorder.onstart = () => {
      isRecording = true;
      btn.style.borderColor = '#FF3B5C';
      btn.style.color = '#FF3B5C';
      lbl.textContent = '⏹ Stop Recording';
      status.textContent = '🔴 Recording — talk naturally...';
    };

    mediaRecorder.onstop = async () => {
      isRecording = false;
      stream.getTracks().forEach(t => t.stop());
      btn.style.borderColor = '#2A2A3E';
      btn.style.color = '#00E5FF';
      lbl.textContent = 'Record Voice Sample';
      status.textContent = '⏳ Uploading to ElevenLabs...';

      const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType });
      if (blob.size < 10000) { status.textContent = '⚠️ Too short — record at least 15 seconds.'; return; }

      try {
        const form = new FormData();
        form.append('audio', blob, 'sample.webm');
        const r = await fetch('/api/voice-sample', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + TOKEN },
          body: form,
        });
        const d = await r.json();
        if (r.ok) {
          status.textContent = '✅ Voice sample added — clone is getting sharper!';
        } else {
          status.textContent = '❌ ' + (d.error || 'Upload failed');
        }
      } catch { status.textContent = '❌ Connection error — try again.'; }
    };

    mediaRecorder.start();
  } catch (err) {
    status.textContent = '❌ Mic access denied — allow microphone in browser settings.';
  }
}

// ── ElevenLabs voice output ────────────────────────────────────────────────
let voiceEnabled = false;
let currentAudio = null;

async function speakReply(text) {
  if (!voiceEnabled || !text) return;
  try {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    setTalkBtn('speaking');
    const r = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) { setTalkBtn('idle'); talkModeActive = false; return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.play();
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      if (talkModeActive) {
        // TALK mode: keep the mic loop going
        setTimeout(() => startTalkMode(), 400);
      } else {
        setTalkBtn('idle');
        // If wake mode is on, resume listening for "Hey Fellito"
        if (wakeActive) setTimeout(() => _startWakeListener(), 400);
      }
    };
  } catch {
    setTalkBtn('idle');
    talkModeActive = false;
  }
}

// ── Mic / Speech-to-text ───────────────────────────────────────────────────
let micRecog = null;
let micActive = false;

function toggleMic() {
  // Legacy alias — just calls startTalkMode
  startTalkMode();
}

function _internalToggleMic() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    addBubble('assistant', 'Voice input not supported on this browser — try Chrome.');
    return;
  }
  if (micActive) { micRecog && micRecog.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  micRecog = new SR();
  micRecog.lang = 'en-US';
  micRecog.continuous = false;
  micRecog.interimResults = true;
  const ta = document.getElementById('input');
  micRecog.onstart = () => { micActive = true; setTalkBtn('listening'); };
  micRecog.onresult = (e) => {
    let t = '';
    for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
    ta.value = t;
  };
  micRecog.onend = () => {
    micActive = false;
    if (!talkModeActive) {
      setTalkBtn('idle');
      // Hand back to wake listener if active
      if (wakeActive) setTimeout(() => _startWakeListener(), 300);
      return;
    }
    if (ta.value.trim()) sendMessage();
    else {
      // Nothing heard — either retry or fall back to wake mode
      if (talkModeActive) setTimeout(() => startTalkMode(), 600);
    }
  };
  micRecog.onerror = (err) => {
    micActive = false;
    if (err.error === 'aborted') return;
    setTalkBtn('idle');
    talkModeActive = false;
  };

  micRecog.start();
}

// ── Escalate issue from chat ───────────────────────────────────────────────
async function escalateIssue() {
  const lastExchange = chatHistory.slice(-4);
  if (!lastExchange.length) { addBubble('assistant', 'Nothing to escalate yet — ask me something first.'); return; }
  const summary = lastExchange.map(m => (m.role === 'user' ? 'User: ' : 'FELLITO: ') + m.content).join('\\n').slice(0, 400);
  const title = prompt('Describe the issue in one line:');
  if (!title) return;
  try {
    const r = await fetch('/api/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ title, description: summary, module: selectedModule, dept: selectedDept, goLiveId: selectedGoLiveId, severity: 'high' }),
    });
    if (r.ok) {
      shiftEscalatedIssues.push({ title, module: selectedModule, dept: selectedDept, severity: 'high' });
      addBubble('assistant', '🚨 Issue logged sharp sharp — "' + title + '". Leadership can see it in the admin panel.');
    } else {
      addBubble('assistant', 'Could not log issue — try again.');
    }
  } catch { addBubble('assistant', 'Connection issue — could not escalate.'); }
}

// ── Issue Board (Kanban) ───────────────────────────────────────────────────
async function openBoard() {
  document.getElementById('boardModal').style.display = 'block';
  document.getElementById('boardGoLive').textContent = (selectedGoLive || 'All Issues').toUpperCase();
  await refreshBoard();
}

async function refreshBoard() {
  try {
    const url = '/api/issues' + (selectedGoLiveId ? '?goLiveId=' + selectedGoLiveId : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
    const issues = await r.json();

    const open     = issues.filter(i => i.status === 'open');
    const progress = issues.filter(i => i.status === 'in-progress');
    const resolved = issues.filter(i => i.status === 'resolved');

    document.getElementById('boardCountOpen').textContent     = '(' + open.length + ')';
    document.getElementById('boardCountProgress').textContent = '(' + progress.length + ')';
    document.getElementById('boardCountResolved').textContent = '(' + resolved.length + ')';
    document.getElementById('boardEmpty').style.display = issues.length === 0 ? 'block' : 'none';

    renderBoardCol('boardColOpen',     open,     ['in-progress', 'resolved']);
    renderBoardCol('boardColProgress', progress, ['open',        'resolved']);
    renderBoardCol('boardColResolved', resolved, ['open',        'in-progress']);
  } catch { /* silent */ }
}

function renderBoardCol(colId, issues, nextStatuses) {
  const col = document.getElementById(colId);
  col.innerHTML = '';
  if (!issues.length) {
    col.innerHTML = '<div style="font-size:11px;color:#333;padding:8px 12px;border:1px dashed #2A2A3E;border-radius:8px;text-align:center;">—</div>';
    return;
  }
  issues.forEach(issue => {
    const sevColor = issue.severity === 'high' || issue.severity === 'critical' ? '#FF3B5C' : issue.severity === 'medium' ? '#FFB800' : '#8A8AA0';
    const card = document.createElement('div');
    card.style.cssText = 'background:#0A0A0F;border:1px solid #1E1E2E;border-radius:10px;padding:10px 12px;';

    const btnHtml = nextStatuses.map(function(s) {
      const label = s === 'in-progress' ? '▶ Start' : s === 'resolved' ? '✓ Resolve' : '↩ Reopen';
      const color = s === 'resolved' ? '#00FF88' : s === 'in-progress' ? '#FFB800' : '#8A8AA0';
      return '<button data-issueid="' + issue.id + '" data-status="' + s + '" onclick="moveIssue(this.dataset.issueid,this.dataset.status)" style="background:none;border:1px solid ' + color + ';border-radius:8px;color:' + color + ';font-size:10px;font-weight:700;padding:3px 8px;cursor:pointer;">' + label + '</button>';
    }).join('');

    card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">'
      + '<div style="font-size:13px;color:#fff;font-weight:600;line-height:1.4;">' + issue.title + '</div>'
      + '<span style="flex-shrink:0;background:' + sevColor + '22;color:' + sevColor + ';font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;">' + (issue.severity||'med') + '</span>'
      + '</div>'
      + '<div style="font-size:11px;color:#8A8AA0;margin-bottom:8px;">' + (issue.module||'') + (issue.department ? ' · ' + issue.department : '') + '</div>'
      + '<div style="display:flex;gap:6px;">' + btnHtml + '</div>';
    col.appendChild(card);
  });
}

async function moveIssue(id, newStatus) {
  try {
    await fetch('/api/issues/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ status: newStatus }),
    });
    await refreshBoard();
  } catch { /* silent */ }
}

// ── Pre-Go-Live Quiz ──────────────────────────────────────────────────────
let quizQuestions = [];
let quizIndex = 0;
let quizCorrect = 0;
let quizAnswered = false;

async function openQuiz() {
  quizQuestions = []; quizIndex = 0; quizCorrect = 0; quizAnswered = false;
  document.getElementById('quizModal').style.display = 'block';
  document.getElementById('quizSubtitle').textContent = selectedModule.toUpperCase() + ' · ' + (selectedDept || '').toUpperCase();
  document.getElementById('quizLoading').style.display = 'block';
  document.getElementById('quizQuestion').style.display = 'none';
  document.getElementById('quizResults').style.display = 'none';

  try {
    const r = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ moduleTag: selectedModule, dept: selectedDept, goLiveId: selectedGoLiveId || null }),
    });
    const data = await r.json();
    if (!r.ok || !data.questions) throw new Error(data.error || 'No questions returned');
    quizQuestions = data.questions;
    document.getElementById('quizLoading').style.display = 'none';
    showQuestion();
  } catch (e) {
    document.getElementById('quizLoading').innerHTML = '<div style="color:#FF3B5C;font-size:13px;">Could not load quiz — ' + e.message + '</div>';
  }
}

function closeQuiz() {
  document.getElementById('quizModal').style.display = 'none';
}

function showQuestion() {
  quizAnswered = false;
  const q = quizQuestions[quizIndex];
  document.getElementById('quizQuestion').style.display = 'block';
  document.getElementById('quizProgress').textContent = 'Q ' + (quizIndex + 1) + ' / ' + quizQuestions.length;
  document.getElementById('quizScore').textContent = 'Score: ' + quizCorrect + '/' + quizIndex;
  document.getElementById('quizQText').textContent = q.q;
  document.getElementById('quizFeedback').style.display = 'none';
  document.getElementById('quizNextBtn').style.display = 'none';

  const opts = document.getElementById('quizOptions');
  opts.innerHTML = '';
  q.options.forEach((opt, i) => {
    const letter = ['A','B','C','D'][i];
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.setAttribute('data-letter', letter);
    btn.style.cssText = 'width:100%;background:#0A0A0F;border:1px solid #2A2A3E;border-radius:10px;color:#fff;font-size:13px;padding:11px 14px;cursor:pointer;text-align:left;font-family:inherit;transition:all .15s;';
    btn.onmouseover = () => { if (!quizAnswered) btn.style.borderColor = '#00E5FF'; };
    btn.onmouseout  = () => { if (!quizAnswered) btn.style.borderColor = '#2A2A3E'; };
    btn.onclick = () => selectAnswer(letter, btn);
    opts.appendChild(btn);
  });
}

function selectAnswer(letter, btn) {
  if (quizAnswered) return;
  quizAnswered = true;
  const q = quizQuestions[quizIndex];
  const correct = letter === q.answer;
  if (correct) quizCorrect++;

  // Color all options
  document.querySelectorAll('#quizOptions button').forEach(b => {
    const l = b.getAttribute('data-letter');
    if (l === q.answer) { b.style.background = '#00FF8822'; b.style.borderColor = '#00FF88'; b.style.color = '#00FF88'; }
    else if (l === letter && !correct) { b.style.background = '#FF3B5C22'; b.style.borderColor = '#FF3B5C'; b.style.color = '#FF3B5C'; }
    b.style.cursor = 'default';
  });

  // Feedback
  const fb = document.getElementById('quizFeedback');
  fb.style.display = 'block';
  fb.style.color = correct ? '#00FF88' : '#FF3B5C';
  fb.innerHTML = (correct ? '✅ Correct! ' : '❌ Wrong. ') + '<span style="color:#ccc;">' + q.explanation + '</span>';

  document.getElementById('quizScore').textContent = 'Score: ' + quizCorrect + '/' + (quizIndex + 1);
  document.getElementById('quizNextBtn').style.display = 'block';
  document.getElementById('quizNextBtn').textContent = quizIndex + 1 < quizQuestions.length ? 'NEXT →' : 'SEE RESULTS';
}

function nextQuestion() {
  quizIndex++;
  if (quizIndex < quizQuestions.length) {
    showQuestion();
  } else {
    showResults();
  }
}

function showResults() {
  document.getElementById('quizQuestion').style.display = 'none';
  document.getElementById('quizResults').style.display = 'block';
  const pct = Math.round((quizCorrect / quizQuestions.length) * 100);
  const emoji = pct === 100 ? '🔥' : pct >= 80 ? '💪' : pct >= 60 ? '📚' : '⚠️';
  const msg = pct === 100 ? "Perfect score. You're ready. Hit the floor." :
              pct >= 80  ? "Solid. Review the ones you missed and you're good to go." :
              pct >= 60  ? "Not bad — but brush up before you go live. Your users will test you." :
                           "Real talk — spend 20 more minutes on your module before Day 1.";
  document.getElementById('quizResultEmoji').textContent = emoji;
  document.getElementById('quizResultScore').textContent = quizCorrect + ' / ' + quizQuestions.length + ' (' + pct + '%)';
  document.getElementById('quizResultMsg').textContent = msg;
}

// ── Shift Log ─────────────────────────────────────────────────────────────
let shiftEscalatedIssues = [];

// ── Tip Sheet Generator ──────────────────────────────────────────────────────
function openTipSheet() {
  const modal = document.getElementById('tipModal');
  const ctx = selectedModule && selectedDept
    ? 'MODULE: ' + selectedModule.toUpperCase() + '  ·  DEPT: ' + selectedDept.toUpperCase()
    : selectedModule ? 'MODULE: ' + selectedModule.toUpperCase()
    : 'No module selected — select one on the home screen first';
  document.getElementById('tipContext').textContent = ctx;
  document.getElementById('tipOutput').style.display = 'none';
  document.getElementById('tipLoading').style.display = 'none';
  document.getElementById('tipError').style.display = 'none';
  document.getElementById('tipGenBtn').style.display = 'block';
  modal.style.display = 'block';
}

async function generateTipSheet() {
  if (!selectedModule) { alert('Select a module first on the home screen.'); return; }
  document.getElementById('tipGenBtn').style.display = 'none';
  document.getElementById('tipLoading').style.display = 'block';
  document.getElementById('tipOutput').style.display = 'none';
  document.getElementById('tipError').style.display = 'none';
  try {
    const r = await fetch('/api/tipsheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ moduleTag: selectedModule, dept: selectedDept, goLive: selectedGoLive, goLiveId: selectedGoLiveId || null })
    });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || 'Generation failed');
    document.getElementById('tipContent').textContent = data.content;
    document.getElementById('tipLoading').style.display = 'none';
    document.getElementById('tipOutput').style.display = 'block';
    document.getElementById('tipGenBtn').style.display = 'none';
  } catch (e) {
    document.getElementById('tipLoading').style.display = 'none';
    document.getElementById('tipError').textContent = 'Error: ' + e.message;
    document.getElementById('tipError').style.display = 'block';
    document.getElementById('tipGenBtn').style.display = 'block';
  }
}

async function copyTipSheet() {
  const text = document.getElementById('tipContent').textContent;
  await navigator.clipboard.writeText(text);
  const btn = document.querySelector('#tipOutput button');
  btn.textContent = '✅ Copied!';
  setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
}

// ── Adoption Tracker ─────────────────────────────────────────────────────────
let adoptionStatus = '';

function setAdoptionStatus(s) {
  adoptionStatus = s;
  const colors = { confident: '#00FF88', struggling: '#FFB800', 'needs-followup': '#FF3B5C' };
  const ids = { confident: 'adpConfident', struggling: 'adpStruggling', 'needs-followup': 'adpFollowup' };
  Object.keys(ids).forEach(k => {
    const btn = document.getElementById(ids[k]);
    btn.style.borderColor = k === s ? colors[k] : '#2A2A3E';
    btn.style.color = k === s ? colors[k] : '#8A8AA0';
    btn.style.background = k === s ? colors[k] + '22' : '#0A0A0F';
  });
}

async function openAdoption() {
  const modal = document.getElementById('adoptionModal');
  document.getElementById('adoptionGoLive').textContent = selectedGoLive ? 'GO-LIVE: ' + selectedGoLive.toUpperCase() : '';
  modal.style.display = 'block';
  adoptionStatus = '';
  document.getElementById('adoptionName').value = '';
  document.getElementById('adoptionNotes').value = '';
  ['adpConfident','adpStruggling','adpFollowup'].forEach(id => {
    const b = document.getElementById(id);
    b.style.borderColor = '#2A2A3E'; b.style.color = '#8A8AA0'; b.style.background = '#0A0A0F';
  });
  await loadAdoptionList();
}

async function loadAdoptionList() {
  const list = document.getElementById('adoptionList');
  const empty = document.getElementById('adoptionEmpty');
  const url = '/api/adoption' + (selectedGoLiveId ? '?goLiveId=' + selectedGoLiveId : '');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
  const records = await r.json();
  if (!records.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  const colors = { confident: '#00FF88', struggling: '#FFB800', 'needs-followup': '#FF3B5C' };
  const labels = { confident: '✅ Confident', struggling: '⚠️ Struggling', 'needs-followup': '🔴 Needs Follow-Up' };
  list.innerHTML = records.map(rec => {
    const c = colors[rec.status] || '#8A8AA0';
    return '<div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:12px;padding:10px 12px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;color:#fff;font-weight:700;margin-bottom:2px;">' + escHtml(rec.userName) + '</div>'
      + (rec.department ? '<div style="font-size:10px;color:#8A8AA0;">' + escHtml(rec.department) + '</div>' : '')
      + (rec.notes ? '<div style="font-size:11px;color:#8A8AA0;margin-top:3px;line-height:1.4;">' + escHtml(rec.notes) + '</div>' : '')
      + '</div>'
      + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">'
      + '<span style="background:' + c + '22;color:' + c + ';font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;white-space:nowrap;">' + (labels[rec.status] || rec.status) + '</span>'
      + '<button data-adpid="' + rec.id + '" onclick="deleteAdoption(this.dataset.adpid)" style="background:none;border:none;color:#444;font-size:11px;cursor:pointer;padding:0;">remove</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

async function submitAdoption() {
  const name = document.getElementById('adoptionName').value.trim();
  const notes = document.getElementById('adoptionNotes').value.trim();
  if (!name) { document.getElementById('adoptionName').focus(); return; }
  if (!adoptionStatus) { alert('Pick a status first'); return; }
  await fetch('/api/adoption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ goLiveId: selectedGoLiveId || null, userName: name, department: selectedDept, module: selectedModule, status: adoptionStatus, notes })
  });
  document.getElementById('adoptionName').value = '';
  document.getElementById('adoptionNotes').value = '';
  adoptionStatus = '';
  ['adpConfident','adpStruggling','adpFollowup'].forEach(id => {
    const b = document.getElementById(id);
    b.style.borderColor = '#2A2A3E'; b.style.color = '#8A8AA0'; b.style.background = '#0A0A0F';
  });
  await loadAdoptionList();
}

async function deleteAdoption(id) {
  await fetch('/api/adoption/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN } });
  await loadAdoptionList();
}

function openShiftModal() {
  // Count questions from chat history (user messages only)
  const qCount = chatHistory.filter(m => m.role === 'user').length;
  document.getElementById('shiftQCount').textContent = qCount;
  document.getElementById('shiftICount').textContent = shiftEscalatedIssues.length;
  document.getElementById('shiftNotes').value = '';
  document.getElementById('shiftStatus').textContent = '';
  document.getElementById('shiftModal').style.display = 'block';
}

async function submitShiftLog() {
  const pmEmail = document.getElementById('shiftPmEmail').value.trim();
  const notes = document.getElementById('shiftNotes').value.trim();
  const status = document.getElementById('shiftStatus');

  if (!pmEmail) { status.textContent = 'Enter PM email first.'; status.style.color = '#FF3B5C'; return; }

  status.textContent = 'Sending...'; status.style.color = '#8A8AA0';

  try {
    const r = await fetch('/api/shift/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({
        goLive: selectedGoLive,
        dept: selectedDept,
        module: selectedModule,
        questionsAnswered: chatHistory.filter(m => m.role === 'user').length,
        issuesEscalated: shiftEscalatedIssues.length,
        issues: shiftEscalatedIssues,
        summary: notes,
        pmEmail,
      }),
    });
    const data = await r.json();
    if (r.ok) {
      status.textContent = '✅ Sent to ' + pmEmail;
      status.style.color = '#00FF88';
      setTimeout(() => { document.getElementById('shiftModal').style.display = 'none'; }, 2000);
    } else {
      status.textContent = data.error || 'Failed — try again.';
      status.style.color = '#FF3B5C';
    }
  } catch { status.textContent = 'Connection error.'; status.style.color = '#FF3B5C'; }
}

// ── Nearby ─────────────────────────────────────────────────────────────────
let nearbyCoords = null;

function openNearby() {
  document.getElementById('nearbyPanel').style.display = 'block';
  if (!nearbyCoords) {
    document.getElementById('nearbyLocation').textContent = 'Detecting your location...';
    navigator.geolocation.getCurrentPosition(
      pos => {
        nearbyCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        document.getElementById('nearbyLocation').textContent =
          '📍 ' + nearbyCoords.lat.toFixed(4) + ', ' + nearbyCoords.lon.toFixed(4);
      },
      () => {
        document.getElementById('nearbyLocation').textContent = 'Location unavailable — enable GPS and try again';
      },
      { timeout: 8000 }
    );
  }
}

function closeNearby() {
  document.getElementById('nearbyPanel').style.display = 'none';
}

const categoryMap = {
  '🍔 Food':    { amenity: 'restaurant|fast_food|food_court', label: 'restaurant' },
  '☕ Coffee':  { amenity: 'cafe', label: 'cafe' },
  '🏨 Hotels':  { tourism: 'hotel|motel|hostel', label: 'hotel' },
  '🅿️ Parking': { amenity: 'parking', label: 'parking' },
  '💊 Pharmacy':{ amenity: 'pharmacy', label: 'pharmacy' },
  '🏋️ Gym':    { leisure: 'fitness_centre', label: 'gym' },
};

async function fetchNearby(cat) {
  // Highlight active tab
  document.querySelectorAll('[id^="ncat"]').forEach(b => {
    b.style.background = '#0A0A0F'; b.style.color = '#8A8AA0'; b.style.borderColor = '#2A2A3E';
  });
  event.target.style.background = '#00E5FF22';
  event.target.style.color = '#00E5FF';
  event.target.style.borderColor = '#00E5FF';

  const el = document.getElementById('nearbyResults');
  if (!nearbyCoords) {
    el.innerHTML = '<div style="text-align:center;color:#FF3B5C;padding:24px;font-size:13px;">Enable location access first</div>';
    return;
  }
  el.innerHTML = '<div style="text-align:center;color:#8A8AA0;padding:24px;font-size:13px;">Searching...</div>';

  const { lat, lon } = nearbyCoords;
  const radius = 800; // meters
  const cfg = categoryMap[cat];
  let filter = '';
  if (cfg.amenity)  filter = \`node["amenity"~"\${cfg.amenity}"](around:\${radius},\${lat},\${lon});\`;
  else if (cfg.tourism) filter = \`node["tourism"~"\${cfg.tourism}"](around:\${radius},\${lat},\${lon});\`;
  else if (cfg.leisure) filter = \`node["leisure"~"\${cfg.leisure}"](around:\${radius},\${lat},\${lon});\`;

  const query = \`[out:json][timeout:10];(\${filter});out body 20;\`;

  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: 'data=' + encodeURIComponent(query)
    });
    const json = await r.json();
    const places = json.elements || [];

    if (!places.length) {
      el.innerHTML = '<div style="text-align:center;color:#8A8AA0;padding:24px;font-size:13px;">Nothing found within 800m</div>';
      return;
    }

    el.innerHTML = places.slice(0, 15).map(p => {
      const name = p.tags && p.tags.name ? p.tags.name : 'Unnamed';
      const street = p.tags && p.tags['addr:street'] ? p.tags['addr:street'] + (p.tags['addr:housenumber'] ? ' ' + p.tags['addr:housenumber'] : '') : '';
      const phone = (p.tags && (p.tags.phone || p.tags['contact:phone'])) || '';
      const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lon;
      const dist = Math.round(haversine(lat, lon, p.lat, p.lon));
      return '<div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:14px;padding:14px;margin-bottom:10px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
        + '<div style="font-size:14px;font-weight:700;color:#fff;flex:1;">' + name + '</div>'
        + '<div style="font-size:11px;color:#00E5FF;font-weight:700;margin-left:8px;flex-shrink:0;">' + dist + 'm</div>'
        + '</div>'
        + (street ? '<div style="font-size:12px;color:#8A8AA0;margin-top:3px;">' + street + '</div>' : '')
        + (phone  ? '<div style="font-size:12px;color:#8A8AA0;">' + phone + '</div>' : '')
        + '<a href="' + mapsUrl + '" target="_blank" style="display:inline-block;margin-top:8px;font-size:11px;font-weight:700;color:#00E5FF;text-decoration:none;background:#00E5FF15;border:1px solid #00E5FF44;border-radius:8px;padding:4px 10px;">Open in Maps →</a>'
        + '</div>';
    }).join('');
  } catch {
    el.innerHTML = '<div style="text-align:center;color:#FF3B5C;padding:24px;font-size:13px;">Search failed — check your connection</div>';
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}


// ── Chat helpers ───────────────────────────────────────────────────────────
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function addBubble(role, text) {
  const el = document.createElement('div');
  el.className = 'bubble ' + role;
  if (role === 'assistant') el.innerHTML = '<div class="sender"><img src="/public/fellito-avatar.png" alt="" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;" onerror="this.remove()">FELLITO</div><span class="bubble-text">' + escHtml(text).replace(/\\n/g,'<br>') + '</span>';
  else el.textContent = text;
  document.getElementById('messages').appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return el;
}
function updateBubble(el, text) {
  const span = el.querySelector('.bubble-text');
  if (span) span.innerHTML = escHtml(text).replace(/\\n/g,'<br>');
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'bubble typing'; el.id = 'typing';
  el.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  document.getElementById('messages').appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}
function hideTyping() { document.getElementById('typing')?.remove(); }

const ta = document.getElementById('input');
ta.addEventListener('input', () => { ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,100)+'px'; });
ta.addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

async function sendMessage() {
  const text = ta.value.trim(); if (!text) return;

  ta.value = ''; ta.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;
  addBubble('user', text);
  chatHistory.push({ role: 'user', content: text });
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        messages: chatHistory.slice(-16),
        max_tokens: 512,
        moduleTag: selectedModule,
        goLiveId: selectedGoLiveId,
        dept: selectedDept,
        goLive: selectedGoLive,
      }),
    });
    hideTyping();
    if (res.status === 401) { window.location.href = '/app'; return; }

    // Read streaming SSE response
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', fullReply = '', bubble = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\\n\\n');
      buf = parts.pop();
      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        const payload = part.slice(6);
        if (payload === '[DONE]') break;
        try {
          const { text } = JSON.parse(payload);
          fullReply += text;
          if (!bubble) bubble = addBubble('assistant', fullReply);
          else updateBubble(bubble, fullReply);
        } catch {}
      }
    }
    if (!bubble && fullReply) addBubble('assistant', fullReply);
    if (!fullReply) addBubble('assistant', 'Connection issue — try again.');
    if (fullReply) { chatHistory.push({ role: 'assistant', content: fullReply }); speakReply(fullReply); }
  } catch {
    hideTyping();
    const lastQ = chatHistory.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    const hit = queryOfflineCache(lastQ, selectedModule);
    if (hit) {
      const reply = '📵 Offline mode — answering from cached knowledge:\\n\\n' + hit.a;
      addBubble('assistant', reply);
      chatHistory.push({ role: 'assistant', content: reply });
    } else {
      addBubble('assistant', '📵 You appear to be offline. Reconnect to ask FELLITO.\\n\\nIf this Go-Live was opened before, try asking a more specific question — some answers may be cached.');
    }
  }
  document.getElementById('sendBtn').disabled = false;
  ta.focus();
}

loadGoLive();

// ── Screenshot / screen-capture detection ─────────────────────────────────
function postSecurityFlag(type, detail) {
  fetch('/api/security/flag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ type, detail }),
  }).catch(() => {});
}

function showScreenshotWarning() {
  const w = document.createElement('div');
  w.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#FF3B5C;color:#fff;font-size:13px;font-weight:800;padding:12px 24px;border-radius:14px;z-index:9999;box-shadow:0 4px 24px rgba(255,59,92,.5);letter-spacing:.5px;text-align:center;';
  w.textContent = '⚠️ Screenshot activity detected and logged';
  document.body.appendChild(w);
  setTimeout(() => w.remove(), 4000);
}

// PrintScreen key (desktop)
document.addEventListener('keyup', e => {
  if (e.key === 'PrintScreen' || e.keyCode === 44) {
    postSecurityFlag('screenshot_key', 'PrintScreen key pressed');
    showScreenshotWarning();
  }
});

// Clipboard write (some screenshot tools write to clipboard)
document.addEventListener('copy', () => {
  postSecurityFlag('clipboard_copy', 'Content copied to clipboard');
});

// Visibility change — rapid hide/show pattern (mobile screenshot on some devices)
let lastHidden = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    lastHidden = Date.now();
  } else {
    const gap = Date.now() - lastHidden;
    if (lastHidden && gap < 1500) {
      postSecurityFlag('visibility_flash', 'Page briefly hidden (' + gap + 'ms) — possible screenshot');
    }
  }
});
</script>
</body></html>`;
}

function buildErrorPage(msg) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FELLITO</title><style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{height:100%;background:#050508;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;}
.shell{display:flex;align-items:center;justify-content:center;width:100%;}
.phone{width:100%;max-width:390px;height:min(500px,90vh);background:#0A0A0F;border-radius:44px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #1E1E2E;padding:40px 32px;text-align:center;gap:20px;}
.logo{font-size:28px;font-weight:900;color:#00E5FF;letter-spacing:4px;}
.icon{font-size:52px;}
.msg{font-size:14px;color:#FF3B5C;line-height:1.6;}
.sub{font-size:12px;color:#8A8AA0;}
@media(max-width:430px){.phone{border-radius:0;max-width:100%;height:100vh;}}
</style></head>
<body><div class="shell"><div class="phone">
<div class="logo">FELLITO</div>
<div class="icon">⛔</div>
<div class="msg">${msg}</div>
<div class="sub">Contact your administrator for a new invite link.</div>
</div></div></body></html>`;
}


// ─── Root — Consultant entry page ─────────────────────────────────────────────
// ─── /app — permanent login for owner + contributors ─────────────────────────
app.get('/app', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>FELLITO</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/png" href="/public/favicon.png">
<meta name="theme-color" content="#00E5FF">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="FELLITO">
<link rel="apple-touch-icon" href="/public/icon-192.png">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{height:100%;background:#050508;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;}
.card{width:100%;max-width:360px;padding:0 24px;}
.logo{font-size:36px;font-weight:900;color:#00E5FF;letter-spacing:8px;text-align:center;margin-bottom:6px;}
.sub{font-size:11px;color:#8A8AA0;letter-spacing:3px;text-align:center;margin-bottom:40px;}
input{width:100%;background:#12121A;border:1px solid #1E1E2E;border-radius:12px;padding:14px 16px;color:#fff;font-size:15px;margin-bottom:12px;outline:none;}
input:focus{border-color:#00E5FF;}
.btn-primary{width:100%;background:#00E5FF;color:#000;font-size:15px;font-weight:800;border:none;border-radius:12px;padding:16px;cursor:pointer;letter-spacing:1px;margin-top:4px;}
.btn-secondary{width:100%;background:transparent;color:#00E5FF;font-size:14px;font-weight:600;border:1px solid #1E1E2E;border-radius:12px;padding:14px;cursor:pointer;margin-top:10px;}
.btn-secondary:hover{border-color:#00E5FF;}
.err{color:#FF4444;font-size:13px;text-align:center;margin-top:12px;display:none;}
.ok{color:#00E5FF;font-size:13px;text-align:center;margin-top:12px;display:none;}
.view{display:none;} .view.active{display:block;}
.btn-link{width:100%;background:none;border:none;color:#8A8AA0;font-size:13px;cursor:pointer;margin-top:8px;padding:8px;text-decoration:underline;}
.btn-link:hover{color:#00E5FF;}
</style>
</head>
<body>
<div class="card">
  <div class="logo">FELLITO</div>
  <div class="sub">ECLAT UNIVERSE · EPIC ATE SUPPORT</div>

  <!-- LOGIN -->
  <div class="view active" id="viewLogin">
    <input id="email" type="email" placeholder="Email" autocomplete="email">
    <input id="pass" type="password" placeholder="Password" autocomplete="current-password">
    <button class="btn-primary" onclick="doLogin()">Enter →</button>
    <button class="btn-secondary" onclick="show('viewRegister')">Create Account</button>
    <button class="btn-link" onclick="show('viewForgot')">Forgot Password?</button>
    <div class="err" id="loginErr"></div>
  </div>

  <!-- CHANGE PASSWORD (forced on first login) -->
  <div class="view" id="viewChangePass">
    <div style="color:#00E5FF;font-size:13px;font-weight:700;text-align:center;margin-bottom:12px;">Create your new password</div>
    <input id="newPass1" type="password" placeholder="New password (min 8 chars)" autocomplete="new-password">
    <input id="newPass2" type="password" placeholder="Confirm new password" autocomplete="new-password">
    <button class="btn-primary" onclick="doChangePass()">Set Password →</button>
    <div class="err" id="changePassErr"></div>
  </div>

  <!-- FORGOT PASSWORD -->
  <div class="view" id="viewForgot">
    <input id="forgotEmail" type="email" placeholder="Enter your email" autocomplete="email">
    <button class="btn-primary" onclick="doForgot()">Send Reset Link →</button>
    <button class="btn-secondary" onclick="show('viewLogin')">Back to Login</button>
    <div class="err" id="forgotErr"></div>
    <div class="ok"  id="forgotOk"></div>
  </div>

  <!-- REGISTER -->
  <div class="view" id="viewRegister">
    <input id="regName"  type="text"     placeholder="Full Name" autocomplete="off">
    <input id="regEmail" type="email"    placeholder="Email" autocomplete="off">
    <input id="regPass"  type="password" placeholder="Password (min 8 chars)" autocomplete="new-password">
    <button class="btn-primary" onclick="doRegister()">Create Account →</button>
    <button class="btn-secondary" onclick="show('viewLogin')">Back to Login</button>
    <div class="err" id="regErr"></div>
    <div class="ok"  id="regOk"></div>
  </div>
</div>
<script>
function show(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('viewLogin').classList.contains('active')) doLogin();
    else doRegister();
  }
});

async function doLogin() {
  const email = document.getElementById('email').value.trim();
  const pass  = document.getElementById('pass').value;
  const err   = document.getElementById('loginErr');
  err.style.display = 'none';
  if (!email || !pass) { err.textContent = 'Enter email and password.'; err.style.display = 'block'; return; }
  try {
    const res  = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Login failed.'; err.style.display = 'block'; return; }
    localStorage.setItem('_ft', data.token);
    localStorage.setItem('_fu', JSON.stringify(data.user));
    if (data.user.mustChangePassword) { show('viewChangePass'); return; }
    window.location.href = '/app/chat';
  } catch { err.textContent = 'Connection issue — try again.'; err.style.display = 'block'; }
}

async function doRegister() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPass').value;
  const err   = document.getElementById('regErr');
  const ok    = document.getElementById('regOk');
  err.style.display = 'none'; ok.style.display = 'none';
  if (!name || !email || !pass) { err.textContent = 'All fields required.'; err.style.display = 'block'; return; }
  if (pass.length < 8) { err.textContent = 'Password must be at least 8 characters.'; err.style.display = 'block'; return; }
  try {
    const res  = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password: pass }) });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Registration failed.'; err.style.display = 'block'; return; }
    ok.textContent = 'Account created! You can now log in.'; ok.style.display = 'block';
    setTimeout(() => show('viewLogin'), 1800);
  } catch { err.textContent = 'Connection issue — try again.'; err.style.display = 'block'; }
}

async function doChangePass() {
  const p1  = document.getElementById('newPass1').value;
  const p2  = document.getElementById('newPass2').value;
  const err = document.getElementById('changePassErr');
  err.style.display = 'none';
  if (p1.length < 8) { err.textContent = 'Password must be at least 8 characters.'; err.style.display = 'block'; return; }
  if (p1 !== p2)     { err.textContent = 'Passwords do not match.'; err.style.display = 'block'; return; }
  try {
    const token = localStorage.getItem('_ft');
    const res   = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ newPassword: p1 }) });
    const data  = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Failed to update password.'; err.style.display = 'block'; return; }
    window.location.href = '/app/chat';
  } catch { err.textContent = 'Connection issue — try again.'; err.style.display = 'block'; }
}

async function doForgot() {
  const email = document.getElementById('forgotEmail').value.trim();
  const err   = document.getElementById('forgotErr');
  const ok    = document.getElementById('forgotOk');
  err.style.display = 'none'; ok.style.display = 'none';
  if (!email) { err.textContent = 'Enter your email.'; err.style.display = 'block'; return; }
  try {
    const res  = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Something went wrong.'; err.style.display = 'block'; return; }
    ok.textContent = 'Check your email — a reset link is on the way.'; ok.style.display = 'block';
  } catch { err.textContent = 'Connection issue — try again.'; err.style.display = 'block'; }
}

// Auto-redirect if already logged in
const t = localStorage.getItem('_ft');
if (t) window.location.href = '/app/chat';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
</script>
</body>
</html>`);
});

app.get('/app/chat', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const fakeLink = { label: '', id: 'perm', browserToken: null };
  // Token is loaded from localStorage client-side; serve the shell with no token injected
  res.send(buildChatPage(fakeLink, '__PERM__', null));
});

app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>FELLITO — Epic ATE Support</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
.card{width:100%;max-width:420px;text-align:center;}
.logo{font-size:48px;font-weight:900;color:#00E5FF;letter-spacing:8px;margin-bottom:6px;}
.sub{font-size:12px;color:#8A8AA0;letter-spacing:3px;text-transform:uppercase;margin-bottom:4px;}
.powered{font-size:11px;color:#3A3A5A;margin-bottom:48px;}
.label{font-size:13px;color:#8A8AA0;margin-bottom:12px;line-height:1.6;}
input{width:100%;background:#12121A;border:1px solid #1E1E2E;border-radius:14px;color:#fff;font-size:14px;padding:14px 18px;outline:none;margin-bottom:12px;transition:border .2s;}
input:focus{border-color:#00E5FF;}
input::placeholder{color:#3A3A5A;}
button{width:100%;background:#00E5FF;color:#000;font-size:15px;font-weight:800;letter-spacing:1px;border:none;border-radius:14px;padding:16px;cursor:pointer;transition:opacity .2s;}
button:hover{opacity:.9;}
.err{color:#FF3B5C;font-size:13px;margin-top:12px;display:none;}
.divider{border:none;border-top:1px solid #1E1E2E;margin:32px 0;}
.hint{font-size:12px;color:#3A3A5A;line-height:1.7;}
</style>
</head>
<body>
<div class="card">
  <div class="logo">FELLITO</div>
  <div class="sub">Epic ATE Go-Live Support</div>
  <div class="powered">Powered by Eclat Universe</div>

  <div class="label">Paste your invite link or token below to start your session.</div>
  <input id="tokenInput" placeholder="Paste invite link or token here..." autocomplete="off"/>
  <button onclick="go()">Enter Session →</button>
  <div class="err" id="err">Invalid link. Check your invite email and try again.</div>

  <hr class="divider"/>
  <div class="hint">Don't have a link? Contact your Go-Live admin to receive an invite.</div>
</div>
<script>
  // Auto-redirect if a token is in the URL path already
  const path = window.location.pathname;
  if (path.startsWith('/temp/') || path.startsWith('/t/')) {
    window.location.href = path;
  }

  function go() {
    let val = document.getElementById('tokenInput').value.trim();
    if (!val) return;
    // Extract token from full URL if pasted
    const match = val.match(/\\/temp\\/([a-zA-Z0-9_-]+)/);
    if (match) { window.location.href = '/temp/' + match[1]; return; }
    // Raw token
    if (/^[a-zA-Z0-9_-]{10,}$/.test(val)) { window.location.href = '/temp/' + val; return; }
    document.getElementById('err').style.display = 'block';
  }

  document.getElementById('tokenInput').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
</script>
</body>
</html>`);
});

// ─── Temp password reset (remove after use) ───────────────────────────────────
app.post('/api/auth/reset-pw', async (req, res) => {
  const { secret, email, newPassword } = req.body;
  if (secret !== process.env.OWNER_MAGIC_SECRET) return res.status(403).json({ error: 'Denied' });
  const fs = require('fs'), path = require('path');
  const file = path.join(DATA_DIR, 'users.json');
  const users = JSON.parse(fs.readFileSync(file, 'utf8'));
  const u = users.find(x => x.email.toLowerCase() === email.toLowerCase());
  if (!u) return res.status(404).json({ error: 'User not found' });
  const bcrypt = require('bcryptjs');
  u.passwordHash = await bcrypt.hash(newPassword, 12);
  fs.writeFileSync(file, JSON.stringify(users, null, 2), 'utf8');
  res.json({ ok: true, email: u.email });
});

// ─── Owner Magic Link ─────────────────────────────────────────────────────────
app.get('/owner/:secret', (req, res) => {
  const secret = process.env.OWNER_MAGIC_SECRET;
  if (!secret || req.params.secret !== secret) {
    return res.status(403).send('Access denied.');
  }
  const owner = require('./authEngine').listTeam().find(u => u.role === 'owner');
  if (!owner) return res.status(500).send('Owner account not found.');
  const jwt = signToken({ sub: owner.id, email: owner.email, name: owner.name, role: 'owner' }, '12h');
  res.cookie('_fellito_admin_token', jwt, { httpOnly: false, maxAge: 12 * 60 * 60 * 1000, sameSite: 'strict' });
  res.redirect('/admin/');
});

// ─── Security Flags ───────────────────────────────────────────────────────────
const securityFlags = [];

app.post('/api/security/flag', requireAuth, (req, res) => {
  const { type, detail } = req.body;
  const flag = {
    id: Date.now().toString(),
    type: type || 'unknown',
    detail: detail || '',
    userId: req.user.id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    ts: new Date().toISOString(),
  };
  securityFlags.unshift(flag);
  if (securityFlags.length > 500) securityFlags.pop();
  console.warn('[SECURITY FLAG]', flag);
  res.json({ ok: true });
});

app.get('/api/security/flags', requireOwner, (_req, res) => {
  res.json(securityFlags);
});

app.delete('/api/security/flags', requireOwner, (_req, res) => {
  securityFlags.length = 0;
  res.json({ ok: true });
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', agent: 'FELLITO' }));

// ─── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
  await bootstrapOwner();
  app.listen(PORT, () => {
    console.log(`\nFELLITO backend running on port ${PORT}`);
    console.log(`Admin portal → http://localhost:${PORT}/admin\n`);
  });
})();
