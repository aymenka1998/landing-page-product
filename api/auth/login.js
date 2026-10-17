const { authFetch, sameOrigin, setSession } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'تعذر التحقق من مصدر الطلب.' });
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || password.length < 1) return res.status(400).json({ error: 'تحقق من إعداد بريد المسؤول وأدخل كلمة المرور.' });

  try {
    const response = await authFetch('token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    const session = await response.json().catch(() => null);
    if (!response.ok || !session?.access_token) return res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });
    const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
    setSession(res, { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: expiresAt });
    return res.json({ success: true });
  } catch {
    return res.status(503).json({ error: 'تعذر الاتصال بـ Supabase. تحقق من إعدادات Vercel.' });
  }
};
