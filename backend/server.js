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

const app = express();
const PORT = process.env.BACKEND_PORT ?? 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
