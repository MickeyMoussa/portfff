// ─── Left section indicator ───────────────────────────────────────────────────
//  A slim, fixed dot-nav: one dot per section, each carrying that section's accent
//  colour. The dot whose section sits at the viewport centre becomes active —
//  filled, enlarged, glowing, and labelled. Hidden over the hero; fades in from
//  About onward. Clicking a dot smooth-scrolls to its section.
(function () {
  const SECTIONS = [
    { id: 'about',       name: 'About Me',     color: '#e79bff' },  // about-slide pink
    { id: 'research',    name: 'Actuarial ML', color: '#1d3f7c' },  // research-slide dark blue
    { id: 'gaming-plus', name: 'Gaming+',      color: '#ec0144' },
    { id: 'cpu',         name: '16-bit CPU',   color: '#39f58c' },
    { id: 'recognition', name: 'Recognition',  color: '#8fc3ff' },
    { id: 'contact',     name: 'Contact',      color: '#ffffff' },
  ];

  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.getElementById('dotnav');
    if (!nav) return;

    const dots = SECTIONS.map((s) => {
      const a = document.createElement('a');
      a.className = 'dot';
      a.href = '#' + s.id;
      a.style.setProperty('--c', s.color);
      a.setAttribute('aria-label', s.name);
      a.innerHTML = `<span class="dot-circle"></span><span class="dot-label">${s.name}</span>`;
      nav.appendChild(a);
      return a;
    });

    const setActive = (id) =>
      SECTIONS.forEach((s, i) => dots[i].classList.toggle('active', s.id === id));

    // Active = the section crossing the viewport's vertical centre (thin band).
    const present = {};
    const center = new IntersectionObserver((entries) => {
      entries.forEach((e) => { present[e.target.id] = e.isIntersecting; });
      const act = SECTIONS.find((s) => present[s.id]);
      if (act) setActive(act.id);
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) center.observe(el);
    });

    // Reveal once the hero is scrolled past; stay hidden over the hero.
    const hero = document.getElementById('hero');
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(
        (es) => nav.classList.toggle('is-visible', !es[0].isIntersecting),
        { threshold: 0.4 }
      ).observe(hero);
    } else {
      nav.classList.add('is-visible');
    }
  });
})();
