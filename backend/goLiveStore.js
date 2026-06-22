/**
 * Go-Live event store — persists events to backend/data/golives.json.
 * Owners can create/delete. Contributors are assigned per-event.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'golives.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  if (!fs.existsSync(FILE)) return [];
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return []; }
}

function save(events) {
  fs.writeFileSync(FILE, JSON.stringify(events, null, 2), 'utf8');
}

function listGoLives(user) {
  const all = load();
  if (user.role === 'owner') return all;
  if (user.temp) return all.filter((e) => e.active);
  const assigned = user.assignedGoLives || [];
  if (assigned.length === 0) return all.filter((e) => e.active);
  return all.filter((e) => assigned.includes(e.id));
}

function createGoLive({ name, startDate, endDate, modules, createdBy }) {
  const events = load();
  const event = {
    id: crypto.randomUUID(),
    name,
    startDate,
    endDate: endDate ?? '',
    modules: modules ?? [],
    createdBy,
    createdAt: Date.now(),
    active: false,
  };
  save([...events, event]);
  return event;
}

function updateGoLive(id, updates) {
  const events = load();
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('Go-Live not found');
  const allowed = ['name', 'startDate', 'endDate', 'modules', 'active'];
  for (const k of allowed) {
    if (k in updates) events[idx][k] = updates[k];
  }
  save(events);
  return events[idx];
}

function deleteGoLive(id) {
  const events = load();
  if (!events.find((e) => e.id === id)) throw new Error('Go-Live not found');
  save(events.filter((e) => e.id !== id));
}

function getGoLive(id) {
  return load().find((e) => e.id === id);
}

module.exports = { listGoLives, createGoLive, updateGoLive, deleteGoLive, getGoLive };
