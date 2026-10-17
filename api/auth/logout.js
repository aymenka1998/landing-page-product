const { clearSession, sameOrigin } = require('../../lib/supabase');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'تعذر التحقق من مصدر الطلب.' });
  clearSession(res);
  return res.json({ success: true });
};
