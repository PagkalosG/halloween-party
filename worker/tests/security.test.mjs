import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const origin = 'https://pagkalosg.github.io';
const url = path => 'https://halloween-party-album-api.example.workers.dev' + path;
const env = {
  DRIVE_FOLDER_ID:'1cnjXZT6E8DQVmUjA7rTO_GZHzq5eRUQC',
  FRONTEND_ORIGIN:origin,
  GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET:'fake-secret',
  GOOGLE_REFRESH_TOKEN:'fake-refresh',
  UPLOAD_SIGNING_KEY:'fake-signing-key',
  TURNSTILE_SITE_KEY:'site-key',
  TURNSTILE_SECRET:'secret-key',
  UPLOADS_ENABLED:'false'
};

test('API stays unavailable without Google credentials', async () => {
  const res = await worker.fetch(new Request(url('/api/config')), {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {ready:false,uploadsEnabled:false,turnstileSiteKey:null,maxFileBytes:300*1024*1024});
});

test('uploads are off by default even with credentials', async () => {
  const res=await worker.fetch(new Request(url('/api/config')),env);
  const result=await res.json();
  assert.equal(result.ready,true);
  assert.equal(result.uploadsEnabled,false);
  assert.equal(result.turnstileSiteKey,null);
});

test('there is no delete endpoint available to visitors', async () => {
  const res=await worker.fetch(new Request(url('/api/delete'),{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'
  }),env);
  assert.equal(res.status,404);
});

test('upload start fails closed while disabled', async () => {
  const res=await worker.fetch(new Request(url('/api/upload/start'),{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'
  }),env);
  assert.equal(res.status,503);
});

test('upload authorization fails closed when limiter binding is absent', async () => {
  const on={...env,UPLOADS_ENABLED:'true'};
  const res=await worker.fetch(new Request(url('/api/upload/authorize'),{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'
  }),on);
  assert.equal(res.status,429);
});

test('CORS only allows the configured frontend origin', async () => {
  const ok=await worker.fetch(new Request(url('/api/upload/start'),{
    method:'OPTIONS',headers:{Origin:origin}
  }),env);
  assert.equal(ok.status,204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'),origin);

  const bad=await worker.fetch(new Request(url('/api/upload/start'),{
    method:'OPTIONS',headers:{Origin:'https://malicious.example'}
  }),env);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'),null);
});
