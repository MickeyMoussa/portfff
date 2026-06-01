# Technical Documentation

A single-page, dependency-free portfolio (vanilla HTML/CSS/JS, raw WebGL). No
framework, no bundler. `index.html` defines the slides; `style.css` holds all
styling; each `js/*.js` file is a self-contained module attached on
`DOMContentLoaded`.

## Sections & accent colors
| Section            | id              | accent            |
|--------------------|-----------------|-------------------|
| Hero (black hole)  | `#hero`         | —                 |
| About              | `#about`        | pink `#e79bff`    |
| Actuarial ML       | `#research`     | dark blue `#1d3f7c` (on pink slide) |
| Gaming+            | `#gaming-plus`  | crimson `#ec0144` |
| 16-bit CPU         | `#cpu`          | green `#39f58c`   |
| Recognition        | `#recognition`  | baby blue `#8fc3ff` |
| Contact            | `#contact`      | white             |

## Modules

### `js/blackhole.js` — hero
A self-contained WebGL Schwarzschild black-hole raytracer: photon geodesics are
integrated via the Binet equation, with a thin Shakura–Sunyaev accretion disk,
Doppler beaming, an explicit photon ring, and a lensed procedural starfield. A
second pass bends the disk light around the hero CTA labels. Adaptive resolution
and WebGL context-loss recovery are built in. No three.js — raw WebGL + inline GLSL.

### `js/recommender.js` + `assets/model/` — live ML demo
Runs the real trained two-tower model **client-side**, no server:
- `tools/export_recommender.py` reads the Keras `.h5` with h5py, int8-quantizes the
  Dense kernels (per-output-column), and emits `recommender.json` (topology + a
  byte-offset manifest), `recommender.bin` (~8 MB), and `plans.json` (sampled real
  ACA plans + covered-benefit indices).
- `recommender.js` binds typed-array views into the `.bin` and runs a hand-rolled
  forward pass (dense / LeakyReLU / BatchNorm / concat / softmax), validated to
  within 1.6e-3 of the original float32 model. A "trial" draws a random
  policyholder, scores sampled plans, and spotlights best vs. worst.

### `js/cpu.js` — 16-bit RISC datapath
A faithful functional model of the COE-301 ISA: registers R0–R7 (R0 = 0), 16-bit
words, R/I/J formats (`Op5 f2 Rd Rs Rt` / `Op5 Imm5 Rs Rt` / `Op5 Imm11`). It runs
a real Fibonacci program one instruction at a time; per instruction it lights the
active datapath wires (SVG), animates green signal pulses along them, shows the
live machine-code encoding, and fills a data-memory view (0,1,1,2,3,5,8,13).

### Cross-slide signal flow (`cpu.js` + `stars.js`)
Bit-signals share one set of 120px columns across three slides: a dim Gaming+
light → the bright green CPU bit-light → a pale **falling star** in the sky, each
handing off at the slide seam (same period + per-column delay). The falling stars
are masked to fade out across the two text bands so they never streak through copy.

### `js/stars.js` — closing sky
Recognition + Contact are wrapped in one `.sky` container with a single gradient
and one starfield spanning both, so there's no seam between them. `stars.js`
scatters small twinkling stars scaled to the combined height.

### `js/nav.js` — section indicator
A fixed left dot-nav: one dot per section in that section's accent. An
`IntersectionObserver` (centre band) marks the active section — the active dot
enlarges, fills, glows, and shows its label. Hidden over the hero; dots
smooth-scroll on click; hidden under 600px.

## Accessibility / responsiveness
- Honors `prefers-reduced-motion` (typewriter, signals, falling stars, twinkle).
- The custom cursor is disabled on touch / no-hover devices (`@media (hover: none)`).
- Layouts collapse to single-column on small viewports.

## Regenerating the model bundle
```bash
python tools/export_recommender.py   # needs h5py, numpy, pandas, scikit-learn
```
Reads the source `.h5` / pickles (paths configurable via the `REC_SRC` env var) and
rewrites `assets/model/`.
