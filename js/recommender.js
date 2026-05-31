// ════════════════════════════════════════════════════════════════════════════
//  Live demo — SDAIA two-tower actuarial recommender, running in the browser.
//
//  The real Keras model I trained at the SDAIA–KFUPM JRC is shipped as an int8
//  bundle (assets/model/): a policyholder tower (46 feats) and an insurance-plan
//  tower (28 feats), each 512→1024→512→256 with LeakyReLU + BatchNorm, fused and
//  pushed through a head ending in a 407-way softmax over benefit types.
//
//  A "trial" draws a random policyholder + a handful of real plans, runs genuine
//  forward inference on each (no server, no TF.js — a hand-rolled pass that was
//  validated to within 1.6e-3 of the original float32 model), then ranks plans by
//  EXPECTED COVERAGE USAGE = Σ softmax probability over the benefits each plan
//  actually covers. Best vs. worst shows how much coverage the model recovers.
// ════════════════════════════════════════════════════════════════════════════

(function () {
  const BASE       = 'assets/model/';
  const N_PER_TRIAL = 14;            // plans drawn per trial

  // Income brackets — ordinal 1..6, as encoded during training (see Streamlit app)
  const INCOME = {
    1: '100–150% FPL', 2: '150–200% FPL', 3: '200–250% FPL',
    4: 'Above 250% FPL', 5: 'Tribal — zero/limited cost sharing',
    6: 'Catastrophic / hardship exemption',
  };
  const AGES = ['Adult', 'Child', 'Adult & Child'];   // maps to the 3 age one-hots

  // ── tiny helpers ─────────────────────────────────────────────────────────
  const $  = (id) => document.getElementById(id);
  const ri = (n) => Math.floor(Math.random() * n);          // random int [0,n)
  const pick = (arr) => arr[ri(arr.length)];

  // ── Engine: loads the int8 bundle and runs the two-tower forward pass ──────
  class Recommender {
    constructor() { this.ready = false; this.loading = null; }

    // Lazy, once. Returns a promise that resolves when weights are usable.
    load() {
      if (this.loading) return this.loading;
      this.loading = (async () => {
        const [m, planDoc, binBuf] = await Promise.all([
          fetch(BASE + 'recommender.json').then(r => r.json()),
          fetch(BASE + 'plans.json').then(r => r.json()),
          fetch(BASE + 'recommender.bin').then(r => r.arrayBuffer()),
        ]);
        this.m = m;
        this.plans = planDoc.plans;
        this.benefits = m.benefits;
        this.holderCols = m.policyholder_columns;
        // index lookups for building the policyholder vector
        this.colIdx = {};
        this.holderCols.forEach((c, i) => { this.colIdx[c] = i; });
        this.states = this.holderCols
          .filter(c => c.startsWith('State_'))
          .map(c => c.slice(6, -('_policyholder'.length)));

        // Bind typed-array views into the single binary buffer (zero-copy).
        const I8 = (r) => new Int8Array(binBuf, r[0], r[1]);
        const F32 = (r) => new Float32Array(binBuf, r[0], r[1]);
        for (const op of m.ops) {
          if (op.type === 'dense') { op._kq = I8(op.kq); op._ks = F32(op.ks); op._b = F32(op.b); }
          else if (op.type === 'bn') {
            op._g = F32(op.gamma); op._be = F32(op.beta);
            op._mu = F32(op.mean); op._va = F32(op.var);
          }
        }
        this.ready = true;
      })();
      return this.loading;
    }

    // Dense: y[j] = scale[j]·Σ_i x[i]·q[i,j] + b[j], then optional relu/softmax.
    // Kernel is int8 row-major [in,out] with one float scale per output unit.
    _dense(x, op) {
      const [inn, out] = op.shape, q = op._kq, sc = op._ks, b = op._b;
      const y = new Float32Array(out);
      for (let i = 0; i < inn; i++) {
        const xi = x[i]; if (xi === 0) continue;        // one-hot inputs are sparse
        const base = i * out;
        for (let j = 0; j < out; j++) y[j] += xi * q[base + j];
      }
      for (let j = 0; j < out; j++) {
        let v = y[j] * sc[j] + b[j];
        if (op.act === 'relu' && v < 0) v = 0;
        y[j] = v;
      }
      if (op.act === 'softmax') {
        let mx = -Infinity; for (let j = 0; j < out; j++) if (y[j] > mx) mx = y[j];
        let s = 0; for (let j = 0; j < out; j++) { y[j] = Math.exp(y[j] - mx); s += y[j]; }
        for (let j = 0; j < out; j++) y[j] /= s;
      }
      return y;
    }
    _bn(x, op) {
      const y = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++)
        y[i] = (x[i] - op._mu[i]) / Math.sqrt(op._va[i] + op.eps) * op._g[i] + op._be[i];
      return y;
    }

    // Full forward over the topological op-list. `seed` maps input-layer names
    // → feature vectors. Returns the 407-dim softmax.
    predict(phVec, planVec) {
      const m = this.m, t = {};
      t[m.input_layers.policyholder] = phVec;
      t[m.input_layers.plan] = planVec;
      for (const op of m.ops) {
        const a = op.in.map(n => t[n]);
        switch (op.type) {
          case 'dense':    t[op.name] = this._dense(a[0], op); break;
          case 'bn':       t[op.name] = this._bn(a[0], op); break;
          case 'leaky': {
            const x = a[0], s = op.slope, y = new Float32Array(x.length);
            for (let i = 0; i < x.length; i++) y[i] = x[i] > 0 ? x[i] : s * x[i];
            t[op.name] = y; break;
          }
          case 'identity': t[op.name] = a[0]; break;        // Dropout at inference
          case 'concat': {
            let len = 0; for (const v of a) len += v.length;
            const y = new Float32Array(len); let o = 0;
            for (const v of a) { y.set(v, o); o += v.length; }
            t[op.name] = y; break;
          }
        }
      }
      return t[m.output];
    }

    // ── Demo-domain helpers ──────────────────────────────────────────────────
    randomPolicyholder() {
      const v = new Float32Array(this.holderCols.length);
      const income = 1 + ri(6);
      v[this.colIdx['IncomeLevel_policyholder']] = income;

      const ageCols = [
        'Age_Allows Adult-Only_policyholder',
        'Age_Allows Child-Only_policyholder',
        'Age_Allows Adult and Child-Only_policyholder',
      ];
      const ageI = ri(3);
      v[this.colIdx[ageCols[ageI]]] = 1;

      const years = ['Year_2013.0_policyholder', 'Year_2014.0_policyholder', 'Year_2015.0_policyholder'];
      const yearI = ri(3);
      v[this.colIdx[years[yearI]]] = 1;

      const state = pick(this.states);
      const sk = `State_${state}_policyholder`;
      if (this.colIdx[sk] != null) v[this.colIdx[sk]] = 1;

      return {
        vec: v,
        profile: {
          income: INCOME[income],
          age: AGES[ageI],
          year: [2013, 2014, 2015][yearI],
          state,
        },
      };
    }

    // Score a plan for a policyholder: Σ softmax prob over the plan's covered
    // benefits. Returns the score plus the top covered benefits by probability.
    scorePlan(probs, plan) {
      let total = 0;
      const contrib = [];
      for (const idx of plan.covered) {
        const p = probs[idx];
        total += p;
        contrib.push([idx, p]);
      }
      contrib.sort((a, b) => b[1] - a[1]);
      const top = contrib.slice(0, 4).map(([idx, p]) => ({
        name: this.benefits[idx].trim(), p,
      }));
      return { total, top };
    }

    runTrial() {
      const { vec, profile } = this.randomPolicyholder();
      // sample N distinct plans
      const idxs = new Set();
      while (idxs.size < Math.min(N_PER_TRIAL, this.plans.length)) idxs.add(ri(this.plans.length));
      const results = [];
      for (const i of idxs) {
        const plan = this.plans[i];
        const probs = this.predict(vec, Float32Array.from(plan.feat));
        const { total, top } = this.scorePlan(probs, plan);
        results.push({ plan, score: total, top });
      }
      results.sort((a, b) => b.score - a.score);    // higher coverage usage = better match
      return { profile, results };
    }
  }

  // ── UI controller ──────────────────────────────────────────────────────────
  const engine = new Recommender();

  function chip(label, value) {
    return `<span class="rec-chip"><span class="rec-chip-k">${label}</span>${value}</span>`;
  }

  function planCard(r, tag) {
    const p = r.plan;
    const benefits = r.top.map(b => `<li>${b.name}</li>`).join('');
    return `
      <article class="rec-card rec-card--${tag}">
        <div class="rec-card-tag">${tag === 'best' ? 'Model’s pick' : 'Weakest in draw'}</div>
        <div class="rec-card-metal">${p.metal}</div>
        <div class="rec-card-meta">${p.state} · ${p.year} · AV ${Math.round(p.av * 100)}%</div>
        <div class="rec-card-score">
          <span class="rec-score-num">${(r.score * 100).toFixed(1)}</span>
          <span class="rec-score-unit">coverage-match score</span>
        </div>
        <div class="rec-card-benefits">
          <span>Top benefits this plan covers for them</span>
          <ul>${benefits}</ul>
        </div>
      </article>`;
  }

  function render({ profile, results }) {
    const best = results[0], worst = results[results.length - 1];
    const lift = worst.score > 1e-6
      ? ((best.score - worst.score) / worst.score) * 100 : 0;

    $('rec-profile').innerHTML =
      `<div class="rec-profile-head">Randomized policyholder</div>` +
      chip('Income', profile.income) +
      chip('Age', profile.age) +
      chip('State', profile.state) +
      chip('Year', profile.year);

    // best / worst spotlight + the value the model recovers
    const maxScore = results[0].score;
    const bars = results.map((r, i) => {
      const w = maxScore > 0 ? (r.score / maxScore) * 100 : 0;
      const cls = i === 0 ? 'is-best' : (i === results.length - 1 ? 'is-worst' : '');
      return `<div class="rec-bar ${cls}" style="--w:${w.toFixed(1)}%">
                <span class="rec-bar-label">${r.plan.metal} · ${r.plan.state}</span>
                <span class="rec-bar-fill"></span>
                <span class="rec-bar-val">${(r.score * 100).toFixed(1)}</span>
              </div>`;
    }).join('');

    $('rec-results').innerHTML = `
      <div class="rec-spotlight">
        ${planCard(best, 'best')}
        ${planCard(worst, 'worst')}
      </div>
      <div class="rec-lift">
        Across ${results.length} sampled plans, the model’s top pick captures
        <strong>${lift.toFixed(0)}% more</strong> of this policyholder’s expected
        claims than the weakest plan in the draw.
      </div>
      <div class="rec-bars">${bars}</div>
    `;
    $('rec-results').hidden = false;
  }

  async function onRun(btn, status) {
    btn.disabled = true;
    if (!engine.ready) {
      status.hidden = false;
      status.textContent = 'Loading the trained model (~8 MB)…';
      try { await engine.load(); }
      catch (e) {
        status.textContent = 'Could not load the model bundle.';
        console.error(e); btn.disabled = false; return;
      }
    }
    status.textContent = 'Running inference on sampled plans…';
    // yield a frame so the status paints before the (synchronous) compute
    await new Promise(requestAnimationFrame);
    const t0 = performance.now();
    const out = engine.runTrial();
    const ms = Math.round(performance.now() - t0);
    render(out);
    status.textContent = `${out.results.length} plans scored live in ${ms} ms · ${engine.benefits.length}-way softmax`;
    btn.disabled = false;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = $('rec-run'), status = $('rec-status'), section = $('research');
    if (!btn || !section) return;

    // Warm the bundle when the research slide approaches the viewport, so the
    // first trial feels instant. Falls back to lazy load inside onRun().
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        if (es[0].isIntersecting) { engine.load().catch(() => {}); io.disconnect(); }
      }, { rootMargin: '600px' });
      io.observe(section);
    }

    btn.addEventListener('click', () => onRun(btn, status));
  });
})();
