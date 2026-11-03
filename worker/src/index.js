import {gatePage} from './gate.js';
/**
 * Το Αρχείο των Σκιών — read-only Drive album.
 *
 * Google service account has Viewer access ONLY to the album's Drive folder.
 * No user Google OAuth tokens, writes, deletes, or upload endpoints exist here.
 * ALBUM_INDEX (Workers KV) holds a global manifest; Cron checks Drive every
 * five minutes and writes KV ONLY when file IDs/metadata actually change.
 * Cloudflare Cache API + browser caching retain versioned images/thumbnails.
 * Video byte-range requests stream from Drive, not through a whole-file cache.
 */
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const INDEX_KEY = 'album:manifest:v1';
const PAGE_SIZE = 120;
const IMAGE_CACHE_SECONDS = 21600;
const MAX_CACHED_IMAGE = 20 * 1024 * 1024;
const SUPPORTED = new Set([
  'image/jpeg','image/png','image/webp','image/gif','image/avif',
  'image/heic','image/heif',
  'video/mp4','video/quicktime','video/webm','video/x-matroska'
]);
let access = null;
let accessExpiry = 0;
let keyCache = null;
let keyFingerprint = '';

const isImage = mime => mime?.startsWith('image/') && SUPPORTED.has(mime);
const isVideo = mime => mime?.startsWith('video/') && SUPPORTED.has(mime);
const validId = id => /^[A-Za-z0-9_-]{10,180}$/.test(id || '');
const frontend = env => (env.FRONTEND_ORIGIN || 'https://pagkalosg.github.io').replace(/\/$/,'');
const configured = env => Boolean(
  env.DRIVE_FOLDER_ID && validId(env.DRIVE_FOLDER_ID) &&
  env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
  env.ALBUM_INDEX && typeof env.ALBUM_INDEX.get === 'function'
);
const b64url = bytes => {
  let binary = '';
  for(const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const json = (value,status=200,headers={}) => new Response(JSON.stringify(value), {
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}
});
const fail = (message,status=400) => json({error:message},status);
const sha256 = async string => b64url(new Uint8Array(
  await crypto.subtle.digest('SHA-256',new TextEncoder().encode(string))
));

async function privateKey(env) {
  const pem = String(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||'')
    .replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const fp = pem.slice(-48);
  if(keyCache && fp===keyFingerprint) return keyCache;
  const raw = Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  keyCache = await crypto.subtle.importKey('pkcs8',raw,{
    name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'
  },false,['sign']);
  keyFingerprint=fp;
  return keyCache;
}
async function googleToken(env) {
  if(access && Date.now() < accessExpiry) return access;
  const now=Math.floor(Date.now()/1000);
  const hdr=b64url(new TextEncoder().encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const body=b64url(new TextEncoder().encode(JSON.stringify({
    iss:env.GOOGLE_SERVICE_ACCOUNT_EMAIL,scope:DRIVE_SCOPE,
    aud:TOKEN_URL,iat:now,exp:now+3500
  })));
  const assertion=hdr+'.'+body;
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',await privateKey(env),new TextEncoder().encode(assertion));
  const form=new URLSearchParams({
    grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion:assertion+'.'+b64url(new Uint8Array(sig))
  });
  const res=await fetch(TOKEN_URL,{method:'POST',headers:{
    'Content-Type':'application/x-www-form-urlencoded'
  },body:form});
  const data=await res.json().catch(()=>({}));
  if(!res.ok || !data.access_token) throw Error('GOOGLE_AUTH');
  access=data.access_token;
  accessExpiry=Date.now()+Math.max(60,Number(data.expires_in||3600)-120)*1000;
  return access;
}
async function driveRequest(env,url,options={}) {
  if(!url.startsWith('https://www.googleapis.com/drive/v3/files')) throw Error('BAD_DRIVE_URL');
  const headers=new Headers(options.headers||{});
  headers.set('Authorization','Bearer '+await googleToken(env));
  // Do not forward OAuth bearer tokens to a redirect target.
  return fetch(url,{...options,redirect:'manual',headers});
}
async function folderAccessible(env) {
  const params=new URLSearchParams({fields:'id,mimeType,trashed'});
  const r=await driveRequest(env,DRIVE_API+'/'+encodeURIComponent(env.DRIVE_FOLDER_ID)+'?'+params);
  if(!r.ok) return false;
  const f=await r.json();
  return !f.trashed && f.id===env.DRIVE_FOLDER_ID &&
    f.mimeType==='application/vnd.google-apps.folder';
}
function normalizeFile(f) {
  if(!validId(f.id)||!SUPPORTED.has(f.mimeType)) return null;
  return {
    id:f.id,name:String(f.name||'Ανάμνηση').slice(0,240),
    type:isVideo(f.mimeType)?'video':'image',
    mimeType:f.mimeType,
    size:Number(f.size||0),
    createdTime:f.createdTime||f.modifiedTime||'',
    modifiedTime:f.modifiedTime||f.createdTime||'',
    md5Checksum:f.md5Checksum||''
  };
}
async function readDriveFiles(env) {
  if(!(await folderAccessible(env))) throw Error('FOLDER_UNAVAILABLE');
  const files=[];
  let page='';
  // Read all pages. Only files directly in the chosen folder are eligible.
  for(let i=0;i<100;i++) {
    const params=new URLSearchParams({
      q:"'"+env.DRIVE_FOLDER_ID+"' in parents and trashed = false",
      fields:'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size,md5Checksum)',
      pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true'
    });
    if(page) params.set('pageToken',page);
    const res=await driveRequest(env,DRIVE_API+'?'+params);
    if(!res.ok) throw Error('DRIVE_LIST');
    const data=await res.json();
    for(const raw of data.files||[]) {
      const file=normalizeFile(raw);
      if(file) files.push(file);
    }
    page=data.nextPageToken||'';
    if(!page) break;
    if(i===99) throw Error('DRIVE_TOO_MANY_FILES');
  }
  files.sort((a,b)=>b.createdTime.localeCompare(a.createdTime) || a.id.localeCompare(b.id));
  return files;
}
function signature(files) {
  // Do not include expiring thumbnailLink or request-time values.
  return files.map(f=>[f.id,f.name,f.mimeType,f.size,f.createdTime,f.modifiedTime,f.md5Checksum].join(':')).sort().join('\n');
}
async function refreshAlbum(env) {
  if(!configured(env)) throw Error('NOT_CONFIGURED');
  const files=await readDriveFiles(env);
  const version=await sha256(signature(files));
  const prev=await env.ALBUM_INDEX.get(INDEX_KEY,'json');
  if(prev?.version===version) {
    return {changed:false,version,count:files.length};
  }
  const updated={version,files,updatedAt:new Date().toISOString()};
  await env.ALBUM_INDEX.put(INDEX_KEY,JSON.stringify(updated));
  return {changed:true,version,count:files.length,previousVersion:prev?.version||null};
}
async function album(env) {
  if(!configured(env)) throw Error('NOT_CONFIGURED');
  const cached=await env.ALBUM_INDEX.get(INDEX_KEY,'json');
  if(cached && Array.isArray(cached.files) && cached.version) return cached;
  // First visit can initialize the cache; all later visits use KV only.
  await refreshAlbum(env);
  return env.ALBUM_INDEX.get(INDEX_KEY,'json');
}
const fileVersion = f => encodeURIComponent(f.md5Checksum||f.modifiedTime||'initial');
function outputFile(f) {
  const id=encodeURIComponent(f.id),v=fileVersion(f);
  return {...f,
    thumbnailUrl:'/api/thumb/'+id+'?v='+v,
    mediaUrl:'/api/media/'+id+'?v='+v
  };
}
async function listFiles(env,request) {
  const snapshot=await album(env);
  if(!snapshot) return fail('Η συλλογή ετοιμάζεται. Δοκίμασε ξανά.',503);
  const text=new URL(request.url).searchParams.get('page')||'0';
  if(!/^\d{1,7}$/.test(text)) return fail('Μη έγκυρη σελίδα.',400);
  const offset=Number(text);
  const items=snapshot.files.slice(offset,offset+PAGE_SIZE).map(outputFile);
  const next=offset+PAGE_SIZE<snapshot.files.length?String(offset+PAGE_SIZE):null;
  return json({items,nextPageToken:next,version:snapshot.version,
    total:snapshot.files.length,updatedAt:snapshot.updatedAt});
}
async function changes(env,request) {
  const snapshot=await album(env);
  if(!snapshot) return fail('Η συλλογή δεν είναι ακόμη διαθέσιμη.',503);
  const since=new URL(request.url).searchParams.get('since')||'';
  return json({changed:since!==snapshot.version,version:snapshot.version,
    total:snapshot.files.length,updatedAt:snapshot.updatedAt});
}
function headerContentType(upstream, fallback){
  const type=upstream.headers.get('Content-Type')||'';
  return type.startsWith('image/')||type.startsWith('video/')?type:fallback;
}
function cachedResponse(response, request, ctx, seconds) {
  if(response.ok && typeof caches!=='undefined' && caches.default && ctx?.waitUntil) {
    const key=new Request(new URL(request.url).toString(),{method:'GET'});
    // This copy is stored inside the Worker Cache API, not sent to guests.
    const internalHeaders=new Headers(response.headers);
    internalHeaders.set('Cache-Control','public, max-age='+seconds+', immutable');
    const internal=new Response(response.clone().body,{status:response.status,headers:internalHeaders});
    ctx.waitUntil(caches.default.put(key,internal).catch(()=>{}));
  }
  return response;
}
async function serveMedia(env,request,ctx,thumbnail=false) {
  const url=new URL(request.url);
  const prefix=thumbnail?'/api/thumb/':'/api/media/';
  const id=decodeURIComponent(url.pathname.slice(prefix.length));
  if(!validId(id)) return fail('Το αρχείο δεν βρέθηκε.',404);
  const snapshot=await album(env);
  const file=snapshot?.files.find(x=>x.id===id);
  if(!file) return fail('Το αρχείο δεν υπάρχει στο άλμπουμ.',404);

  const v=url.searchParams.get('v');
  if(v!== (file.md5Checksum||file.modifiedTime||'initial')) return fail('Η έκδοση του αρχείου έχει αλλάξει.',410);
  const range=request.headers.get('Range');
  if(range && !/^bytes=\d*-\d*$/.test(range)) return fail('Μη έγκυρο εύρος.',416);
  const downloading=url.searchParams.get('download')==='1';
  const cacheable=!range && !downloading &&
    (thumbnail || (isImage(file.mimeType) && file.size>0 && file.size<=MAX_CACHED_IMAGE));
  const cacheKey=new Request(url.toString(),{method:'GET'});
  if(cacheable && typeof caches!=='undefined' && caches.default) {
    const hit=await caches.default.match(cacheKey);
    if(hit) return hit;
  }
  let target=DRIVE_API+'/'+encodeURIComponent(id)+'?alt=media';
  let upstream;
  if(thumbnail){
    const params=new URLSearchParams({fields:'thumbnailLink',supportsAllDrives:'true'});
    const meta=await driveRequest(env,DRIVE_API+'/'+encodeURIComponent(id)+'?'+params);
    if(!meta.ok) return fail('Δεν υπάρχει διαθέσιμη μικρογραφία.',404);
    const data=await meta.json();
    if(!data.thumbnailLink) return fail('Δεν υπάρχει διαθέσιμη μικρογραφία.',404);
    const preview=new URL(data.thumbnailLink);
    const hostname=preview.hostname.toLowerCase();
    if(preview.protocol!=='https:'||
      !(hostname==='googleusercontent.com'||hostname.endsWith('.googleusercontent.com')||
        hostname==='google.com'||hostname.endsWith('.google.com'))) {
      return fail('Μη έγκυρη μικρογραφία.',502);
    }
    // Google thumbnailLink for private files needs an authorized request.
    upstream=await fetch(preview.toString(),{redirect:'manual',
      headers:{Authorization:'Bearer '+await googleToken(env)}});
  } else {
    const headers={};
    if(range)headers.Range=range;
    upstream=await driveRequest(env,target,{headers});
  }
  if(!upstream.ok) return fail('Αποτυχία ανάκτησης πολυμέσου.',upstream.status===404?404:502);
  const headers=new Headers();
  for(const h of ['Content-Length','Content-Range','Accept-Ranges','ETag']) {
    const value=upstream.headers.get(h);
    if(value)headers.set(h,value);
  }
  headers.set('Content-Type',headerContentType(upstream,thumbnail?'image/jpeg':file.mimeType));
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Content-Disposition',downloading
    ? "attachment; filename*=UTF-8''"+encodeURIComponent(file.name)
    : 'inline');
  // The Worker Cache API is used only after authorization. Shared/public
  // HTTP caches must not serve private photos independently of that check.
  headers.set('Cache-Control','private, no-store');
  const response=new Response(upstream.body,{status:upstream.status,headers});
  return cacheable?cachedResponse(response,request,ctx,IMAGE_CACHE_SECONDS):response;
}

const SESSION_COOKIE = '__Host-shadow_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const PUBLIC_SITE = 'https://pagkalosg.github.io/halloween-party/';
const encoder = new TextEncoder();

const allowedStatic = path => path==='/' || path==='/index.html' ||
  /^\/(?:styles\.css|app\.js|parallax\.js|config\.js|favicon\.ico|robots\.txt)$/.test(path) ||
  /^\/assets\/[a-zA-Z0-9_./-]{1,180}$/.test(path) && !path.includes('..');

function authReady(env) {
  return Boolean(
    typeof env.ALBUM_PASSWORD==='string' && env.ALBUM_PASSWORD.length >= 8 &&
    typeof env.ALBUM_SESSION_SECRET==='string' && env.ALBUM_SESSION_SECRET.length >= 32 &&
    env.LOGIN_LIMITER && typeof env.LOGIN_LIMITER.limit==='function'
  );
}
async function sessionKey(env) {
  return crypto.subtle.importKey('raw',encoder.encode(env.ALBUM_SESSION_SECRET),
    {name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function comparePasswords(given,expected) {
  if(typeof given!=='string'||given.length<1||given.length>128)return false;
  const [a,b]=await Promise.all([given,expected].map(t=>crypto.subtle.digest('SHA-256',encoder.encode(t))));
  const x=new Uint8Array(a), y=new Uint8Array(b);
  let diff=0;
  for(let i=0;i<32;i++)diff |= x[i]^y[i];
  return diff===0;
}
function getCookie(request) {
  const raw=request.headers.get('Cookie')||'';
  const match=raw.split(';').map(v=>v.trim()).find(v=>v.startsWith(SESSION_COOKIE+'='));
  return match?match.slice(SESSION_COOKIE.length+1):'';
}
async function newSession(env) {
  const expires=String(Math.floor(Date.now()/1000)+SESSION_SECONDS);
  const nonce=b64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload='v1.'+expires+'.'+nonce;
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode(payload)));
  return payload+'.'+b64url(signature);
}
async function validSession(request,env) {
  if(!authReady(env))return false;
  const parts=getCookie(request).split('.');
  if(parts.length!==4||parts[0]!=='v1')return false;
  const [version,expiration,nonce,signature]=parts;
  if(!/^\d{10,11}$/.test(expiration)||!/^[A-Za-z0-9_-]{22}$/.test(nonce)||
    !/^[A-Za-z0-9_-]{43}$/.test(signature))return false;
  const now=Math.floor(Date.now()/1000),expires=Number(expiration);
  if(expires<=now||expires>now+SESSION_SECONDS)return false;
  try {
    const base64=signature.replace(/-/g,'+').replace(/_/g,'/');
    const sig=Uint8Array.from(atob(base64+'='.repeat((4-base64.length%4)%4)),c=>c.charCodeAt(0));
    return crypto.subtle.verify('HMAC',await sessionKey(env),sig,
      encoder.encode(version+'.'+expiration+'.'+nonce));
  }catch{return false;}
}
function secureCookie(value) {
  return SESSION_COOKIE+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+SESSION_SECONDS;
}
function clearCookie() {
  return SESSION_COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}
function protectedResponse(response) {
  const headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Frame-Options','DENY');
  headers.set('X-Robots-Tag','noindex,nofollow');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('Cross-Origin-Resource-Policy','same-origin');
  // Cache API hits carry an internal public TTL. Never propagate it to clients.
  const type=headers.get('Content-Type')||'';
  if(type.startsWith('image/')||type.startsWith('video/'))
    headers.set('Cache-Control','private, no-store');
  else if(!headers.has('Cache-Control'))headers.set('Cache-Control','private, no-store');
  return new Response(response.body,{status:response.status,headers});
}
function noAccess() {
  return protectedResponse(json({error:'Ο πορτιέρης ζητά τον μυστικό κωδικό.',loginRequired:true},401));
}
async function handleLogin(request,env) {
  if(!authReady(env))return fail('Η πύλη χρειάζεται ακόμη τις ασφαλείς ρυθμίσεις της.',503);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return fail('Μη επιτρεπτή προέλευση.',403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))
    return fail('Μη έγκυρο αίτημα.',415);
  if(Number(request.headers.get('Content-Length')||0)>2048)return fail('Μεγάλο αίτημα.',413);
  const ip=(request.headers.get('CF-Connecting-IP')||'unknown').slice(0,70);
  const {success}=await env.LOGIN_LIMITER.limit({key:ip});
  if(!success)return fail('Πάρα πολλές προσπάθειες. Δοκίμασε σε ένα λεπτό.',429);
  let data;
  try {
    const body=await request.text();
    if(body.length>2048)return fail('Μεγάλο αίτημα.',413);
    data=JSON.parse(body);
  } catch {return fail('Μη έγκυρο αίτημα.',400);}
  if(!(await comparePasswords(data?.password,env.ALBUM_PASSWORD)))
    return fail('Ο πορτιέρης δεν σε αναγνωρίζει.',401);
  const response=json({ok:true,expiresIn:SESSION_SECONDS});
  response.headers.set('Set-Cookie',secureCookie(await newSession(env)));
  return response;
}
async function publicPage(request,env) {
  const path=new URL(request.url).pathname;
  if(!(await validSession(request,env))) {
    if(path==='/'||path==='/index.html')
      return protectedResponse(new Response(gatePage(),{
        headers:{
          'Content-Type':'text/html; charset=utf-8',
          'Cache-Control':'no-store',
          'Content-Security-Policy':"default-src 'none'; img-src https://pagkalosg.github.io; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
        }
      }));
    return noAccess();
  }
  if(!allowedStatic(path))return protectedResponse(fail('Η διαδρομή δεν υπάρχει.',404));
  const asset=path==='/'?'index.html':path.slice(1);
  const upstream=await fetch(new URL(asset,PUBLIC_SITE),{redirect:'manual'});
  if(!upstream.ok)return protectedResponse(fail('Το αρχείο της σελίδας δεν είναι διαθέσιμο.',upstream.status===404?404:502));
  const headers=new Headers();
  headers.set('Content-Type',upstream.headers.get('Content-Type')||'application/octet-stream');
  headers.set('Cache-Control',asset==='index.html'?'private, no-store':'private, max-age=3600');
  return protectedResponse(new Response(upstream.body,{status:upstream.status,headers}));
}

export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url),path=url.pathname;
    try {
      if(path==='/auth/login') {
        return protectedResponse(request.method==='POST'
          ? await handleLogin(request,env) : fail('Μη επιτρεπτή μέθοδος.',405));
      }
      if(path==='/auth/logout') {
        if(request.method!=='POST')return protectedResponse(fail('Μη επιτρεπτή μέθοδος.',405));
        if(request.headers.get('Origin')!==url.origin)return protectedResponse(fail('Μη επιτρεπτή προέλευση.',403));
        const response=json({ok:true});
        response.headers.set('Set-Cookie',clearCookie());
        return protectedResponse(response);
      }
      if(path==='/auth/status')
        return protectedResponse(json({authenticated:await validSession(request,env),gateReady:authReady(env)}));
      if(request.method!=='GET')return protectedResponse(fail('Επιτρέπεται μόνο προβολή.',405));
      // The GitHub Pages copy is public, but on this hostname the HTML, CSS
      // and JavaScript are served with the same-origin signed session cookie.
      if(!path.startsWith('/api/'))return publicPage(request,env);
      if(!(await validSession(request,env)))return noAccess();
      if(!configured(env))
        return protectedResponse(fail('Η σύνδεση με το Drive δεν έχει ολοκληρωθεί.',503));
      let response;
      if(path==='/api/config') {
        response=json({ready:true,readOnly:true,syncMode:'cron',syncMinutes:5,
          uploadsEnabled:false,cacheEnabled:Boolean(env.ALBUM_INDEX)});
      }else if(path==='/api/folder-access') {
        response=json({folderAccessible:await folderAccessible(env)});
      }else if(path==='/api/items') {
        response=await listFiles(env,request);
      }else if(path==='/api/changes') {
        response=await changes(env,request);
      }else if(path.startsWith('/api/thumb/')) {
        response=await serveMedia(env,request,ctx,true);
      }else if(path.startsWith('/api/media/')) {
        response=await serveMedia(env,request,ctx,false);
      }else response=fail('Η διαδρομή δεν υπάρχει.',404);
      return protectedResponse(response);
    }catch(error){
      console.error('Album gate/API error:',error?.message||'unknown');
      return protectedResponse(fail('Προσωρινό πρόβλημα επικοινωνίας με το αρχείο.',503));
    }
  },
  async scheduled(controller,env,ctx) {
    if(!configured(env)) return;
    ctx.waitUntil(refreshAlbum(env)
      .then(result=>console.log('Album refresh:',result.changed?'updated':'unchanged',result.count))
      .catch(error=>console.error('Album sync error:',error?.message||'unknown')));
  }
};
