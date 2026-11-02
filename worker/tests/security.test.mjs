import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker from '../src/index.js';

globalThis.crypto ||= webcrypto;
const origin='https://pagkalosg.github.io';
const base='https://halloween-party-album-api.pagkalosgeo.workers.dev';
const request=(path,options)=>new Request(base+path,options);
const emptyEnv={DRIVE_FOLDER_ID:'1cnjXZT6E8DQVmUjA7rTO_GZHzq5eRUQC',FRONTEND_ORIGIN:origin};

test('does not expose old OAuth configuration',async()=>{
  const res=await worker.fetch(request('/api/config'),emptyEnv);
  const data=await res.json();
  assert.equal(res.status,200);
  assert.equal(data.ready,false);
  assert.equal(data.readOnly,true);
  assert.equal(data.uploadsEnabled,false);
  assert.equal(data.syncMinutes,5);
  assert.ok(!('turnstileSiteKey' in data));
  assert.ok(!('GOOGLE_REFRESH_TOKEN' in data));
});

for(const [method,path] of [
  ['POST','/api/upload/authorize'],['POST','/api/upload/start'],
  ['PUT','/api/upload/chunk'],['DELETE','/api/media/aaaaabbbbbcccc']
]){
  test(method+' '+path+' cannot upload or delete',async()=>{
    const res=await worker.fetch(request(path,{method,headers:{Origin:origin}}),emptyEnv);
    assert.equal(res.status,405);
    assert.equal((await res.json()).error,'Επιτρέπεται μόνο προβολή.');
  });
}

test('read-only worker rejects all old upload endpoints even on GET',async()=>{
  const res=await worker.fetch(request('/api/upload/start'),emptyEnv);
  assert.equal(res.status,503); // fail closed before service account is configured
});

test('CORS only authorizes public album origin',async()=>{
  const good=await worker.fetch(request('/api/items',{
    method:'OPTIONS',headers:{Origin:origin}
  }),emptyEnv);
  assert.equal(good.status,204);
  assert.equal(good.headers.get('Access-Control-Allow-Origin'),origin);
  const bad=await worker.fetch(request('/api/items',{
    method:'OPTIONS',headers:{Origin:'https://untrusted.example'}
  }),emptyEnv);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'),null);
});

test('cron fails closed until read-only service account is configured',async()=>{
  let invoked=false;
  await worker.scheduled({cron:'*/5 * * * *'},emptyEnv,{waitUntil(){invoked=true;}});
  assert.equal(invoked,false);
});
