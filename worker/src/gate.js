export function gatePage() {
return `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#09080e"><title>Ο Πορτιέρης · Το Αρχείο των Σκιών</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#09080d;color:#f3e9dd}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}body{background:#09080d}
.gate{display:grid;grid-template-columns:1.06fr .94fr;min-height:100svh}
.scene{min-height:100svh;position:relative;overflow:hidden;background:#080a0e}
.scene::before{content:"";position:absolute;inset:0;background:url("https://pagkalosg.github.io/halloween-party/assets/butler-door.webp") 33% center/cover no-repeat,url("https://pagkalosg.github.io/halloween-party/assets/gothic-horror-collage.webp") center/cover no-repeat;filter:brightness(.77) contrast(1.1) saturate(.78);animation:breath 25s ease-in-out infinite alternate}
.scene::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 65%,#09080d),linear-gradient(0deg,#09080d 0%,transparent 37%)}
.scene-fog{position:absolute;inset:0;background:radial-gradient(ellipse 55% 13% at 40% 83%,#cfcbcf50,transparent 96%);filter:blur(18px);animation:fog 11s ease-in-out infinite alternate}
.seal{position:absolute;top:25px;left:28px;color:#d3a78a;border:1px solid #9f6c6180;border-radius:50%;width:48px;height:48px;display:grid;place-items:center;font:27px Georgia,serif}
.caption{position:absolute;bottom:27px;left:29px;color:#d3b5a6;font-size:10px;letter-spacing:.27em}
.door{position:relative;display:grid;place-items:center;padding:60px clamp(26px,5vw,75px);background:radial-gradient(ellipse at 45% 40%,#381921,#100c13 75%)}
.door::before{content:"";position:absolute;inset:16px;border:1px solid #a9766660;border-radius:18px;pointer-events:none}
.content{max-width:470px;width:100%;text-align:center}
.kicker{color:#c89886;font-size:10px;letter-spacing:.3em;font-weight:700;margin:0 0 25px}
.moon{font:40px Georgia,serif;color:#cd8d79;margin:0 0 25px}
h1{font:600 clamp(58px,6vw,93px)/.84 "Cormorant Garamond",Georgia,serif;letter-spacing:-.055em;margin:0;text-shadow:0 4px 26px #000}
h1 span{display:block;color:#cf8978;margin-top:.09em}
.quote{font:italic 500 clamp(20px,2vw,25px)/1.3 "Cormorant Garamond",Georgia,serif;color:#ead0c0;margin:33px 0 8px}
.helper{font-size:13px;line-height:1.6;color:#ba9f96;margin:0 0 32px}
label{display:block;text-align:left;color:#d1ad9b;font-weight:600;font-size:10px;letter-spacing:.2em;margin-bottom:11px}
input{display:block;width:100%;height:55px;padding:0 16px;border:1px solid #906356;border-radius:15px;background:#1b1319;color:#fff;font-size:17px;outline:none}
input:focus{border-color:#e0ac90;box-shadow:0 0 0 3px #bb5e4c2d}
button{width:100%;min-height:54px;margin-top:14px;border:1px solid #db9a81;border-radius:15px;background:linear-gradient(120deg,#78303c,#a64f43);color:#fff4e9;letter-spacing:.15em;font-weight:700;font-size:11px;cursor:pointer}
button:hover{background:linear-gradient(120deg,#913745,#bf6153)}button:disabled{opacity:.55;cursor:wait}
.error{color:#f1aaa1;min-height:28px;margin-top:15px;font-size:12px;line-height:1.5}
.sign{font:italic 17px "Cormorant Garamond",Georgia,serif;color:#ab847e}
.unlock-curtain{position:fixed;top:0;height:100%;width:58%;z-index:10;pointer-events:none;opacity:0;transition:transform 1.2s ease,opacity .8s ease;background:radial-gradient(ellipse at 50% 50%,#b2bbc3da,transparent 98%);filter:blur(32px)}
.unlock-curtain.left{left:0;transform:translateX(-110%)}.unlock-curtain.right{right:0;transform:translateX(110%)}
.unlocking .unlock-curtain{transform:translateX(0);opacity:1}.unlocking.open .unlock-curtain.left{transform:translateX(-110%);opacity:0}.unlocking.open .unlock-curtain.right{transform:translateX(110%);opacity:0}
@keyframes breath{to{transform:scale(1.08) translateX(-1%)}}@keyframes fog{to{transform:translateX(7%)}}
@media(max-width:790px){.gate{display:flex;flex-direction:column}.scene{min-height:42svh;max-height:46svh}.scene::after{background:linear-gradient(0deg,#100c13,transparent 67%)}.scene::before{background-position:30% center}.seal{top:14px;left:16px;width:36px;height:36px}.caption{left:17px;bottom:15px;font-size:9px}.door{min-height:58svh;padding:43px 24px 56px}.door::before{inset:8px}.moon{margin:0 0 12px;font-size:30px}h1{font-size:clamp(54px,12vw,77px)}.quote{margin-top:24px}.helper{margin-bottom:22px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.unlock-curtain{display:none!important}}
</style></head><body>
<div class="gate"><div class="scene" aria-hidden="true"><div class="scene-fog"></div><div class="seal">✦</div><div class="caption">ΚΑΘΕ ΠΟΡΤΑ ΦΥΛΑΕΙ ΤΑ ΜΥΣΤΙΚΑ ΤΗΣ</div></div>
<main class="door"><div class="content"><p class="moon" aria-hidden="true">☽</p><p class="kicker">Ο ΠΟΡΤΙΕΡΗΣ ΣΕ ΠΕΡΙΜΕΝΕΙ</p>
<h1>ΤΟ ΑΡΧΕΙΟ <span>ΤΩΝ ΣΚΙΩΝ</span></h1><p class="quote">«Έχετε τον κωδικό, υποθέτω;»</p><p class="helper">Χωρίς πρόσκληση, ούτε οι ζωντανοί περνούν.</p>
<form id="gateForm"><label for="password">ΤΟ ΜΥΣΤΙΚΟ ΣΥΝΘΗΜΑ</label>
<input id="password" name="password" type="password" maxlength="128" autocomplete="off" placeholder="••••••••••" required>
<button type="submit" id="gateButton">ΑΝΟΙΞΕ ΤΗΝ ΠΥΛΗ →</button><div class="error" id="error" role="status" aria-live="polite"></div></form>
<p class="sign">— Ο οικονόμος των Σκιών</p></div></main></div>
<div class="unlock-curtain left" aria-hidden="true"></div><div class="unlock-curtain right" aria-hidden="true"></div>
<script>
(() => {
const form=document.querySelector('#gateForm'),field=document.querySelector('#password'),button=document.querySelector('#gateButton'),error=document.querySelector('#error');
form.addEventListener('submit',async e=>{
e.preventDefault();if(!field.value)return;button.disabled=true;error.textContent='';
try{
const response=await fetch('/auth/login',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:field.value})});
const data=await response.json().catch(()=>({}));field.value='';
if(!response.ok){error.textContent=response.status===429?'Ο πορτιέρης χρειάζεται ένα διάλειμμα. Δοκίμασε σε λίγο.':data.error||'Ο πορτιέρης δεν σε αναγνωρίζει.';return}
document.body.classList.add('unlocking');setTimeout(()=>document.body.classList.add('open'),440);setTimeout(()=>location.replace('/'),1400);
}catch{error.textContent='Η πύλη δεν ανταποκρίνεται. Δοκίμασε ξανά.';}finally{button.disabled=false}
});
})();
</script></body></html>`;
}