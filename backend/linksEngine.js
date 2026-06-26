const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { DATA_DIR } = require('./storagePaths');

const LINKS_FILE = path.join(DATA_DIR, 'links.json');

function loadLinks() {
  if (!fs.existsSync(LINKS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8')); } catch { return []; }
}

function saveLinks(links) {
  fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2), 'utf8');
}

function listLinks() { return loadLinks(); }

function deleteLink(id) {
  const links = loadLinks();
  if (!links.find((l) => l.id === id)) throw new Error('Link not found');
  saveLinks(links.filter((l) => l.id !== id));
}

// Fetch URL content, strip HTML tags, return plain text
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'FELLITO-KnowledgeBot/1.0' } }, (res) => {
      // Follow one redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', (chunk) => { data += chunk; if (data.length > 2_000_000) res.destroy(); });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{3,}/g, '\n\n')
    .trim();
}

async function ingestLink(url, description, moduleTag, ingestDocFn) {
  const links = loadLinks();

  // Add as pending
  const link = {
    id: crypto.randomUUID(),
    url,
    description: description ?? '',
    moduleTag: moduleTag ?? '',
    status: 'pending',
    chunkCount: 0,
    docId: null,
    error: null,
    createdAt: Date.now(),
    indexedAt: null,
  };
  saveLinks([...links, link]);

  try {
    const html = await fetchUrl(url);
    const text = stripHtml(html);

    if (text.length < 100) throw new Error('Page content too short to index');

    // Write to a temp file then ingest via RAG engine
    const tmpPath = path.join(DATA_DIR, `link_${link.id}.txt`);
    fs.writeFileSync(tmpPath, text, 'utf8');

    const effectiveSession = moduleTag ? 'module:' + moduleTag : 'links';
    const result = await ingestDocFn(tmpPath, `[Link] ${description || url}`, effectiveSession, moduleTag);
    fs.unlink(tmpPath, () => {});

    // Update link record
    const updated = loadLinks();
    const idx = updated.findIndex((l) => l.id === link.id);
    if (idx !== -1) {
      updated[idx].status = 'indexed';
      updated[idx].chunkCount = result.chunkCount;
      updated[idx].docId = result.docId;
      updated[idx].indexedAt = Date.now();
      saveLinks(updated);
    }
    return updated[idx] ?? link;
  } catch (err) {
    const updated = loadLinks();
    const idx = updated.findIndex((l) => l.id === link.id);
    if (idx !== -1) {
      updated[idx].status = 'error';
      updated[idx].error = err.message;
      saveLinks(updated);
    }
    throw err;
  }
}

module.exports = { listLinks, ingestLink, deleteLink };
