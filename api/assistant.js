const { getAdmin, sameOrigin } = require('../lib/supabase');
const { generateProductDraft } = require('../lib/ai-assistant');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'تعذر التحقق من مصدر الطلب.' });
  if (!await getAdmin(req, res).catch(() => null)) return res.status(401).json({ error: 'سجّل الدخول لاستخدام لوحة التحكم.' });

  try {
    const draft = await generateProductDraft(req.body);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, draft });
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message || 'تعذر الاتصال بالمساعد.' });
  }
};
