import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker from '../src/index.js';

globalThis.crypto ||= webcrypto;
const base='https://halloween-party-album-api.pagkalosgeo.workers.dev';
const request=(path,options={})=>new Request(base+path,options);
const sessionSecret='This-long-random-session-test-secret-is-not-a-production-password';
const env={
  DRIVE_FOLDER_ID:'1cnjXZT6E8DQVmUjA7rTO_GZHzq5eRUQC',
  FRONTEND_ORIGIN:'https://pagkalosg.github.io',
  GOOGLE_SERVICE_ACCOUNT_EMAIL:'tests@example.iam.gserviceaccount.com',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'not-used-for-auth-tests',
  ALBUM_INDEX:{get:async()=>null,put:async()=>{}},
  ALBUM_PASSWORD:'super-secret-test-only',
  ALBUM_SESSION_SECRET:sessionSecret,
  LOGIN_LIMITER:{limit:async()=>({success:true})}
};
const login=async(password=env.ALBUM_PASSWORD,extra={})=>worker.fetch(request('/auth/login',{
  method:'POST',headers:{Origin:base,'Content-Type':'application/json',...extra},
  body:JSON.stringify({password})
}),env);
const cookieOf=response=>response.headers.get('Set-Cookie')?.split(';')[0]||'';

test('landing page is a haunted password gate without cookie',async()=>{
  const response=await worker.fetch(request('/'),env);
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Ο ΠΟΡΤΙΕΡΗΣ ΣΕ ΠΕΡΙΜΕΝΕΙ/);
  assert.match(html,/type="password"/);
  assert.doesNotMatch(html,/#gallery/);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});
for(const path of [
  '/api/config','/api/items','/api/changes','/api/folder-access',
  '/api/thumb/valid-file-000000','/api/media/valid-file-000000','/styles.css'
]) {
  test('private resource requires signed session: '+path,async()=>{
    const response=await worker.fetch(request(path),env);
    assert.equal(response.status,401);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  });
}
test('guest passwords of exactly 8 characters are accepted',async()=>{
  const shortEnv={...env,ALBUM_PASSWORD:'Spooky88'};
  const response=await worker.fetch(request('/auth/login',{
    method:'POST',
    headers:{Origin:base,'Content-Type':'application/json'},
    body:JSON.stringify({password:'Spooky88'})
  }),shortEnv);
  assert.equal(response.status,200);
  assert.match(response.headers.get('Set-Cookie'),/__Host-shadow_session=/);
});
test('guest passwords shorter than 8 characters fail closed',async()=>{
  const weakEnv={...env,ALBUM_PASSWORD:'seven77'};
  const response=await worker.fetch(request('/auth/login',{
    method:'POST',
    headers:{Origin:base,'Content-Type':'application/json'},
    body:JSON.stringify({password:'seven77'})
  }),weakEnv);
  assert.equal(response.status,503);
});
test('wrong password is not accepted',async()=>{
  const response=await login('incorrect-password');
  assert.equal(response.status,401);
  assert.equal(response.headers.get('Set-Cookie'),null);
});
test('cross-origin login forbidden',async()=>{
  const response=await login(env.ALBUM_PASSWORD,{Origin:'https://untrusted.example'});
  assert.equal(response.status,403);
});
test('rate-limited login returns 429',async()=>{
  const rejected={...env,LOGIN_LIMITER:{limit:async()=>({success:false})}};
  const response=await worker.fetch(request('/auth/login',{method:'POST',
    headers:{Origin:base,'Content-Type':'application/json'},
    body:JSON.stringify({password:env.ALBUM_PASSWORD})
  }),rejected);
  assert.equal(response.status,429);
});
test('valid password issues secure HttpOnly same-origin cookie',async()=>{
  const response=await login();
  assert.equal(response.status,200);
  const cookie=response.headers.get('Set-Cookie');
  assert.match(cookie,/__Host-shadow_session=/);
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/Secure/);
  assert.match(cookie,/SameSite=Lax/);
  const status=await worker.fetch(request('/auth/status',{headers:{Cookie:cookieOf(response)}}),env);
  assert.equal((await status.json()).authenticated,true);
});
test('authenticated session can view read-only config',async()=>{
  const cookie=cookieOf(await login());
  const response=await worker.fetch(request('/api/config',{headers:{Cookie:cookie}}),env);
  assert.equal(response.status,200);
  assert.equal((await response.json()).uploadsEnabled,false);
});
test('tampered cookie is invalid',async()=>{
  const original=cookieOf(await login());
  const broken=original.slice(0,-2)+(original.endsWith('AA')?'BB':'AA');
  const response=await worker.fetch(request('/api/config',{headers:{Cookie:broken}}),env);
  assert.equal(response.status,401);
});
test('logout clears cookie',async()=>{
  const response=await worker.fetch(request('/auth/logout',{
    method:'POST',headers:{Origin:base,Cookie:cookieOf(await login())}
  }),env);
  assert.equal(response.status,200);
  assert.match(response.headers.get('Set-Cookie'),/Max-Age=0/);
});
for(const [method,path] of [
  ['POST','/api/upload/authorize'],['POST','/api/upload/start'],
  ['PUT','/api/upload/chunk'],['DELETE','/api/media/valid-file-000000']
]) {
  test(method+' '+path+' cannot upload or delete',async()=>{
    const response=await worker.fetch(request(path,{method}),env);
    assert.equal(response.status,405);
  });
}
test('fails closed when password secrets are not configured',async()=>{
  const response=await worker.fetch(request('/api/items'),{
    ...env,ALBUM_SESSION_SECRET:undefined
  });
  assert.equal(response.status,401);
  const denied=await worker.fetch(request('/auth/login',{
    method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
    body:JSON.stringify({password:env.ALBUM_PASSWORD})
  }),{...env,ALBUM_SESSION_SECRET:undefined});
  assert.equal(denied.status,503);
});
test('cron remains independent of login, but needs Drive config',async()=>{
  let called=false;
  await worker.scheduled({},{
    ...env,ALBUM_INDEX:undefined
  },{waitUntil(){called=true;}});
  assert.equal(called,false);
});
