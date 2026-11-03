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
    ctx.waitUntil(caches.default.put(key,response.clone()).catch(()=>{}));
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
