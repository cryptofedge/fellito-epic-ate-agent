const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./storagePaths');

const SHIFTS_FILE = path.join(DATA_DIR, 'shifts.json');

function load() {
  if (!fs.existsSync(SHIFTS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(SHIFTS_FILE, 'utf8')); } catch { return []; }
}

function save(shifts) {
  fs.writeFileSync(SHIFTS_FILE, JSON.stringify(shifts, null, 2), 'utf8');
}

function logShift({ userId, consultantName, consultantEmail, goLive, goLiveId, dept, module, questionsAnswered, issuesEscalated, issues, summary, pmEmail, pmName }) {
  const shifts = load();
  const record = {
    id: crypto.randomUUID(),
    userId: userId || null,
    consultantName: consultantName || consultantEmail || 'Unknown',
    consultantEmail: consultantEmail || '',
    goLive: goLive || 'Unknown',
    goLiveId: goLiveId || null,
    dept: dept || '',
    module: module || '',
    questionsAnswered: Number(questionsAnswered) || 0,
    issuesEscalated: Number(issuesEscalated) || 0,
    issues: issues || [],
    summary: summary || '',
    pmEmail: pmEmail || '',
    pmName: pmName || '',
    date: new Date().toISOString(),
  };
  shifts.push(record);
  save(shifts);
  return record;
}

function listShifts({ userId, goLiveId } = {}) {
  const all = load();
  if (userId) return all.filter(s => s.userId === userId);
  if (goLiveId) return all.filter(s => s.goLiveId === goLiveId);
  return all;
}

function getScorecard() {
  const shifts = load();
  const byUser = {};

  for (const s of shifts) {
    const key = s.userId || s.consultantEmail || s.consultantName;
    if (!byUser[key]) {
      byUser[key] = {
        userId: s.userId,
        name: s.consultantName,
        email: s.consultantEmail,
        shifts: 0,
        questionsAnswered: 0,
        issuesEscalated: 0,
        goLives: new Set(),
        modules: new Set(),
        lastActive: null,
        recentSummaries: [],
      };
    }
    const u = byUser[key];
    u.shifts++;
    u.questionsAnswered += s.questionsAnswered;
    u.issuesEscalated += s.issuesEscalated;
    if (s.goLive) u.goLives.add(s.goLive);
    if (s.module) u.modules.add(s.module);
    if (!u.lastActive || s.date > u.lastActive) u.lastActive = s.date;
    if (s.summary) u.recentSummaries.unshift(s.summary);
  }

  return Object.values(byUser).map(u => ({
    ...u,
    goLives: [...u.goLives],
    modules: [...u.modules],
    recentSummaries: u.recentSummaries.slice(0, 3),
    avgQuestionsPerShift: u.shifts ? Math.round(u.questionsAnswered / u.shifts) : 0,
  })).sort((a, b) => b.questionsAnswered - a.questionsAnswered);
}

module.exports = { logShift, listShifts, getScorecard };
