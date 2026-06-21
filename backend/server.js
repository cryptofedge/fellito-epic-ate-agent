require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk').default;
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ingestDocument, queryDocuments, listDocuments, deleteDocument } = require('./ragEngine');

const app = express();
const PORT = process.env.BACKEND_PORT ?? 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// ─── Chat endpoint ───────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { model, system, messages, max_tokens } = req.body;

  if (!model || !messages) {
    return res.status(400).json({ error: 'Missing model or messages' });
  }

  try {
    const response = await anthropic.messages.create({
      model,
      system,
      messages,
      max_tokens: max_tokens ?? 1024,
    });
    res.json(response);
  } catch (err) {
    console.error('[Chat] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Voice endpoint ──────────────────────────────────────────────────────────
app.post('/api/voice', async (req, res) => {
  const { text, voice_settings, model_id } = req.body;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!voiceId) {
    return res.status(500).json({ error: 'ELEVENLABS_VOICE_ID not configured' });
  }

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
    console.error('[Voice] Error:', err.response?.status, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── RAG: Ingest document ────────────────────────────────────────────────────
app.post('/api/rag/ingest', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { sessionId, moduleTag } = req.body;
  try {
    const result = await ingestDocument(req.file.path, req.file.originalname, sessionId, moduleTag);
    // Clean up temp file
    fs.unlink(req.file.path, () => {});
    res.json(result);
  } catch (err) {
    console.error('[RAG Ingest] Error:', err.message);
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: err.message });
  }
});

// ─── RAG: Query ─────────────────────────────────────────────────────────────
app.post('/api/rag/query', async (req, res) => {
  const { question, sessionId, topK } = req.body;
  try {
    const context = await queryDocuments(question, sessionId, topK ?? 5);
    res.json({ context });
  } catch (err) {
    console.error('[RAG Query] Error:', err.message);
    res.json({ context: '' });
  }
});

// ─── RAG: List docs ──────────────────────────────────────────────────────────
app.get('/api/rag/docs', async (req, res) => {
  const { sessionId } = req.query;
  try {
    const docs = await listDocuments(sessionId);
    res.json(docs);
  } catch (err) {
    res.json([]);
  }
});

// ─── RAG: Delete doc ─────────────────────────────────────────────────────────
app.delete('/api/rag/docs/:docId', async (req, res) => {
  try {
    await deleteDocument(req.params.docId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', agent: 'FELLITO' }));

app.listen(PORT, () => {
  console.log(`FELLITO backend running on port ${PORT}`);
});
