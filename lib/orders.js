const { getAdmin, sameOrigin } = require('./supabase');

function getConfig() {
  const endpoint = process.env.GOOGLE_SHEET_WEBHOOK?.trim();
  const token = process.env.GOOGLE_SHEET_ACCESS_TOKEN?.trim();
  if (!endpoint || !token) throw new Error('أكمل إعداد GOOGLE_SHEET_WEBHOOK و GOOGLE_SHEET_ACCESS_TOKEN في Vercel.');
  return { endpoint, token };
}

async function callSheet(action, payload = {}) {
  const { endpoint, token } = getConfig();
  const url = new URL(endpoint);
  url.searchParams.set('action', action);
  url.searchParams.set('token', token);
  const options = action === 'list'
    ? { method: 'GET', cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, action, token }), cache: 'no-store' };
  const response = await fetch(url, options);
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch {
    if (/^\s*<!doctype html|^\s*<html/i.test(text)) throw new Error('عاد Google صفحة HTML بدل بيانات الطلبات. تحقق من رابط Apps Script الذي ينتهي بـ /exec، ومن نشر أحدث إصدار بصلاحية الوصول Anyone.');
    throw new Error(`استجابة غير صالحة من Google Sheets (HTTP ${response.status}).`);
  }
  if (!response.ok || !result?.success) throw new Error(result?.error || 'تعذر الاتصال بجدول Google Sheets.');
  return result;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'الطريقة غير مدعومة.' });
  if (req.method === 'PATCH' && !sameOrigin(req)) return res.status(403).json({ error: 'مصدر الطلب غير صالح.' });
  if (!await getAdmin(req, res).catch(() => null)) return res.status(401).json({ error: 'سجّل الدخول لمتابعة استخدام لوحة التحكم.' });
  try {
    if (req.method === 'GET') return res.json(await callSheet('list'));
    const { rowNumber, status } = req.body || {};
    if (!Number.isInteger(Number(rowNumber)) || Number(rowNumber) < 2 || typeof status !== 'string' || status.length > 40) return res.status(400).json({ error: 'رقم الطلب أو حالته غير صالح.' });
    return res.json(await callSheet('update', { rowNumber: Number(rowNumber), status }));
  } catch (error) {
    return res.status(503).json({ error: error.message || 'تعذر تحميل الطلبات.' });
  }
}

module.exports = handler;
module.exports.callSheet = callSheet;
