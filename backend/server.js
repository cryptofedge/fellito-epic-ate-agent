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
const { listLinks, ingestLink, deleteLink } = require('./linksEngine');
const { createTempLink, listTempLinks, openLink, revokeTempLink, validateTempSession, SESSION_TTL_MS } = require('./tempLinkStore');
const { sendInviteEmail } = require('./emailService');
const cookieParser = require('cookie-parser');
const { signToken } = require('./authEngine');

const app = express();
const PORT = process.env.BACKEND_PORT ?? 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Serve the admin portal as a static SPA
app.use('/admin', express.static(path.join(__dirname, 'admin')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 25 * 1024 * 1024 },
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

// ─── Admin: current user ──────────────────────────────────────────────────────
app.get('/api/admin/me', requireAuth, (req, res) => {
  const { id, email, name, role, assignedGoLives } = req.user;
  res.json({ id, email, name, role, assignedGoLives });
});

// ─── Admin: team management (owner only) ──────────────────────────────────────
app.get('/api/admin/team', requireAuth, (_req, res) => {
  res.json(listTeam());
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

// ─── Chat (requires auth) ─────────────────────────────────────────────────────
app.post('/api/chat', requireAuth, async (req, res) => {
  const { model, system, messages, max_tokens } = req.body;
  if (!model || !messages) return res.status(400).json({ error: 'Missing model or messages' });
  try {
    const response = await anthropic.messages.create({ model, system, messages, max_tokens: max_tokens ?? 1024 });
    res.json(response);
  } catch (err) {
    console.error('[Chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Voice (requires auth) ────────────────────────────────────────────────────
app.post('/api/voice', requireAuth, async (req, res) => {
  const { text, voice_settings, model_id } = req.body;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) return res.status(500).json({ error: 'ELEVENLABS_VOICE_ID not configured' });
  try {
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      data: {
        text,
        model_id: model_id ?? 'eleven_multilingual_v2',
        voice_settings: voice_settings ?? { stability: 0.5, similarity_boost: 0.75 },
      },
      responseType: 'arraybuffer',
    });
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(response.data));
  } catch (err) {
    console.error('[Voice]', err.response?.status, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── RAG: Ingest (requires auth) ──────────────────────────────────────────────
app.post('/api/rag/ingest', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { sessionId, moduleTag } = req.body;
  try {
    const result = await ingestDocument(req.file.path, req.file.originalname, sessionId, moduleTag);
    fs.unlink(req.file.path, () => {});
    res.json(result);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('[RAG Ingest]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── RAG: Query (requires auth) ───────────────────────────────────────────────
app.post('/api/rag/query', requireAuth, async (req, res) => {
  const { question, sessionId, topK } = req.body;
  try {
    const context = await queryDocuments(question, sessionId, topK ?? 5);
    res.json({ context });
  } catch (err) {
    res.json({ context: '' });
  }
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
  const { goLiveId, title, description, module, department, severity } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const issue = createIssue({ goLiveId, title, description, module, department, severity, reportedBy: req.user.email });
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

// ─── Temp Invite Links ────────────────────────────────────────────────────────

app.post('/api/temp-links', requireOwner, async (req, res) => {
  try {
    const { label, goLiveId, assignedModules, toEmail } = req.body;
    const link = createTempLink({ label, goLiveId, assignedModules });
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.BACKEND_PORT || 3001}`;
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
    const jwtToken = signToken(
      { sub: `temp_${link.id}`, name: link.label || 'Guest', temp: true, linkId: link.id,
        browserToken: link.browserToken, assignedGoLives: link.goLiveId ? [link.goLiveId] : [] },
      Math.floor(msLeft / 1000) + 's'
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
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.BACKEND_PORT || 3001}`;
  const inviteUrl = `${baseUrl}/admin-temp/${link.token}`;
  res.json({ ...link, inviteUrl, emailSent: !!toEmail, emailError: null });
  if (toEmail) {
    sendInviteEmail({ toEmail, toName: label, inviteUrl, label })
      .catch(err => console.error('[Email] Failed to send admin invite:', err.message));
  }
});

app.get('/api/admin-links', requireOwner, (_req, res) => {
  const links = [...adminLinkStore.values()].map(l => {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.BACKEND_PORT || 3001}`;
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

  const ALL_MODULES = ['ClinDoc','CPOE','ASAP (ED)','Beacon (Oncology)','Beaker (Lab)','ADT','OpTime/Anesthesia','Prelude/Cadence','Radiant','MyChart','In Basket','Haiku/Canto','Reporting'];
  const ALL_DEPTS   = ['ICU','Emergency Department','Med/Surg','Oncology','OR/Surgical','Radiology','Pharmacy','Registration','Labor & Delivery','Pediatrics','PACU','Outpatient Clinic','Blood Bank','Pathology'];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>FELLITO</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{height:100%;background:#050508;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;}

.shell{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#050508;padding:20px;}
.phone{width:100%;max-width:390px;height:min(844px,calc(100vh - 40px));background:#0A0A0F;border-radius:44px;overflow:hidden;display:flex;flex-direction:column;border:1px solid #1E1E2E;box-shadow:0 40px 120px rgba(0,229,255,0.08);position:relative;}

/* status bar */
.status-bar{background:#0A0A0F;padding:12px 24px 6px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.status-time{font-size:15px;font-weight:700;color:#fff;}
.status-right{display:flex;gap:6px;align-items:center;}

/* header */
.header{background:#12121A;padding:10px 16px 12px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #1E1E2E;flex-shrink:0;}
.avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#00E5FF,#0070FF);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#000;flex-shrink:0;}
.header-info{flex:1;min-width:0;}
.header-name{font-size:15px;font-weight:800;color:#00E5FF;letter-spacing:1px;}
.header-sub{font-size:10px;color:#8A8AA0;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.timer-pill{background:rgba(255,184,0,0.15);border:1px solid #FFB800;border-radius:20px;padding:4px 10px;display:flex;align-items:center;gap:4px;flex-shrink:0;}
.timer-text{font-size:12px;font-weight:800;color:#FFB800;font-family:'Courier New',monospace;}

/* ── SCREENS ── */
.screen{display:none;flex:1;flex-direction:column;overflow:hidden;}
.screen.active{display:flex;}

/* welcome screen */
.welcome-body{flex:1;overflow-y:auto;padding:24px 20px;display:flex;flex-direction:column;gap:16px;}
.welcome-body::-webkit-scrollbar{width:0;}
.golive-card{background:#12121A;border:1px solid #00E5FF;border-radius:16px;padding:18px;}
.golive-tag{font-size:10px;color:#00E5FF;font-weight:700;letter-spacing:2px;margin-bottom:6px;}
.golive-name{font-size:17px;font-weight:800;color:#fff;margin-bottom:4px;}
.golive-dates{font-size:12px;color:#8A8AA0;}
.section-title{font-size:11px;color:#8A8AA0;font-weight:700;letter-spacing:2px;margin-bottom:10px;}
.chip-grid{display:flex;flex-wrap:wrap;gap:8px;}
.chip{background:#12121A;border:1px solid #1E1E2E;border-radius:20px;padding:8px 14px;font-size:13px;color:#fff;cursor:pointer;transition:all .15s;}
.chip:active,.chip.selected{background:#00E5FF;color:#000;border-color:#00E5FF;font-weight:700;}
.welcome-footer{background:#12121A;border-top:1px solid #1E1E2E;padding:14px 20px;flex-shrink:0;padding-bottom:max(14px,env(safe-area-inset-bottom));}
.start-btn{width:100%;background:#00E5FF;color:#000;font-size:15px;font-weight:800;border:none;border-radius:14px;padding:14px;cursor:pointer;letter-spacing:1px;transition:opacity .15s;}
.start-btn:disabled{opacity:.4;cursor:not-allowed;}

/* chat screen */
.messages{flex:1;overflow-y:auto;padding:16px 12px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;}
.messages::-webkit-scrollbar{width:0;}
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
.input-bar{background:#12121A;border-top:1px solid #1E1E2E;padding:10px 12px;display:flex;align-items:flex-end;gap:8px;flex-shrink:0;padding-bottom:max(10px,env(safe-area-inset-bottom));}
.input-wrap{flex:1;background:#0A0A0F;border:1px solid #1E1E2E;border-radius:22px;padding:10px 16px;}
textarea{width:100%;background:transparent;border:none;outline:none;color:#fff;font-size:14px;resize:none;max-height:100px;font-family:inherit;line-height:1.4;}
textarea::placeholder{color:#8A8AA0;}
.send-btn{width:40px;height:40px;border-radius:50%;background:#00E5FF;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.send-btn svg{fill:#000;}
.send-btn:disabled{background:#1E1E2E;cursor:not-allowed;}
.send-btn:disabled svg{fill:#8A8AA0;}
.mic-btn{width:40px;height:40px;border-radius:50%;background:#1E1E2E;border:1px solid #2A2A3E;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;}
.mic-btn.listening{background:#FF3B5C;border-color:#FF3B5C;animation:pulse .8s infinite;}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,59,92,.4);}50%{box-shadow:0 0 0 8px rgba(255,59,92,0);}}

/* expired overlay */
.expired-overlay{display:none;position:absolute;inset:0;background:rgba(10,10,15,.97);border-radius:44px;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:32px;text-align:center;z-index:100;}
.expired-overlay.show{display:flex;}

@media(max-width:430px){
  .shell{padding:0;background:#0A0A0F;}
  .phone{max-width:100%;height:100vh;border-radius:0;border:none;}
  .expired-overlay{border-radius:0;}
}
</style>
</head>
<body>
<div class="shell"><div class="phone" id="phone">

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
    <div class="avatar">F</div>
    <div class="header-info">
      <div class="header-name">FELLITO</div>
      <div class="header-sub" id="headerSub">${name} · Epic ATE Support</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button onclick="openNearby()" title="What's nearby?" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:20px;color:#00E5FF;font-size:11px;font-weight:700;padding:5px 10px;cursor:pointer;letter-spacing:.5px;display:flex;align-items:center;gap:5px;">
        📍 Nearby
      </button>
      <div class="timer-pill">
        <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.5" stroke="#FFB800" stroke-width="1" fill="none"/><path d="M5 2.5V5l1.5 1.5" stroke="#FFB800" stroke-width="1" stroke-linecap="round"/></svg>
        <span class="timer-text" id="countdown">10:00</span>
      </div>
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
          `<button onclick="fetchNearby('${cat}')" id="ncat${i}" style="background:#0A0A0F;border:1px solid #2A2A3E;border-radius:20px;color:#8A8AA0;font-size:12px;font-weight:600;padding:6px 14px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .2s;">${cat}</button>`
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
      <!-- PHI Warning -->
      <div style="background:rgba(255,59,92,.08);border:2px solid #FF3B5C;border-radius:14px;padding:16px;">
        <div style="font-size:12px;font-weight:900;color:#FF3B5C;letter-spacing:2px;margin-bottom:8px;">⛔ PHI STRICTLY PROHIBITED</div>
        <div style="font-size:12px;color:#fff;line-height:1.7;">FELLITO <strong>never</strong> sees or processes:</div>
        <ul style="margin:6px 0 8px 16px;font-size:12px;color:#FF3B5C;font-weight:700;line-height:2;">
          <li>Patient names, MRNs, DOBs, SSNs</li>
          <li>Clinical records or charts</li>
          <li>Any PHI in any form</li>
        </ul>
        <div style="font-size:11px;color:#FF3B5C;font-weight:800;letter-spacing:1px;">ANY SUCH INFORMATION WILL BE IMMEDIATELY REJECTED.</div>
      </div>

      <div>
        <div class="section-title">SELECT YOUR GO-LIVE</div>
        <div class="chip-grid" id="goLiveChips"><div style="color:#8A8AA0;font-size:13px;">Loading Go-Lives...</div></div>
      </div>

      <div>
        <div class="section-title">SELECT YOUR MODULE</div>
        <div class="chip-grid" id="moduleChips"></div>
      </div>

      <div>
        <div class="section-title">SELECT YOUR DEPARTMENT</div>
        <div class="chip-grid" id="deptChips"></div>
      </div>
    </div>
    <div class="welcome-footer">
      <button class="start-btn" id="startBtn" disabled onclick="startChat()">Select module & department to continue</button>
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
    <div class="input-bar">
      <button class="mic-btn" id="micBtn" onclick="toggleMic()" title="Hold to speak">
        <svg id="micIcon" width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 17.93V21H9v2h6v-2h-2v-2.07A8 8 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93z"/></svg>
      </button>
      <div class="input-wrap">
        <textarea id="input" placeholder="Ask Fellito or tap mic..." rows="1"></textarea>
      </div>
      <button class="send-btn" id="sendBtn" onclick="sendMessage()">
        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
      </button>
    </div>
  </div>

  <!-- Expired overlay -->
  <div class="expired-overlay" id="expiredOverlay">
    <div style="font-size:48px;">⛔</div>
    <div style="font-size:20px;font-weight:900;color:#FF3B5C;">Session Expired</div>
    <div style="font-size:13px;color:#8A8AA0;line-height:1.6;">Your 10-minute access window has ended.<br><br>Contact your administrator for a new invite link.</div>
  </div>

</div></div>

<script>
const TOKEN = '${jwtToken}';
const SESSION_EXPIRES_AT = ${link.sessionExpiresAt};
const GOLIVE_ID = '${link.goLiveId || ''}';
const USER_NAME = '${name}';
const ALL_MODULES = ${JSON.stringify(ALL_MODULES)};
const ALL_DEPTS   = ${JSON.stringify(ALL_DEPTS)};

let selectedGoLive   = '';
let selectedGoLiveId = GOLIVE_ID || '';
let selectedModule = '';
let selectedDept   = '';
let chatHistory    = [];
let expired        = false;
let recognition    = null;
let isListening    = false;
let currentAudio   = null;

// ── Clock ──────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
}
updateClock(); setInterval(updateClock, 10000);

// ── Countdown ──────────────────────────────────────────────────────────────
function updateTimer() {
  const ms = SESSION_EXPIRES_AT - Date.now();
  if (ms <= 0) { expire(); return; }
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2,'0');
  document.getElementById('countdown').textContent = m + ':' + s;
  const pill = document.querySelector('.timer-pill');
  const txt  = document.getElementById('countdown');
  if (ms < 120000)      { pill.style.borderColor='#FF3B5C'; pill.style.background='rgba(255,59,92,.15)'; txt.style.color='#FF3B5C'; }
  else if (ms < 300000) { pill.style.borderColor='#FF8C00'; pill.style.background='rgba(255,140,0,.15)'; txt.style.color='#FF8C00'; }
}
updateTimer(); setInterval(updateTimer, 1000);

function expire() {
  if (expired) return; expired = true;
  document.getElementById('expiredOverlay').classList.add('show');
  document.getElementById('sendBtn').disabled = true;
  document.getElementById('input').disabled   = true;
}

// ── Load Go-Live info + render all selection chips ─────────────────────────
async function loadGoLive() {
  // Render modules and depts immediately — never block on Go-Live fetch
  renderModules();
  renderDepts();

  // Fetch Go-Lives with a 5s timeout so it never hangs forever
  let lives = [];
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/golives', { headers: { Authorization: 'Bearer ' + TOKEN }, signal: controller.signal });
    clearTimeout(tid);
    if (res.ok) lives = await res.json();
  } catch {}

  // Render Go-Live dropdown
  const glc = document.getElementById('goLiveChips');
  glc.innerHTML = '';
  const active = lives.filter(g => g.active);
  const list   = active.length ? active : lives;

  const sel = document.createElement('select');
  sel.style.cssText = 'width:100%;background:#0A0A0F;border:1px solid #2A2A3E;border-radius:12px;color:#fff;font-size:14px;padding:12px 16px;outline:none;font-family:inherit;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%238A8AA0\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 16px center;';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = list.length ? 'Select your Go-Live...' : 'No active Go-Lives — type name below';
  placeholder.disabled = true;
  placeholder.selected = true;
  sel.appendChild(placeholder);

  list.forEach(gl => {
    const opt = document.createElement('option');
    opt.value = gl.id;
    opt.textContent = gl.name + (gl.startDate ? '  (' + gl.startDate + ')' : '');
    if (GOLIVE_ID && gl.id === GOLIVE_ID) {
      opt.selected = true;
      selectedGoLive   = gl.name;
      selectedGoLiveId = gl.id;
    }
    sel.appendChild(opt);
  });

  // Always add a "Other / Manual entry" option
  const other = document.createElement('option');
  other.value = '__other__';
  other.textContent = '✏️  Other — enter manually';
  sel.appendChild(other);

  sel.addEventListener('change', function() {
    if (this.value === '__other__') {
      glc.innerHTML = '';
      const inp = document.createElement('input');
      inp.placeholder = 'Type your Go-Live name...';
      inp.style.cssText = 'width:100%;background:#0A0A0F;border:1px solid #00E5FF;border-radius:12px;color:#fff;font-size:14px;padding:12px 16px;outline:none;font-family:inherit;';
      glc.appendChild(inp);
      inp.focus();
      inp.addEventListener('input', function() {
        selectedGoLive   = this.value.trim();
        selectedGoLiveId = 'manual';
        checkReady();
      });
      return;
    }
    const chosen = list.find(g => g.id === this.value);
    if (chosen) {
      selectedGoLive   = chosen.name;
      selectedGoLiveId = chosen.id;
      checkReady();
    }
  });

  glc.appendChild(sel);
  if (selectedGoLive) checkReady();
}

function renderModules() {
  const mc = document.getElementById('moduleChips');
  mc.innerHTML = '';
  ALL_MODULES.forEach(m => {
    const c = document.createElement('div');
    c.className = 'chip'; c.textContent = m;
    c.onclick = () => {
      mc.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
      selectedModule = m;
      checkReady();
    };
    mc.appendChild(c);
  });
}

function renderDepts() {
  const dc = document.getElementById('deptChips');
  dc.innerHTML = '';
  ALL_DEPTS.forEach(d => {
    const c = document.createElement('div');
    c.className = 'chip'; c.textContent = d;
    c.onclick = () => {
      dc.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
      selectedDept = d;
      checkReady();
    };
    dc.appendChild(c);
  });
}

function checkReady() {
  const btn = document.getElementById('startBtn');
  if (selectedGoLive && selectedModule && selectedDept) {
    btn.disabled = false;
    btn.textContent = 'Start Session with Fellito →';
  } else {
    btn.disabled = true;
    btn.textContent = 'Select Go-Live, module & department';
  }
}

// ── Start chat ─────────────────────────────────────────────────────────────
async function startChat() {
  document.getElementById('screen-welcome').classList.remove('active');
  document.getElementById('screen-chat').classList.add('active');
  document.getElementById('ctxGoLive').textContent = selectedGoLive || '—';
  document.getElementById('ctxModule').textContent = selectedModule;
  document.getElementById('ctxDept').textContent   = selectedDept;
  document.getElementById('headerSub').textContent = selectedGoLive ? selectedGoLive.split('—')[0].trim() + ' · ' + selectedModule : selectedModule + ' · ' + selectedDept;
  document.getElementById('input').focus();

  showTyping();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: 'Introduce yourself and orient me for my shift.' }],
        max_tokens: 400,
      }),
    });
    hideTyping();
    if (res.status === 401) { expire(); return; }
    const data = await res.json();
    const reply = data.content?.[0]?.text ?? "Yo! I'm FELLITO. No wahala — I got you. What do you need?";
    addBubble('assistant', reply);
    speakReply(reply);
    chatHistory.push({ role: 'user', content: 'Introduce yourself and orient me for my shift.' });
    chatHistory.push({ role: 'assistant', content: reply });
  } catch {
    hideTyping();
    addBubble('assistant', "Yo! I'm FELLITO — your Epic ATE Go-Live support. No wahala, I got you. What's the issue?");
  }
}

function buildSystemPrompt() {
  return \`You are FELLITO — a digital clone of Fellito R. Rodriguez, a 13+ year Epic ATE Go-Live consultant with NYC/Nigerian swagger. You speak from lived experience — you have personally trained 250+ physicians and 300+ nurses across 20+ major health systems including Northwell Health, MSK Cancer Center, Columbia/NYP, Methodist Le Bonheur, Montefiore, and many more.

This consultant is supporting the \${selectedGoLive || 'current Go-Live'} — working the \${selectedModule} module in the \${selectedDept} department. Give them sharp, specific, real-world advice about Epic workflows for their exact context. No textbook answers — speak like a veteran consultant who has been elbow-to-elbow on the floor on Go-Live day.

Rules:
- Keep responses concise and actionable — bullet points where helpful
- Use your voice: "no wahala", "sharp sharp", "I got you", NYC/Nigerian expressions where natural
- Never mention Claude or Anthropic — you are FELLITO, powered by Eclat Universe
- If they ask something outside Epic/EHR workflows, redirect back to Go-Live support

🚨 PHI HARD BLOCK — NON-NEGOTIABLE:
If the user's message contains or appears to contain ANY of the following, REFUSE IMMEDIATELY and do not engage with the content:
- Patient names, MRNs, DOBs, SSNs, insurance IDs, or any patient identifiers
- Clinical records, chart notes, lab results, medication lists, or diagnoses
- Any Protected Health Information (PHI) in any form

When PHI is detected, respond ONLY with:
"⛔ STOP — I cannot process patient information. FELLITO is a workflow support tool only. Never enter patient names, MRNs, charts, or any PHI here. Ask me about Epic workflows and I'll help you sharp sharp."\`;
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

// ── Voice output (ElevenLabs) ──────────────────────────────────────────────
async function speakReply(text) {
  try {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.play().catch(() => {});
    currentAudio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; };
  } catch {}
}

// ── Voice input (Web Speech API) ───────────────────────────────────────────
function toggleMic() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Voice input is not supported in this browser. Try Chrome.');
    return;
  }
  if (isListening) { recognition?.stop(); return; }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    document.getElementById('micBtn').classList.add('listening');
  };
  recognition.onend = () => {
    isListening = false;
    document.getElementById('micBtn').classList.remove('listening');
  };
  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    const ta = document.getElementById('input');
    ta.value = transcript;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
    sendMessage();
  };
  recognition.onerror = () => {
    isListening = false;
    document.getElementById('micBtn').classList.remove('listening');
  };
  recognition.start();
}

// ── Chat helpers ───────────────────────────────────────────────────────────
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function addBubble(role, text) {
  const el = document.createElement('div');
  el.className = 'bubble ' + role;
  if (role === 'assistant') el.innerHTML = '<div class="sender">FELLITO</div>' + escHtml(text).replace(/\\n/g,'<br>');
  else el.textContent = text;
  document.getElementById('messages').appendChild(el);
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
  if (expired) return;
  const text = ta.value.trim(); if (!text) return;
  if (Date.now() >= SESSION_EXPIRES_AT) { expire(); return; }

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
        model: 'claude-sonnet-4-6',
        system: buildSystemPrompt(),
        messages: chatHistory.slice(-16),
        max_tokens: 512,
      }),
    });
    hideTyping();
    if (res.status === 401) { expire(); return; }
    const data = await res.json();
    const reply = data.content?.[0]?.text ?? 'No wahala — try again.';
    addBubble('assistant', reply);
    speakReply(reply);
    chatHistory.push({ role: 'assistant', content: reply });
  } catch {
    hideTyping();
    addBubble('assistant', 'Wahala with the connection. Check your network and try again.');
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

// ─── TTS proxy (ElevenLabs) ───────────────────────────────────────────────────
app.post('/api/tts', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const apiKey  = process.env.ELEVENLABS_API_KEY;
  if (!voiceId || !apiKey) return res.status(503).json({ error: 'TTS not configured' });
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: text.slice(0, 800), model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!r.ok) return res.status(502).json({ error: 'TTS upstream error' });
    res.set('Content-Type', 'audio/mpeg');
    r.body.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Root — Consultant entry page ─────────────────────────────────────────────
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
.logo{font-size:48px;font-weight:900;color:#FF8C00;letter-spacing:8px;margin-bottom:6px;}
.sub{font-size:12px;color:#8A8AA0;letter-spacing:3px;text-transform:uppercase;margin-bottom:4px;}
.powered{font-size:11px;color:#3A3A5A;margin-bottom:48px;}
.label{font-size:13px;color:#8A8AA0;margin-bottom:12px;line-height:1.6;}
input{width:100%;background:#12121A;border:1px solid #1E1E2E;border-radius:14px;color:#fff;font-size:14px;padding:14px 18px;outline:none;margin-bottom:12px;transition:border .2s;}
input:focus{border-color:#FF8C00;}
input::placeholder{color:#3A3A5A;}
button{width:100%;background:#FF8C00;color:#000;font-size:15px;font-weight:800;letter-spacing:1px;border:none;border-radius:14px;padding:16px;cursor:pointer;transition:opacity .2s;}
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
  <div class="hint">Don't have a link? Contact your Go-Live admin to receive an invite.<br/><br/>Sessions are device-locked and expire after 10 minutes.</div>
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
