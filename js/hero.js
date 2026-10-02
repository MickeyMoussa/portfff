// ─── Hero typewriter ──────────────────────────────────────────────────────────
//  Types "hi", holds, erases, then types "I'm Yazeed" and reveals the CTAs
//  together with a Minecraft-style splash quote.
//  Honours prefers-reduced-motion (skips straight to the final state).
(function () {
  const out  = document.getElementById('type');
  const name = document.querySelector('.hero-name');
  const cta  = document.getElementById('hero-cta');
  if (!out || !name) return;

  const FINAL = "I'm Yazeed";
  const refreshLens = () => window.dispatchEvent(new Event('bh:refresh-lens'));
  function revealCTA() {
    showSplash();
    if (!cta) return;
    cta.classList.add('is-visible');   // pure fade — labels don't move
    refreshLens();                     // enable the light-lens (strength eases in)
  }
  // keep the lens aligned if the layout reflows
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(refreshLens, 150); });

  // ── Splash quotes (Minecraft title-screen style) ──
  // Visitor's local clock: 9 PM – 5 AM counts as night.
  function isNight() { const h = new Date().getHours(); return h >= 21 || h < 5; }
  const SPLASHES = [
    'Riding sinusoidal waves',
    'A lower center of gravity helps with back flips',
    'Json? never heard of him',
    'Sunbathing on Mars',
    { text: 'Another night owl huh', when: isNight },   // only offered at night
    'X and Y axes stimming',
    'No means no: never ssh a tunnel without asking for user consent…',
    'Conquer the multiverse!',
  ];
  const splash   = document.getElementById('splash');
  const splashTx = document.getElementById('splash-text');
  const LAST_KEY = 'splash:last';
  let splashIdx = -1;

  const splashText = q => (typeof q === 'string' ? q : q.text);
  const splashOK   = q => (typeof q === 'string' || !q.when || q.when());

  function pickSplash(avoid) {
    // pool = quotes allowed right now (time-gated ones checked live), minus the last one shown
    let pool = SPLASHES.map((q, i) => i).filter(i => splashOK(SPLASHES[i]));
    if (pool.length > 1) pool = pool.filter(i => i !== avoid);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function setSplash(i) {
    splashIdx = i;
    const text = splashText(SPLASHES[i]);
    splashTx.textContent = text;
    // Like Minecraft: longer lines render smaller so every quote has a similar footprint.
    splashTx.style.setProperty('--len-scale', Math.min(1, Math.max(0.72, 30 / (text.length + 6))).toFixed(3));
    splashTx.setAttribute('aria-label', 'Splash quote: ' + text + '. Activate for another.');
    try { localStorage.setItem(LAST_KEY, String(i)); } catch (e) {}
  }
  function showSplash() {
    if (!splash || !splashTx || splash.classList.contains('is-shown')) return;
    splash.classList.add('is-shown');
  }
  if (splash && splashTx) {
    let last = -1;
    try { last = parseInt(localStorage.getItem(LAST_KEY), 10); } catch (e) {}
    setSplash(pickSplash(Number.isFinite(last) ? last : -1));
    splashTx.addEventListener('click', () => {
      setSplash(pickSplash(splashIdx));
      splash.classList.remove('is-swapping');
      void splashTx.offsetWidth;            // restart the pop animation
      splash.classList.add('is-swapping');
    });
  }

  // Reduced motion → no animation, show final text + CTAs immediately.
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    out.textContent = FINAL;
    revealCTA();
    return;
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  function type(str, done) {
    let i = 0;
    (function step() {
      out.textContent = str.slice(0, i);
      if (i++ < str.length) setTimeout(step, rand(85, 150));
      else done();
    })();
  }

  function erase(str, done) {
    let i = str.length;
    (function step() {
      out.textContent = str.slice(0, i);
      if (i-- > 0) setTimeout(step, rand(40, 80));
      else done();
    })();
  }

  name.classList.add('is-typing');           // solid caret while typing

  setTimeout(() => {
    type('hi', () => {                        // 1. type "hi"
      setTimeout(() => {                      // 2. hold
        erase('hi', () => {                   // 3. erase
          setTimeout(() => {
            type(FINAL, () => {               // 4. type "I'm Yazeed"
              name.classList.remove('is-typing'); // caret starts blinking
              setTimeout(revealCTA, 400);     // 5. reveal CTAs
            });
          }, 200);
        });
      }, 900);
    });
  }, 550);
})();

// ─── Brand reveal ─────────────────────────────────────────────────────────────
//  يزيد فارس surfaces once the hero (black-hole) section is mostly scrolled past,
//  and hides again when you return to it.
(function () {
  const hero  = document.getElementById('hero');
  const brand = document.getElementById('brand');
  if (!hero || !brand) return;

  if (!('IntersectionObserver' in window)) { brand.classList.add('is-shown'); return; }

  new IntersectionObserver(
    entries => brand.classList.toggle('is-shown', entries[0].intersectionRatio < 0.35),
    { threshold: [0, 0.35, 1] }
  ).observe(hero);
})();
