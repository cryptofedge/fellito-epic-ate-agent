const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./storagePaths');

const ISSUES_FILE = path.join(DATA_DIR, 'issues.json');

function load() {
  if (!fs.existsSync(ISSUES_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf8')); } catch { return []; }
}

function save(issues) {
  fs.writeFileSync(ISSUES_FILE, JSON.stringify(issues, null, 2), 'utf8');
}

function listIssues(goLiveId) {
  const all = load();
  return goLiveId ? all.filter((i) => i.goLiveId === goLiveId) : all;
}

function createIssue({ goLiveId, title, description, module, department, severity, reportedBy }) {
  const issues = load();
  const issue = {
    id: crypto.randomUUID(),
    goLiveId: goLiveId ?? null,
    title,
    description,
    module: module ?? '',
    department: department ?? '',
    severity: severity ?? 'medium', // low | medium | high | critical
    status: 'open',                  // open | in-progress | resolved
    escalationTier: null,
    resolution: '',
    reportedBy: reportedBy ?? '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    resolvedAt: null,
  };
  save([...issues, issue]);
  return issue;
}

function updateIssue(id, updates) {
  const issues = load();
  const idx = issues.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error('Issue not found');
  const allowed = ['title', 'description', 'module', 'department', 'severity', 'status', 'escalationTier', 'resolution'];
  for (const key of allowed) {
    if (key in updates) issues[idx][key] = updates[key];
  }
  issues[idx].updatedAt = Date.now();
  if (updates.status === 'resolved' && !issues[idx].resolvedAt) {
    issues[idx].resolvedAt = Date.now();
  }
  save(issues);
  return issues[idx];
}

function deleteIssue(id) {
  const issues = load();
  if (!issues.find((i) => i.id === id)) throw new Error('Issue not found');
  save(issues.filter((i) => i.id !== id));
}

function generateReport(goLiveId) {
  const issues = listIssues(goLiveId);
  const total = issues.length;
  const open = issues.filter((i) => i.status === 'open').length;
  const inProgress = issues.filter((i) => i.status === 'in-progress').length;
  const resolved = issues.filter((i) => i.status === 'resolved').length;

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  issues.forEach((i) => { if (i.severity in bySeverity) bySeverity[i.severity]++; });

  const byModule = {};
  issues.forEach((i) => {
    const key = i.module || 'General';
    byModule[key] = (byModule[key] || 0) + 1;
  });

  const byDept = {};
  issues.forEach((i) => {
    if (i.department) byDept[i.department] = (byDept[i.department] || 0) + 1;
  });

  const avgResolutionMs = (() => {
    const resolved_issues = issues.filter((i) => i.resolvedAt);
    if (!resolved_issues.length) return null;
    const total_ms = resolved_issues.reduce((sum, i) => sum + (i.resolvedAt - i.createdAt), 0);
    return Math.round(total_ms / resolved_issues.length / 60000); // in minutes
  })();

  return {
    goLiveId,
    generatedAt: Date.now(),
    summary: { total, open, inProgress, resolved },
    bySeverity,
    byModule,
    byDepartment: byDept,
    avgResolutionMinutes: avgResolutionMs,
    issues,
  };
}

module.exports = { listIssues, createIssue, updateIssue, deleteIssue, generateReport };
