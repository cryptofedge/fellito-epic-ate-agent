const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./storagePaths');

const FILE = path.join(DATA_DIR, 'temp_links.json');

const LINK_TTL_MS    = 30 * 24 * 60 * 60 * 1000; // 30 days to first open
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;        // 8 hours of chat after opening

const PURGE_AFTER_MS = 2 * 60 * 60 * 1000; // keep expired/revoked for 2h then drop

function load() {
  if (!fs.existsSync(FILE)) return [];
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}
function save(links) {
  const now = Date.now();
  const clean = links.filter((l) => {
    if (l.status === 'revoked')  return now - (l.revokedAt || l.createdAt) < PURGE_AFTER_MS;
    if (l.status === 'expired')  return now - (l.sessionExpiresAt || l.linkExpiresAt) < PURGE_AFTER_MS;
    // pending/active: drop if both link expiry and session expiry (if set) have passed by 24h
    const expiry = l.sessionExpiresAt || l.linkExpiresAt;
    if (now - expiry > PURGE_AFTER_MS) return false;
    return true;
  });
  fs.writeFileSync(FILE, JSON.stringify(clean, null, 2), 'utf8');
}

const PERMANENT_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000; // ~100 years

function createTempLink({ label = '', goLiveId = null, assignedModules = [], permanent = false } = {}) {
  const links = load();
  const token = crypto.randomBytes(24).toString('hex'); // URL token
  const now   = Date.now();
  const link  = {
    id: crypto.randomUUID(),
    token,
    label,
    goLiveId,
    assignedModules,
    permanent: !!permanent,
    status: 'pending',          // pending | active | expired | revoked
    createdAt: now,
    linkExpiresAt: permanent ? now + PERMANENT_TTL_MS : now + LINK_TTL_MS,
    openedAt: null,
    sessionExpiresAt: null,
    revokedAt: null,
    // Anti-sharing fields
    boundIp: null,              // IP of first opener — others are blocked
    browserToken: null,         // random token set as cookie so only that browser can use it
  };
  save([...links, link]);
  return link;
}

function listTempLinks() {
  const now = Date.now();
  return load().map((l) => {
    if ((l.status === 'pending') && now > l.linkExpiresAt) return { ...l, status: 'expired' };
    if ((l.status === 'active') && l.sessionExpiresAt && now > l.sessionExpiresAt) return { ...l, status: 'expired' };
    return l;
  });
}

// Called on GET /temp/:token — first visit starts everything, subsequent visits verified
function openLink(token, requestIp, cookieToken) {
  const links = load();
  const idx = links.findIndex((l) => l.token === token);
  if (idx === -1) throw new Error('Link not found. Check the URL and try again.');

  const link = links[idx];
  const now = Date.now();

  if (link.status === 'revoked') throw new Error('This link has been revoked by the administrator.');
  if (link.status === 'expired' || (link.sessionExpiresAt && now > link.sessionExpiresAt))
    throw new Error('This session has expired. Ask your administrator for a new invite link.');

  // ── First open ──────────────────────────────────────────────────────────────
  if (link.status === 'pending') {
    if (now > link.linkExpiresAt) throw new Error('This invite link expired before it was opened.');
    const newBrowserToken = crypto.randomBytes(16).toString('hex');
    links[idx] = {
      ...link,
      status: 'active',
      openedAt: now,
      sessionExpiresAt: link.permanent ? now + PERMANENT_TTL_MS : now + SESSION_TTL_MS,
      boundIp: requestIp,
      browserToken: newBrowserToken,
    };
    save(links);
    return { link: links[idx], isNew: true };
  }

  // ── Returning visit — enforce anti-sharing ──────────────────────────────────
  if (link.status === 'active') {
    // Different IP — block immediately
    if (link.boundIp && link.boundIp !== requestIp) {
      throw new Error('This link is already in use on another device and cannot be shared.');
    }
    // Same IP but missing cookie (incognito copy-paste, etc.) — block
    if (link.browserToken && link.browserToken !== cookieToken) {
      throw new Error('This session is locked to the browser that originally opened it. It cannot be shared or copied.');
    }
    // All good — return existing session
    return { link, isNew: false };
  }

  throw new Error('This link is no longer valid.');
}

function revokeTempLink(id) {
  const links = load();
  const idx = links.findIndex((l) => l.id === id);
  if (idx === -1) throw new Error('Link not found');
  links[idx].status = 'revoked';
  links[idx].revokedAt = Date.now();
  save(links);
  return links[idx];
}

// Auth middleware check — validates session still live + not revoked
function validateTempSession(linkId, browserToken) {
  const link = load().find((l) => l.id === linkId);
  if (!link) return false;
  if (link.status === 'revoked') return false;
  if (link.status !== 'active') return false;
  if (!link.sessionExpiresAt || Date.now() >= link.sessionExpiresAt) return false;
  if (browserToken && link.browserToken !== browserToken) return false;
  return true;
}

module.exports = {
  createTempLink, listTempLinks, openLink,
  revokeTempLink, validateTempSession,
  SESSION_TTL_MS, LINK_TTL_MS,
};
