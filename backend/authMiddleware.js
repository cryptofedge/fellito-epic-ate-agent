const { verifyToken, getUserById } = require('./authEngine');
const { validateTempSession } = require('./tempLinkStore');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const payload = verifyToken(header.slice(7));

    // Temp session — validate against live store (catches revokes + expiry + device switching)
    if (payload.temp && payload.linkId) {
      if (!validateTempSession(payload.linkId, payload.browserToken)) {
        return res.status(401).json({ error: 'SESSION_EXPIRED', message: 'Your session has expired. Contact your administrator for a new invite link.' });
      }
      // Attach a synthetic user object for temp sessions
      req.user = {
        id: payload.sub,
        name: payload.name ?? 'Guest',
        email: payload.email ?? '',
        role: 'contributor',
        assignedGoLives: payload.assignedGoLives ?? [],
        temp: true,
        sessionExpiresAt: payload.sessionExpiresAt,
        active: true,
      };
      return next();
    }

    const user = getUserById(payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: 'Account inactive' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }
    next();
  });
}

// Contributors can only access Go-Lives they're assigned to
function requireGoLiveAccess(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role === 'owner') return next();
    const goLiveId = req.body?.goLiveId ?? req.query?.goLiveId ?? req.params?.goLiveId;
    if (!goLiveId || req.user.assignedGoLives.includes(goLiveId)) return next();
    return res.status(403).json({ error: 'Not assigned to this Go-Live' });
  });
}

module.exports = { requireAuth, requireOwner, requireGoLiveAccess };
