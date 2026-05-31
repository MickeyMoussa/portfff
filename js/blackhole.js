// ════════════════════════════════════════════════════════════════════════════
//  Schwarzschild black-hole hero — self-contained WebGL geodesic raytracer.
//
//  Pass A (raymarch): photon paths integrated via the Binet equation
//    d²u/dφ² = −u + 1.5u²  (u = 1/r, r_s = 1), leapfrog stepped — a stripped
//    port of the reference raytracer (black-hole-master). Thin Shakura-Sunyaev
//    accretion disk + Keplerian Doppler beaming, explicit photon ring, lensed
//    procedural starfield, ACES tonemap. Rendered into an offscreen texture.
//
//  Pass B (lens composite): samples that texture and DEFLECTS the light around
//    each hero CTA button's region — so the bright disk bends around the labels
//    instead of overlapping them, echoing the black hole's own lensing.
//
//  Interaction: the cursor gently TILTS the viewpoint (bounded, eased, returns
//  to centre) — a parallax look-around that bends the lensed light toward the
//  pointer. Not an orbit.
// ════════════════════════════════════════════════════════════════════════════

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// ─── Pass A — black-hole raymarch ─────────────────────────────────────────────
const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_camPos;   // camera position (r_s units)
uniform vec3  u_camX;     // right
uniform vec3  u_camY;     // up
uniform vec3  u_camZ;     // forward (toward BH)
uniform float u_fov;      // FOV multiplier = 1/tan(fov/2)
uniform float u_exposure;

#define PI 3.14159265359
#define NSTEPS 140
#define MAX_REV 4.0

const float R_IN   = 3.0;     // ISCO  (3 r_s, Schwarzschild)
const float R_OUT  = 13.0;    // outer disk edge
const float DISK_T = 5200.0;  // peak disk temperature (K)

// ── Noise ──────────────────────────────────────────────────────────────────
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash12(i),            b = hash12(i + vec2(1,0));
  float c = hash12(i + vec2(0,1)), d = hash12(i + vec2(1,1));
  vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ s += a*vnoise(p); p = p*2.03 + vec2(17.13,-11.7); a *= 0.5; }
  return s;
}

// ── Blackbody colour (Tanner Helland approximation), temperature in Kelvin ──
vec3 blackbody(float t){
  t = clamp(t, 1000.0, 40000.0) / 100.0;
  float r, g, b;
  if (t <= 66.0){
    r = 1.0;
    g = clamp(0.3900815788*log(t) - 0.6318414438, 0.0, 1.0);
  } else {
    r = clamp(1.292936186*pow(t - 60.0, -0.1332047592), 0.0, 1.0);
    g = clamp(1.129890861*pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  }
  if (t >= 66.0)      b = 1.0;
  else if (t <= 19.0) b = 0.0;
  else                b = clamp(0.5432067891*log(t - 10.0) - 1.196254089, 0.0, 1.0);
  return vec3(r, g, b);
}

// ── Background sky (sampled along the escaped ray direction) ────────────────
vec3 starfield(vec3 dir){
  vec2 uv = vec2(atan(dir.y, dir.x), asin(clamp(dir.z, -1.0, 1.0)));
  vec3 col = vec3(0.0);

  vec2 np = uv * vec2(1.5, 3.0);
  float n1 = fbm(np*2.0 + vec2(0.0, u_time*0.003));
  float n2 = fbm(np*5.0 + 11.0);
  col += vec3(0.012, 0.016, 0.045) * pow(n1, 2.0);
  col += vec3(0.050, 0.020, 0.060) * pow(n2, 3.0) * 0.5;

  float band = exp(-dir.z*dir.z * 7.0);
  col += vec3(0.030, 0.045, 0.080) * band * pow(fbm(np*1.2 + 5.0), 2.0) * 0.6;

  for (int k = 0; k < 3; k++){
    float sc   = 90.0 + float(k)*150.0;
    vec2  g    = uv * sc;
    vec2  cell = floor(g);
    float h    = hash12(cell + float(k)*37.0);
    if (h > 0.93){
      vec2  c  = cell + vec2(hash12(cell + 1.3), hash12(cell + 2.7));
      float d  = length(g - c);
      float tw = 0.6 + 0.4*sin(u_time*3.0 + h*60.0);
      float s  = smoothstep(0.5, 0.0, d) * (h - 0.93)/0.07;
      col += vec3(0.90, 0.95, 1.00) * s * tw * 1.1;
    }
  }
  return col;
}

void main(){
  vec2 p   = (2.0*gl_FragCoord.xy - u_res) / u_res.y;
  vec3 ray = normalize(p.x*u_camX + p.y*u_camY + u_fov*u_camZ);
  vec3 pos = u_camPos;

  float u  = 1.0 / length(pos);
  vec3  nv = normalize(pos);
  vec3  rp = cross(cross(nv, ray), nv);
  float rl = length(rp);
  vec3  tv;
  if (rl > 1e-6) tv = rp / rl;
  else {
    vec3 hlp = abs(nv.z) < 0.9 ? vec3(0,0,1) : vec3(1,0,0);
    tv = normalize(cross(nv, hlp));
  }
  float lapse  = sqrt(max(1.0 - u, 1e-4));
  float radial = dot(ray, nv) * lapse;
  float dtan   = dot(ray, tv);
  float du     = (abs(dtan) > 1e-6) ? -radial/dtan * u
                                    : -sign(dot(ray, nv)) * u * 50.0;
  float phi = 0.0;

  vec3  color    = vec3(0.0);
  bool  captured = false;
  vec3  old_pos  = pos;
  float umax     = u;

  for (int i = 0; i < NSTEPS; i++){
    float step = MAX_REV * 2.0*PI / float(NSTEPS);
    float ps = exp(-12.0*(u - 0.667)*(u - 0.667));
    step *= 1.0 - 0.7*ps;
    if (du*step < -0.7*u) step = -0.7*u/du;

    old_pos = pos;

    du += 0.5*(-u + 1.5*u*u)*step;
    u  += du*step;
    du += 0.5*(-u + 1.5*u*u)*step;

    if (u >= 1.0){ captured = true; break; }
    u = max(u, 1e-4);
    umax = max(umax, u);

    phi += step;
    pos  = (cos(phi)*nv + sin(phi)*tv) / u;
    vec3 seg = pos - old_pos;

    int  subs = (abs(u - 0.667) < 0.15 && step > 0.12) ? 4 : 1;
    vec3 so   = old_pos;
    vec3 sv   = seg / float(subs);
    for (int ds = 0; ds < 4; ds++){
      if (ds >= subs) break;
      vec3 sn = old_pos + sv*float(ds + 1);
      if (so.z * sn.z < 0.0){
        float tc   = -so.z / (sn.z - so.z);
        vec3  isec = so + (sn - so)*tc;
        float r    = length(isec);
        if (r > R_IN && r < R_OUT){
          float ang   = atan(isec.y, isec.x);
          float x     = max(r/R_IN, 1.0001);
          float inner = max(1.0 - sqrt(1.0/x), 0.02);

          float temp = DISK_T * 2.05 * pow(1.0/x, 0.75) * pow(inner, 0.25);
          float flux = inner / (x*x*x) * 18.0;

          float orbit = ang - 0.5*u_time / pow(max(r, 1.001), 1.5);
          vec2  ou    = vec2(cos(orbit), sin(orbit));
          float turb  = fbm(vec2(r*2.5 + ou.x*4.5, ou.y*4.5 + u_time*0.05)) * 0.7
                      + fbm(vec2(r*9.0 + ou.x*12.0, ou.y*12.0 - u_time*0.12)) * 0.3;
          turb = 0.5 + 1.0*turb;

          float rn   = (r - R_IN)/(R_OUT - R_IN);
          float fade = smoothstep(0.0, 0.12, rn) * (1.0 - smoothstep(0.72, 1.0, rn));

          float intensity = flux * turb * fade;

          float vmag = 1.0 / sqrt(2.0*max(r - 1.0, 0.05));
          vec3  vel  = vmag * vec3(-isec.y, isec.x, 0.0) / r;
          float gam  = 1.0 / sqrt(max(1.0 - dot(vel, vel), 1e-3));
          vec3  sdir = seg / max(length(seg), 1e-6);
          float dop  = clamp(gam*(1.0 + dot(sdir, vel)), 0.6, 1.5);
          intensity /= pow(dop, 1.4);
          temp      /= dop;

          float cosa = abs(seg.z) / max(length(seg), 1e-6);
          intensity *= 0.55 + 0.45*cosa;
          intensity *= 1.0 + 0.7*exp(-8.0*(r - R_IN));

          color += blackbody(temp) * intensity * 1.2;
        }
      }
      so = sn;
    }

    if (u < 0.03 && du < 0.0) break;
  }

  if (!captured) {
    color += starfield(normalize(pos - old_pos));
    float ring = exp(-pow((umax - 0.667)/0.055, 2.0));
    color += vec3(1.0, 0.92, 0.76) * ring * 0.6;
  }

  color *= u_exposure;
  color  = clamp((color*(2.51*color + 0.03)) / (color*(2.43*color + 0.59) + 0.14), 0.0, 1.0);
  color  = pow(color, vec3(1.0/2.2));

  vec2 vc = gl_FragCoord.xy/u_res * 2.0 - 1.0;
  color *= 1.0 - dot(vc, vc) * 0.12;

  gl_FragColor = vec4(color, 1.0);
}
`;

// ─── Pass B — lens composite (bends light around the CTA buttons) ─────────────
const MAX_BTN = 3;
const FRAG_LENS = `
precision highp float;

uniform sampler2D u_tex;
uniform vec2  u_res;
uniform int   u_count;
uniform vec4  u_btn[${MAX_BTN}];   // xy = centre px, zw = half-size px
uniform float u_rad[${MAX_BTN}];   // capsule corner radius px
uniform float u_strength;          // 0..1 ramp
uniform float u_px;                // GL px per CSS px (for consistent sizing)

// Signed distance to a rounded rectangle.
float sdRR(vec2 p, vec2 c, vec2 b, float r){
  vec2 q = abs(p - c) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

void main(){
  vec2 p = gl_FragCoord.xy;

  float bandW = 28.0 * u_px;   // width of the bending ring around the label
  float push  = 30.0 * u_px;   // peak deflection — strong, like a small mass
  float reach = 46.0 * u_px;   // how far the shadow/calm reaches outside the label
  float inset = 30.0 * u_px;   // how far it reaches inside

  vec2  disp = vec2(0.0);
  float calm = 0.0;

  for (int i = 0; i < ${MAX_BTN}; i++){
    if (i >= u_count) break;
    vec2  c = u_btn[i].xy;
    vec2  b = u_btn[i].zw;
    float r = u_rad[i];
    float d = sdRR(p, c, b, r);

    // Deflect light radially from the label centre — smooth everywhere (no
    // SDF-gradient medial-axis seam). A Gaussian band concentrates the bend on
    // the contour; centerFade kills the deflection at the dead centre so there
    // is no singular point.
    float cd  = length(p - c);
    vec2  dir = (p - c) / (cd + 1e-3);
    float band       = exp(-(d*d) / (bandW*bandW));
    float centerFade = smoothstep(0.0, 12.0*u_px, cd);
    disp += dir * (push * band * centerFade * u_strength);

    // Soft, borderless "shadow" core behind the label — feathered union so the
    // two labels blend without a max() crease. (edge0<edge1 form for driver safety.)
    float cur = (1.0 - smoothstep(-inset, reach, d)) * u_strength;
    calm = calm + cur * (1.0 - calm);
  }

  // Sample the deflected light, but NEVER pull a darker region (the black hole's
  // shadow) into view — that was the dark blob above a label, which tracked the
  // shadow. Show the bent light only where it is brighter; otherwise keep the
  // undeflected pixel. So light gathers/bends around the label, but the shadow
  // never bleeds onto it.
  vec3 base = texture2D(u_tex, p / u_res).rgb;
  vec3 bent = texture2D(u_tex, (p + disp) / u_res).rgb;
  float keep = smoothstep(-0.04, 0.06, dot(bent - base, vec3(0.3333)));
  vec3 col = mix(base, bent, keep);

  col *= mix(1.0, 0.12, calm);   // dark, feathered shadow core — light no longer overlaps the text
  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── vec3 helpers ─────────────────────────────────────────────────────────────
const v = {
  cross: (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  norm: (a) => { const l = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; },
};

// ─── Renderer ─────────────────────────────────────────────────────────────────
class BlackHole {
  constructor() {
    this.canvas = document.getElementById('bh-canvas');

    this.DIST = 9.0;
    this.FOV  = 1.8;
    this.EXPO = 1.15;

    this.AZ0  = 0.0;
    this.EL0  = 0.07;
    this.AZ_AMP = 0.16;
    this.EL_AMP = 0.09;

    this.az = this.AZ0;  this.el = this.EL0;
    this.azT = this.AZ0; this.elT = this.EL0;

    this.time = 0; this.last = 0;
    this.scale = 1.0;
    this.frameEMA = 16;
    this.scaleCooldown = 0;
    this.tabVisible = true;          // tab foregrounded?
    this.inView = true;              // hero scrolled into view?
    this.contextLost = false;

    this.buttons = [];               // {cx,cy,hx,hy,rad} in GL pixels
    this.lensStrength = 0;           // eased current
    this.lensTarget = 0;             // 0 until CTAs reveal

    this._initGL();
    this._initCursor();
    this._initVisibility();

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('bh:refresh-lens', () => { this.lensTarget = 1; this._updateButtons(); });

    requestAnimationFrame(t => this._loop(t));
  }

  _compile(fragSrc) {
    const gl = this.gl;
    const prog = gl.createProgram();
    [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, fragSrc]].forEach(([type, src]) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error('Shader compile:', gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    });
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      console.error('Program link:', gl.getProgramInfoLog(prog));
    return prog;
  }

  _initGL() {
    const opts = { antialias: false, alpha: false, powerPreference: 'high-performance' };
    const gl = this.canvas.getContext('webgl', opts)
            || this.canvas.getContext('experimental-webgl', opts);
    if (!gl) { console.error('WebGL unavailable'); document.body.classList.add('no-webgl'); return; }
    this.gl = gl;
    this.contextLost = false;

    // A tab switch (or GPU pressure) can drop the WebGL context; without handling
    // it the canvas stays black on return. Recreate all GL resources on restore.
    this.canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      this.contextLost = true;
    }, false);
    this.canvas.addEventListener('webglcontextrestored', () => {
      this._setupGLResources();
      this._resize();
      this.contextLost = false;
    }, false);

    this._setupGLResources();
    this._resize();
  }

  // Create every GL object (buffer, programs, FBO, texture). Re-runnable so the
  // renderer can recover from a lost-then-restored context.
  _setupGLResources() {
    const gl = this.gl;

    // fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    this.buf = buf;

    // Pass A — raymarch
    this.progA = this._compile(FRAG);
    this.aA = gl.getAttribLocation(this.progA, 'a_pos');
    this.uA = {
      res: gl.getUniformLocation(this.progA, 'u_res'),
      time: gl.getUniformLocation(this.progA, 'u_time'),
      camPos: gl.getUniformLocation(this.progA, 'u_camPos'),
      camX: gl.getUniformLocation(this.progA, 'u_camX'),
      camY: gl.getUniformLocation(this.progA, 'u_camY'),
      camZ: gl.getUniformLocation(this.progA, 'u_camZ'),
      fov: gl.getUniformLocation(this.progA, 'u_fov'),
      exposure: gl.getUniformLocation(this.progA, 'u_exposure'),
    };

    // Pass B — lens composite
    this.progB = this._compile(FRAG_LENS);
    this.aB = gl.getAttribLocation(this.progB, 'a_pos');
    this.uB = {
      tex: gl.getUniformLocation(this.progB, 'u_tex'),
      res: gl.getUniformLocation(this.progB, 'u_res'),
      count: gl.getUniformLocation(this.progB, 'u_count'),
      btn: gl.getUniformLocation(this.progB, 'u_btn'),
      rad: gl.getUniformLocation(this.progB, 'u_rad'),
      strength: gl.getUniformLocation(this.progB, 'u_strength'),
      px: gl.getUniformLocation(this.progB, 'u_px'),
    };

    // offscreen target for pass A
    this.fbo = gl.createFramebuffer();
    this.tex = gl.createTexture();
    this._allocTarget(Math.max(this.canvas.width, 1), Math.max(this.canvas.height, 1));
  }

  _allocTarget(w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _resize() {
    if (!this.gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * this.scale;
    const w = Math.max(1, Math.round(innerWidth  * dpr));
    const h = Math.max(1, Math.round(innerHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this._allocTarget(w, h);
    }
    this.canvas.style.width  = innerWidth  + 'px';
    this.canvas.style.height = innerHeight + 'px';
    this._updateButtons();
  }

  // Read the CTA rectangles and convert them into GL pixel space.
  _updateButtons() {
    if (!this.canvas.width) return;
    const factor = this.canvas.width / innerWidth;     // dpr * scale
    this.pxFactor = factor;
    const out = [];
    document.querySelectorAll('.cta').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 1) return;
      out.push({
        cx: (r.left + r.width  / 2) * factor,
        cy: this.canvas.height - (r.top + r.height / 2) * factor,  // flip Y
        hx: (r.width  / 2) * factor + 7 * factor,
        hy: (r.height / 2) * factor + 5 * factor,
        rad: Math.min(r.width / 2, r.height / 2) * factor + 5 * factor,
      });
    });
    this.buttons = out.slice(0, MAX_BTN);
  }

  _camera() {
    const ce = Math.cos(this.el), se = Math.sin(this.el);
    const ca = Math.cos(this.az), sa = Math.sin(this.az);
    const pos = [this.DIST*ce*ca, this.DIST*ce*sa, this.DIST*se];
    const fwd = v.norm([-pos[0], -pos[1], -pos[2]]);
    const right = v.norm(v.cross(fwd, [0, 0, 1]));
    const camUp = v.cross(right, fwd);
    return { pos, x: right, y: camUp, z: fwd };
  }

  _initCursor() {
    const dot  = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    let rx = innerWidth/2, ry = innerHeight/2;

    window.addEventListener('mousemove', e => {
      if (dot) { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }
      const mx = (e.clientX / innerWidth)  * 2 - 1;
      const my = (e.clientY / innerHeight) * 2 - 1;
      this.azT = this.AZ0 + mx * this.AZ_AMP;
      this.elT = Math.max(0.02, Math.min(0.30, this.EL0 - my * this.EL_AMP));
    }, { passive: true });

    if (dot && ring) {
      const tick = () => {
        const dx = parseFloat(dot.style.left) || innerWidth/2;
        const dy = parseFloat(dot.style.top)  || innerHeight/2;
        rx += (dx - rx) * 0.15;  ry += (dy - ry) * 0.15;
        ring.style.left = rx + 'px';  ring.style.top = ry + 'px';
        requestAnimationFrame(tick);
      };
      tick();
    }
  }

  _initVisibility() {
    this.tabVisible = !document.hidden;
    this.inView = true;
    const hero = document.getElementById('hero') || this.canvas;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        es => { this.inView = es[0].isIntersecting; },
        { threshold: 0.01 }
      ).observe(hero);
    }
    // Re-enable on tab return. The IntersectionObserver does NOT re-fire (the
    // hero never left the viewport), so track the tab flag separately — this is
    // what was leaving the canvas black after a tab switch.
    document.addEventListener('visibilitychange', () => {
      this.tabVisible = !document.hidden;
      if (this.tabVisible) this.last = 0;   // reset clock so dt doesn't jump on resume
    });
  }

  _adaptResolution(ms) {
    this.frameEMA += (ms - this.frameEMA) * 0.05;
    if (this.scaleCooldown > 0) { this.scaleCooldown--; return; }
    if (this.frameEMA > 23 && this.scale > 0.62) {
      this.scale = Math.max(0.6, this.scale - 0.12);
      this.scaleCooldown = 90; this._resize();
    } else if (this.frameEMA < 13 && this.scale < 1.0) {
      this.scale = Math.min(1.0, this.scale + 0.12);
      this.scaleCooldown = 90; this._resize();
    }
  }

  _bindQuad(loc) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  _loop(ts) {
    const gap = this.last ? (ts - this.last) : 16;
    const dt = Math.min(gap * 0.001, 0.05);
    // Skip adaptive-res sampling on big gaps (e.g. returning from a hidden tab)
    // so a multi-second pause doesn't spike the frame-time average.
    if (this.last && gap < 200) this._adaptResolution(gap);
    this.last = ts;

    requestAnimationFrame(t => this._loop(t));
    if (!this.gl || this.contextLost || !this.tabVisible || !this.inView) return;

    this.time += dt;

    const s = 1 - Math.exp(-dt * 4.5);
    this.az += (this.azT - this.az) * s;
    this.el += (this.elT - this.el) * s;
    this.lensStrength += (this.lensTarget - this.lensStrength) * (1 - Math.exp(-dt * 3.0));

    const gl = this.gl;
    const W = this.canvas.width, H = this.canvas.height;
    const cam = this._camera();

    // ── Pass A → offscreen texture ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.progA);
    this._bindQuad(this.aA);
    gl.uniform2f(this.uA.res, W, H);
    gl.uniform1f(this.uA.time, this.time);
    gl.uniform3fv(this.uA.camPos, cam.pos);
    gl.uniform3fv(this.uA.camX, cam.x);
    gl.uniform3fv(this.uA.camY, cam.y);
    gl.uniform3fv(this.uA.camZ, cam.z);
    gl.uniform1f(this.uA.fov, this.FOV);
    gl.uniform1f(this.uA.exposure, this.EXPO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass B → screen, bending light around the CTAs ──
    const n = this.buttons.length;
    const btn = new Float32Array(MAX_BTN * 4);
    const rad = new Float32Array(MAX_BTN);
    for (let i = 0; i < n; i++) {
      const b = this.buttons[i];
      btn[i*4] = b.cx; btn[i*4+1] = b.cy; btn[i*4+2] = b.hx; btn[i*4+3] = b.hy;
      rad[i] = b.rad;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.progB);
    this._bindQuad(this.aB);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.uB.tex, 0);
    gl.uniform2f(this.uB.res, W, H);
    gl.uniform1i(this.uB.count, this.lensStrength > 0.001 ? n : 0);
    gl.uniform4fv(this.uB.btn, btn);
    gl.uniform1fv(this.uB.rad, rad);
    gl.uniform1f(this.uB.strength, this.lensStrength);
    gl.uniform1f(this.uB.px, this.pxFactor || 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

document.addEventListener('DOMContentLoaded', () => new BlackHole());
