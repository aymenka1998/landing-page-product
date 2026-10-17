const fs = require('fs');
const path = require('path');
const { getAdmin } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let page = 'login.html';
  try {
    if (await getAdmin(req, res)) page = 'dashboard.html';
  } catch {}
  const file = path.join(process.cwd(), page);
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(fs.readFileSync(file));
  } catch {
    return res.status(500).send('تعذر تحميل لوحة التحكم. تحقق من إعداد نشر Vercel.');
  }
};
