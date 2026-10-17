const { getAdmin, sameOrigin } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'تعذر التحقق من مصدر الطلب.' });
  if (!await getAdmin(req, res).catch(() => null)) return res.status(401).json({ error: 'سجّل الدخول لمتابعة استخدام لوحة التحكم.' });
  return res.json({ success: true, message: 'البيانات محفوظة على Supabase وتظهر تلقائياً على الموقع.' });
};
