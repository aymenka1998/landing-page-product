const COOKIE = 'dashboard_session';
const SESSION_SECONDS = 8 * 60 * 60;

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!url || !anonKey || !serviceKey || !adminEmail) throw new Error('Supabase environment is incomplete.');
  return { url: url.replace(/\/$/, ''), anonKey, serviceKey, adminEmail };
}

function readCookie(req) {
  const raw = (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  try { return JSON.parse(Buffer.from(decodeURIComponent(raw.slice(COOKIE.length + 1)), 'base64url').toString()); }
  catch { return null; }
}

function setSession(res, session) {
  const value = Buffer.from(JSON.stringify(session)).toString('base64url');
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

async function authFetch(path, options = {}) {
  const c = config();
  return fetch(`${c.url}/auth/v1/${path}`, {
    ...options,
    headers: { apikey: c.anonKey, 'Content-Type': 'application/json', ...options.headers },
    cache: 'no-store',
  });
}

async function getAdmin(req, res) {
  const c = config();
  let session = readCookie(req);
  if (!session?.access_token || !session?.refresh_token) return null;

  if (Number(session.expires_at) < Math.floor(Date.now() / 1000) + 60) {
    const refreshed = await authFetch('token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const next = await refreshed.json().catch(() => null);
    if (!refreshed.ok || !next?.access_token) return null;
    session = {
      access_token: next.access_token,
      refresh_token: next.refresh_token,
      expires_at: next.expires_at || Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600),
    };
    setSession(res, session);
  }

  const result = await authFetch('user', { headers: { Authorization: `Bearer ${session.access_token}` } });
  const user = await result.json().catch(() => null);
  if (!result.ok || user?.email?.toLowerCase() !== c.adminEmail) return null;
  return { user, accessToken: session.access_token };
}

async function rest(path, options = {}) {
  const c = config();
  return fetch(`${c.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: c.serviceKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    cache: 'no-store',
  });
}

module.exports = { config, COOKIE, SESSION_SECONDS, authFetch, clearSession, getAdmin, readCookie, rest, sameOrigin, setSession };
