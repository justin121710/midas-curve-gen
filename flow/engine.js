// ============================================================================
// 吊橋纜索初張力引擎：midas-curve-gen tools/cable_pretension.py（v 82a6cce 系列）的
// JavaScript 移植。演算法、迭代順序、浮點運算順序與輸出格式逐行對應原程式，
// 以 tools/examples 的人行吊橋範例與 60 m 參數式例題比對逐位元組相同。
// ============================================================================
const KIND = { Pretension: 1, Horizontal: 2, Lu: 3 };
class CpError extends Error {}

function checkPhys(L, T, EA, where) {
  const w = where ? where + '：' : '';
  for (const [nm, v] of [['長度 L', L], ['張力 T', T], ['EA', EA]])
    if (typeof v !== 'number' || !isFinite(v)) throw new CpError(`${w}${nm} = ${v} 不是有限的數值`);
  if (L <= 0) throw new CpError(`${w}長度 L = ${L} 必須大於 0（零長元素）`);
  if (EA <= 0) throw new CpError(`${w}EA = ${EA} 必須大於 0`);
  if (T < 0) throw new CpError(`${w}張力 T = ${T} 為負：纜索不能受壓，請檢查載重與 hanger_loads 的正負號`);
}
function unstressed(L, T, EA) { checkPhys(L, T, EA); return L / (1.0 + T / EA); }
function strip0(s) { if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, ''); return s; }
function fmt(v) { let s = strip0(v.toFixed(6)); return (s === '' || s === '-0') ? '0' : s; }
function fmtLu(L, T, EA, rel = 1e-3) {
  const Lu = unstressed(L, T, EA);
  const tol = Math.max(rel * Math.abs(T), 1e-12 * EA);
  for (let nd = 6; nd <= 12; nd++) {
    const s = strip0(Lu.toFixed(nd));
    if (Math.abs(EA * (L / parseFloat(s) - 1.0) - T) <= tol) return s;
  }
  throw new CpError(`Lu = ${Lu} 以 12 位小數寫出仍無法保留張力 T = ${T}；請改用 Pretension`);
}
function exval(kind, L, Lh, T, EA) {
  if (kind === 'Lu') return unstressed(L, T, EA);
  if (kind === 'Pretension') return T;
  if (kind === 'Horizontal') return T * Lh / L;
  throw new CpError('output_kind 只能是 Lu、Pretension 或 Horizontal');
}
function expandList(text) {
  const out = [];
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    const m = /^(\d+)to(\d+)(?:by(\d+))?$/i.exec(tok);
    if (m) { const a = +m[1], b = +m[2], s = +(m[3] || 1); for (let v = a; v <= b; v += s) out.push(v); }
    else if (/^\d+$/.test(tok)) out.push(+tok);
    else throw new CpError(`無法解析的節點／元素清單項目：${tok}`);
  }
  return out;
}
function compressList(ids) {
  ids = [...new Set(ids)].sort((a, b) => a - b); const out = []; let i = 0;
  while (i < ids.length) {
    let j = i; while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) j++;
    out.push(j > i + 1 ? `${ids[i]}to${ids[j]}` : ids.slice(i, j + 1).join(' ')); i = j + 1;
  }
  return out.join(' ');
}

class Mct {
  constructor(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    this.newline = text.includes('\r\n') ? '\r\n' : '\n';
    this.lines = text.split(/\r\n|\n|\r/);
    if (this.lines.length && this.lines[this.lines.length - 1] === '') this.lines.pop();
    this.unit = ['?', '?'];
    this.nodes = new Map(); this.nodeLine = new Map();
    this.elems = new Map(); this.elemLine = new Map();
    this.groups = new Map();
    let sec = null, cont = '';
    this.lines.forEach((raw, k) => {
      const s = raw.trim();
      if (s.startsWith('*') && !cont) { sec = s.split(/\s+/)[0].split(';')[0].toUpperCase(); return; }
      let data = s.split(';')[0].trim();
      if (data.endsWith('\\')) { cont += data.slice(0, -1) + ' '; return; }
      data = cont + data; cont = '';
      if (!data) return;
      const f = data.split(',').map(x => x.trim());
      if (sec === '*UNIT') this.unit = [f[0], f[1]];
      else if (sec === '*NODE') { const n = parseInt(f[0]); this.nodes.set(n, [parseFloat(f[1]), parseFloat(f[2]), parseFloat(f[3])]); this.nodeLine.set(n, k); }
      else if (sec === '*ELEMENT') { const e = parseInt(f[0]); this.elems.set(e, { type: f[1], i: parseInt(f[4]), j: parseInt(f[5]), f }); this.elemLine.set(e, k); }
      else if (sec === '*GROUP') this.groups.set(f[0], { nodes: expandList(f[1] || ''), elems: expandList(f.length > 2 ? f[2] : '') });
    });
    this.extraGroups = [];
  }
  groupElems(name) {
    if (!this.groups.has(name)) throw new CpError(`MCT 裡沒有群組 ${name}`);
    const es = this.groups.get(name).elems, miss = es.filter(e => !this.elems.has(e));
    if (miss.length) throw new CpError(`群組 ${name} 列了 *ELEMENT 中不存在的元素 ${miss.slice(0, 5)}；請由 midas 重新匯出完整的 .mct`);
    return es.slice();
  }
  setExval(e, code, value) {
    const f = this.elems.get(e).f.slice();
    if (f[1].toUpperCase() !== 'TENSTR') throw new CpError(`元素 ${e} 不是 TENSTR（${f[1]}）`);
    if (f.length < 8 || f[7] !== '3') throw new CpError(`元素 ${e} 是 TENSTR 但 iSUB＝${f.length > 7 ? f[7] : '（缺）'}，不是 Cable（3）`);
    while (f.length < 10) f.push('0');
    f[7] = '3'; f[8] = typeof value === 'string' ? value : fmt(value); f[9] = String(code);
    this.lines[this.elemLine.get(e)] = '   ' + f.slice(0, 10).join(', ');
  }
  setNode(n, xyz) { this.nodes.set(n, xyz.slice()); this.lines[this.nodeLine.get(n)] = '   ' + [String(n), ...xyz.map(fmt)].join(', '); }
  text(header = []) {
    const out = this.lines.slice();
    let k = out.findIndex(s => s.trim().toUpperCase().startsWith('*UNIT')); if (k < 0) k = 0;
    out.splice(k, 0, ...header);
    return out.join(this.newline) + this.newline;
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = a => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const hlen = a => pyHypot(a[0], a[1]);
const unit = a => { const n = norm(a); return [a[0] / n, a[1] / n, a[2] / n]; };
// CPython math.hypot（2 個引數）：以 frexp 縮放後求平方和，再做一次修正（vector_norm）
function pyHypot(x, y) {
  x = Math.abs(x); y = Math.abs(y);
  const max = Math.max(x, y);
  if (max === 0) return 0;
  if (!isFinite(max)) return Infinity;
  if (x === max ? y === 0 : x === 0) return max;
  return vectorNorm([x, y], max);
}
function frexpE(v) { if (v === 0) return 0; let e = Math.floor(Math.log2(v)) + 1; if (v / 2 ** e >= 1) e++; if (v / 2 ** e < 0.5) e--; return e; }
function ldexp(m, e) { return e > 1000 ? m * 2 ** 1000 * 2 ** (e - 1000) : e < -1000 ? m * 2 ** -1000 * 2 ** (e + 1000) : m * 2 ** e; }
function twoProd(a, b) { const p = a * b; const s = 134217729; let t = s * a; const ah = t - (t - a), al = a - ah; t = s * b; const bh = t - (t - b), bl = b - bh; return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl]; }
function vectorNorm(vec, max) {
  // CPython 3.12+ Modules/mathmodule.c vector_norm（DBL_MANT_DIG = 53）
  const maxE = frexpE(max);
  if (maxE < -1023) { return ldexp(vectorNorm(vec.map(v => v / 2 ** -1074 * 1), max / 2 ** -1074), -1074); }
  const scale = ldexp(1.0, -maxE);
  let csum = 1.0, frac1 = 0.0, frac2 = 0.0;
  for (let x of vec) {
    x *= scale;
    const [pr_hi, pr_lo] = twoProd(x, x);
    const sm_hi = csum + pr_hi; const sm_lo = (csum - sm_hi) + pr_hi; csum = sm_hi;
    frac1 += pr_lo; frac2 += sm_lo;
  }
  let h = Math.sqrt(csum - 1.0 + (frac1 + frac2));
  let [pr_hi, pr_lo] = twoProd(-h, h);
  let sm_hi = csum + pr_hi, sm_lo = (csum - sm_hi) + pr_hi; csum = sm_hi;
  frac1 += pr_lo; frac2 += sm_lo;
  const x = csum - 1.0 + (frac1 + frac2);
  h += x / (2.0 * h);
  return h / scale;
}

function chain(mct, g) {
  const es = mct.groupElems(g), adj = new Map();
  for (const e of es) {
    const { i, j } = mct.elems.get(e);
    if (!adj.has(i)) adj.set(i, []); adj.get(i).push([j, e]);
    if (!adj.has(j)) adj.set(j, []); adj.get(j).push([i, e]);
  }
  const ends = [...adj].filter(([, v]) => v.length === 1).map(([n]) => n);
  if (ends.length !== 2 || [...adj.values()].some(v => v.length > 2)) throw new CpError(`群組 ${g} 不是一條不分岔的節點串`);
  const key = n => mct.nodes.get(n);
  const start = ends.reduce((a, b) => { const A = key(a), B = key(b); return (B[0] < A[0] || (B[0] === A[0] && B[1] < A[1])) ? b : a; });
  const ns = [start], el = []; let prev = null;
  for (;;) { const nxt = adj.get(ns[ns.length - 1]).filter(([, e]) => e !== prev); if (!nxt.length) break; const [m, e] = nxt[0]; ns.push(m); el.push(e); prev = e; }
  if (el.length !== es.length || new Set(ns).size !== ns.length) throw new CpError(`群組 ${g} 有 ${es.length - el.length} 根元素沒有連在同一條節點串上`);
  return [ns, el];
}

function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  const tol = 1e-12 * Math.max(...A.flat().map(Math.abs), 1e-300);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) <= tol) throw new CpError(`力密度矩陣奇異（第 ${c + 1} 個未知數）：耐風索節點可能重複、孤立，或力密度為零`);
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const k = M[r][c] / M[c][c]; if (k) for (let cc = c; cc <= n; cc++) M[r][cc] -= k * M[c][cc]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = 0; for (let cc = r + 1; cc < n; cc++) s += M[r][cc] * x[cc]; x[r] = (M[r][n] - s) / M[r][r]; }
  return x;
}

function windFormFinding(mct, cfg, ns, tieOf) {
  const Hw = cfg.wind_H, tT = cfg.tie_T, ww = (cfg.loads || {}).w_wind || 0;
  if (!(Hw > 0 && tT >= 0)) throw new CpError(`fix_wind 需要 wind_H > 0、tie_T ≥ 0（目前 ${Hw}、${tT}）`);
  const P = new Map(ns.map(n => [n, mct.nodes.get(n).slice()]));
  let ax = sub(P.get(ns[ns.length - 1]), P.get(ns[0])); ax = unit([ax[0], ax[1], 0.0]);
  const free = ns.slice(1, -1), idx = new Map(free.map((n, k) => [n, k]));
  let it, move = 0;
  for (it = 0; it < 200; it++) {
    const A = free.map(() => new Array(free.length).fill(0)), rhs = [0, 1, 2].map(() => new Array(free.length).fill(0));
    const edge = (a, b, q) => {
      for (const [u, v] of [[a, b], [b, a]]) if (idx.has(u)) {
        const iu = idx.get(u); A[iu][iu] += q;
        if (idx.has(v)) A[iu][idx.get(v)] -= q;
        else for (let c = 0; c < 3; c++) rhs[c][iu] += !P.has(v) ? q * mct.nodes.get(v)[c] : q * P.get(v)[c];
      }
    };
    for (let k = 0; k < ns.length - 1; k++) {
      const a = ns[k], b = ns[k + 1], d = sub(P.get(b), P.get(a));
      const dx = Math.max(Math.abs(d[0] * ax[0] + d[1] * ax[1]), 1e-9);
      edge(a, b, Hw / dx);
      if (idx.has(b)) rhs[2][idx.get(b)] -= ww * norm(d) / 2;
      if (idx.has(a)) rhs[2][idx.get(a)] -= ww * norm(d) / 2;
    }
    for (const n of free) if (tieOf.has(n)) {
      const [, deck] = tieOf.get(n), lt = norm(sub(mct.nodes.get(deck), P.get(n)));
      if (lt < 1e-3) throw new CpError('tie_T 相對於 wind_H 太大：耐風索被拉到橋面上（降低 tie_T 或提高 wind_H）');
      edge(n, deck, tT / lt);
    }
    const X = [0, 1, 2].map(c => solve(A, rhs[c]));
    move = 0;
    for (const n of free) { const i = idx.get(n), q = [X[0][i], X[1][i], X[2][i]]; move = Math.max(move, norm(sub(q, P.get(n)))); P.set(n, q); }
    if (move < 1e-10) break;
  }
  if (it === 200) throw new CpError(`耐風索力密度法 200 次未收斂（最後一次節點移動 ${move.toPrecision(3)}）`);
  for (const n of free) mct.setNode(n, P.get(n));
  return it + 1;
}

function windSystem(mct, cfg, rep, log) {
  const Hw = cfg.wind_H || 0, ww = (cfg.loads || {}).w_wind || 0, out = new Map();
  const tieOf = new Map(), tieGrp = new Map(), nTie = new Map();
  for (const g of cfg.tie || []) for (const e of mct.groupElems(g)) {
    const { i, j } = mct.elems.get(e);
    tieOf.set(i, [e, j]); tieOf.set(j, [e, i]); tieGrp.set(e, g);
    nTie.set(i, (nTie.get(i) || 0) + 1); nTie.set(j, (nTie.get(j) || 0) + 1);
  }
  if ((cfg.tie || []).length && !(cfg.wind || []).length) throw new CpError('設定了繫索（tie）群組卻沒有耐風索（wind）群組：只處理型式 A（耐風索＋繫索）');
  const info = [];
  for (const g of cfg.wind || []) {
    const [ns, el] = chain(mct, g);
    const dup = ns.slice(1, -1).filter(n => (nTie.get(n) || 0) > 1);
    if (dup.length) throw new CpError(`${g}：耐風索節點 ${dup[0]} 等 ${dup.length} 處接了兩根以上繫索`);
    let ffIt = 0;
    if (cfg.fix_wind && 'tie_T' in cfg) { ffIt = windFormFinding(mct, cfg, ns, tieOf); log(`${g}：以力密度法重算耐風索節點（${ffIt} 次迭代收斂）`); }
    const P = ns.map(n => mct.nodes.get(n));
    let ax = sub(P[P.length - 1], P[0]); ax = unit([ax[0], ax[1], 0.0]);
    const T = [];
    el.forEach((e, k) => {
      const d = sub(P[k + 1], P[k]), dx = Math.abs(d[0] * ax[0] + d[1] * ax[1]);
      T.push(Hw * norm(d) / dx);
      rep.push({ group: g, elem: e, role: 'wind', L: norm(d), Lh: hlen(d), T: T[T.length - 1], EA: cfg.EA.wind });
    });
    const resid = [];
    for (let k = 1; k < ns.length - 1; k++) {
      const n = ns[k], a = sub(P[k - 1], P[k]), b = sub(P[k + 1], P[k]);
      const F = add(mul(unit(a), T[k - 1]), mul(unit(b), T[k]));
      F[2] -= ww * (norm(a) + norm(b)) / 2;
      if (!tieOf.has(n)) { resid.push(norm(F)); continue; }
      const [e, deck] = tieOf.get(n), d = unit(sub(mct.nodes.get(deck), mct.nodes.get(n)));
      const t = norm(F);
      let mis = 0;
      if (t >= 1e-12) { const cosang = -(F[0] * d[0] + F[1] * d[1] + F[2] * d[2]) / t; mis = Math.acos(Math.max(-1, Math.min(1, cosang))) * 180 / Math.PI; }
      out.set(e, { deck, t, force: mul(d, -t), mis });
      const dv = sub(mct.nodes.get(deck), mct.nodes.get(n));
      rep.push({ group: tieGrp.get(e), elem: e, role: 'tie', L: norm(dv), Lh: hlen(dv), T: t, EA: cfg.EA.tie, mis });
    }
    const rmax = resid.length ? Math.max(...resid) : 0;
    if (resid.length && rmax > 1e-6 * Math.max(...T)) log(`! ${g}：${resid.length} 個沒有繫索的節點合力不為 0（最大 ${rmax.toFixed(3)}），耐風索的幾何不是這組繫索的索多邊形；可開啟「修正耐風索」並設定繫索張力`, 'warn');
    info.push({ g, ns, ffIt, resid: rmax });
  }
  return [out, info];
}

function mainSystem(mct, cfg, ties, rep, gname, log) {
  const ld = cfg.loads || {};
  const [ns, el] = chain(mct, gname);
  const z = ns.map(n => mct.nodes.get(n)[2]);
  let s1, s2;
  const sad = (cfg.saddles || {})[gname];
  if (sad) { [s1, s2] = [ns.indexOf(sad[0]), ns.indexOf(sad[1])].sort((a, b) => a - b); }
  else {
    let peaks = []; for (let k = 1; k < ns.length - 1; k++) if (z[k] >= z[k - 1] && z[k] >= z[k + 1]) peaks.push(k);
    if (peaks.length < 2) peaks = [...new Set([...peaks, 0, ns.length - 1])].sort((a, b) => a - b);
    [s1, s2] = peaks.slice().sort((a, b) => -z[a] - -z[b]).slice(0, 2).sort((a, b) => a - b);
  }
  const P0 = mct.nodes.get(ns[s1]), P1 = mct.nodes.get(ns[s2]);
  let axv = sub(P1, P0); const span = hlen(axv); const ax = [axv[0] / span, axv[1] / span, 0.0];
  const xl = p => (p[0] - P0[0]) * ax[0] + (p[1] - P0[1]) * ax[1];
  let off = [-1, null];
  for (const n of ns.slice(s1 + 1, s2)) { const p = mct.nodes.get(n), v = Math.abs(-(p[0] - P0[0]) * ax[1] + (p[1] - P0[1]) * ax[0]); if (v > off[0] || (v === off[0] && n > off[1])) off = [v, n]; }
  if (off[0] > 1e-4 * span) throw new CpError(`${gname}：主跨節點 ${off[1]} 偏離兩索鞍的鉛直面 ${off[0].toPrecision(4)}；只處理平面主纜`);
  const inner = new Set(ns.slice(s1 + 1, s2));
  const hang = new Map();
  for (const g of cfg.hanger) for (const e of mct.groupElems(g)) {
    const { i, j } = mct.elems.get(e);
    const [top, bot] = inner.has(i) ? [i, j] : inner.has(j) ? [j, i] : [null, null];
    if (top === null) continue;
    if (hang.has(top)) throw new CpError(`主纜節點 ${top} 接了兩根以上的吊索（元素 ${hang.get(top)[0]}、${e}）`);
    hang.set(top, [e, bot]);
  }
  const hx = [...hang.keys()].map(n => [xl(mct.nodes.get(n)), n]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const trib = new Map();
  hx.forEach(([x, n], k) => { const xa = k ? hx[k - 1][0] : 0.0, xb = k + 1 < hx.length ? hx[k + 1][0] : span; trib.set(n, (xb - xa) / 2); });
  const ptie = new Map([...hang.keys()].map(n => [n, 0.0]));
  const um = { M: 1.0, CM: 100.0, MM: 1000.0, FT: 3.28084, IN: 39.3701 }[mct.unit[1].toUpperCase()] || 1.0;
  const tol = hx.length > 1 ? 0.6 * (hx[1][0] - hx[0][0]) + 0.5 * um : 2.0 * um;
  const lowAll = new Set();
  for (const g of cfg.hanger) for (const e of mct.groupElems(g)) { const { i, j } = mct.elems.get(e); lowAll.add(mct.nodes.get(i)[2] < mct.nodes.get(j)[2] ? i : j); }
  const mine = new Set([...hang.values()].map(([, d]) => d));
  const argmin = (it, f) => { let best = null, bv = Infinity; for (const x of it) { const v = f(x); if (v < bv) { bv = v; best = x; } } return best; };
  for (const [e, tv] of ties) {
    const dn = mct.nodes.get(tv.deck);
    if (lowAll.size) { const gb = argmin(lowAll, d => hlen(sub(mct.nodes.get(d), dn))); if (!mine.has(gb)) continue; }
    const best = argmin(hang.keys(), n => hlen(sub(mct.nodes.get(hang.get(n)[1]), dn)));
    const d = hlen(sub(mct.nodes.get(hang.get(best)[1]), dn));
    if (d < tol) ptie.set(best, ptie.get(best) + -tv.force[2]);
    else log(`! 繫索 ${e}（橋面節點 ${tv.deck}）距最近吊點 ${d.toFixed(2)}，垂直分力未計入吊索與主纜初張力`, 'warn');
  }
  const over = cfg.hanger_loads || {};
  let H, f, dz0, Q, Nh, km, Wtot;
  const fixZ = !!cfg.fix_main_z;
  for (let it = 0; it < 100; it++) {
    const Pn = ns.map(n => mct.nodes.get(n));
    const seg = []; for (let k = 0; k < ns.length - 1; k++) seg.push(norm(sub(Pn[k + 1], Pn[k])));
    Nh = new Map(); Q = new Map();
    for (const [n, [e, d]] of hang) {
      const lh = norm(sub(mct.nodes.get(d), mct.nodes.get(n)));
      const base = (String(n) in over) ? over[String(n)] : ld.deck_per_len * trib.get(n);
      Nh.set(n, base + ptie.get(n) + (ld.w_hang || 0) * lh / 2);
    }
    for (let k = s1 + 1; k < s2; k++) {
      const n = ns[k];
      let q = (ld.w_main || 0) * (seg[k - 1] + seg[k]) / 2;
      if (hang.has(n)) { const lh = norm(sub(mct.nodes.get(hang.get(n)[1]), mct.nodes.get(n))); q += Nh.get(n) + (ld.w_hang || 0) * lh / 2 + (ld.band || 0); }
      Q.set(n, q);
    }
    const xs = new Map(ns.slice(s1, s2 + 1).map(n => [n, xl(mct.nodes.get(n))]));
    let R = 0; for (const [n, q] of Q) R += q * (span - xs.get(n)); R /= span;
    const M0 = x => { let s = 0; for (const [n, q] of Q) s += q * Math.max(0.0, x - xs.get(n)); return R * x - s; };
    const zc = x => P0[2] + (P1[2] - P0[2]) * x / span;
    km = s1 + 1; for (let k = s1 + 1; k < s2; k++) if (Math.abs(xs.get(ns[k]) - span / 2) < Math.abs(xs.get(ns[km]) - span / 2)) km = k;
    f = zc(xs.get(ns[km])) - mct.nodes.get(ns[km])[2];
    const m0 = M0(xs.get(ns[km]));
    if (!(f > 0 && m0 > 0 && isFinite(f) && isFinite(m0))) throw new CpError(`${gname}：跨中節點 ${ns[km]} 的垂度 f = ${f}、M0 = ${m0}，無法求 H`);
    H = m0 / f;
    const dz = new Map(ns.slice(s1 + 1, s2).map(n => [n, mct.nodes.get(n)[2] - (zc(xs.get(n)) - M0(xs.get(n)) / H)]));
    if (it === 0) dz0 = dz;
    if (!fixZ) break;
    if (Math.max(...[...dz.values()].map(Math.abs)) < 1e-9) break;
    if (it === 99) throw new CpError(`${gname}：主纜索多邊形 100 次未收斂`);
    for (const n of ns.slice(s1 + 1, s2)) { const p = mct.nodes.get(n); mct.setNode(n, [p[0], p[1], p[2] - dz.get(n)]); }
  }
  if (!(isFinite(H) && H > 0 && f > 0)) throw new CpError(`${gname}：垂度 f = ${f}、H = ${H} 不合理`);
  if (fixZ) {
    let res = 0;
    for (let k = s1 + 1; k < s2; k++) {
      const a = sub(mct.nodes.get(ns[k - 1]), mct.nodes.get(ns[k])), b = sub(mct.nodes.get(ns[k + 1]), mct.nodes.get(ns[k]));
      const la = Math.abs(a[0] * ax[0] + a[1] * ax[1]), lb = Math.abs(b[0] * ax[0] + b[1] * ax[1]);
      const F = add(mul(a, H / la), mul(b, H / lb)); F[2] -= Q.get(ns[k]); res = Math.max(res, norm(F));
    }
    if (res > 1e-6 * H) throw new CpError(`${gname}：修正後主纜節點的三方向殘差 ${res.toPrecision(4)} 超過 1e-6·H`);
  }
  el.forEach((e, k) => {
    const d = sub(mct.nodes.get(ns[k + 1]), mct.nodes.get(ns[k])), lx = Math.abs(d[0] * ax[0] + d[1] * ax[1]);
    if (lx < 1e-9) throw new CpError(`${gname} 的元素 ${e} 與橋軸垂直`);
    rep.push({ group: gname, elem: e, role: (s1 <= k && k < s2) ? 'main' : 'backstay', L: norm(d), Lh: hlen(d), T: H * norm(d) / lx, EA: cfg.EA.main });
  });
  for (const [n, [e, d]] of hang) {
    const dv = sub(mct.nodes.get(d), mct.nodes.get(n)), L = norm(dv);
    if (hlen(dv) > 0.01 * L) throw new CpError(`吊索 ${e} 不是鉛直，只處理鉛直吊索`);
    const g = cfg.hanger.find(x => mct.groupElems(x).includes(e));
    rep.push({ group: g, elem: e, role: 'hanger', L, Lh: hlen(dv), T: Nh.get(n), EA: cfg.EA.hanger, ptie: ptie.get(n), top: n, bot: d });
  }
  let ps = 0; for (const v of ptie.values()) ps += v;
  let wt = 0; for (const v of Q.values()) wt += v;
  return { H, f, span, dz: dz0, nHang: hang.size, ptie: ps, Wtot: wt, ns, el, s1, s2, km, hang, ax, P0, P1 };
}

function runMct(text, cfg, log = () => {}) {
  const mct = new Mct(text), kind = cfg.output_kind || 'Lu';
  for (const r of ['main', 'hanger', ...((cfg.wind || []).length ? ['wind', 'tie'] : [])]) {
    const ea = (cfg.EA || {})[r];
    if (typeof ea !== 'number' || !isFinite(ea) || ea <= 0) throw new CpError(`EA.${r} = ${ea}：必須是正的有限數值`);
  }
  const rep = [];
  const [ties, windInfo] = windSystem(mct, cfg, rep, log);
  if (ties.size) {
    const v = [...ties.values()], mis = Math.max(...v.map(x => x.mis));
    log(`繫索 ${ties.size} 根：張力 ${Math.min(...v.map(x => x.t)).toFixed(3)}～${Math.max(...v.map(x => x.t)).toFixed(3)}；繫索方向與耐風索節點合力的最大夾角 ${mis.toFixed(2)}°`);
    if (mis > 2.0) log('! 夾角大於 2°：耐風索的幾何與繫索方向不一致，繫索張力不可靠', 'warn');
  }
  const res = new Map();
  const toMm = { M: 1000.0, CM: 10.0, MM: 1.0, FT: 304.8, IN: 25.4 }[mct.unit[1].toUpperCase()];
  if (toMm === undefined) throw new CpError(`不認得的長度單位 ${mct.unit[1]}`);
  for (const g of cfg.main) {
    const r = mainSystem(mct, cfg, ties, rep, g, log); res.set(g, r);
    r.dzmax = Math.max(...[...r.dz.values()].map(Math.abs)) * toMm;
    log(`${g}：主跨 ${r.span.toFixed(3)}，垂度 ${r.f.toFixed(4)}，H = ${r.H.toFixed(3)}；吊索 ${r.nHang} 根，繫索向下分力合計 ${r.ptie.toFixed(3)}；原始主纜節點與索多邊形最大差 ${r.dzmax.toFixed(1)} mm` + (cfg.fix_main_z ? '（已移到索多邊形上）' : '（未修正）'));
  }
  if (kind === 'Horizontal') { const steep = rep.filter(r => r.Lh < 0.05 * r.L); if (steep.length) throw new CpError(`${steep.length} 根纜索接近鉛直（例如 ${steep[0].elem}），水平分量無法代表張力；請改用 Lu 或 Pretension`); }
  const seen = new Map();
  for (const row of rep) {
    if (seen.has(row.elem)) throw new CpError(`元素 ${row.elem} 同時屬於 ${seen.get(row.elem)} 與 ${row.group}（${row.role}）`);
    seen.set(row.elem, `${row.group}（${row.role}）`);
    checkPhys(row.L, row.T, row.EA, `${row.group} 元素 ${row.elem}`);
  }
  const left = [...mct.elems].filter(([e, v]) => v.type.toUpperCase() === 'TENSTR' && !seen.has(e)).map(([e]) => e).sort((a, b) => a - b);
  if (left.length) log(`! ${left.length} 根 TENSTR 元素不屬於任何角色群組（例如 ${left.slice(0, 5)}），EXVAL 原樣保留`, 'warn');
  for (const row of rep) {
    row.Lu = unstressed(row.L, row.T, row.EA);
    row.LuStr = fmtLu(row.L, row.T, row.EA);
    mct.setExval(row.elem, KIND[kind], kind === 'Lu' ? row.LuStr : exval(kind, row.L, row.Lh, row.T, row.EA));
  }
  const hdr = [';', `; cable_pretension.py: EXVAL filled for ${rep.length} cable elements (kind ${kind}, EXVAL2 = ${KIND[kind]})`,
    '; NOTE: dropping this file back onto midas-curve-gen rebuilds the geometry', ';       from the parameter block; EXVAL and moved nodes are NOT kept.', ';'];
  const tot = new Map();
  for (const e of [...ties.keys()].sort((a, b) => a - b)) { const v = ties.get(e); if (!tot.has(v.deck)) tot.set(v.deck, [0, 0, 0]); const t = tot.get(v.deck); for (let c = 0; c < 3; c++) t[c] += v.force[c]; }
  const tieEq = [...tot.keys()].sort((a, b) => a - b).map(n => ({ node: n, F: tot.get(n) }));
  return { mct, text: mct.text(hdr), rep, ties, res, tieEq, windInfo, kind, unit: mct.unit };
}

// ---------------------------------------------------------------- 角色自動判定（不需 roles.json）
// 只看 .mct：全部元素為 Cable（TENSTR、iSUB 3）的群組才算纜索群組；
// 元素皆鉛直＝吊索；上端節點在某條節點串上＝主纜；其餘節點串＝耐風索；連到耐風索的非串群組＝繫索。
function inferRoles(mct) {
  const cableGroups = [];
  for (const [g, v] of mct.groups) {
    if (!v.elems.length) continue;
    if (v.elems.every(e => mct.elems.has(e) && mct.elems.get(e).type.toUpperCase() === 'TENSTR' && mct.elems.get(e).f[7] === '3')) cableGroups.push(g);
  }
  const isVert = g => mct.groups.get(g).elems.every(e => { const { i, j } = mct.elems.get(e); const d = sub(mct.nodes.get(i), mct.nodes.get(j)); return hlen(d) <= 0.01 * norm(d); });
  const isChain = g => { try { chain(mct, g); return true; } catch (e) { return false; } };
  const hanger = cableGroups.filter(g => isVert(g) && !isChain(g));
  const chains = cableGroups.filter(g => !hanger.includes(g) && isChain(g));
  const hangNodes = new Set(); hanger.forEach(g => mct.groups.get(g).elems.forEach(e => { const { i, j } = mct.elems.get(e); hangNodes.add(i); hangNodes.add(j); }));
  const nodesOf = g => { const s = new Set(); mct.groups.get(g).elems.forEach(e => { const { i, j } = mct.elems.get(e); s.add(i); s.add(j); }); return s; };
  const main = chains.filter(g => [...nodesOf(g)].some(n => hangNodes.has(n)));
  const wind = chains.filter(g => !main.includes(g));
  const windNodes = new Set(); wind.forEach(g => nodesOf(g).forEach(n => windNodes.add(n)));
  const tie = cableGroups.filter(g => !hanger.includes(g) && !chains.includes(g) && [...nodesOf(g)].some(n => windNodes.has(n)));
  const other = cableGroups.filter(g => ![...hanger, ...main, ...wind, ...tie].includes(g));
  return { main, hanger, wind, tie, other };
}

// 參數區塊（midas-curve-gen 匯出時附在檔頭的 JSON）
function readParams(text) {
  const a = text.indexOf('CURVE-GEN-PARAMS-BEGIN'), b = text.indexOf('CURVE-GEN-PARAMS-END');
  if (a < 0 || b < 0) return null;
  const body = text.slice(a, b).split(/\r?\n/).slice(1, -1).filter(l => l.startsWith(';')).map(l => l.slice(1)).join('\n').trim();
  try { let depth = 0, end = 0; for (let k = 0; k < body.length; k++) { if (body[k] === '{') depth++; else if (body[k] === '}') { depth--; if (!depth) { end = k + 1; break; } } } return JSON.parse(body.slice(0, end)); } catch (e) { return null; }
}

if (typeof module !== 'undefined') module.exports = { Mct, runMct, inferRoles, readParams, chain, fmt, fmtLu, compressList, expandList, pyHypot, CpError, KIND };
