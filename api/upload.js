const crypto = require('crypto');
const multer = require('multer');
const { getAdmin, rest, sameOrigin, config } = require('../lib/supabase');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'مصدر الطلب غير صالح.' });
  if (!await getAdmin(req, res).catch(() => null)) return res.status(401).json({ error: 'سجّل الدخول أولاً.' });

  upload.single('image')(req, res, async (error) => {
    if (error || !req.file) return res.status(400).json({ error: 'اختر صورة JPG أو PNG أو WebP بحجم أقصى 5MB.' });
    const slot = Number(req.body?.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > 5) return res.status(400).json({ error: 'خانة الصورة غير صالحة.' });
    try {
      const rowsResponse = await rest('product_settings?id=eq.1&select=data');
      const rows = await rowsResponse.json();
      if (!rowsResponse.ok || !rows?.[0]?.data) return res.status(502).json({ error: 'تعذرت قراءة بيانات المنتج.' });
      const data = rows[0].data;
      data.images = Array.isArray(data.images) ? data.images : [];
      if (slot > data.images.length || (slot === data.images.length && data.images.length >= 6)) return res.status(400).json({ error: 'أضف الصور بالتتابع، والحد الأقصى 6 صور.' });

      const c = config();
      const storagePath = `${crypto.randomUUID()}.${extensions[req.file.mimetype]}`;
      const storageResponse = await fetch(`${c.url}/storage/v1/object/product-images/${storagePath}`, {
        method: 'POST', headers: { apikey: c.serviceKey, 'Content-Type': req.file.mimetype, 'x-upsert': 'false' }, body: req.file.buffer,
      });
      if (!storageResponse.ok) return res.status(502).json({ error: 'تعذر حفظ الصورة في Supabase Storage.' });

      const previous = data.images[slot] || {};
      const imageUrl = `${c.url}/storage/v1/object/public/product-images/${storagePath}`;
      data.images[slot] = { ...previous, src: imageUrl, storagePath };
      const saveResponse = await rest('product_settings?id=eq.1', {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!saveResponse.ok) {
        await fetch(`${c.url}/storage/v1/object/product-images/${storagePath}`, { method: 'DELETE', headers: { apikey: c.serviceKey } }).catch(() => {});
        return res.status(502).json({ error: 'تعذر تحديث بيانات المنتج بعد رفع الصورة.' });
      }
      if (previous.storagePath && previous.storagePath !== storagePath) {
        await fetch(`${c.url}/storage/v1/object/product-images/${encodeURIComponent(previous.storagePath)}`, { method: 'DELETE', headers: { apikey: c.serviceKey } }).catch(() => {});
      }
      return res.json({ success: true, path: imageUrl });
    } catch {
      return res.status(503).json({ error: 'تعذر الاتصال بخدمات Supabase.' });
    }
  });
};

module.exports.config = { api: { bodyParser: false } };
