/**
 * FELLITO Memory Engine
 * Per-user persistent memory — tracks workflow patterns, frequent questions,
 * module usage, and recent exchanges. Injected into every system prompt so
 * FELLITO already knows the user before they say a word.
 */

const fs   = require('fs');
const path = require('path');

const STORE_DIR  = path.join(__dirname, 'data');
const STORE_FILE = path.join(STORE_DIR, 'user-memory.json');
const MAX_RECENT = 30;   // recent messages kept per user
const MAX_INSIGHTS = 50; // extracted insight strings per user

if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });

function load() {
  if (!fs.existsSync(STORE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch { return {}; }
}

function save(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function getMemory(userId) {
  const store = load();
  return store[userId] || {
    userId,
    firstSeen:      Date.now(),
    lastSeen:       Date.now(),
    messageCount:   0,
    modules:        {},   // { ClinDoc: 5, CPOE: 12, ... }
    depts:          {},   // { ICU: 3, ED: 8, ... }
    goLives:        {},   // { "Northwell Go-Live": 4, ... }
    recentMessages: [],   // [{ role, content, ts, module, dept }]
    insights:       [],   // extracted workflow patterns & preferences
    struggledWith:  [],   // topics they asked about 2+ times
  };
}

function updateMemory(userId, { role, content, module, dept, goLive }) {
  const store = load();
  const mem   = store[userId] || getMemory(userId);

  mem.lastSeen    = Date.now();
  mem.messageCount++;

  // Track module usage
  if (module) mem.modules[module] = (mem.modules[module] || 0) + 1;

  // Track dept usage
  if (dept) mem.depts[dept] = (mem.depts[dept] || 0) + 1;

  // Track Go-Live usage
  if (goLive) mem.goLives[goLive] = (mem.goLives[goLive] || 0) + 1;

  // Store recent message
  mem.recentMessages.push({ role, content, ts: Date.now(), module, dept });
  if (mem.recentMessages.length > MAX_RECENT) {
    mem.recentMessages = mem.recentMessages.slice(-MAX_RECENT);
  }

  // Detect repeat questions (same topic asked 2+ times = struggled)
  if (role === 'user') {
    const lc = content.toLowerCase();
    const existing = mem.struggledWith.find(s => similarity(s.topic, lc) > 0.5);
    if (existing) {
      existing.count++;
      existing.lastAsked = Date.now();
    } else {
      mem.struggledWith.push({ topic: lc.slice(0, 120), count: 1, lastAsked: Date.now() });
    }
    // Keep top 20 by count
    mem.struggledWith = mem.struggledWith
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  store[userId] = mem;
  save(store);
  return mem;
}

function addInsight(userId, insight) {
  const store = load();
  const mem   = store[userId] || getMemory(userId);
  if (!mem.insights.includes(insight)) {
    mem.insights.unshift(insight);
    if (mem.insights.length > MAX_INSIGHTS) mem.insights = mem.insights.slice(0, MAX_INSIGHTS);
    store[userId] = mem;
    save(store);
  }
}

// Build the memory context string injected into system prompt
function buildMemoryContext(userId) {
  const mem = getMemory(userId);
  if (mem.messageCount === 0) return '';

  const lines = [];

  // Primary module
  const topModule = topKey(mem.modules);
  const topDept   = topKey(mem.depts);
  const topGoLive = topKey(mem.goLives);

  lines.push(`USER MEMORY — this consultant has used FELLITO ${mem.messageCount} time(s).`);

  if (topModule) lines.push(`Primary module: ${topModule} (${mem.modules[topModule]} sessions)`);
  if (topDept)   lines.push(`Primary department: ${topDept}`);
  if (topGoLive) lines.push(`Primary Go-Live: ${topGoLive}`);

  // All modules they've used
  const allMods = Object.entries(mem.modules).sort((a,b) => b[1]-a[1]).map(([k]) => k);
  if (allMods.length > 1) lines.push(`Also worked in: ${allMods.slice(1).join(', ')}`);

  // Things they've struggled with (asked 2+ times)
  const struggled = mem.struggledWith.filter(s => s.count >= 2).slice(0, 5);
  if (struggled.length) {
    lines.push(`Topics this user has needed help with multiple times:`);
    struggled.forEach(s => lines.push(`  - "${s.topic.slice(0, 80)}" (asked ${s.count}x)`));
  }

  // Recent exchanges (last 6 for context)
  const recent = mem.recentMessages.slice(-6);
  if (recent.length) {
    lines.push(`Recent conversation context:`);
    recent.forEach(m => {
      const prefix = m.role === 'user' ? 'CONSULTANT' : 'FELLITO';
      lines.push(`  ${prefix}: ${m.content.slice(0, 120)}`);
    });
  }

  // Stored insights
  if (mem.insights.length) {
    lines.push(`Known patterns about this user:`);
    mem.insights.slice(0, 10).forEach(i => lines.push(`  - ${i}`));
  }

  return lines.join('\n');
}

// Simple word-overlap similarity (0–1)
function similarity(a, b) {
  const wa = new Set(a.split(/\s+/).filter(w => w.length > 3));
  const wb = new Set(b.split(/\s+/).filter(w => w.length > 3));
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

function topKey(obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function getUserMemory(userId) { return getMemory(userId); }
function listAllMemory() { return load(); }

module.exports = { updateMemory, addInsight, buildMemoryContext, getUserMemory, listAllMemory };
