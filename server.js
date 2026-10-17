const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const os = require('os');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { spawn } = require('child_process');
const runFile = promisify(execFile);
const scrypt = promisify(crypto.scrypt);
const multer = require('multer');
const { generateProductDraft } = require('./lib/ai-assistant');
try {
  const localEnv = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of localEnv.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
} catch {}
const app = express();
const PORT = Number(process.env.PORT || 4000);
const LANDING_PROJECT = path.resolve(__dirname, '..', 'product-landing');
const CONFIG_PATH = path.join(LANDING_PROJECT, 'src', 'config', 'product.json');
const IMAGES_DIR = path.join(LANDING_PROJECT, 'public', 'images');
const AUTH_PATH = path.join(__dirname, '.dashboard-auth.json');
const TLS_CONFIG_PATH = path.join(__dirname, '.dashboard-https.json');
const TLS_PFX_PATH = path.join(__dirname, '.dashboard-server.pfx');
const ALLOWED_IMAGES = ['product-front.jpg', 'product-side.jpg', 'product-back.jpg', 'product-wrist.jpg', 'product-detail.jpg', 'product-extra.jpg'];
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const attempts = new Map();
let setupInProgress = false;
let firstSetupCode = readAuth() ? null : crypto.randomBytes(5).toString("hex").toUpperCase();
const promisifiedScrypt = async (password, salt) => Buffer.from(await scrypt(password, salt, 64)).toString('hex');
function readAuth() { try { return JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8')); } catch { return null; } }
function privateIp(ip = '') {
  const value = ip.replace(/^::ffff:/, '').split('%')[0];
  if (value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
  const m = value.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 127;
}
function safeEqual(a, b) { const left = Buffer.from(String(a)); const right = Buffer.from(String(b)); return left.length === right.length && crypto.timingSafeEqual(left, right); }
function cookieValue(req, name) { const entry = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`)); return entry ? decodeURIComponent(entry.slice(name.length + 1)) : ''; }
function sessionToken(username, secret, expiresAt) {
  const body = Buffer.from(JSON.stringify({ username, expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
function isAuthenticated(req) {
  const auth = readAuth(); if (!auth) return false;
  const [body, signature] = cookieValue(req, 'dashboard_session').split('.');
  if (!body || !signature) return false;
  const expected = crypto.createHmac('sha256', auth.sessionSecret).update(body).digest('base64url');
  if (!safeEqual(signature, expected)) return false;
  try { const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return payload.username === auth.username && payload.expiresAt > Date.now(); } catch { return false; }
}
function setSession(res, req, username, secret) {
  const maxAge = 8 * 60 * 60;
  const token = sessionToken(username, secret, Date.now() + maxAge * 1000);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `dashboard_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function setNoStore(res) { res.setHeader('Cache-Control', 'no-store'); }
function sendLogin(res) { setNoStore(res); res.sendFile(path.join(__dirname, 'login.html')); }
app.use((req, res, next) => {
  if (!privateIp(req.socket.remoteAddress)) return res.status(403).send('الوصول مسموح من الشبكة المحلية فقط.');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.get('/api/auth/status', (req, res) => {
  setNoStore(res);
  const auth = readAuth();
  res.json({ configured: Boolean(auth), authenticated: Boolean(auth && isAuthenticated(req)), localAddress: `https://${os.hostname()}.local:${PORT}` });
});
app.post('/api/auth/setup', async (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'تعذر التحقق من مصدر الطلب.' });
  if (readAuth() || setupInProgress) return res.status(409).json({ error: 'تم إعداد حساب المسؤول مسبقاً.' });
  if (!firstSetupCode || !safeEqual(String(req.body?.setupCode || '').trim().toUpperCase(), firstSetupCode)) return res.status(403).json({ error: 'رمز الإعداد غير صحيح. خذه من نافذة تشغيل اللوحة على الحاسوب.' });
  const username = typeof req.body?.username === 'string' && req.body.username.trim() ? req.body.username.trim() : auth.username;
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (username.length < 3 || username.length > 64 || password.length < 12 || password.length > 256) return res.status(400).json({ error: 'اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل وكلمة المرور من 12 حرفاً على الأقل.' });
  setupInProgress = true;
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = await promisifiedScrypt(password, salt);
    const auth = { username, salt, passwordHash, sessionSecret: crypto.randomBytes(32).toString('hex'), createdAt: new Date().toISOString() };
    const temp = `${AUTH_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(auth), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temp, AUTH_PATH);
    setSession(res, req, username, auth.sessionSecret);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'تعذر إنشاء حساب المسؤول.' }); }
  finally { setupInProgress = false; }
});
app.post('/api/auth/login', async (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'تعذر التحقق من مصدر الطلب.' });
  const ip = req.socket.remoteAddress || 'local';
  const record = attempts.get(ip) || { count: 0, until: 0 };
  if (record.until > Date.now()) return res.status(429).json({ error: 'محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجدداً.' });
  const auth = readAuth();
  if (!auth) return res.status(409).json({ error: 'أنشئ حساب المسؤول أولاً.' });
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const candidate = await promisifiedScrypt(password, auth.salt);
  if (!safeEqual(username, auth.username) || !safeEqual(candidate, auth.passwordHash)) {
    record.count += 1;
    if (record.count >= 5) { record.count = 0; record.until = Date.now() + 15 * 60 * 1000; }
    attempts.set(ip, record);
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });
  }
  attempts.delete(ip);
  setSession(res, req, username, auth.sessionSecret);
  res.json({ success: true });
});
app.post('/api/auth/logout', (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'تعذر التحقق من مصدر الطلب.' });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `dashboard_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
  res.json({ success: true });
});
app.get('/', (req, res) => isAuthenticated(req) ? (setNoStore(res), res.sendFile(path.join(__dirname, 'dashboard.html'))) : sendLogin(res));
app.get('/index.html', (req, res) => isAuthenticated(req) ? res.sendFile(path.join(__dirname, 'dashboard.html')) : res.redirect('/'));
app.use('/api', (req, res, next) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'سجّل الدخول لمتابعة استخدام لوحة التحكم.' });
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !sameOrigin(req)) return res.status(403).json({ error: 'تعذر التحقق من مصدر الطلب.' });
  next();
});
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => { fs.mkdirSync(IMAGES_DIR, { recursive: true }); cb(null, IMAGES_DIR); },
  filename: (req, _file, cb) => { const index = Number(req.body.slot); if (!Number.isInteger(index) || index < 0 || index >= ALLOWED_IMAGES.length) return cb(new Error('رقم خانة الصورة غير صالح')); cb(null, ALLOWED_IMAGES[index]); }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, imageTypes.has(file.mimetype)) });
app.get('/api/product', (_req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))); }
  catch { res.status(500).json({ error: 'تعذر قراءة بيانات المنتج.' }); }
});
app.put('/api/product', (req, res) => {
  const data = req.body;
  if (!data || typeof data.name !== 'string' || !data.name.trim() || !Number.isFinite(Number(data.price)) || Number(data.price) <= 0 || !Number.isFinite(Number(data.oldPrice)) || Number(data.oldPrice) <= 0 || !Number.isInteger(Number(data.maxQty)) || Number(data.maxQty) < 1 || Number(data.maxQty) > 100 || !Array.isArray(data.images) || data.images.length < 2 || data.images.length > 6 || data.images.some((image) => !image || typeof image.src !== 'string' || !image.src.trim())) return res.status(400).json({ error: 'تحقق من بيانات المنتج وتأكد من وجود صورتين إلى 6 صور مرفوعة.' });
  const temp = `${CONFIG_PATH}.${process.pid}.tmp`;
  try {
    fs.copyFileSync(CONFIG_PATH, path.join(path.dirname(CONFIG_PATH), 'product.backup.json'));
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temp, CONFIG_PATH);
    res.json({ success: true, message: 'تم حفظ المنتج.' });
  } catch (error) { if (fs.existsSync(temp)) fs.unlinkSync(temp); res.status(500).json({ error: 'تعذر حفظ بيانات المنتج.' }); }
});
app.post('/api/upload', (req, res) => upload.single('image')(req, res, (err) => {
  if (err) return res.status(400).json({ error: 'ارفع صورة JPG أو PNG أو WebP بحجم أقصى 5MB، واختر خانة صحيحة.' });
  if (!req.file) return res.status(400).json({ error: 'لم يتم اختيار صورة صالحة.' });
  const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const slot = Number(req.body.slot); const previous = data.images?.[slot] || {};
  data.images = data.images || [];
  data.images[slot] = { ...previous, src: `/images/${ALLOWED_IMAGES[slot]}` };
  const temp = `${CONFIG_PATH}.${process.pid}.tmp`;
  fs.copyFileSync(CONFIG_PATH, path.join(path.dirname(CONFIG_PATH), 'product.backup.json'));
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8'); fs.renameSync(temp, CONFIG_PATH);
  res.json({ success: true, path: `/images/${ALLOWED_IMAGES[slot]}` });
}));
app.delete('/api/image', (req, res) => {
  const index = Number(req.body?.index);
  let data;
  try { data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return res.status(500).json({ error: 'تعذرت قراءة بيانات المنتج.' }); }
  data.images = Array.isArray(data.images) ? data.images : [];
  if (!Number.isInteger(index) || index < 0 || index >= data.images.length) return res.status(400).json({ error: 'رقم الصورة غير صالح.' });
  if (data.images.length <= 2) return res.status(400).json({ error: 'يجب إبقاء صورتين على الأقل.' });
  const [removed] = data.images.splice(index, 1);
  const temp = `${CONFIG_PATH}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8'); fs.renameSync(temp, CONFIG_PATH);
    const filename = path.basename(String(removed?.src || ''));
    if (ALLOWED_IMAGES.includes(filename)) { const target = path.resolve(IMAGES_DIR, filename); if (target.startsWith(`${path.resolve(IMAGES_DIR)}${path.sep}`) && fs.existsSync(target)) fs.unlinkSync(target); }
    return res.json({ success: true });
  } catch { if (fs.existsSync(temp)) fs.unlinkSync(temp); return res.status(500).json({ error: 'تعذر حذف الصورة.' }); }
});
app.post('/api/assistant', async (req, res) => {
  try { res.json({ success: true, draft: await generateProductDraft(req.body) }); }
  catch (error) { res.status(error.status || 502).json({ error: error.message || 'تعذر الاتصال بالمساعد.' }); }
});
app.post('/api/publish', async (_req, res) => {
  const git = (args) => runFile('git', args, { cwd: LANDING_PROJECT, windowsHide: true });
  try {
    const { stdout: status } = await git(['status', '--porcelain']);
    if (!status.trim()) return res.json({ success: false, message: 'لا توجد تغييرات للنشر' });
    const { stdout: remotes } = await git(['remote']);
    if (!remotes.trim()) return res.status(400).json({ error: 'لا يوجد remote مربوط بمستودع صفحة الهبوط.' });
    await git(['add', 'src/config/product.json', 'public/images']);
    await git(['commit', '-m', `تحديث المنتج من لوحة التحكم - ${new Date().toLocaleDateString('sv-SE')}`]);
    await git(['push']);
    res.json({ success: true, message: 'سيظهر التحديث على موقعك خلال 1-2 دقيقة.' });
  } catch (error) {
    const output = `${error.message || ''} ${error.stderr || ''}`;
    if (error.code === 'ENOENT') return res.status(500).json({ error: 'Git غير مثبت أو غير متاح في PATH.' });
    if (/not a git repository/i.test(output)) return res.status(400).json({ error: 'مجلد صفحة الهبوط ليس مستودع Git.' });
    if (/no configured push destination|has no upstream branch|no remote/i.test(output)) return res.status(400).json({ error: 'لا يوجد remote أو فرع نشر مهيأ.' });
    if (/authentication failed|permission denied|could not read username|publickey/i.test(output)) return res.status(403).json({ error: 'فشلت مصادقة GitHub. سجّل الدخول أو حدّث بيانات Git.' });
    res.status(500).json({ error: 'فشل النشر عبر Git. تحقق من اتصال المستودع ثم حاول مجدداً.' });
  }
});
app.use(express.static(path.join(__dirname, 'public'), { index: false, dotfiles: 'deny' }));
app.use('/preview-images', express.static(IMAGES_DIR));
const tlsConfig = (() => { try { return JSON.parse(fs.readFileSync(TLS_CONFIG_PATH, 'utf8')); } catch { return null; } })();
if (tlsConfig && fs.existsSync(TLS_PFX_PATH)) {
  const server = https.createServer({ pfx: fs.readFileSync(TLS_PFX_PATH), passphrase: tlsConfig.passphrase }, app);
  server.listen(PORT, '0.0.0.0', () => { console.log(`لوحة التحكم الآمنة: https://${os.hostname()}.local:${PORT}`); if (firstSetupCode) console.log(`رمز إعداد حساب المسؤول لمرة واحدة: ${firstSetupCode}`); });
} else {
  app.listen(PORT, '127.0.0.1', () => { console.log(`لوحة التحكم المحلية: http://localhost:${PORT}. شغّل إعداد HTTPS للوصول من الهاتف.`); if (firstSetupCode) console.log(`رمز إعداد حساب المسؤول لمرة واحدة: ${firstSetupCode}`); });
}
