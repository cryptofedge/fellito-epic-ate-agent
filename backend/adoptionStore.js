const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./storagePaths');

const ADOPTION_FILE = path.join(DATA_DIR, 'adoption.json');

const STATUSES = ['confident', 'struggling', 'needs-followup'];

function load() {
  if (!fs.existsSync(ADOPTION_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(ADOPTION_FILE, 'utf8')); } catch { return []; }
}

function save(records) {
  fs.writeFileSync(ADOPTION_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function listAdoption(goLiveId) {
  const all = load();
  return goLiveId ? all.filter(r => r.goLiveId === goLiveId) : all;
}

function upsertAdoption({ goLiveId, userName, department, module, status, notes, consultantName }) {
  const records = load();
  const existing = records.find(r => r.goLiveId === goLiveId && r.userName === userName);
  if (existing) {
    existing.status = status;
    existing.notes = notes ?? existing.notes;
    existing.module = module ?? existing.module;
    existing.department = department ?? existing.department;
    existing.updatedAt = Date.now();
    existing.consultantName = consultantName ?? existing.consultantName;
  } else {
    records.push({
      id: crypto.randomUUID(),
      goLiveId: goLiveId ?? null,
      userName,
      department: department ?? '',
      module: module ?? '',
      status,
      notes: notes ?? '',
      consultantName: consultantName ?? '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  save(records);
  return records.find(r => r.goLiveId === goLiveId && r.userName === userName);
}

function deleteAdoptionRecord(id) {
  const records = load().filter(r => r.id !== id);
  save(records);
}

module.exports = { listAdoption, upsertAdoption, deleteAdoptionRecord, STATUSES };
