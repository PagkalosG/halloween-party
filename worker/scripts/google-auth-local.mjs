/**
 * One-time OAuth bootstrap on YOUR computer. No third-party token playground.
 * Requirements: Node.js >= 20, Web OAuth Client created in project
 * "Halloween Party Album", redirect http://localhost:8765/oauth2callback.
 * Scope is intentionally EXACTLY drive.file (not full drive).
 * Never commit/copy secrets or output from this script.
 */
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const scope = 'https://www.googleapis.com/auth/drive.file';
const redirectUri = 'http://localhost:8765/oauth2callback';
const rl = createInterface({input:stdin,output:stdout});
console.log('Halloween Party Album – Google OAuth (drive.file only)');
console.log('Συμπλήρωσε τα στοιχεία μόνο στο τοπικό terminal. ΜΗΝ τα στείλεις σε chat.');
const clientId = (await rl.question('Google OAuth Client ID: ')).trim();
const clientSecret = (await rl.question('Google OAuth Client Secret (θα εμφανιστεί στην κονσόλα): ')).trim();
rl.close();
if (!clientId.endsWith('.apps.googleusercontent.com') || !clientSecret) {
  console.error('Μη έγκυρο OAuth Client ID ή Secret.');process.exit(1);
}
const state = randomBytes(24).toString('base64url');
const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorization.searchParams.set('client_id',clientId);
authorization.searchParams.set('redirect_uri',redirectUri);
authorization.searchParams.set('response_type','code');
authorization.searchParams.set('scope',scope);
authorization.searchParams.set('access_type','offline');
authorization.searchParams.set('prompt','consent');
authorization.searchParams.set('include_granted_scopes','false');
authorization.searchParams.set('state',state);
authorization.searchParams.set('code_challenge',challenge);
authorization.searchParams.set('code_challenge_method','S256');

let done = false;
const server = http.createServer(async (request,response) => {
  const incoming = new URL(request.url || '/',redirectUri);
  if (incoming.pathname !== '/oauth2callback') {
    response.writeHead(404);response.end('Not found');return;
  }
  if (done) {response.writeHead(409);response.end('Already complete');return;}
  done = true;
  try {
    if (incoming.searchParams.get('state') !== state) throw Error('OAuth state does not match');
    const error = incoming.searchParams.get('error');
    if (error) throw Error('Google denied consent: ' + error);
    const code = incoming.searchParams.get('code');
    if (!code) throw Error('No authorization code returned');
    const body = new URLSearchParams({
      code, client_id:clientId, client_secret:clientSecret,
      code_verifier:verifier, redirect_uri:redirectUri,
      grant_type:'authorization_code'
    });
    const exchange = await fetch('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body
    });
    const json = await exchange.json();
    if (!exchange.ok || !json.refresh_token) throw Error('Token exchange failed: ' + (json.error_description || json.error || 'no refresh token'));
    const scopes = String(json.scope || scope).split(/\s+/);
    if (!scopes.includes(scope) || scopes.some(s => s === 'https://www.googleapis.com/auth/drive'))
      throw Error('Returned token has incorrect scope; stop and revoke authorization');
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    response.end('<meta charset="utf-8"><title>Halloween OAuth</title><h1>Επιτυχής εξουσιοδότηση</h1><p>Επιστροφή στο terminal. Το refresh token εμφανίζεται ΜΟΝΟ εκεί.</p>');
    console.log('\n✅ Εξουσιοδότηση drive.file επιτυχής.');
    console.log('Βάλε την παρακάτω τιμή ΜΟΝΟ στο Cloudflare Worker Secret GOOGLE_REFRESH_TOKEN:');
    console.log('\n'+json.refresh_token+'\n');
    console.log('Προσοχή: ΜΗΝ το δημοσιεύσεις, αποθηκεύσεις σε repository ή στείλεις σε chat.');
    console.log('Αν το OAuth app είναι σε Testing, αυτό το token συνήθως λήγει σε 7 ημέρες.');
  } catch(error) {
    response.writeHead(400,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    response.end('OAuth failed. Check terminal.');
    console.error('OAuth error:',error.message);
  } finally {setTimeout(()=>server.close(),1000);}
});
server.on('error',error=>{console.error('Τοπικός server: ',error.message);process.exit(1);});
server.listen(8765,'127.0.0.1',()=>{
 console.log('\nΆνοιξε τον παρακάτω σύνδεσμο στον browser και εξουσιοδότησε ΜΟΝΟ το drive.file:');
 console.log(authorization.toString());
 console.log('\nΑναμονή Google redirect στο '+redirectUri+' (Ctrl+C για ακύρωση).');
});
