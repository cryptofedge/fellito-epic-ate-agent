/**
 * Auth Engine — JWT-based auth with bcrypt passwords.
 * Users persisted to backend/data/users.json (swap for Postgres/Mongo in production).
 *
 * Roles:
 *   owner       — full access: manage team, all Go-Lives, all docs
 *   contributor — upload docs and manage content for assigned Go-Live events
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const JWT_SECRET = process.env.JWT_SECRET ?? 'CHANGE_THIS_IN_PRODUCTION_fellito_2025';
const JWT_EXPIRES = '7d';
const SALT_ROUNDS = 12;

// ─── User store ───────────────────────────────────────────────────────────────
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function findUser(email) {
  return loadUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
}

// ─── Bootstrap owner account on first run ────────────────────────────────────
async function bootstrapOwner() {
  const users = loadUsers();
  if (users.length > 0) return; // already seeded

  const ownerEmail = process.env.OWNER_EMAIL ?? 'cryptofedge@gmail.com';
  const ownerPassword = process.env.OWNER_PASSWORD;

  if (!ownerPassword) {
    console.warn('[Auth] OWNER_PASSWORD not set in .env — set it to create the owner account on startup.');
    return;
  }

  const hash = await bcrypt.hash(ownerPassword, SALT_ROUNDS);
  const owner = {
    id: crypto.randomUUID(),
    email: ownerEmail,
    name: 'Fellito Rodriguez',
    role: 'owner',
    passwordHash: hash,
    createdAt: Date.now(),
    active: true,
    assignedGoLives: [], // owners see everything
  };
  saveUsers([owner]);
  console.log(`[Auth] Owner account created: ${ownerEmail}`);
}

// ─── Auth operations ─────────────────────────────────────────────────────────
async function login(email, password, deviceId) {
  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !user.active) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  // Device binding — owner is exempt (logs in from admin portal too)
  if (user.role !== 'owner' && deviceId) {
    if (!user.boundDeviceId) {
      // First login — bind this device
      const idx = users.findIndex((u) => u.id === user.id);
      users[idx].boundDeviceId = deviceId;
      saveUsers(users);
    } else if (user.boundDeviceId !== deviceId) {
      throw new Error('This account is linked to another device. Contact your administrator.');
    }
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, assignedGoLives: user.assignedGoLives },
  };
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function signToken(payload, expiresIn) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// ─── Team management (owner only) ────────────────────────────────────────────
async function inviteContributor({ email, name, password, assignedGoLives }) {
  const users = loadUsers();
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('A user with this email already exists');
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = {
    id: crypto.randomUUID(),
    email,
    name,
    role: 'contributor',
    passwordHash: hash,
    createdAt: Date.now(),
    active: true,
    assignedGoLives: assignedGoLives ?? [],
  };

  saveUsers([...users, user]);
  return { id: user.id, email: user.email, name: user.name, role: user.role, assignedGoLives: user.assignedGoLives };
}

function listTeam() {
  return loadUsers().map(({ id, email, name, role, createdAt, active, assignedGoLives }) => ({
    id, email, name, role, createdAt, active, assignedGoLives,
  }));
}

function updateTeamMember(userId, updates) {
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error('User not found');

  const allowed = ['name', 'active', 'assignedGoLives', 'boundDeviceId'];
  for (const key of allowed) {
    if (key in updates) users[idx][key] = updates[key];
  }

  if (updates.password) {
    users[idx].passwordHash = bcrypt.hashSync(updates.password, SALT_ROUNDS);
  }

  saveUsers(users);
  const u = users[idx];
  return { id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, assignedGoLives: u.assignedGoLives };
}

function deleteTeamMember(userId) {
  const users = loadUsers();
  const target = users.find((u) => u.id === userId);
  if (!target) throw new Error('User not found');
  if (target.role === 'owner') throw new Error('Cannot delete owner account');
  saveUsers(users.filter((u) => u.id !== userId));
}

function getUserById(userId) {
  return loadUsers().find((u) => u.id === userId);
}

module.exports = {
  bootstrapOwner,
  login,
  verifyToken,
  signToken,
  inviteContributor,
  listTeam,
  updateTeamMember,
  deleteTeamMember,
  getUserById,
};
