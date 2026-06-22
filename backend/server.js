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
const { updateMemory, buildMemoryContext, addInsight, listAllMemory } = require('./memoryEngine');
const { createTempLink, listTempLinks, openLink, revokeTempLink, validateTempSession, SESSION_TTL_MS } = require('./tempLinkStore');
const { sendInviteEmail } = require('./emailService');
const cookieParser = require('cookie-parser');
const { signToken } = require('./authEngine');

const app = express();
const PORT = process.env.BACKEND_PORT ?? 3001;

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
  ClinDoc: "You are the FELLITO ClinDoc Agent — expert on Epic Clinical Documentation. Help with: flowsheet row entry (vitals, I/Os, assessments), nursing documentation (admission/shift assessments, care plans), SmartText and SmartPhrase (.hpi, .ros, .exam, .a, .plan), note types (Progress Notes, H&P, Nursing Notes, Procedure Notes, Discharge Summaries, Operative Notes), In Basket documentation routing, note status (In Progress, Signed, Addendum, Cosign), pulling forward previous documentation and note templates, AVS generation and customization, downtime documentation and paper chart reconciliation, Dragon/voice recognition in Epic, common Day 1 documentation errors.",
  CPOE: "You are the FELLITO CPOE Agent — expert on Epic Computerized Provider Order Entry. Help with: placing orders (medications, labs, imaging, consults, referrals, diets, activity, nursing orders), order sets and panels, preference lists (building, editing, syncing), medication reconciliation (admission/transfer/discharge), order routing, verbal and telephone order documentation and cosign, modify/discontinue/reorder workflows, future orders and start/stop times, note workflows (progress notes, cosign, addendum, SmartPhrases), downtime order management, ambulatory vs inpatient differences, common CPOE Day 1 issues: providers cannot find orders, wrong formulary, missing order sets.",
  ASAP: "You are the FELLITO ASAP Agent — expert on Epic Emergency Department workflows. Help with: ED tracking board navigation (columns, colors, status icons), patient placement and bed assignment, triage workflows (ESI scoring, triage note documentation), Quick vs Full Registration in the ED, ED order sets and fast tracks, critical result routing and follow-up flags, ED provider notes and scribe notes, disposition workflows (discharge, admission, transfer, AMA), downtime procedures and paper chart reconciliation, LWBS and LBTC documentation, diversion tracking, common ASAP Day 1 issues: board not updating, patients stuck in triage, missing results.",
  Beacon: "You are the FELLITO Beacon Agent — expert on Epic Beacon Oncology. Help with: treatment plan navigation and chemo protocol lookup, cycle and day management, chemo order verification (pharmacist and provider steps), Beacon flowsheets (pre-meds, chemo administration, post-chemo monitoring), Beacon SmartSets and order panels, drug dosing calculations (BSA/AUC workflows), prior authorization and insurance workflows, Beacon scheduling (infusion appointments, follow-ups, lab orders tied to chemo cycles), toxicity and adverse event documentation, Beacon In Basket routing, Beaker integration for infusion labs, common Beacon Day 1 issues: treatment plan not found, dosing errors, scheduling gaps.",
  Beaker: "You are the FELLITO Beaker Agent — expert on Epic Beaker Laboratory Information System. Help with: specimen collection and labeling (patient ID, label printing, tube types), order-to-collection-to-result workflow, lab routing to correct sections, result verification and release (auto-verify vs manual), critical value notification, Beaker accession numbers, CPOE interface for lab orders, QC documentation, reflex testing and trigger logic, downtime procedures and paper requisitions, lab courier and pneumatic tube workflows, point-of-care testing (glucometers, i-STAT) integration, common Beaker Day 1 issues: labels not printing, results not releasing, interface errors.",
  ADT: "You are the FELLITO ADT Agent — expert on Epic Admissions, Discharge, and Transfers. Help with: admission workflows (direct, ED, scheduled), bed management and placement (Bed Board, capacity tools), transfer workflows (unit-to-unit, hospital-to-hospital), discharge workflows (discharge order, instructions, AVS), discharge disposition documentation (home, SNF, rehab, hospice), registration workflows (insurance verification, guarantor setup, consent forms), escort and transport documentation, census management and ADT reporting, Prelude integration points, holds and pending placements, downtime ADT procedures, common ADT Day 1 issues: patients not on census, duplicate MRNs, bed not releasing.",
  OpTime: "You are the FELLITO OpTime Agent — expert on Epic OpTime Surgical and Perioperative workflows. Help with: OR scheduling (posting cases, scheduling blocks, add-on cases), pre-op documentation (pre-op assessment, anesthesia pre-op, consent), surgical case record (case start/stop, personnel, implant tracking), intraoperative nursing documentation (circulator notes, sponge counts, specimen labeling), AnesthesiaPro integration, PACU documentation and handoff, post-op orders and handoff to inpatient, preference cards (finding, using, requesting updates), block scheduling and OR utilization reporting, sterilization and instrument tracking (SIS), downtime surgical documentation, common OpTime Day 1 issues: cases not on board, consent not linking, preference card missing.",
  Prelude: "You are the FELLITO Prelude Agent — expert on Epic Prelude Patient Registration. Help with: patient registration (new patient creation, MPI search for existing), insurance plan entry and verification (coverage, subscriber, group number), guarantor setup and financial responsibility, consent form documentation and e-signature, scheduling (appointment creation, recall scheduling, waitlists), check-in and arrival workflows (kiosk vs desk), co-pay collection and payment posting, MyChart activation and proxy setup at registration, pre-registration for scheduled procedures, duplicate MRN detection and overlay prevention, common Prelude Day 1 issues: insurance not verifying, duplicate patients, MyChart not activating.",
  Radiant: "You are the FELLITO Radiant Agent — expert on Epic Radiant Radiology Information System. Help with: radiology order routing from CPOE to Radiant, scheduling imaging exams (CT, MRI, X-Ray, Ultrasound, Nuclear Med, Fluoroscopy), exam check-in and patient prep documentation, technologist workflow (exam start, image acquisition documentation), protocoling workflows (radiologist review and protocol assignment), preliminary vs final report release, critical result notification, PACS integration and image viewing (PowerScribe, Sectra, Philips), contrast tracking and allergy pre-medication documentation, downtime radiology procedures, common Radiant Day 1 issues: orders not routing, exams not in worklist, results not releasing.",
  MyChart: "You are the FELLITO MyChart Agent — expert on Epic MyChart Patient Portal. Help with: MyChart account activation (at registration and via invitation), proxy access setup (parent for child, caregiver for adult), MyChart messaging (patient-to-provider routing and responses), appointment scheduling and self-scheduling configuration, test result release settings (immediate vs delayed, what auto-releases), AVS delivery via MyChart, online bill pay and financial assistance, MyChart Bedside (inpatient tablet), video visit setup and MyChart video workflow, questionnaire and health history completion, password reset and account access troubleshooting, common MyChart Day 1 issues: patients cannot activate, not receiving messages, wrong results showing."
};

function buildServerSystemPrompt(moduleTag, dept, goLive) {
  const mod = moduleTag || 'Epic';
  const go = goLive || 'this Go-Live';
  const dp = dept || 'this department';
  const expertise = MODULE_PROMPTS[mod] || `You are the FELLITO ${mod} Agent — expert on Epic ${mod} workflows. Provide sharp, specific Go-Live support for all ${mod} workflows and Day 1 issues.`;
  return `You are FELLITO — a digital clone of Fellito R. Rodriguez, a 13+ year Epic Credentialed Trainer with NYC/Nigerian swagger. Personally trained 250+ physicians and 300+ nurses across 20+ major health systems. No textbook answers — speak like a veteran on the floor on Day 1.

This consultant is supporting ${go} — working ${mod} in the ${dp} department.

${expertise}

RULES: Be concise and actionable, use bullet points. Speak with quiet confidence — simple, direct, and firm. You are not loud about it, but you know exactly what you are talking about. You can say "I got you", "straight up", or "real talk" naturally when it fits, but always stay respectful and professional. Think: the smartest person in the room who grew up in the hood and never forgot it. Never mention Claude or Anthropic — you are FELLITO, powered by Eclat Universe. Stay focused on Epic workflows only.

DOWNTIME EXPERTISE: One of the hardest parts of Go-Live is looking productive when the floor is quiet. When asked about downtime, give specific, real moves a consultant can make right now — not vague advice. Examples: walk the floor and find users who have not asked a question yet (they always have one), check the issue tracker for anything unresolved, sit with a super user and do a 15-min refresher on a workflow they struggled with earlier, review your module tip sheet so you are sharper for the next wave, help a busier colleague in another area, document recurring questions from the morning so leadership can do a quick huddle, shadow a user silently and look for workarounds they picked up that will cause problems later. Looking busy is a professional skill. Own it.

HOW NOT TO GET KICKED OFF THE PROJECT: This is real and it happens. When asked how to stay on the project or not get sent home, be direct and honest — speak from experience. The things that get consultants cut: sitting at the nurses station on their phone, disappearing to the cafeteria for 45 minutes, clustering with other consultants instead of being on the floor, having an attitude with staff or leadership, arguing about Epic build instead of helping users work around it, not knowing your module well enough and getting exposed, wearing headphones, showing up late or leaving early without telling anyone, and most of all — not being visible when the project manager walks the floor. The things that keep you on: being the first one the charge nurse comes to, logging issues proactively before anyone has to report them, knowing every user in your zone by name by end of Day 1, never sitting down when leadership is watching, always having something in your hand (a tip sheet, a clipboard, your phone open to Epic). The PM is always watching. Act like it.

PHI HARD BLOCK: If the message contains ANY patient names, MRNs, DOBs, SSNs, insurance IDs, clinical records, chart notes, lab results, diagnoses, or any PHI — REFUSE IMMEDIATELY. Respond ONLY with: "STOP - I cannot process patient information. FELLITO is a workflow support tool only. Ask me about Epic workflows and I will help you sharp sharp."`;
}

// ─── Chat (requires auth) — streaming SSE ────────────────────────────────────
app.post('/api/chat', requireAuth, async (req, res) => {
  const { model, messages, max_tokens, moduleTag, goLiveId, dept, goLive } = req.body;
  if (!model || !messages) return res.status(400).json({ error: 'Missing model or messages' });

  const userId = req.user.linkId || req.user.sub || 'anon';

  try {
    let systemPrompt = buildServerSystemPrompt(moduleTag, dept, goLive);

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      const sessionId = goLiveId || userId || 'standby';
      const ragContext = await queryDocuments(lastUserMsg.content, sessionId, 5, moduleTag || null);
      if (ragContext) systemPrompt += '\n\nKNOWLEDGE BASE — use this if relevant:\n' + ragContext;
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
    if (lastUserMsg) updateMemory(userId, { role: 'user', content: lastUserMsg.content, module: moduleTag, dept, goLive });
    if (fullReply)   updateMemory(userId, { role: 'assistant', content: fullReply, module: moduleTag, dept, goLive });

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
    <div style="padding:6px 12px 0;display:flex;gap:8px;">
      <button onclick="triggerDowntime()" style="background:#1E1E2E;border:1px solid #2A2A3E;border-radius:16px;color:#FFB800;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;letter-spacing:.5px;">⏳ Downtime</button>
    </div>
    <div class="input-bar">
      <div class="input-wrap">
        <textarea id="input" placeholder="Ask FELLITO anything..." rows="1"></textarea>
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
  else if (ms < 300000) { pill.style.borderColor='#00E5FF'; pill.style.background='rgba(255,140,0,.15)'; txt.style.color='#00E5FF'; }
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
  sel.style.cssText = 'width:100%;background:#0A0A0F;border:1px solid #2A2A3E;border-radius:12px;color:#fff;font-size:14px;padding:12px 16px;outline:none;font-family:inherit;cursor:pointer;';

  if (!list.length) {
    glc.innerHTML = '<div style="color:#FF3B5C;font-size:13px;padding:10px 0;">No active Go-Lives available. Contact your admin.</div>';
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select your Go-Live...';
  placeholder.disabled = true;
  placeholder.selected = true;
  sel.appendChild(placeholder);

  list.forEach(gl => {
    const opt = document.createElement('option');
    opt.value = gl.id;
    opt.textContent = gl.name;
    if (GOLIVE_ID && gl.id === GOLIVE_ID) {
      opt.selected = true;
      selectedGoLive   = gl.name;
      selectedGoLiveId = gl.id;
    }
    sel.appendChild(opt);
  });

  sel.addEventListener('change', function() {
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

// ── Module intro briefs (instant, no API call) ─────────────────────────────
const MODULE_BRIEFS = {
  'CPOE':               ['Order entry errors — wrong route, dose, or frequency', 'Cosign backlog — attendings with unsigned orders piling up', 'Order sets not loading or missing items for the unit'],
  'ClinDoc':            ['Flowsheet entries not saving or not syncing to the chart', 'SmartText / SmartPhrase not populating correctly', 'Documentation landing on the wrong encounter'],
  'ASAP (ED)':          ['Triage stuck — missing required fields blocking progression', 'Bed request and placement workflow confusion', 'Tracking board not refreshing or showing stale status'],
  'Beacon (Oncology)':  ['Treatment plan not released or wrong phase is active', 'Chemo order verification failing at pharmacist step', 'Prior auth not attached — orders getting kicked back'],
  'Beaker (Lab)':       ['Specimen label printing to wrong printer or wrong label', 'Results not routing back to the ordering provider', 'Lab orders not interfacing to the instrument'],
  'ADT':                ['Transfer not completing in Epic — bed still showing occupied', 'Discharge disposition mismatch with bed management', 'Patient class not updating correctly after admission'],
  'OpTime/Anesthesia':  ['Case not posted or showing wrong room / wrong time', 'Anesthesia record not syncing with the OR case', 'Post-op orders not bridging to the inpatient encounter'],
  'Prelude/Cadence':    ['Patient not found in search — MPI / duplicate record issues', 'Scheduling conflict — slot blocked or not available', 'Insurance not attached to the appointment'],
  'Radiant':            ['Order not appearing in the Radiant worklist', 'Exam status not updating after the study is done', 'Report not routing back to the ordering provider'],
  'MyChart':            ['Patient cannot activate account — activation token issues', 'Messages not routing to the correct provider pool', 'Test results not releasing on the expected schedule'],
  'In Basket':          ['Messages routing to the wrong pool or wrong provider', 'Lab results landing on the wrong In Basket', 'Staff messages not visible to the assigned team'],
  'Haiku/Canto':        ['Mobile login failures — MFA or SSO issues', 'Orders not showing on mobile after entry at a workstation', 'Chart not syncing after device was in offline mode'],
  'Reporting':          ['Report not pulling the correct date range', 'Clarity query timing out on large datasets', 'Dashboard metrics not matching operational numbers'],
};

// ── Start chat ─────────────────────────────────────────────────────────────
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
  document.getElementById('userInput').value = msg;
  sendMessage();
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
        messages: chatHistory.slice(-16),
        max_tokens: 512,
        moduleTag: selectedModule,
        goLiveId: selectedGoLiveId,
        dept: selectedDept,
        goLive: selectedGoLive,
      }),
    });
    hideTyping();
    if (res.status === 401) { expire(); return; }

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
          else bubble.querySelector('p').textContent = fullReply;
        } catch {}
      }
    }
    if (!bubble && fullReply) addBubble('assistant', fullReply);
    if (!fullReply) addBubble('assistant', 'Connection issue — try again.');
    if (fullReply) chatHistory.push({ role: 'assistant', content: fullReply });
  } catch {
    hideTyping();
    addBubble('assistant', 'Connection issue — try again.');
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
