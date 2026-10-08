// FitPulse CRM — public site + private admin (cookie auth)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);

// ---------- CONFIG (set these as environment variables) ----------
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitpulse';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';              // admin password
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('fp:' + ADMIN_KEY).digest('hex');
const ADMIN_PATH = (process.env.ADMIN_PATH || '/admin').replace(/\/+$/, ''); // e.g. /ops-x7k2 to hide it better
const IS_PROD = process.env.NODE_ENV === 'production';
if (IS_PROD && ADMIN_KEY === 'admin123') { console.error('Refusing to start: set a strong ADMIN_KEY'); process.exit(1); }

// ---------- MIDDLEWARE ----------
app.use(cors({ origin: false }));            // same-origin only
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });

// ---------- MODELS ----------
const Enquiry = mongoose.model('GymEnquiry', new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  gymName: { type: String, trim: true, maxlength: 100 },
  phone: { type: String, required: true, match: /^\+91[6-9]\d{9}$/ },
  city: { type: String, trim: true, maxlength: 80 },
  members: { type: String, maxlength: 40 },
  message: { type: String, maxlength: 1000 },
  planInterest: { type: String, default: 'Starter', maxlength: 40 },
  status: { type: String, enum: ['New', 'Contacted', 'Converted', 'Lost'], default: 'New' },
  created_at: { type: Date, default: Date.now }
}, { collection: 'gym_enquiries' }));

const Setting = mongoose.model('Setting', new mongoose.Schema({
  key: { type: String, unique: true, required: true }, value: { type: String, default: '' }
}, { collection: 'settings' }));

// ---------- AUTH HELPERS (signed HttpOnly cookie) ----------
const sign = (s) => crypto.createHmac('sha256', SESSION_SECRET).update(s).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const makeToken = () => { const exp = Date.now() + 8 * 3600e3; return exp + '.' + sign(String(exp)); };
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split(/=(.*)/s).slice(0, 2)).filter(p => p[0]));
}
function isAuthed(req) {
  const t = cookies(req).fp_admin; if (!t) return false;
  const [exp, sig] = t.split('.');
  return !!exp && !!sig && Number(exp) > Date.now() && safeEq(sig, sign(exp));
}
const adminAuth = (req, res, next) => isAuthed(req) ? next() : res.status(401).json({ error: 'Unauthorized' });
const cookieOpts = (req) => `Path=/; HttpOnly; SameSite=Strict; ${(req.secure || IS_PROD) ? 'Secure; ' : ''}`;

// simple login rate limit: 5 tries / 15 min / IP
const tries = new Map();
function limited(ip) {
  const now = Date.now(), r = (tries.get(ip) || []).filter(t => now - t < 15 * 60e3);
  tries.set(ip, r); return r.length >= 5;
}

// ---------- PRIVATE ADMIN PAGES (NOT in /public, never served statically) ----------
const adminFile = (f) => path.join(__dirname, 'private', 'admin', f);
const noCache = (res) => res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY' });

app.get([ADMIN_PATH, ADMIN_PATH + '/'], (req, res) => {
  if (isAuthed(req)) return res.redirect(ADMIN_PATH + '/dashboard');
  noCache(res); res.sendFile(adminFile('login.html'));
});
app.get(ADMIN_PATH + '/dashboard', (req, res) => {
  if (!isAuthed(req)) return res.redirect(ADMIN_PATH);
  noCache(res); res.sendFile(adminFile('dashboard.html'));
});

// ---------- ADMIN API ----------
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  if (limited(ip)) return res.status(429).json({ success: false, error: 'Too many attempts. Try again in 15 minutes.' });
  const pw = req.body && req.body.password;
  if (!pw || !safeEq(pw, ADMIN_KEY)) { tries.get(ip).push(Date.now()); return res.status(401).json({ success: false, error: 'Invalid admin credentials' }); }
  res.set('Set-Cookie', `fp_admin=${makeToken()}; Max-Age=${8 * 3600}; ${cookieOpts(req)}`);
  res.json({ success: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.set('Set-Cookie', `fp_admin=; Max-Age=0; ${cookieOpts(req)}`); res.json({ success: true });
});
app.get('/api/admin/verify', adminAuth, (req, res) => res.json({ success: true }));

// ---------- ENQUIRIES ----------
app.post('/api/enquiries', async (req, res) => {          // public
  try {
    const { name, gymName, phone, city, members, message, planInterest } = req.body || {};
    res.status(201).json(await Enquiry.create({ name, gymName, phone, city, members, message, planInterest, status: 'New' }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/enquiries', adminAuth, async (req, res) => {
  try { res.json(await Enquiry.find().sort({ created_at: -1 })); } catch (e) { res.status(500).json({ error: 'Failed to load enquiries' }); }
});
app.put('/api/enquiries/:id', adminAuth, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['New', 'Contacted', 'Converted', 'Lost'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const doc = await Enquiry.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
    doc ? res.json(doc) : res.status(404).json({ error: 'Enquiry not found' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- SETTINGS ----------
app.get('/api/settings', async (req, res) => {            // public (landing page needs demo URL)
  try { const s = await Setting.findOne({ key: 'demoUrl' }); res.json({ demoUrl: s ? s.value : '' }); }
  catch (e) { res.status(500).json({ error: 'Failed to load settings' }); }
});
app.put('/api/settings', adminAuth, async (req, res) => {
  try {
    const url = String((req.body && req.body.demoUrl) || '').trim();
    if (url && !/^https:\/\//i.test(url)) return res.status(400).json({ error: 'Demo URL must start with https://' });
    await Setting.findOneAndUpdate({ key: 'demoUrl' }, { value: url }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Failed to save settings' }); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));

// ---------- PUBLIC WEBSITE ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('*', (req, res) => res.redirect('/'));            // unknown URLs go to the website

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

// ---------- START ----------
mongoose.connect(MONGODB_URI).then(() => {
  console.log('MongoDB connected');
  app.listen(PORT, () => {
    console.log(`Website: http://localhost:${PORT}`);
    console.log(`Admin:   http://localhost:${PORT}${ADMIN_PATH}   (not linked from the website)`);
  });
}).catch(e => { console.error('MongoDB connection error:', e.message); process.exit(1); });