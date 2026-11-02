/**
 * Fog curtain reveal and atmospheric parallax.
 * Pure presentation: it never blocks Drive loading or alters gallery state.
 */
(() => {
  'use strict';

  const html = document.documentElement;
  const intro = document.getElementById('cinematicIntro');
  const heroImage = document.getElementById('cinemaHeroImage');
  const skip = document.getElementById('introSkip');
  const ambient = document.getElementById('ambientBackdrop');
  if (!intro || !heroImage) return;

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = navigator.connection?.saveData === true;
  const reduced = motionQuery.matches;
  const initialHold = 1850;
  const curtainDuration = 2500;
  const fadeAt = 1690;
  const safetyDeadline = 8200;
  let closed = false;
  let opening = false;
  let frame = 0;
  const timeouts = new Set();

  // A new visit/reload starts at the cinematic title, not at the previous
  // scroll position. Same-page anchor navigation remains fully functional.
  try { history.scrollRestoration = 'manual'; } catch {}
  const returnToTop = () => window.scrollTo(0, 0);
  returnToTop();
  window.addEventListener('pageshow', returnToTop);
  window.addEventListener('load', returnToTop, {once:true});

  const schedule = (callback, delay) => {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      callback();
    }, delay);
    timeouts.add(id);
    return id;
  };

  const finish = () => {
    if (closed) return;
    closed = true;
    for (const id of timeouts) window.clearTimeout(id);
    timeouts.clear();
    intro.hidden = true;
    intro.classList.remove('is-opening', 'is-fading');
    html.classList.remove('intro-running');
    html.classList.add('cinema-revealed');
  };

  const openFog = () => {
    if (opening || closed) return;
    opening = true;
    intro.classList.add('is-opening');
    html.classList.add('cinema-revealed');
    schedule(() => { if (!closed) intro.classList.add('is-fading'); }, fadeAt);
    schedule(finish, curtainDuration);
  };

  // Move two photographic layers on the compositor, never change layout.
  // Bounded translation protects mobile painting and scroll responsiveness.
  const updateScroll = () => {
    frame = 0;
    if (reduced || document.visibilityState !== 'visible') return;
    const y = Math.max(0, window.scrollY || 0);
    const sceneShift = Math.min(y * (saveData ? 0.09 : 0.17), saveData ? 52 : 115);
    const heroShift = Math.min(y * (saveData ? 0.07 : 0.13), saveData ? 28 : 72);
    html.style.setProperty('--scene-shift', sceneShift.toFixed(1) + 'px');
    html.style.setProperty('--hero-shift', heroShift.toFixed(1) + 'px');
    if (ambient) ambient.style.setProperty('--ambient-opacity', String(Math.min(0.75, 0.2 + y / 1000)));
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(updateScroll);
  };
  if (!reduced) {
    addEventListener('scroll', onScroll, {passive:true});
    addEventListener('resize', onScroll, {passive:true});
    updateScroll();
  }
  motionQuery.addEventListener?.('change', e => {
    if (e.matches) {
      finish();
      html.style.setProperty('--scene-shift', '0px');
      html.style.setProperty('--hero-shift', '0px');
    }
  });

  if (reduced || document.visibilityState === 'hidden') {
    html.classList.add('cinema-revealed');
    return;
  }

  intro.hidden = false;
  html.classList.add('intro-running');
  skip?.addEventListener('click', finish);
  schedule(finish, safetyDeadline);

  // Hold the scene long enough for a deliberate cinematic opening, but never
  // wait indefinitely for an image or device/network capability.
  const imageReady = typeof heroImage.decode === 'function'
    ? heroImage.decode().catch(() => {})
    : new Promise(resolve => {
        if (heroImage.complete) return resolve();
        heroImage.addEventListener('load', resolve, {once:true});
        heroImage.addEventListener('error', resolve, {once:true});
      });
  const maxImageDelay = new Promise(resolve => schedule(resolve, 950));
  Promise.race([imageReady, maxImageDelay])
    .then(() => schedule(openFog, initialHold))
    .catch(() => schedule(openFog, initialHold));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') finish();
  });
  window.addEventListener('pagehide', finish, {once:true});
})();
