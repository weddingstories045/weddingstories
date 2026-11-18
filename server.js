/**
 * Wedding photography portfolio - zero-dependency Node.js server.
 * Features: public site, JSON API, admin login, story (folder) + image management.
 * Run:  node server.js     (or: ADMIN_PASSWORD=secret PORT=3000 node server.js)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- optional .env loader ----------
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch (_) {}

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_UPLOAD = 200 * 1024 * 1024; // 200 MB per request
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- tiny JSON "database" ----------
const DEFAULT_DB = {
  settings: {
    siteName: 'Your Name',
    tagline: 'Wedding Photographer',
    heroTitle: 'You Feel. I Focus. We Frame.',
    heroText:
      'A wedding is the validation of love and a chronological record of a couple’s journey. I photograph the in-between moments, the quiet glances and the loud laughter, so you can relive them for a lifetime.',
    heroQuote: 'We are creating fiction out of reality.',
    storiesHeading: 'Real Love Stories',
    aboutTitle: 'About',
    aboutText:
      'Hi, I’m a documentary-style wedding photographer. Tell me about your story, your people and your dream day, and let’s make something timeless together.',
    aboutImage: '',
    email: 'hello@example.com',
    phone: '',
    instagram: 'https://instagram.com/',
  },
  stories: [],
  enquiries: [],
};
let db;
function loadDB() {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.settings = { ...DEFAULT_DB.settings, ...(db.settings || {}) };
    db.stories = db.stories || [];
    db.enquiries = db.enquiries || [];
  } catch (_) {
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
    saveDB();
  }
}
function saveDB() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
loadDB();

// ---------- helpers ----------
const uid = () => crypto.randomBytes(6).toString('hex');
const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'story';
function uniqueSlug(base, exceptId) {
  let slug = slugify(base), n = 2;
  while (db.stories.some((s) => s.slug === slug && s.id !== exceptId)) slug = `${slugify(base)}-${n++}`;
  return slug;
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, {
    'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJSON(req) {
  const b = await readBody(req);
  try { return JSON.parse(b.toString() || '{}'); }
  catch (_) { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

// minimal multipart/form-data parser (files only need name + buffer)
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) throw Object.assign(new Error('No boundary'), { status: 400 });
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const files = []; const fields = {};
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const next = buf.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    let part = buf.slice(pos + boundary.length, next);
    if (part.slice(0, 2).toString() === '\r\n') part = part.slice(2);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);
    const headEnd = part.indexOf('\r\n\r\n');
    if (headEnd !== -1) {
      const head = part.slice(0, headEnd).toString();
      const data = part.slice(headEnd + 4);
      const name = /name="([^"]*)"/i.exec(head);
      const filename = /filename="([^"]*)"/i.exec(head);
      if (filename) files.push({ field: name && name[1], filename: filename[1], data });
      else if (name) fields[name[1]] = data.toString();
    }
    pos = next;
  }
  return { files, fields };
}
function sniffImage(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8) return '.jpg';
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (b.slice(0, 4).toString() === 'GIF8') return '.gif';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return '.webp';
  if (b.slice(4, 8).toString() === 'ftyp' && /avif|avis/.test(b.slice(8, 16).toString())) return '.avif';
  return null;
}

// ---------- auth (in-memory sessions) ----------
const sessions = new Map(); // token -> expiry
const SESSION_MS = 1000 * 60 * 60 * 12;
const attempts = new Map(); // ip -> {count, until}
function getCookie(req, name) {
  const c = (req.headers.cookie || '').split(';').map((s) => s.trim());
  for (const p of c) if (p.startsWith(name + '=')) return decodeURIComponent(p.slice(name.length + 1));
  return null;
}
const isAdmin = (req) => {
  const t = getCookie(req, 'sid');
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
};
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// ---------- public shaping ----------
const urlFor = (story, file) => `/uploads/${story.id}/${file}`;
function publicStory(s, full) {
  const cover = s.cover && s.images.find((i) => i.id === s.cover) || s.images[0];
  const base = {
    id: s.id, slug: s.slug, title: s.title, couple: s.couple || s.title,
    location: s.location, date: s.date,
    cover: cover ? urlFor(s, cover.file) : null,
    count: s.images.length,
  };
  if (!full) return base;
  return {
    ...base, description: s.description,
    images: s.images.map((i) => ({ id: i.id, url: urlFor(s, i.file), caption: i.caption || '' })),
  };
}
const adminStory = (s) => ({
  ...publicStory(s, true), published: s.published, coverId: s.cover || (s.images[0] && s.images[0].id) || null,
});

// ---------- API ----------
async function handleApi(req, res, url) {
  const p = url.pathname; const m = req.method;
  let r;

  // ----- public -----
  if (m === 'GET' && p === '/api/site') {
    return send(res, 200, {
      settings: db.settings,
      stories: db.stories.filter((s) => s.published && s.images.length).map((s) => publicStory(s)),
    });
  }
  if (m === 'GET' && (r = p.match(/^\/api\/stories\/([a-z0-9-]+)$/))) {
    const s = db.stories.find((x) => x.slug === r[1] && x.published);
    if (!s) return send(res, 404, { error: 'Story not found' });
    const idx = db.stories.filter((x) => x.published && x.images.length);
    const i = idx.findIndex((x) => x.id === s.id);
    return send(res, 200, {
      story: publicStory(s, true), settings: db.settings,
      next: idx.length > 1 && i !== -1 ? publicStory(idx[(i + 1) % idx.length]) : null,
    });
  }
  if (m === 'POST' && p === '/api/enquire') {
    const b = await readJSON(req);
    const clean = (v, n) => String(v || '').trim().slice(0, n);
    if (b.website) return send(res, 200, { ok: true }); // honeypot
    const e = {
      id: uid(), name: clean(b.name, 120), email: clean(b.email, 160), phone: clean(b.phone, 40),
      date: clean(b.date, 60), location: clean(b.location, 120), message: clean(b.message, 4000),
      createdAt: new Date().toISOString(),
    };
    if (!e.name || !/^\S+@\S+\.\S+$/.test(e.email) || !e.message)
      return send(res, 400, { error: 'Please fill in name, a valid email and a message.' });
    db.enquiries.unshift(e); db.enquiries = db.enquiries.slice(0, 500); saveDB();
    return send(res, 200, { ok: true });
  }

  // ----- auth -----
  if (m === 'POST' && p === '/api/login') {
    const ip = req.socket.remoteAddress || 'x';
    const a = attempts.get(ip) || { count: 0, until: 0 };
    if (a.until > Date.now()) return send(res, 429, { error: 'Too many attempts. Try again later.' });
    const b = await readJSON(req);
    if (safeEqual(b.password || '', ADMIN_PASSWORD)) {
      attempts.delete(ip);
      const t = crypto.randomBytes(32).toString('hex');
      sessions.set(t, Date.now() + SESSION_MS);
      return send(res, 200, { ok: true }, {
        'Set-Cookie': `sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`,
      });
    }
    a.count++; if (a.count >= 5) { a.until = Date.now() + 5 * 60 * 1000; a.count = 0; }
    attempts.set(ip, a);
    return send(res, 401, { error: 'Wrong password' });
  }
  if (m === 'POST' && p === '/api/logout') {
    const t = getCookie(req, 'sid'); if (t) sessions.delete(t);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' });
  }
  if (m === 'GET' && p === '/api/me') return send(res, 200, { admin: isAdmin(req) });

  // ----- admin (everything below needs login) -----
  if (!p.startsWith('/api/admin')) return send(res, 404, { error: 'Not found' });
  if (!isAdmin(req)) return send(res, 401, { error: 'Not logged in' });
  // basic CSRF defence: state-changing requests must come from same origin
  if (m !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Bad origin' });
  }

  if (m === 'GET' && p === '/api/admin/stories') return send(res, 200, { stories: db.stories.map(adminStory) });
  if (m === 'GET' && p === '/api/admin/settings') return send(res, 200, { settings: db.settings });
  if (m === 'GET' && p === '/api/admin/enquiries') return send(res, 200, { enquiries: db.enquiries });

  if (m === 'PUT' && p === '/api/admin/settings') {
    const b = await readJSON(req);
    for (const k of Object.keys(DEFAULT_DB.settings)) if (typeof b[k] === 'string') db.settings[k] = b[k].slice(0, 5000);
    saveDB(); return send(res, 200, { settings: db.settings });
  }
  if (m === 'DELETE' && (r = p.match(/^\/api\/admin\/enquiries\/(\w+)$/))) {
    db.enquiries = db.enquiries.filter((e) => e.id !== r[1]); saveDB(); return send(res, 200, { ok: true });
  }

  // create story
  if (m === 'POST' && p === '/api/admin/stories') {
    const b = await readJSON(req);
    const title = String(b.title || '').trim().slice(0, 140);
    if (!title) return send(res, 400, { error: 'Title is required' });
    const s = {
      id: uid(), slug: uniqueSlug(title), title, couple: title,
      location: String(b.location || '').slice(0, 120), date: String(b.date || '').slice(0, 40),
      description: String(b.description || '').slice(0, 5000), published: true, cover: null, images: [],
    };
    db.stories.unshift(s); saveDB();
    fs.mkdirSync(path.join(UPLOAD_DIR, s.id), { recursive: true });
    return send(res, 201, { story: adminStory(s) });
  }
  // reorder stories
  if (m === 'PUT' && p === '/api/admin/stories-order') {
    const b = await readJSON(req);
    if (Array.isArray(b.order)) {
      const map = new Map(db.stories.map((s) => [s.id, s]));
      const ordered = b.order.map((id) => map.get(id)).filter(Boolean);
      const rest = db.stories.filter((s) => !b.order.includes(s.id));
      db.stories = [...ordered, ...rest]; saveDB();
    }
    return send(res, 200, { ok: true });
  }

  if ((r = p.match(/^\/api\/admin\/stories\/(\w+)(?:\/(images|order)(?:\/(\w+))?)?$/))) {
    const s = db.stories.find((x) => x.id === r[1]);
    if (!s) return send(res, 404, { error: 'Story not found' });
    const sub = r[2], imgId = r[3];

    if (!sub) {
      if (m === 'GET') return send(res, 200, { story: adminStory(s) });
      if (m === 'PUT') {
        const b = await readJSON(req);
        if (typeof b.title === 'string' && b.title.trim()) {
          const t = b.title.trim().slice(0, 140);
          if (t !== s.title) { s.title = t; s.couple = t; s.slug = uniqueSlug(t, s.id); }
        }
        if (typeof b.location === 'string') s.location = b.location.slice(0, 120);
        if (typeof b.date === 'string') s.date = b.date.slice(0, 40);
        if (typeof b.description === 'string') s.description = b.description.slice(0, 5000);
        if (typeof b.published === 'boolean') s.published = b.published;
        if (b.cover && s.images.some((i) => i.id === b.cover)) s.cover = b.cover;
        saveDB(); return send(res, 200, { story: adminStory(s) });
      }
      if (m === 'DELETE') {
        db.stories = db.stories.filter((x) => x.id !== s.id); saveDB();
        fs.rmSync(path.join(UPLOAD_DIR, s.id), { recursive: true, force: true });
        return send(res, 200, { ok: true });
      }
    }
    if (sub === 'images' && !imgId && m === 'POST') {
      const body = await readBody(req, MAX_UPLOAD);
      const { files } = parseMultipart(body, req.headers['content-type']);
      const dir = path.join(UPLOAD_DIR, s.id); fs.mkdirSync(dir, { recursive: true });
      const added = [], rejected = [];
      for (const f of files) {
        const ext = sniffImage(f.data);
        if (!ext || !ALLOWED_EXT.has(ext)) { rejected.push(f.filename); continue; }
        const file = `${Date.now().toString(36)}-${uid()}${ext}`;
        fs.writeFileSync(path.join(dir, file), f.data);
        const img = { id: uid(), file, caption: '' };
        s.images.push(img); added.push(img.id);
      }
      saveDB();
      return send(res, 200, { story: adminStory(s), added: added.length, rejected });
    }
    if (sub === 'images' && imgId) {
      const i = s.images.findIndex((x) => x.id === imgId);
      if (i === -1) return send(res, 404, { error: 'Image not found' });
      if (m === 'DELETE') {
        const [img] = s.images.splice(i, 1);
        fs.rmSync(path.join(UPLOAD_DIR, s.id, img.file), { force: true });
        if (s.cover === img.id) s.cover = null;
        saveDB(); return send(res, 200, { story: adminStory(s) });
      }
      if (m === 'PUT') {
        const b = await readJSON(req);
        if (typeof b.caption === 'string') s.images[i].caption = b.caption.slice(0, 300);
        saveDB(); return send(res, 200, { ok: true });
      }
    }
    if (sub === 'order' && m === 'PUT') {
      const b = await readJSON(req);
      if (Array.isArray(b.order)) {
        const map = new Map(s.images.map((i) => [i.id, i]));
        const ordered = b.order.map((id) => map.get(id)).filter(Boolean);
        const rest = s.images.filter((i) => !b.order.includes(i.id));
        s.images = [...ordered, ...rest]; saveDB();
      }
      return send(res, 200, { story: adminStory(s) });
    }
  }

  // site "about" photo upload
  if (m === 'POST' && p === '/api/admin/about-image') {
    const body = await readBody(req, 30 * 1024 * 1024);
    const { files } = parseMultipart(body, req.headers['content-type']);
    const f = files[0]; const ext = f && sniffImage(f.data);
    if (!ext) return send(res, 400, { error: 'Not a valid image' });
    const dir = path.join(UPLOAD_DIR, '_site'); fs.mkdirSync(dir, { recursive: true });
    const file = `about-${Date.now().toString(36)}${ext}`;
    fs.writeFileSync(path.join(dir, file), f.data);
    db.settings.aboutImage = `/uploads/_site/${file}`; saveDB();
    return send(res, 200, { settings: db.settings });
  }

  return send(res, 404, { error: 'Not found' });
}

// ---------- static files ----------
function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}
function safeJoin(base, rel) {
  const full = path.normalize(path.join(base, rel));
  return full.startsWith(base + path.sep) || full === base ? full : null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);

    if (p.startsWith('/api/')) return await handleApi(req, res, url);

    if (p.startsWith('/uploads/')) {
      const f = safeJoin(UPLOAD_DIR, p.slice('/uploads/'.length));
      return f ? serveFile(req, res, f, true) : send(res, 403, 'Forbidden');
    }
    // page routes
    if (p === '/' || p === '/weddings' || p === '/weddings/') p = '/index.html';
    else if (p === '/admin' || p === '/admin/') p = '/admin.html';
    else if (p.startsWith('/story/')) p = '/story.html';

    const f = safeJoin(PUBLIC_DIR, p);
    if (!f) return send(res, 403, 'Forbidden');
    return serveFile(req, res, f, false);
  } catch (e) {
    const code = e.status || 500;
    if (code === 500) console.error(e);
    if (!res.headersSent) send(res, code, { error: e.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Site:   http://localhost:${PORT}`);
  console.log(`  Admin:  http://localhost:${PORT}/admin`);
  if (!process.env.ADMIN_PASSWORD) console.log('  (!) Using default admin password "admin123". Set ADMIN_PASSWORD before going live.\n');
});
