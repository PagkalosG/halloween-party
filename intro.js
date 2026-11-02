/**
 * Cinematic opening — presentation only, independent of Drive and gallery.
 * The photographs and all gallery controls remain usable if this script fails.
 */
(() => {
  'use strict';

  const intro = document.getElementById('cinematicIntro');
  const hero = document.getElementById('cinemaHeroImage');
  if (!intro || !hero) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const navigationToGallery = decodeURIComponent(location.hash || '') === '#συλλογή';
  if (reducedMotion || navigationToGallery || document.visibilityState === 'hidden') {
    document.documentElement.classList.add('cinema-revealed');
    return;
  }

  let closed = false;
  let started = false;
  let safetyTimer;

  function finish() {
    if (closed) return;
    closed = true;
    clearTimeout(safetyTimer);
    intro.hidden = true;
    intro.classList.remove('is-opening', 'is-fading');
    document.documentElement.classList.remove('intro-running');
    document.documentElement.classList.add('cinema-revealed');
  }

  function openFog() {
    if (started || closed) return;
    started = true;
    intro.classList.add('is-opening');
    document.documentElement.classList.add('cinema-revealed');

    // Reveal the title while the two fog banks separate.
    window.setTimeout(() => {
      if (!closed) intro.classList.add('is-fading');
    }, 850);
    window.setTimeout(finish, 1450);
  }

  intro.hidden = false;
  document.documentElement.classList.add('intro-running');
  safetyTimer = window.setTimeout(finish, 3800);

  // Avoid an unbounded loader on slow/mobile connections. The cinematic
  // background is a local WebP; the fog opens even if decoding is delayed.
  const delay = new Promise(resolve => window.setTimeout(resolve, 650));
  const decoded = typeof hero.decode === 'function'
    ? hero.decode().catch(() => {})
    : new Promise(resolve => {
        if (hero.complete) resolve();
        else {
          hero.addEventListener('load', resolve, {once:true});
          hero.addEventListener('error', resolve, {once:true});
        }
      });

  Promise.race([decoded, delay])
    .then(() => window.setTimeout(openFog, 250))
    .catch(openFog);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') finish();
  });
  window.addEventListener('pagehide', finish, {once:true});
})();
