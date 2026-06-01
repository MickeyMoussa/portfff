# Yazeed Faris — Portfolio

An interactive, single-page portfolio built from scratch in vanilla HTML/CSS/JS —
no framework, no build step. Each section is a full-height "slide" with its own
visual identity, and two of them run **real, live demos** in the browser.

🌐 **Live:** _yazeed.systems_

## Sections
- **Hero** — a self-contained WebGL Schwarzschild black-hole raytracer (geodesic
  ray-marching, accretion disk, lensed starfield) with a typewriter intro.
- **About** — short bio.
- **Actuarial ML (SDAIA research)** — a **live in-browser run of the actual
  trained model**: a two-tower neural network for healthcare-plan recommendation.
  The model is shipped int8-quantized and inferred entirely client-side.
- **Gaming+** — experience at KFUPM's Gaming+, themed after the gamingplus.gg site.
- **16-bit RISC CPU** — an **animated datapath** that executes a real Fibonacci
  program one instruction at a time, lighting up the active wires and showing the
  live machine-code encoding. Faithful to the COE-301 ISA (R0–R7, R/I/J formats).
- **Research & Recognition** — research experience and honors.
- **Contact** — email, résumé.

A slim left-side dot indicator tracks the active section; the last two slides share
one continuous starfield.

## Run locally
The model demo loads its weights with `fetch()`, so the site must be served over
HTTP (not opened as a `file://`):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Deploy
It's a fully static site — host it on **GitHub Pages, Netlify, Vercel, or
Cloudflare Pages**. No build command; the publish directory is the repo root.
The model bundle (`assets/model/recommender.bin`, ~8 MB) loads lazily only when
the research slide is reached, so it never blocks the initial page load.

## Structure
```
.
├── index.html
├── style.css
├── js/
│   ├── blackhole.js     # WebGL black-hole hero
│   ├── hero.js          # typewriter + brand reveal
│   ├── recommender.js   # live two-tower model inference
│   ├── cpu.js           # 16-bit CPU simulator + animated datapath
│   ├── stars.js         # starfield for the closing slides
│   └── nav.js           # left section indicator
├── assets/
│   ├── YazeedFarisCV260.pdf
│   ├── images/          # logo, photo, favicon
│   └── model/           # int8 model bundle (recommender.json/.bin, plans.json)
├── tools/
│   └── export_recommender.py   # regenerates the model bundle from the .h5
└── docs/
    └── technical-documentation.md
```

## Credits
- The black-hole hero is adapted from the MIT-licensed renderer by Otto Seiskari
  (2015) and the Adriwin fork.
- The recommender model is from my SDAIA–KFUPM JRC research,
  *"A Two-Tower Content-Based Neural Network for Healthcare Plan Recommendation."*
