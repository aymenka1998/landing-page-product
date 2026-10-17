const { getAdmin, rest, sameOrigin, config } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'مصدر الطلب غير صالح.' });
  if (!await getAdmin(req, res).catch(() => null)) return res.status(401).json({ error: 'سجّل الدخول أولاً.' });
  const index = Number(req.body?.index);
  if (!Number.isInteger(index) || index < 0 || index > 5) return res.status(400).json({ error: 'رقم الصورة غير صالح.' });

  try {
    const response = await rest('product_settings?id=eq.1&select=data');
    const rows = await response.json();
    if (!response.ok || !rows?.[0]?.data) return res.status(502).json({ error: 'تعذرت قراءة بيانات المنتج.' });
    const data = rows[0].data;
    data.images = Array.isArray(data.images) ? data.images : [];
    if (data.images.length <= 2) return res.status(400).json({ error: 'يجب إبقاء صورتين على الأقل.' });
    if (index >= data.images.length) return res.status(404).json({ error: 'الصورة غير موجودة.' });
    const [removed] = data.images.splice(index, 1);
    const saved = await rest('product_settings?id=eq.1', {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
    });
    if (!saved.ok) return res.status(502).json({ error: 'تعذر حفظ حذف الصورة.' });

    // Delete only objects belonging to this project's public product-images bucket.
    const c = config();
    let storagePath = removed?.storagePath;
    if (!storagePath && typeof removed?.src === 'string') {
      const prefix = `${c.url}/storage/v1/object/public/product-images/`;
      if (removed.src.startsWith(prefix)) {
        const legacy = decodeURIComponent(removed.src.slice(prefix.length).split(/[?#]/)[0]);
        if (/^(product-(front|side|back|wrist)\.jpg)$/.test(legacy)) storagePath = legacy;
      }
    }
    if (typeof storagePath === 'string' && /^[a-zA-Z0-9._-]{1,120}$/.test(storagePath)) {
      await fetch(`${c.url}/storage/v1/object/product-images/${encodeURIComponent(storagePath)}`, {
        method: 'DELETE', headers: { apikey: c.serviceKey },
      }).catch(() => {});
    }
    return res.json({ success: true });
  } catch {
    return res.status(503).json({ error: 'تعذر الاتصال بخدمات Supabase.' });
  }
};
