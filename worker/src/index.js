/**
 * Shadow Album Worker — Drive list/read + authenticated upload sessions.
 * Uses the non-sensitive Google OAuth drive.file scope: only app-created and
 * individually Picker-approved items may be accessed. Google Drive, not the
 * Worker, enforces that scope. Do not authorize the broad drive scope.
 * All public GET media requests validate direct membership in one folder.
 * Public writes require Cloudflare Turnstile and encrypted upload sessions.
 */
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType';
const CHUNK = 4 * 1024 * 1024;
const MAX_FILE = 300 * 1024 * 1024;
const MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'
]);
let cachedToken;
let tokenExpiry = 0;

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' } });
}
const failure = (message, status = 400) => reply({ error:message }, status);
const frontendOrigin = env => (env.FRONTEND_ORIGIN || 'https://pagkalosg.github.io').replace(/\/$/, '');
const ready = env => !!(env.DRIVE_FOLDER_ID && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);
const canUpload = env => ready(env) && env.UPLOADS_ENABLED === 'true' && !!(env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY && env.UPLOAD_SIGNING_KEY);
const fileMime = type => MEDIA_TYPES.has(type);
const goodId = id => /^[A-Za-z0-9_-]{10,180}$/.test(id || '');
const urlEncode = encodeURIComponent;

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  const requestOrigin = request.headers.get('Origin');
  if (requestOrigin === frontendOrigin(env)) {
    headers.set('Access-Control-Allow-Origin', requestOrigin);
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Content-Range, Range, X-Upload-Token');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, OPTIONS');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    headers.set('Vary', 'Origin');
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status:response.status, headers });
}
async function token(env) {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (!ready(env)) throw Error('NOT_CONFIGURED');
  const data = new URLSearchParams({
    grant_type:'refresh_token', client_id:env.GOOGLE_CLIENT_ID,
    client_secret:env.GOOGLE_CLIENT_SECRET, refresh_token:env.GOOGLE_REFRESH_TOKEN
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:data
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw Error('GOOGLE_AUTH');
  cachedToken = j.access_token;
  tokenExpiry = Date.now() + Math.max(60, Number(j.expires_in || 3600) - 120) * 1000;
  return cachedToken;
}
async function driveFetch(env, endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', 'Bearer ' + await token(env));
  return fetch(endpoint, { ...options, headers });
}
async function getMeta(env, id) {
  if (!goodId(id)) return null;
  const params = new URLSearchParams({ fields:'id,name,mimeType,parents,thumbnailLink,size,trashed', supportsAllDrives:'true' });
  const r = await driveFetch(env, DRIVE + '/' + urlEncode(id) + '?' + params);
  if (!r.ok) return null;
  const file = await r.json();
  if (file.trashed || !file.parents?.includes(env.DRIVE_FOLDER_ID) || !fileMime(file.mimeType)) return null;
  return file;
}
async function listFiles(env, request) {
  const page = new URL(request.url).searchParams.get('page') || '';
  if (page.length > 3500) return failure('Μη έγκυρη σελίδα.', 400);
  const folder = env.DRIVE_FOLDER_ID.replace(/'/g, '');
  const params = new URLSearchParams({
    q:"'" + folder + "' in parents and trashed = false",
    fields:'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size,thumbnailLink)',
    orderBy:'createdTime desc', pageSize:'100', supportsAllDrives:'true', includeItemsFromAllDrives:'true'
  });
  if (page) params.set('pageToken', page);
  const r = await driveFetch(env, DRIVE + '?' + params);
  if (!r.ok) return failure('Δεν ήταν δυνατή η ανάγνωση του άλμπουμ.', 502);
  const data = await r.json();
  return reply({
    items:(data.files || []).filter(f => fileMime(f.mimeType)).map(f => ({
      id:f.id, name:f.name, type:f.mimeType.startsWith('video/')?'video':'image',
      mimeType:f.mimeType, size:Number(f.size || 0), createdTime:f.createdTime,
      thumbnailUrl:'/api/thumb/' + urlEncode(f.id), mediaUrl:'/api/media/' + urlEncode(f.id)
    })),
    nextPageToken:data.nextPageToken || null
  });
}
async function streamFile(env, request, id, thumbnail = false) {
  const f = await getMeta(env, id);
  if (!f) return failure('Το αρχείο δεν υπάρχει σε αυτό το άλμπουμ.', 404);
  if (thumbnail && !f.thumbnailLink && f.mimeType.startsWith('video/')) return failure('Δεν υπάρχει ακόμη μικρογραφία.', 404);
  const url = thumbnail && f.thumbnailLink
    ? f.thumbnailLink
    : DRIVE + '/' + urlEncode(id) + '?alt=media&supportsAllDrives=true';
  const headers = new Headers();
  const range = request.headers.get('Range');
  if (!thumbnail && range && /^bytes=\d*-\d*$/.test(range)) headers.set('Range', range);
  const r = await driveFetch(env, url, { headers });
  if (!r.ok) return failure('Αποτυχία ανάκτησης του αρχείου.', r.status===404?404:502);
  const responseHeaders = new Headers();
  for (const h of ['Content-Type','Content-Length','Content-Range','Accept-Ranges','ETag']) {
    const v = r.headers.get(h); if (v) responseHeaders.set(h,v);
  }
  if (!responseHeaders.has('Content-Type')) responseHeaders.set('Content-Type', thumbnail ? 'image/jpeg' : f.mimeType);
  responseHeaders.set('Cache-Control', thumbnail ? 'public, max-age=180' : 'private, max-age=180');
  const downloadable = !thumbnail && new URL(request.url).searchParams.get('download') === '1';
  const encodedName = encodeURIComponent(f.name || 'photo');
  responseHeaders.set('Content-Disposition', downloadable ? "attachment; filename*=UTF-8''" + encodedName : 'inline');
  return new Response(r.body, { status:r.status, headers:responseHeaders });
}
function b64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unb64(s) {
  const raw = atob(s.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function hmacKey(env) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.UPLOAD_SIGNING_KEY),
    { name:'HMAC', hash:'SHA-256' }, false, ['sign','verify']);
}
async function issue(env, data) {
  const raw = b64url(new TextEncoder().encode(JSON.stringify(data)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(raw));
  return raw + '.' + b64url(new Uint8Array(sig));
}
async function unpack(env, signed) {
  if (typeof signed !== 'string' || signed.length > 8000) return null;
  const pair = signed.split('.');
  if (pair.length !== 2) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64(pair[1]), new TextEncoder().encode(pair[0]));
    if (!valid) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64(pair[0])));
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}
// A Google resumable upload URL is a bearer capability. Never place that URL
// inside a readable HMAC/JWT payload sent to an anonymous visitor.
async function sessionKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.UPLOAD_SIGNING_KEY));
  return crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
}
async function sealSession(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const result = await crypto.subtle.encrypt({name:'AES-GCM',iv}, await sessionKey(env), bytes);
  return 'v1.' + b64url(iv) + '.' + b64url(new Uint8Array(result));
}
async function openSession(env, value) {
  if (typeof value !== 'string' || value.length > 9000) return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  try {
    const iv = unb64(parts[1]);
    if (iv.length !== 12) return null;
    const payload = await crypto.subtle.decrypt(
      {name:'AES-GCM',iv}, await sessionKey(env), unb64(parts[2])
    );
    const session = JSON.parse(new TextDecoder().decode(payload));
    return session.exp > Date.now() ? session : null;
  } catch { return null; }
}
async function folderStatus(env) {
  const id = env.DRIVE_FOLDER_ID;
  if (!goodId(id)) return false;
  const query = new URLSearchParams({fields:'id,mimeType,trashed',supportsAllDrives:'true'});
  const r = await driveFetch(env, DRIVE + '/' + urlEncode(id) + '?' + query);
  if (!r.ok) return false;
  const folder = await r.json();
  return !folder.trashed && folder.id === id && folder.mimeType === 'application/vnd.google-apps.folder';
}
async function readSmallBody(request) {
  if (Number(request.headers.get('Content-Length') || 0) > 8192) return null;
  try { return await request.json(); } catch { return null; }
}
async function withinUploadLimit(env, request, route) {
  if (!env.UPLOAD_LIMITER) return false; // Fail closed without rate-limiting protection.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const {success} = await env.UPLOAD_LIMITER.limit({key:route + ':' + ip});
  return success;
}
async function authorize(request, env) {
  if (!canUpload(env)) return failure('Η αποστολή δεν έχει ενεργοποιηθεί.', 503);
  if (!(await withinUploadLimit(env,request,'grant'))) return failure('Πολλές προσπάθειες αποστολής. Δοκίμασε σε λίγο.', 429);
  const body = await readSmallBody(request);
  if (typeof body?.turnstileToken !== 'string' || body.turnstileToken.length > 2500)
    return failure('Χρειάζεται έλεγχος ασφάλειας.', 400);
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', body.turnstileToken);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method:'POST',body:form});
  if (!r.ok) return failure('Ο έλεγχος ασφάλειας δεν ολοκληρώθηκε.', 502);
  const verdict = await r.json();
  if (!verdict.success || verdict.hostname !== 'pagkalosg.github.io') return failure('Ο έλεγχος ασφάλειας απέτυχε. Δοκίμασε ξανά.', 403);
  const grant = await issue(env, {kind:'grant', ip, exp:Date.now()+15*60*1000});
  return reply({grant});
}
async function startUpload(request, env) {
  if (!canUpload(env)) return failure('Η αποστολή δεν έχει ενεργοποιηθεί.', 503);
  if (!(await withinUploadLimit(env,request,'start'))) return failure('Υπερβολικά πολλά αρχεία. Περίμενε λίγο.', 429);
  const data = await readSmallBody(request);
  const grant = await unpack(env, data?.grant);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!grant || grant.kind !== 'grant' || grant.ip !== ip) return failure('Η άδεια αποστολής έληξε.', 403);
  const size = Number(data?.size), mimeType = String(data?.mimeType || '');
  const name = String(data?.name || '').replace(/[\\/\x00-\x1f]/g,'_').trim().slice(0,180);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE) return failure('Μέγιστο μέγεθος: 300 MB.', 413);
  if (!fileMime(mimeType) || !name) return failure('Επιτρέπονται μόνο φωτογραφίες και βίντεο.', 415);
  if (!(await folderStatus(env))) return failure('Ο φάκελος δεν έχει επιλεγεί ακόμη με Google Picker. Άνοιξε το owner.html.', 403);
  const r = await driveFetch(env, UPLOAD, {
    method:'POST',
    headers:{'Content-Type':'application/json; charset=utf-8','X-Upload-Content-Type':mimeType,'X-Upload-Content-Length':String(size)},
    body:JSON.stringify({name, mimeType, parents:[env.DRIVE_FOLDER_ID]})
  });
  if (!r.ok) return failure('Το Drive δεν επέτρεψε την αποστολή.', 502);
  const session = r.headers.get('Location');
  if (!session) return failure('Δεν δημιουργήθηκε συνεδρία αποστολής.', 502);
  const u = new URL(session);
  if (u.protocol !== 'https:' || u.hostname !== 'www.googleapis.com' || u.pathname !== '/upload/drive/v3/files')
    return failure('Μη έγκυρη απάντηση από το Drive.', 502);
  const uploadToken = await sealSession(env, {kind:'session', session, size, ip, exp:Date.now()+60*60*1000});
  return reply({uploadToken, chunkSize:CHUNK});
}
async function uploadChunk(request, env) {
  if (!canUpload(env)) return failure('Η αποστολή δεν έχει ενεργοποιηθεί.', 503);
  const data = await openSession(env, request.headers.get('X-Upload-Token'));
  if (!data || data.kind !== 'session' || data.ip !== (request.headers.get('CF-Connecting-IP') || ''))
    return failure('Η συνεδρία αποστολής έληξε.', 403);
  const u = new URL(data.session);
  if (u.protocol !== 'https:' || u.hostname !== 'www.googleapis.com' || u.pathname !== '/upload/drive/v3/files')
    return failure('Μη έγκυρη συνεδρία.', 403);
  const range = request.headers.get('Content-Range') || '';
  const match = range.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (!match) return failure('Μη έγκυρο εύρος αρχείου.', 400);
  const start = Number(match[1]), end = Number(match[2]), total = Number(match[3]);
  if (![start,end,total].every(Number.isSafeInteger) || total !== data.size || start > end || end >= total ||
      end-start+1 > CHUNK || start % (256 * 1024) !== 0) return failure('Μη έγκυρο τμήμα αρχείου.', 400);
  const upstream = await driveFetch(env, data.session, {
    method:'PUT', headers:{'Content-Range':range,'Content-Type':'application/octet-stream'}, body:request.body
  });
  if (upstream.status === 308) return reply({done:false,range:upstream.headers.get('Range') || null});
  if (!upstream.ok) return failure('Η αποστολή διακόπηκε. Δοκίμασε ξανά.', 502);
  const result = await upstream.json().catch(() => ({}));
  return reply({done:true,id:result.id || null, name:result.name || null}, 201);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return withCors(new Response(null, {status:204}), request, env);
    let result;
    try {
      if (url.pathname === '/api/config' && request.method === 'GET') {
        result = reply({ready:ready(env),uploadsEnabled:canUpload(env),
          turnstileSiteKey:canUpload(env)?env.TURNSTILE_SITE_KEY:null,maxFileBytes:MAX_FILE});
      } else if (!ready(env)) {
        result = failure('Το Google Drive δεν έχει εξουσιοδοτηθεί ακόμη.', 503);
      } else if (url.pathname === '/api/folder-access' && request.method === 'GET') {
        result = reply({folderAccessible:await folderStatus(env)});
      } else if (url.pathname === '/api/items' && request.method === 'GET') {
        result = await listFiles(env,request);
      } else if (url.pathname.startsWith('/api/thumb/') && request.method === 'GET') {
        result = await streamFile(env,request,url.pathname.slice('/api/thumb/'.length),true);
      } else if (url.pathname.startsWith('/api/media/') && request.method === 'GET') {
        result = await streamFile(env,request,url.pathname.slice('/api/media/'.length));
      } else if (request.headers.get('Origin') !== frontendOrigin(env)) {
        result = failure('Μη επιτρεπτή προέλευση αιτήματος.', 403);
      } else if (url.pathname === '/api/upload/authorize' && request.method === 'POST') {
        result = await authorize(request,env);
      } else if (url.pathname === '/api/upload/start' && request.method === 'POST') {
        result = await startUpload(request,env);
      } else if (url.pathname === '/api/upload/chunk' && request.method === 'PUT') {
        result = await uploadChunk(request,env);
      } else result = failure('Η διαδρομή δεν υπάρχει.',404);
    } catch (error) {
      result = failure(error?.message === 'GOOGLE_AUTH'
        ? 'Η Google σύνδεση χρειάζεται επανασύνδεση.' : 'Παρουσιάστηκε σφάλμα στον διακομιστή.',503);
    }
    return withCors(result, request, env);
  }
};