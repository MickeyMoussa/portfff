// ─── Hero typewriter ──────────────────────────────────────────────────────────
//  Types "hi", holds, erases, then types "I'm Yazeed" and reveals the CTAs.
//  Honours prefers-reduced-motion (skips straight to the final state).
(function () {
  const out  = document.getElementById('type');
  const name = document.querySelector('.hero-name');
  const cta  = document.getElementById('hero-cta');
  if (!out || !name) return;

  const FINAL = "I'm Yazeed";
  const refreshLens = () => window.dispatchEvent(new Event('bh:refresh-lens'));
  function revealCTA() {
    if (!cta) return;
    cta.classList.add('is-visible');   // pure fade — labels don't move
    refreshLens();                     // enable the light-lens (strength eases in)
  }
  // keep the lens aligned if the layout reflows
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(refreshLens, 150); });

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
