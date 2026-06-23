/**
 * FELLITO Memory Engine
 * Per-user persistent memory — tracks workflow patterns, frequent questions,
 * module usage, Go-Live session journals, and relationship context.
 * Injected into every system prompt so FELLITO already knows the user.
 */

const fs   = require('fs');
const path = require('path');

const STORE_DIR  = path.join(__dirname, 'data');
const STORE_FILE = path.join(STORE_DIR, 'user-memory.json');
const MAX_RECENT = 30;
const MAX_INSIGHTS = 50;
const MAX_JOURNALS = 20; // keep last 20 Go-Live session journals per user

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
    name:           null,
    firstSeen:      Date.now(),
    lastSeen:       Date.now(),
    messageCount:   0,
    modules:        {},
    depts:          {},
    goLives:        {},
    recentMessages: [],
    insights:       [],
    struggledWith:  [],
    journals:       [], // Go-Live session journals
    currentSession: null, // active session being tracked
  };
}

function updateMemory(userId, { role, content, module, dept, goLive, userName }) {
  const store = load();
  const mem   = store[userId] || getMemory(userId);

  mem.lastSeen    = Date.now();
  mem.messageCount++;
  if (userName && !mem.name) mem.name = userName;

  if (module) mem.modules[module] = (mem.modules[module] || 0) + 1;
  if (dept)   mem.depts[dept]     = (mem.depts[dept] || 0) + 1;
  if (goLive) mem.goLives[goLive] = (mem.goLives[goLive] || 0) + 1;

  mem.recentMessages.push({ role, content, ts: Date.now(), module, dept });
  if (mem.recentMessages.length > MAX_RECENT) {
    mem.recentMessages = mem.recentMessages.slice(-MAX_RECENT);
  }

  // Track what they struggled with (repeat questions)
  if (role === 'user') {
    const lc = content.toLowerCase();
    const existing = mem.struggledWith.find(s => similarity(s.topic, lc) > 0.5);
    if (existing) {
      existing.count++;
      existing.lastAsked = Date.now();
    } else {
      mem.struggledWith.push({ topic: lc.slice(0, 120), count: 1, lastAsked: Date.now() });
    }
    mem.struggledWith = mem.struggledWith.sort((a, b) => b.count - a.count).slice(0, 20);
  }

  // Update or create current session tracker
  if (!mem.currentSession) {
    mem.currentSession = {
      startedAt: Date.now(),
      module: module || null,
      dept: dept || null,
      goLive: goLive || null,
      issueCount: 0,
      topIssues: [],
      messageCount: 0,
    };
  }
  mem.currentSession.messageCount++;
  if (module && !mem.currentSession.module) mem.currentSession.module = module;
  if (dept && !mem.currentSession.dept) mem.currentSession.dept = dept;
  if (goLive && !mem.currentSession.goLive) mem.currentSession.goLive = goLive;

  // Capture user questions as issues for the journal
  if (role === 'user' && content.trim().length > 10) {
    mem.currentSession.issueCount++;
    if (mem.currentSession.topIssues.length < 10) {
      mem.currentSession.topIssues.push(content.slice(0, 150));
    }
  }

  store[userId] = mem;
  save(store);
  return mem;
}

// Called when a user ends their session (logout, /api/session/close)
function closeSession(userId) {
  const store = load();
  const mem   = store[userId];
  if (!mem || !mem.currentSession) return null;

  const session = mem.currentSession;
  session.endedAt = Date.now();
  session.durationMin = Math.round((session.endedAt - session.startedAt) / 60000);

  // Save to journal
  if (!mem.journals) mem.journals = [];
  mem.journals.unshift(session);
  if (mem.journals.length > MAX_JOURNALS) mem.journals = mem.journals.slice(0, MAX_JOURNALS);

  mem.currentSession = null;
  store[userId] = mem;
  save(store);
  return session;
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

function buildMemoryContext(userId) {
  const mem = getMemory(userId);
  if (mem.messageCount === 0) return '';

  const lines = [];
  const firstName = mem.name ? mem.name.split(' ')[0] : null;

  lines.push(`USER MEMORY — this consultant has used FELLITO ${mem.messageCount} time(s).`);
  if (firstName) lines.push(`Their name: ${firstName}`);

  const topModule = topKey(mem.modules);
  const topDept   = topKey(mem.depts);
  const topGoLive = topKey(mem.goLives);

  if (topModule) lines.push(`Primary module: ${topModule} (${mem.modules[topModule]} sessions)`);
  if (topDept)   lines.push(`Primary department: ${topDept}`);
  if (topGoLive) lines.push(`Primary Go-Live: ${topGoLive}`);

  const allMods = Object.entries(mem.modules).sort((a,b) => b[1]-a[1]).map(([k]) => k);
  if (allMods.length > 1) lines.push(`Also worked: ${allMods.slice(1).join(', ')}`);

  // Last Go-Live session journal
  if (mem.journals && mem.journals.length > 0) {
    const last = mem.journals[0];
    const when = formatTimeAgo(last.endedAt);
    lines.push(`LAST SESSION — ${when}`);
    if (last.goLive) lines.push(`  Go-Live: ${last.goLive}`);
    if (last.module) lines.push(`  Module: ${last.module}`);
    if (last.dept)   lines.push(`  Department: ${last.dept}`);
    if (last.durationMin) lines.push(`  Duration: ${last.durationMin} min`);
    if (last.issueCount)  lines.push(`  Issues handled: ${last.issueCount}`);
    if (last.topIssues && last.topIssues.length) {
      lines.push(`  What the unit was dealing with:`);
      last.topIssues.slice(0, 5).forEach(q => lines.push(`    - "${q.slice(0, 100)}"`));
    }
    // Show pattern across last 3 sessions
    if (mem.journals.length >= 3) {
      const recent3 = mem.journals.slice(0, 3);
      const recMods = [...new Set(recent3.map(j => j.module).filter(Boolean))];
      if (recMods.length) lines.push(`Recent modules across last 3 sessions: ${recMods.join(', ')}`);
    }
  }

  // Recurring struggles
  const struggled = mem.struggledWith.filter(s => s.count >= 2).slice(0, 5);
  if (struggled.length) {
    lines.push(`Topics this consultant has needed help with multiple times:`);
    struggled.forEach(s => lines.push(`  - "${s.topic.slice(0, 80)}" (${s.count}x)`));
  }

  // Recent conversation context
  const recent = mem.recentMessages.slice(-6);
  if (recent.length) {
    lines.push(`Recent conversation context:`);
    recent.forEach(m => {
      const prefix = m.role === 'user' ? 'CONSULTANT' : 'FELLITO';
      lines.push(`  ${prefix}: ${m.content.slice(0, 120)}`);
    });
  }

  if (mem.insights.length) {
    lines.push(`Known patterns about this consultant:`);
    mem.insights.slice(0, 10).forEach(i => lines.push(`  - ${i}`));
  }

  // Relationship instruction for FELLITO
  lines.push(`RELATIONSHIP INSTRUCTION: Use this history naturally. Reference their last Go-Live when relevant. If they struggled with something before, acknowledge it warmly. Greet them like a colleague you know — not a stranger. Say their first name occasionally. Keep it real, not robotic.`);

  return lines.join('\n');
}

function formatTimeAgo(ts) {
  if (!ts) return 'unknown';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins} min ago`;
  if (hrs < 24)  return `${hrs} hour(s) ago`;
  return `${days} day(s) ago`;
}

function similarity(a, b) {
  const wa = new Set(a.split(/\s+/).filter(w => w.length > 3));
  const wb = new Set(b.split(/\s+/).filter(w => w.length > 3));
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

function topKey(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function getUserMemory(userId) { return getMemory(userId); }
function listAllMemory() { return load(); }

module.exports = { updateMemory, addInsight, buildMemoryContext, closeSession, getUserMemory, listAllMemory };
