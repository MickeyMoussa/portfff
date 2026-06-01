// ─── Starfield for the Research & Recognition slide ───────────────────────────
//  Scatters many small, faint, gently-twinkling stars behind the closing slide —
//  echoes the hero's deep-space backdrop without the black hole. Stars are kept
//  tiny (mostly 1px) so the field reads as quiet texture, not noise.
(function () {
  function fill(host) {
    // scale density to the field's real height (the sky spans two slides)
    const h = host.offsetHeight || innerHeight * 2;
    const count = Math.min(480, Math.round((innerWidth * h) / 8500));
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      const big = Math.random() < 0.12;            // a few slightly larger stars
      const size = big ? 2 : 1;
      const o = (0.25 + Math.random() * 0.65).toFixed(2);
      s.className = big ? 'rr-star bright' : 'rr-star';
      s.style.left = (Math.random() * 100).toFixed(2) + '%';
      s.style.top = (Math.random() * 100).toFixed(2) + '%';
      s.style.width = size + 'px';
      s.style.height = size + 'px';
      s.style.setProperty('--o', o);
      s.style.opacity = o;
      s.style.animationDuration = (2.6 + Math.random() * 4.2).toFixed(2) + 's';
      s.style.animationDelay = (-Math.random() * 7).toFixed(2) + 's';
      frag.appendChild(s);
    }
    host.appendChild(frag);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('.sky-stars, .rr-stars').forEach((host) => {
      if (reduce) host.classList.add('no-twinkle');
      fill(host);
    });
  });
})();
