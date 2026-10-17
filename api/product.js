const { getAdmin, rest, sameOrigin } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  const admin = await getAdmin(req, res).catch(() => null);
  if (!admin) return res.status(401).json({ error: 'سجّل الدخول لمتابعة استخدام لوحة التحكم.' });
  if (req.method === 'GET') {
    const response = await rest('product_settings?id=eq.1&select=data');
    const rows = await response.json().catch(() => null);
    if (!response.ok || !rows?.[0]?.data || !Object.keys(rows[0].data).length) return res.status(503).json({ error: 'أكمل إعداد قاعدة بيانات المنتج في Supabase.' });
    return res.json(rows[0].data);
  }
  if (req.method !== 'PUT') return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'تعذر التحقق من مصدر الطلب.' });
  const data = req.body;
  if (!data || typeof data.name !== 'string' || !data.name.trim() || !Number.isFinite(Number(data.price)) || Number(data.price) <= 0 || !Number.isFinite(Number(data.oldPrice)) || Number(data.oldPrice) <= 0 || !Array.isArray(data.cities) || !Array.isArray(data.images) || data.images.length < 2 || data.images.length > 6 || data.images.some((image) => !image || typeof image.src !== 'string' || !image.src.trim())) return res.status(400).json({ error: 'تحقق من بيانات المنتج وتأكد من وجود صورتين إلى 6 صور مرفوعة.' });
  const response = await rest('product_settings?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 1, data, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) return res.status(502).json({ error: 'تعذر حفظ بيانات المنتج في Supabase.' });
  return res.json({ success: true, message: 'تم حفظ بيانات المنتج.' });
};
