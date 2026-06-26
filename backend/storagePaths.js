const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const VECTOR_STORE_DIR = process.env.VECTOR_STORE_DIR || path.join(DATA_DIR, 'vector-store');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(DATA_DIR);
ensureDir(UPLOAD_DIR);
ensureDir(VECTOR_STORE_DIR);

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  VECTOR_STORE_DIR,
  ensureDir,
};
