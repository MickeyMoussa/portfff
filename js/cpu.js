// ════════════════════════════════════════════════════════════════════════════
//  Live demo — 16-bit single-cycle RISC CPU (the one I built in Logisim/Verilog).
//
//  A faithful functional model of the datapath: PC, instruction memory, an
//  8-register file ($0 hard-wired to zero), sign-extend, an ALU (+ ALU control),
//  data memory, and the control unit — with branch and jump feedback to the PC.
//  It runs a real Fibonacci program one instruction at a time; on each step the
//  active wires light up and green "bit signals" flow along them, mirroring the
//  signal pulses travelling down the background lines.
//
//  ISA (16-bit words, 8 regs): add sub slt (R) · addi lw sw beq (I) · j (J).
// ════════════════════════════════════════════════════════════════════════════

(function () {
  const $ = (id) => document.getElementById(id);

  // ─── Program: first 8 Fibonacci numbers, stored to data memory ──────────────
  //  ISA (COE 301): 16-bit words · regs R0..R7 (R0 = 0). Field semantics follow
  //  the spec — R-type writes Rd; I-type (addi/lw) writes Rt; sw/beq read Rt.
  //  Regs: R1=a  R2=b  R3=i  R4=n  R5=cond  R6=t  R7=mem ptr
  const PROG = [
    { t:'addi', rt:1, rs:0, imm:0,  txt:'addi R1, R0, 0',   c:'a = 0' },
    { t:'addi', rt:2, rs:0, imm:1,  txt:'addi R2, R0, 1',   c:'b = 1' },
    { t:'addi', rt:3, rs:0, imm:0,  txt:'addi R3, R0, 0',   c:'i = 0' },
    { t:'addi', rt:4, rs:0, imm:8,  txt:'addi R4, R0, 8',   c:'n = 8' },
    { t:'addi', rt:7, rs:0, imm:0,  txt:'addi R7, R0, 0',   c:'ptr = 0' },
    // loop:  (index 5)
    { t:'slt',  rd:5, rs:3, rt:4,   txt:'slt  R5, R3, R4',  c:'R5 = i < n', lbl:'loop' },
    { t:'beq',  rs:5, rt:0, tgt:14, txt:'beq  R5, R0, end', c:'exit if done' },
    { t:'sw',   rt:1, rs:7, imm:0,  txt:'sw   R1, 0(R7)',   c:'mem[ptr] = a' },
    { t:'add',  rd:6, rs:1, rt:2,   txt:'add  R6, R1, R2',  c:'t = a + b' },
    { t:'add',  rd:1, rs:2, rt:0,   txt:'add  R1, R2, R0',  c:'a = b' },
    { t:'add',  rd:2, rs:6, rt:0,   txt:'add  R2, R6, R0',  c:'b = t' },
    { t:'addi', rt:7, rs:7, imm:1,  txt:'addi R7, R7, 1',   c:'ptr++' },
    { t:'addi', rt:3, rs:3, imm:1,  txt:'addi R3, R3, 1',   c:'i++' },
    { t:'j',    tgt:5,              txt:'j    loop',         c:'repeat' },
    // end:  (index 14)
    { t:'j',    tgt:14,             txt:'j    end',          c:'halt', lbl:'end' },
  ];

  // Real COE-301 opcode/function encodings → live machine code per instruction.
  const ROP = { add:[0,0], sub:[0,1], slt:[0,2], sltu:[0,3] };       // (subset used)
  const IOP = { addi:8, lw:12, sw:13, beq:14, bne:15 };
  const JOP = { j:16, jal:17 };
  const bin = (v, n) => (v & ((1 << n) - 1)).toString(2).padStart(n, '0');
  function encode(i, pc) {
    if (ROP[i.t]) {
      const [op, f] = ROP[i.t];
      const word = (op << 11) | (f << 9) | ((i.rd||0) << 6) | ((i.rs||0) << 3) | (i.rt||0);
      return { word, fields: `${bin(op,5)} ${bin(f,2)} ${bin(i.rd,3)} ${bin(i.rs,3)} ${bin(i.rt,3)}` };
    }
    if (IOP[i.t] != null) {
      let imm = i.imm; if (i.t === 'beq' || i.t === 'bne') imm = i.tgt - (pc + 1);
      const word = (IOP[i.t] << 11) | ((imm & 31) << 6) | ((i.rs||0) << 3) | (i.rt||0);
      return { word, fields: `${bin(IOP[i.t],5)} ${bin(imm,5)} ${bin(i.rs,3)} ${bin(i.rt,3)}` };
    }
    const word = (JOP[i.t] << 11) | ((i.tgt||0) & 0x7ff);
    return { word, fields: `${bin(JOP[i.t],5)} ${bin(i.tgt,11)}` };
  }

  // wires active per instruction type (ids defined in the datapath below)
  const FETCH = ['pc_im', 'im_ctrl', 'pc_inc'];
  const PATHS = {
    add:  ['im_rf','rf_a','rf_b','alu_wb','wb_rf'],
    sub:  ['im_rf','rf_a','rf_b','alu_wb','wb_rf'],
    slt:  ['im_rf','rf_a','rf_b','alu_wb','wb_rf'],
    addi: ['im_rf','rf_a','im_ext','ext_alu','alu_wb','wb_rf'],
    lw:   ['im_rf','rf_a','im_ext','ext_alu','alu_dm','dm_wb','wb_rf'],
    sw:   ['im_rf','rf_a','im_ext','ext_alu','alu_dm','rf_dm'],
    beq:  ['im_rf','rf_a','rf_b','alu_br','br_pc'],
    j:    ['im_jmp','jmp_pc'],
  };
  const BLOCKS_FOR = {
    add:['rf','alu'], sub:['rf','alu'], slt:['rf','alu'],
    addi:['rf','ext','alu'], lw:['rf','ext','alu','dm'], sw:['rf','ext','alu','dm'],
    beq:['rf','alu'], j:['ctrl'],
  };

  // ─── Simulator ───────────────────────────────────────────────────────────────
  class CPU {
    constructor() { this.reset(); }
    reset() {
      this.pc = 0;
      this.reg = new Int32Array(8);     // R0..R7, R0 stays 0
      this.mem = new Int32Array(16);
      this.memWritten = new Set();      // addresses written so far (for the view)
      this.halted = false;
      this.lastWrite = null;            // reg index written this step
      this.lastMem = null;              // mem index written this step
    }
    // execute one instruction; return a trace of what lit up
    step() {
      if (this.halted) return null;
      const i = PROG[this.pc];
      if (!i) { this.halted = true; return null; }
      const r = this.reg;
      let next = this.pc + 1, wrote = null, memw = null;
      switch (i.t) {
        case 'add': r[i.rd] = (r[i.rs] + r[i.rt]) | 0; wrote = i.rd; break;
        case 'sub': r[i.rd] = (r[i.rs] - r[i.rt]) | 0; wrote = i.rd; break;
        case 'slt': r[i.rd] = (r[i.rs] < r[i.rt]) ? 1 : 0; wrote = i.rd; break;
        case 'addi':r[i.rt] = (r[i.rs] + i.imm) | 0; wrote = i.rt; break;   // dest = Rt
        case 'lw':  r[i.rt] = this.mem[(r[i.rs] + i.imm) & 15] | 0; wrote = i.rt; break;
        case 'sw':  memw = (r[i.rs] + i.imm) & 15; this.mem[memw] = r[i.rt]; this.memWritten.add(memw); break;
        case 'beq': if (r[i.rs] === r[i.rt]) next = i.tgt; break;
        case 'bne': if (r[i.rs] !== r[i.rt]) next = i.tgt; break;
        case 'j':   next = i.tgt; break;
      }
      r[0] = 0;                          // $0 is always zero
      const trace = {
        index: this.pc, instr: i, enc: encode(i, this.pc),
        wires: FETCH.concat(PATHS[i.t] || []),
        blocks: ['pc','im'].concat(BLOCKS_FOR[i.t] || []),
        wrote, memw,
      };
      if (i.t === 'j' && i.tgt === this.pc) this.halted = true;   // end-spin → stop
      this.pc = next;
      this.lastWrite = wrote; this.lastMem = memw;
      return trace;
    }
  }

  // ─── Datapath geometry (viewBox 0 0 720 360) ────────────────────────────────
  const VB = { w: 720, h: 360 };
  const B = {
    pc:   { x: 18,  y: 162, w: 40,  h: 48, label: 'PC' },
    im:   { x: 84,  y: 154, w: 74,  h: 64, label: 'Instr\nMemory' },
    ctrl: { x: 250, y: 18,  w: 150, h: 40, label: 'Control' },
    rf:   { x: 190, y: 146, w: 92,  h: 84, label: 'Register\nFile' },
    ext:  { x: 190, y: 272, w: 90,  h: 36, label: 'Sign-extend' },
    alu:  { x: 352, y: 150, w: 74,  h: 76, label: 'ALU' },
    dm:   { x: 478, y: 150, w: 80,  h: 76, label: 'Data\nMemory' },
    wb:   { x: 600, y: 168, w: 16,  h: 44, label: '' },   // write-back mux
  };
  // anchor helpers
  const R = (b) => [B[b].x + B[b].w, B[b].y + B[b].h / 2];      // right-mid
  const L = (b) => [B[b].x, B[b].y + B[b].h / 2];               // left-mid
  const T = (b) => [B[b].x + B[b].w / 2, B[b].y];               // top-mid
  const Bot = (b) => [B[b].x + B[b].w / 2, B[b].y + B[b].h];    // bottom-mid

  // wires as point lists (orthogonal routing)
  const WIRES = {
    pc_im:   [R('pc'), L('im')],
    im_ctrl: [[B.im.x + B.im.w, 168], [220, 168], [220, 38], [B.ctrl.x, 38]],
    im_rf:   [[B.im.x + B.im.w, 186], L('rf')],
    im_ext:  [[B.im.x + B.im.w, 210], [174, 210], [174, 290], L('ext')],
    rf_a:    [[B.rf.x + B.rf.w, 172], [320, 172], [320, 168], L('alu')],
    rf_b:    [[B.rf.x + B.rf.w, 208], [330, 208], [330, 210], [B.alu.x, 210]],
    ext_alu: [R('ext'), [320, 290], [320, 200], [B.alu.x, 200]],
    alu_wb:  [R('alu'), [444, 188], [444, 300], [624, 300], [624, 190], [B.wb.x + B.wb.w, 190]],
    alu_dm:  [R('alu'), L('dm')],
    rf_dm:   [[B.rf.x + B.rf.w, 224], [300, 224], [300, 332], [560, 332], [560, 210], [B.dm.x, 210]],
    dm_wb:   [R('dm'), L('wb')],
    wb_rf:   [[B.wb.x + B.wb.w / 2, B.wb.y + B.wb.h], [608, 340], [150, 340], [150, 224], [B.rf.x, 224]],
    alu_br:  [T('alu'), [389, 96]],
    br_pc:   [[389, 96], [38, 96], T('pc')],
    im_jmp:  [[B.im.x + B.im.w, 160], [200, 160], [200, 74]],
    jmp_pc:  [[200, 74], [38, 130], L('pc')],
    pc_inc:  [Bot('pc'), [38, 232], [10, 232], [10, 130], L('pc')],
  };

  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  const ptsToPath = (pts) => 'M ' + pts.map(p => p.join(' ')).join(' L ');

  // ─── Renderer + animator ─────────────────────────────────────────────────────
  class Datapath {
    constructor(svg) {
      this.svg = svg;
      svg.setAttribute('viewBox', `0 0 ${VB.w} ${VB.h}`);
      this.wireEls = {};
      this._build();
    }
    _build() {
      const svg = this.svg;
      // wires first (under blocks)
      const gW = el('g', { class: 'cpu-wires' });
      for (const id in WIRES) {
        const d = ptsToPath(WIRES[id]);
        const g = el('g', { class: 'cpu-wire', 'data-id': id });
        g.appendChild(el('path', { d, class: 'wire-base', fill: 'none' }));
        g.appendChild(el('path', { d, class: 'wire-pulse', fill: 'none', pathLength: '100' }));
        gW.appendChild(g);
        this.wireEls[id] = g;
      }
      svg.appendChild(gW);
      // blocks
      const gB = el('g', { class: 'cpu-blocks' });
      for (const id in B) {
        const b = B[id];
        const g = el('g', { class: 'cpu-block', 'data-id': id });
        g.appendChild(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 7, class: 'block-box' }));
        const lines = b.label.split('\n');
        lines.forEach((ln, k) => {
          const t = el('text', {
            x: b.x + b.w / 2, y: b.y + b.h / 2 + (k - (lines.length - 1) / 2) * 13,
            class: 'block-label', 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          });
          t.textContent = ln;
          g.appendChild(t);
        });
        gB.appendChild(g);
        B[id]._el = g;
      }
      svg.appendChild(gB);
    }
    clear() {
      for (const id in this.wireEls) this.wireEls[id].classList.remove('live');
      for (const id in B) B[id]._el && B[id]._el.classList.remove('active');
    }
    show(trace) {
      this.clear();
      if (!trace) return;
      trace.wires.forEach(w => this.wireEls[w] && this.wireEls[w].classList.add('live'));
      trace.blocks.forEach(b => B[b]._el && B[b]._el.classList.add('active'));
    }
  }

  // ─── UI controller ────────────────────────────────────────────────────────────
  const cpu = new CPU();
  let dp, asmEls = [], regEls = [], memEls = [], timer = null, playing = false;

  function buildAsm(list) {
    list.innerHTML = '';
    asmEls = PROG.map((ins, idx) => {
      const li = el => el; // noop
      const node = document.createElement('li');
      node.className = 'cpu-asm-line';
      node.innerHTML =
        `<span class="asm-addr">${idx.toString().padStart(2, '0')}</span>` +
        `<span class="asm-code">${ins.txt}</span>` +
        `<span class="asm-cmt">; ${ins.c}</span>`;
      list.appendChild(node);
      return node;
    });
  }
  function buildRegs(box) {
    box.innerHTML = '';
    regEls = [];
    for (let i = 0; i < 8; i++) {
      const d = document.createElement('div');
      d.className = 'cpu-reg';
      d.innerHTML = `<span class="reg-name">R${i}</span><span class="reg-val">0</span>`;
      box.appendChild(d);
      regEls.push(d.querySelector('.reg-val'));
    }
    const pcd = document.createElement('div');
    pcd.className = 'cpu-reg cpu-reg--pc';
    pcd.innerHTML = `<span class="reg-name">PC</span><span class="reg-val" id="cpu-pcval">0</span>`;
    box.appendChild(pcd);
  }
  function buildMem(box) {
    box.innerHTML = '';
    memEls = [];
    for (let i = 0; i < 8; i++) {                 // the program stores 8 values
      const d = document.createElement('div');
      d.className = 'cpu-memcell';
      d.innerHTML = `<span class="mem-idx">M${i}</span><span class="mem-v">·</span>`;
      box.appendChild(d);
      memEls.push(d);
    }
  }
  // Keep the active line visible by scrolling ONLY the listing element — using
  // element.scrollIntoView() here would also scroll the page (every step) and
  // trap the viewport on this slide.
  function scrollListToLine(node) {
    const list = $('cpu-asm-list');
    if (!list) return;
    const cr = list.getBoundingClientRect(), lr = node.getBoundingClientRect();
    if (lr.top < cr.top) list.scrollTop -= (cr.top - lr.top) + 6;
    else if (lr.bottom > cr.bottom) list.scrollTop += (lr.bottom - cr.bottom) + 6;
  }
  function paint(trace) {
    // registers
    for (let i = 0; i < 8; i++) {
      regEls[i].textContent = cpu.reg[i];
      regEls[i].parentElement.classList.toggle('changed', trace && trace.wrote === i);
    }
    $('cpu-pcval').textContent = cpu.pc;
    // current asm line
    asmEls.forEach(n => n.classList.remove('current'));
    const enc = $('cpu-enc');
    if (trace) {
      const n = asmEls[trace.index];
      n.classList.add('current');
      scrollListToLine(n);              // scroll the listing only — never the page
      if (enc) enc.innerHTML =
        `<span class="enc-fields">${trace.enc.fields}</span>` +
        `<span class="enc-hex">0x${(trace.enc.word & 0xffff).toString(16).toUpperCase().padStart(4, '0')}</span>`;
    } else if (enc) {
      enc.innerHTML = '<span class="enc-fields enc-idle">— machine code —</span>';
    }
    // data memory
    for (let i = 0; i < memEls.length; i++) {
      const written = cpu.memWritten.has(i);
      memEls[i].querySelector('.mem-v').textContent = written ? cpu.mem[i] : '·';
      memEls[i].classList.toggle('filled', written);
      memEls[i].classList.toggle('changed', trace && trace.memw === i);
    }
    dp.show(trace);
  }

  function doStep() {
    if (cpu.halted) { stop(); return; }
    const trace = cpu.step();
    paint(trace);
    if (cpu.halted) { stop(); setStatus('halted · 8 Fibonacci values in memory'); }
  }
  function setStatus(s) { const e = $('cpu-status'); if (e) e.textContent = s; }
  function play() {
    if (playing) return;
    if (cpu.halted) doReset();
    playing = true; $('cpu-play').textContent = '❚❚ pause';
    timer = setInterval(doStep, 1100);
    setStatus('running…');
  }
  function stop() {
    playing = false; clearInterval(timer); timer = null;
    const b = $('cpu-play'); if (b) b.textContent = '▶ run';
  }
  function doReset() {
    stop(); cpu.reset(); paint(null); dp.clear();
    asmEls.forEach(n => n.classList.remove('current'));
    setStatus('ready');
  }

  // Bit-signals on the shared 120px column grid: a dim Gaming+-coloured light in
  // the slide above and the bright green CPU light below share each column's
  // period + delay, so the light reads as crossing the seam and turning green.
  // (Honours reduced-motion by not spawning anything.)
  const PERIOD = 6.4;   // seconds for a full two-slide crossing
  function seedSignals() {
    if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const gp = document.querySelector('#gaming-plus .gplus-fx');
    const cp = document.querySelector('#cpu .cpu-fx');
    const cols = Math.ceil(innerWidth / 120) + 1;
    for (let k = 0; k < cols; k++) {
      if (k % 3 === 1) continue;                      // sparser, deterministic
      const left = (k * 120) + 'px';
      const delay = (-((k * 1.7) % PERIOD)).toFixed(2) + 's';
      const mk = (cls, host) => {
        if (!host) return;
        const s = document.createElement('span');
        s.className = cls; s.style.left = left;
        s.style.animationDuration = PERIOD + 's';
        s.style.animationDelay = delay;
        host.appendChild(s);
      };
      mk('gplus-signal', gp);
      mk('cpu-signal', cp);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const svg = $('cpu-datapath'), section = $('cpu');
    if (!svg || !section) return;
    seedSignals();
    dp = new Datapath(svg);
    buildAsm($('cpu-asm-list'));
    buildRegs($('cpu-regs'));
    buildMem($('cpu-memgrid'));
    paint(null);
    setStatus('ready');

    $('cpu-play').addEventListener('click', () => playing ? stop() : play());
    $('cpu-step').addEventListener('click', () => { stop(); doStep(); });
    $('cpu-reset').addEventListener('click', doReset);

    // Auto-run once when the slide enters view; pause whenever it leaves so the
    // clock (and its in-list auto-scroll) never runs while you're elsewhere.
    let started = false;
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        const visible = es[0].isIntersecting;
        if (visible && !started) { started = true; play(); }
        else if (!visible && playing) { stop(); }
      }, { threshold: 0.4 });
      io.observe(section);
    }
  });
})();
