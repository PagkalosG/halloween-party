/**
 * The butler handles the entrance. No second loader, sigil or fog animation.
 * This script only keeps the cinematic background subtly moving on scroll.
 */
(() => {
  'use strict';
  const root=document.documentElement;
  const ambient=document.getElementById('ambientBackdrop');
  const prefersReduced=matchMedia('(prefers-reduced-motion: reduce)');
  const saveData=navigator.connection?.saveData===true;
  let scheduled=false;

  try { history.scrollRestoration='manual'; } catch {}
  const beginAtTop=()=>{
    if (!location.hash) window.scrollTo(0,0);
  };
  beginAtTop();
  addEventListener('pageshow',beginAtTop);
  addEventListener('load',beginAtTop,{once:true});

  function paint(){
    scheduled=false;
    if(prefersReduced.matches || document.visibilityState!=='visible')return;
    const y=Math.max(0,window.scrollY||0);
    const scenery=Math.min(y*(saveData?.07:.16),saveData?40:105);
    const hero=Math.min(y*(saveData?.05:.11),saveData?28:70);
    root.style.setProperty('--scene-shift',scenery.toFixed(1)+'px');
    root.style.setProperty('--hero-shift',hero.toFixed(1)+'px');
    if(ambient)ambient.style.setProperty('--ambient-opacity',String(Math.min(.7,.22+y/1150)));
  }
  function requestPaint(){
    if(!scheduled){
      scheduled=true;
      requestAnimationFrame(paint);
    }
  }
  if(!prefersReduced.matches) {
    addEventListener('scroll',requestPaint,{passive:true});
    addEventListener('resize',requestPaint,{passive:true});
    requestPaint();
  }
  prefersReduced.addEventListener?.('change',()=>{
    if(prefersReduced.matches){
      root.style.setProperty('--scene-shift','0px');
      root.style.setProperty('--hero-shift','0px');
      if(ambient)ambient.style.setProperty('--ambient-opacity','.24');
    }else requestPaint();
  });
})();
