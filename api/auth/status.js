const { config, getAdmin } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  try {
    config();
    const admin = await getAdmin(req, res);
    return res.json({ configured: true, authenticated: Boolean(admin) });
  } catch {
    return res.status(503).json({ configured: false, authenticated: false, error: 'إعداد Supabase غير مكتمل في Vercel.' });
  }
};
