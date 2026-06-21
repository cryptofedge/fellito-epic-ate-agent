/**
 * RAG Engine — Lightweight vector store using cosine similarity + TF-IDF-style embeddings.
 * In production, swap the embedding function for the Anthropic Embeddings API or OpenAI
 * to get higher-quality semantic retrieval. For MVP, TF-IDF cosine similarity is fast
 * and works well for structured Go-Live documentation.
 *
 * Document store is in-memory (process lifetime) + flushed to disk as JSON.
 * For multi-server deployment, swap to a real vector DB (Pinecone, Chroma, pgvector).
 */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

// PDF parsing
let pdfParse;
try { pdfParse = require('pdf-parse'); } catch { pdfParse = null; }

const STORE_DIR = path.join(__dirname, 'vector-store');
const STORE_FILE = path.join(STORE_DIR, 'chunks.json');
const CHUNK_SIZE = 600; // characters per chunk
const CHUNK_OVERLAP = 100;

if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });

// In-memory chunk store: { id, docId, filename, sessionId, moduleTag, text, tokens }
let chunks = [];

// Load persisted store on startup
if (fs.existsSync(STORE_FILE)) {
  try {
    chunks = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    console.log(`[RAG] Loaded ${chunks.length} chunks from disk`);
  } catch { chunks = []; }
}

function persist() {
  fs.writeFileSync(STORE_FILE, JSON.stringify(chunks), 'utf8');
}

// ─── Text extraction ──────────────────────────────────────────────────────────
async function extractText(filePath, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf' && pdfParse) {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  // Fallback: read as plain text
  return fs.readFileSync(filePath, 'utf8');
}

// ─── Chunking ─────────────────────────────────────────────────────────────────
function chunkText(text) {
  const result = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    result.push(text.slice(start, end).trim());
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return result.filter((c) => c.length > 50);
}

// ─── TF-IDF tokenizer ────────────────────────────────────────────────────────
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function buildTfVector(tokens) {
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] ?? 0) + 1;
  const total = tokens.length;
  const vec = {};
  for (const [t, f] of Object.entries(freq)) vec[t] = f / total;
  return vec;
}

function cosineSimilarity(a, b) {
  const keysA = Object.keys(a);
  let dot = 0, magA = 0, magB = 0;
  for (const k of keysA) {
    dot += (a[k] ?? 0) * (b[k] ?? 0);
    magA += a[k] ** 2;
  }
  for (const v of Object.values(b)) magB += v ** 2;
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Public API ──────────────────────────────────────────────────────────────
async function ingestDocument(filePath, filename, sessionId, moduleTag) {
  const text = await extractText(filePath, filename);
  const textChunks = chunkText(text);
  const docId = createHash('sha256').update(`${sessionId}:${filename}:${Date.now()}`).digest('hex').slice(0, 16);

  const newChunks = textChunks.map((chunkText, i) => {
    const tokens = tokenize(chunkText);
    return {
      id: `${docId}_${i}`,
      docId,
      filename,
      sessionId,
      moduleTag: moduleTag ?? null,
      text: chunkText,
      tokens: buildTfVector(tokens),
    };
  });

  chunks.push(...newChunks);
  persist();

  return { docId, chunkCount: newChunks.length };
}

async function queryDocuments(question, sessionId, topK = 5) {
  const qTokens = tokenize(question);
  const qVec = buildTfVector(qTokens);

  // Filter to session chunks (plus any global/standby chunks)
  const pool = chunks.filter(
    (c) => c.sessionId === sessionId || c.sessionId === 'standby'
  );

  if (pool.length === 0) return '';

  const scored = pool
    .map((c) => ({ chunk: c, score: cosineSimilarity(qVec, c.tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (scored.length === 0) return '';

  return scored
    .map((s) => `[${s.chunk.filename}${s.chunk.moduleTag ? ` · ${s.chunk.moduleTag}` : ''}]\n${s.chunk.text}`)
    .join('\n\n---\n\n');
}

async function listDocuments(sessionId) {
  const seen = new Set();
  const docs = [];
  for (const c of chunks) {
    if (c.sessionId === sessionId && !seen.has(c.docId)) {
      seen.add(c.docId);
      const docChunks = chunks.filter((x) => x.docId === c.docId);
      docs.push({ id: c.docId, filename: c.filename, chunkCount: docChunks.length });
    }
  }
  return docs;
}

async function deleteDocument(docId) {
  chunks = chunks.filter((c) => c.docId !== docId);
  persist();
}

module.exports = { ingestDocument, queryDocuments, listDocuments, deleteDocument };
