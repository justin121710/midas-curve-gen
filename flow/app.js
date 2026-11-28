/* 吊橋 Midas 流程助手（flow.html）—— 介面與步驟內容
   計算在 flow/engine.js（tools/cable_pretension.py 的移植，輸出逐位元組相同）。
   資料來源：線形建模器交接（localStorage／postMessage）、拖入 .mct、雙擊 .mct（安裝為 App 時）、內建範例、60 m 參數式。 */
// ============================================================== 狀態
const G = 9.80665;
const ICON = {
  proj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h6l2 2h8v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg>',
  pret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6c4 9 14 9 18 0"/><path d="M3 6v12M21 6v12M8 11v7M12 12.5V18M16 11v7M3 18h18"/></svg>',
  midas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/></svg>',
  ana: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16M7 15l4-5 3 3 5-7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
  bridge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8c5 8 15 8 20 0M5 5v13M19 5v13M9 13v5M12 14v4M15 13v5M2 18h20"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>'
};
const PDEF = { L: 60, f: 6, s: 3, zTop: 7, zDeck: 0, zBase: -2, aLx: 12, aLz: -1, aRx: 12, aRz: -1, wd: 107.07, wc: 5.0986, wh: 1.5806, pb: 15.296, EAm: 8565616, EAh: 4099259 };
const XDEF = { b: null, qc: 200, qh: 300, dT: 20, pw: 450, hw: 0.40, Dc: 0.03, area: {} };
const S = {
  src: null, fileName: '', rolesName: '', mctText: '', cfg: null, prov: {}, extra: { ...XDEF, area: {} }, param: { ...PDEF },
  intent: '', confirmed: false, projectId: '', tab: 'proj', step: { proj: 0, pret: 0, midas: 0, ana: 0 }, g1: {}, g2: {}, roleFilter: 'all', route: 'A', deckBeam: true
};
try { const s = JSON.parse(localStorage.getItem('sbflow.v3') || 'null'); if (s) Object.assign(S, s, { extra: { ...XDEF, ...(s.extra || {}), area: { ...((s.extra || {}).area || {}) } } }); } catch (e) {}
function invalidate(includeG1 = true) {
  if (includeG1) S.g1 = {};
  S.g2 = {};
}
function save() { try { localStorage.setItem('sbflow.v3', JSON.stringify(S)); } catch (e) {} }

// ============================================================== 小工具
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fx = (v, d = 3) => (isFinite(v) ? (Math.round(v * 10 ** d) / 10 ** d).toFixed(d) : '—');
const tf = (kgf, d = 3) => fx(kgf / 1000, d);
const rng = (a, b) => a === b ? `${a}` : `${a}to${b}`;
const pill = (st, t) => `<span class="pill ${st}">${t}</span>`;
const TAG = { mct: '.mct', cg: 'curve-gen', roles: 'roles.json', auto: '推估', manual: '手動', demo: '範例', def: '預設' };
const tag = p => p ? `<span class="tag ${p}">${TAG[p]}</span>` : '';
let CODES = {};
function path(p, nx) { return `<div class="path"><span>${esc(p)}${nx ? `<em>NX：${esc(nx)}</em>` : ''}</span><button class="icon-btn" data-copy="${esc(p)}" aria-label="複製路徑">${ICON.copy}</button></div>`; }
function code(id, title, text, dl) {
  CODES[id] = text;
  const lines = text.split('\n'), show = lines.length > 60 ? lines.slice(0, 60).join('\n') + `\n; …（共 ${lines.length} 行，複製時為全文）` : text;
  return `<div class="codebar"><span class="t">${esc(title)}</span><span class="btns"><button class="btn sm solid" data-code="${id}">複製</button>${dl ? `<button class="btn sm" data-dl="${id}" data-name="${esc(dl)}">下載</button>` : ''}</span></div><pre class="mct">${esc(show)}</pre>`;
}
function tiles(list) { return `<div class="tiles">${list.map(([k, v, u, f]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}${u ? `<small>${u}</small>` : ''}</div>${f ? `<div class="f">${f}</div>` : ''}</div>`).join('')}</div>`; }
function head(kicker, title, lead) { return `<div class="kicker">${kicker}</div><h2>${title}</h2>${lead ? `<p class="muted">${lead}</p>` : ''}`; }
function ref(t) { return `<p class="muted" style="font-size:12.5px;margin-top:12px">延伸：${t}</p>`; }

// ============================================================== 參數式 60 m：產生 2D 模型 .mct（交給同一個引擎）
function genParam(p) {
  const n = Math.max(2, Math.round(p.L / p.s)), d = p.L / n, L = [];
  const zc = x => p.zTop - 4 * p.f * x * (p.L - x) / (p.L * p.L);
  L.push(';   Units     : KGF, M', '*UNIT', '; FORCE, LENGTH, HEAT, TEMPER', '   KGF, M, KJ, C', '*NODE', '; iNO, X, Y, Z');
  for (let i = 0; i <= n; i++) L.push(`   ${1 + i}, ${fmt(i * d)}, 0, ${fmt(p.zDeck)}`);
  L.push(`   101, ${fmt(-p.aLx)}, 0, ${fmt(p.aLz)}`);
  for (let i = 0; i <= n; i++) L.push(`   ${102 + i}, ${fmt(i * d)}, 0, ${fmt(zc(i * d))}`);
  L.push(`   ${103 + n}, ${fmt(p.L + p.aRx)}, 0, ${fmt(p.aRz)}`);
  L.push(`   301, 0, 0, ${fmt(p.zBase)}`, `   302, 0, 0, ${fmt(p.zDeck)}`, `   303, ${fmt(p.L)}, 0, ${fmt(p.zBase)}`, `   304, ${fmt(p.L)}, 0, ${fmt(p.zDeck)}`);
  L.push('*ELEMENT', '; iEL, TYPE, iMAT, iPRO, iN1, iN2, ANGLE, iSUB, EXVAL, EXVAL2');
  for (let i = 0; i < n; i++) L.push(`   ${1 + i}, BEAM, 1, 1, ${1 + i}, ${2 + i}, 0, 0`);
  for (let i = 0; i <= n + 1; i++) L.push(`   ${101 + i}, TENSTR, 2, 2, ${101 + i}, ${102 + i}, 0, 3, 0, 3`);
  for (let i = 1; i < n; i++) L.push(`   ${200 + i}, TENSTR, 3, 3, ${102 + i}, ${1 + i}, 0, 3, 0, 3`);
  L.push(`   301, BEAM, 4, 4, 301, 302, 0, 0`, `   302, BEAM, 4, 4, 302, 102, 0, 0`, `   303, BEAM, 4, 4, 303, 304, 0, 0`, `   304, BEAM, 4, 4, 304, ${102 + n}, 0, 0`);
  L.push('*GROUP', '; NAME, NODE_LIST, ELEM_LIST, PLANE_TYPE', `   G_DECK, 1to${1 + n}, 1to${n}, 0`, `   G_CABLE, 101to${103 + n}, 101to${102 + n}, 0`, `   G_HANG, , 201to${199 + n}, 0`, `   G_TOWER, 301to304, 301to304, 0`, '*ENDDATA');
  return L.join('\r\n') + '\r\n';
}
function paramCfg(p) {
  return { main: ['G_CABLE'], hanger: ['G_HANG'], loads: { deck_per_len: p.wd, band: p.pb, w_main: p.wc, w_hang: p.wh }, EA: { main: p.EAm, hanger: p.EAh }, output_kind: (S.cfg && S.cfg.output_kind) || 'Lu', fix_main_z: true };
}

// ============================================================== 匯入
function loadMct(text, name, src) { if (loadMctQuiet(text, name, src)) go('proj', 1); }
// 讀 midas-curve-gen v3.51 起寫在 .mct 的資訊：群組註解的設計標記、檔頭的吊橋設計值、*CONSTRAINT、*ELASTICLINK
function parseExtras(text) {
  const out = { tags: new Map(), design: {}, cons: [], links: [] };
  let sec = null;
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.trim(); let m;
    if ((m = /^;\s*Design\s*:\s*(.*)$/.exec(s))) { for (const kv of m[1].split(/\s+/)) { const [k, v] = kv.split('='); if (k && v !== undefined && isFinite(+v)) out.design[k] = +v; } continue; }
    if ((m = /^;\s*---\s*(\S+)\s*\([A-Z0-9]+\)\s*---\s*(.*)$/.exec(s))) {
      const t = {}; for (const kv of m[2].split(/\s+/).filter(Boolean)) { const [k, v] = kv.split('='); if (v !== undefined) t[k] = k === 'use' ? v : +v; }
      if (Object.keys(t).length) out.tags.set(m[1], t); continue;
    }
    if (s.startsWith('*')) { sec = s.split(/[\s;,]/)[0].toUpperCase(); continue; }
    const data = s.split(';')[0].trim(); if (!data) continue;
    const f = data.split(',').map(x => x.trim());
    try {
      if (sec === '*CONSTRAINT') out.cons.push({ nodes: expandList(f[0]), code: f[1], group: f[2] || '' });
      else if (sec === '*ELASTICLINK') {
        const k = (f[3] || '').toUpperCase(), o = { id: +f[0], i: +f[1], j: +f[2], kind: k, group: f[f.length - 1], sd: [] };
        if (k === 'GEN') o.sd = f.slice(11, 17).map(Number); else if (k === 'TENS' || k === 'COMP') o.sd = [+f[5]];
        out.links.push(o);
      }
    } catch (e) {}
  }
  return out;
}
function loadMctQuiet(text, name, src) {
  let m;
  try { m = new Mct(text); } catch (e) { toast('無法讀取這個 .mct'); return false; }
  if ([...m.nodes.values()].some(p => p.some(v => !Number.isFinite(v))) ||
      [...m.elems.values()].some(e => !e.type || !m.nodes.has(e.i) || !m.nodes.has(e.j))) {
    toast('節點或元素資料有誤，請重新匯入完整 .mct'); return false;
  }
  if (!m.nodes.size || !m.elems.size) { toast('檔案裡沒有 *NODE 或 *ELEMENT'); return false; }
  const x = parseExtras(text);
  const projectId = src === 'cg' ? readParams(text)?.state?.suspensionProjectId || '' : '';
  const previous = projectId && projectId === S.projectId && S.src === 'cg' ? { cfg: S.cfg, extra: S.extra, prov: S.prov } : null;
  S.src = src; S.fileName = name; S.mctText = text; S.rolesName = ''; S.prov = {};
  S.projectId = projectId; S.intent = src === 'file' ? 'review' : 'recalculate';
  S.confirmed = src === 'demo'; invalidate();
  const byUse = u => [...x.tags].filter(([g, t]) => t.use === u && m.groups.has(g)).map(([g]) => g);
  let roles;
  if (byUse('cable').length && byUse('hanger').length) { roles = { main: byUse('cable'), hanger: byUse('hanger'), wind: byUse('wind'), tie: byUse('tie') }; S.prov.roles = 'cg'; }
  else { roles = inferRoles(m); S.prov.roles = 'auto'; }
  S.cfg = { main: roles.main, hanger: roles.hanger, wind: roles.wind, tie: roles.tie, loads: { deck_per_len: 0, band: 0, w_main: 0, w_hang: 0, w_wind: 0 },
    EA: { main: 0, hanger: 0, wind: 0, tie: 0 }, wind_H: 0, tie_T: 0, fix_wind: src !== 'file' && !!roles.wind.length, output_kind: 'Lu', fix_main_z: src !== 'file' };
  const first = (gs, k) => { for (const g of gs || []) { const t = x.tags.get(g); if (t && t[k] > 0) return t[k]; } return 0; };
  const setv = (p, v) => { if (!(v > 0)) return; const [a, b] = p.split('.'); if (b) S.cfg[a][b] = v; else S.cfg[a] = v; S.prov[p] = 'cg'; };
  setv('loads.w_main', first(roles.main, 'w')); setv('loads.w_hang', first(roles.hanger, 'w')); setv('loads.w_wind', first(roles.wind, 'w'));
  setv('EA.main', first(roles.main, 'EA')); setv('EA.hanger', first(roles.hanger, 'EA')); setv('EA.wind', first(roles.wind, 'EA')); setv('EA.tie', first(roles.tie, 'EA'));
  const d = x.design;
  setv('loads.deck_per_len', d.deck_per_len); setv('loads.band', d.band); setv('wind_H', d.wind_H); setv('tie_T', d.tie_T);
  if ('fix_wind' in d) S.cfg.fix_wind = !!d.fix_wind;
  S.extra = { ...XDEF, area: {} };
  for (const k of ['qc', 'qh', 'dT', 'pw']) S.prov[k] = 'def';
  const ex = (k, v) => { if (v > 0) { S.extra[k] = v; S.prov[k] = 'cg'; } };
  ex('b', d.width); ex('qc', d.crowd); ex('qh', d.crowd_hanger); ex('pw', d.wind_p); ex('dT', d.dT);
  if (!(S.extra.b > 0)) { const geo = geomInfo(m, S.cfg); if (geo && geo.planeGap) { S.extra.b = +fx(geo.planeGap, 3); S.prov.b = 'auto'; } }
  if (previous) {
    for (const [key, source] of Object.entries(previous.prov)) {
      if (source !== 'manual' || S.prov[key] === 'cg') continue;
      const [section, k] = key.split('.');
      if (k && S.cfg[section] && previous.cfg[section]) S.cfg[section][k] = previous.cfg[section][k];
      else if (key in S.extra) S.extra[key] = previous.extra[key];
      else if (key === 'wind_H' || key === 'tie_T') S.cfg[key] = previous.cfg[key];
      else continue;
      S.prov[key] = 'manual';
    }
    S.extra.area = { ...previous.extra.area };
  }
  save(); return true;
}
function applyRoles(o, p = 'roles') {
  for (const k of ['main', 'hanger', 'wind', 'tie']) if (Array.isArray(o[k])) { S.cfg[k] = o[k]; S.prov.roles = p; }
  for (const k of ['deck_per_len', 'band', 'w_main', 'w_hang', 'w_wind']) if (o.loads && isFinite(o.loads[k])) { S.cfg.loads[k] = +o.loads[k]; S.prov['loads.' + k] = p; }
  for (const k of ['main', 'hanger', 'wind', 'tie']) if (o.EA && isFinite(o.EA[k])) { S.cfg.EA[k] = +o.EA[k]; S.prov['EA.' + k] = p; }
  for (const k of ['wind_H', 'tie_T']) if (isFinite(o[k])) { S.cfg[k] = +o[k]; S.prov[k] = p; }
  if ('fix_wind' in o) S.cfg.fix_wind = !!o.fix_wind;
  if (o.output_kind) S.cfg.output_kind = o.output_kind;
  if ('fix_main_z' in o) S.cfg.fix_main_z = !!o.fix_main_z;
  if (o.hanger_loads) S.cfg.hanger_loads = o.hanger_loads;
  if (o.saddles) S.cfg.saddles = o.saddles;
}
const DEMO_ROLES = { main: ['G_CABLE_L', 'G_CABLE_R'], hanger: ['G_HANG_L', 'G_HANG_R'], wind: ['G_WIND_L', 'G_WIND_R'], tie: ['G_WSTAY_L', 'G_WSTAY_R'],
  loads: { deck_per_len: 300, band: 20, w_main: 12, w_hang: 2, w_wind: 6 }, EA: { main: 17000000, hanger: 4100000, wind: 10000000, tie: 2850000 }, wind_H: 6000, tie_T: 250, fix_wind: true, output_kind: 'Lu', fix_main_z: true };

// ============================================================== 幾何資訊（匯入檔，計算前）
function geomInfo(m, cfg) {
  if (!cfg || !cfg.main.length) return null;
  const out = { planes: [] };
  for (const g of cfg.main) {
    let ns; try { [ns] = chain(m, g); } catch (e) { out.err = e.message; continue; }
    const z = ns.map(n => m.nodes.get(n)[2]);
    let peaks = []; for (let k = 1; k < ns.length - 1; k++) if (z[k] >= z[k - 1] && z[k] >= z[k + 1]) peaks.push(k);
    if (peaks.length < 2) peaks = [...new Set([...peaks, 0, ns.length - 1])];
    const [s1, s2] = peaks.slice().sort((a, b) => z[b] - z[a]).slice(0, 2).sort((a, b) => a - b);
    const P0 = m.nodes.get(ns[s1]), P1 = m.nodes.get(ns[s2]);
    const span = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]), ax = [(P1[0] - P0[0]) / span, (P1[1] - P0[1]) / span];
    const xl = p => (p[0] - P0[0]) * ax[0] + (p[1] - P0[1]) * ax[1];
    const inner = ns.slice(s1 + 1, s2);
    const zmin = Math.min(...inner.map(n => m.nodes.get(n)[2]));
    const tops = new Set(inner), hx = [], bots = [];
    for (const hg of cfg.hanger) for (const e of (m.groups.get(hg) || { elems: [] }).elems) { const el = m.elems.get(e); if (!el) continue; const t = tops.has(el.i) ? el.i : tops.has(el.j) ? el.j : null; if (t === null) continue; const b = t === el.i ? el.j : el.i; hx.push(xl(m.nodes.get(t))); bots.push(b); }
    hx.sort((a, b) => a - b);
    const gaps = hx.slice(1).map((x, i) => x - hx[i]);
    const anchors = [ns[0], ns[ns.length - 1]].filter((n, i) => i === 0 ? s1 > 0 : s2 < ns.length - 1);
    const hl = bots.map((b, i) => 0);
    out.planes.push({ g, span, f: (P0[2] + P1[2]) / 2 - zmin, zTop: [P0[2], P1[2]], nh: hx.length, sMin: Math.min(...gaps), sMax: Math.max(...gaps), y: -(P0[0]) * ax[1] + P0[1] * ax[0], ax, P0, anchors: anchors.map(n => { const x = xl(m.nodes.get(n)); return { n, p: m.nodes.get(n), dx: x < span / 2 ? Math.abs(x) : Math.abs(x - span) }; }), bots, zDeck: bots.length ? bots.map(b => m.nodes.get(b)[2]) : [] });
  }
  if (out.planes.length >= 2) out.planeGap = Math.abs(out.planes[1].y - out.planes[0].y);
  // 橋面系的幾何高度（參考：受風投影高的上限）
  const p = out.planes[0];
  if (p) {
    const cableEl = new Set(); for (const k of ['main', 'hanger', 'wind', 'tie']) for (const g of cfg[k] || []) (m.groups.get(g) || { elems: [] }).elems.forEach(e => cableEl.add(e));
    const deg = new Map(); for (const [e, v] of m.elems) { deg.set(v.i, (deg.get(v.i) || 0) + 1); deg.set(v.j, (deg.get(v.j) || 0) + 1); }
    const zs = []; const xl = q => (q[0] - p.P0[0]) * p.ax[0] + (q[1] - p.P0[1]) * p.ax[1];
    const deckZ = Math.max(...p.zDeck);
    for (const [e, v] of m.elems) { if (cableEl.has(e)) continue; for (const n of [v.i, v.j]) { const q = m.nodes.get(n), x = xl(q); if (x > 0.25 * p.span && x < 0.75 * p.span && q[2] <= deckZ + 0.5 && q[2] > deckZ - 6) zs.push(q[2]); } }
    if (zs.length) out.deckDepth = Math.max(...zs) - Math.min(...zs);
  }
  out.nNode = m.nodes.size; out.nElem = m.elems.size; out.unit = m.unit;
  out.hasStage = m.lines.some(l => /^\s*\*STAGE/i.test(l));
  return out;
}

// ============================================================== 計算
let R = null;
function compute() {
  R = { missing: [], error: null, x: { tags: new Map(), design: {}, cons: [], links: [] } };
  if (!S.src) return;
  let text, cfg;
  if (S.src === 'param') { text = genParam(S.param); cfg = paramCfg(S.param); }
  else { text = S.mctText; cfg = JSON.parse(JSON.stringify(S.cfg)); }
  R.text0 = text; R.cfg = cfg; R.x = parseExtras(text);
  const m0 = new Mct(text); R.m0 = m0;
  R.geo = geomInfo(m0, cfg);
  if (m0.unit.join(',').toUpperCase() !== 'KGF,M') {
    R.error = '吊橋計算使用 KGF、M。請先換算單位並重新匯入模型。';
    return;
  }
  if (S.src === 'file' && S.intent !== 'recalculate') return;
  if (cfg.main.length > 2) { R.error = '限單、雙索面，請核對主纜群組。'; return; }
  if (!cfg.main.length) R.missing.push('主纜群組（.mct 裡找不到全部為 Cable 元素、且掛有吊索的節點串；可在線形建模器的設計用途標「主纜」）');
  if (!cfg.hanger.length) R.missing.push('吊索群組');
  if (!(cfg.loads.deck_per_len > 0)) R.missing.push('橋面恆載 deck_per_len');
  if (!(cfg.EA.main > 0)) R.missing.push('主纜 EA');
  if (!(cfg.EA.hanger > 0)) R.missing.push('吊索 EA');
  if (S.projectId || S.src === 'file') {
    if (!(cfg.loads.w_main > 0)) R.missing.push('主纜單位長自重');
    if (!(cfg.loads.w_hang > 0)) R.missing.push('吊索單位長自重');
  }
  if ((cfg.wind || []).length) { if (!(cfg.EA.wind > 0)) R.missing.push('耐風索 EA'); if (!(cfg.EA.tie > 0)) R.missing.push('繫索 EA'); if (!(cfg.wind_H > 0)) R.missing.push('耐風索水平張力 wind_H'); }
  if (!(cfg.wind || []).length) { delete cfg.wind; delete cfg.tie; }
  if (cfg.wind && !cfg.fix_wind) delete cfg.tie_T;
  if (R.missing.length) return;
  const log = [];
  try { Object.assign(R, runMct(text, cfg, (t, k) => log.push({ t, k }))); R.ok = true; }
  catch (e) { R.error = e.message; }
  R.log = log;
}
// ============================================================== 步驟定義
const TABS = [
  { id: 'proj', name: '專案', icon: ICON.proj },
  { id: 'pret', name: '初張力', icon: ICON.pret },
  { id: 'midas', name: '建模', icon: ICON.midas },
  { id: 'ana', name: '分析', icon: ICON.ana }
];
function steps(tab) {
  const wind = R && R.cfg && R.cfg.wind && R.cfg.wind.length;
  return {
    proj: [['來源', stSource], ['模型確認', stAuto], ['載重與 EA', stLoads], ['追加載重', stExtra]],
    pret: [['結果', stResult], ...(wind ? [['耐風系統', stWind]] : []), ['輸入值', stValues], ['檢查', stChecks]],
    midas: [['單位', mUnit], ['下載 MIDAS 檔案', mImport], ['材料斷面', mMat], ['邊界', mBnd], ['支承', mBrg], ['旋轉自由度', mRot], ['恆載', mDL], ['分析控制', mNL], ['G1 驗證', mG1], ['存基準檔', mSave]],
    ana: [['工況', aCases], ['組合方式', aComb], ['G2 驗證', aG2], ['特徵值', aEig], ['風', aWind]]
  }[tab];
}
function needResult() {
  if (!S.src) return `<div class="card">${head('尚未開始', '先選擇資料來源')}<p class="muted">到「專案」匯入 midas-curve-gen 的 .mct，或載入範例。</p><button class="btn solid" data-go="proj,0">前往專案</button></div>`;
  if (S.src === 'file' && S.intent !== 'recalculate') return '<div class="card"><p>目前正在檢查現有模型。</p><button class="btn solid" data-go="proj,1">回到模型確認</button></div>';
  if (R.missing.length) return `<div class="card">${head('還缺資料', '補齊後才能計算')}<ul class="checks">${R.missing.map(t => `<li>${pill('warn', '缺')}<span>${esc(t)}</span></li>`).join('')}</ul><button class="btn solid" style="margin-top:12px" data-go="proj,${!R.cfg.main.length || !R.cfg.hanger.length ? 1 : 2}">${!R.cfg.main.length || !R.cfg.hanger.length ? '設定纜索角色' : '補齊恆載與 EA'}</button></div>`;
  if (R.error) return `<div class="card">${head('無法計算', '引擎回報錯誤')}<p>${esc(R.error)}</p><p class="muted">錯誤訊息與 cable_pretension.py 相同；修正 .mct 或設定後會自動重算。</p></div>`;
  return '';
}

// ---------------------------------------------------------------- 專案
function requireConfirmedModel() {
  if (S.src === 'param' || S.confirmed || (S.src === 'demo' && !S.rolesName && S.prov.roles !== 'manual')) return '';
  return '<div class="card"><p>請先確認角色、邊界與支承設定。</p><button class="btn solid" data-go="proj,1">模型確認</button></div>';
}
function stSource() {
  const on = s => S.src === s ? 'true' : 'false';
  return head('專案 1', '開始一個吊橋專案', '依現有資料開始。') + `
  <div class="stack" style="margin-top:12px">
    <a class="src" href="index.html?start=suspension">${ICON.bridge}<b>從零建立吊橋</b><span>輸入線形與高程，建立 3D 雙索面</span></a>
    <a class="src" href="index.html?start=drawing">${ICON.pencil}<b>已有設計圖</b><span>匯入 DXF 或依圖輸入座標</span></a>
    <label class="file" id="dropMct"><span><b style="font-size:14.5px">已有 MIDAS 模型（.mct）</b><br><span class="fn">${S.src === 'file' || S.src === 'cg' ? esc(S.fileName) : '點選或拖曳到這裡（線形建模器匯出的檔最完整）'}</span></span>${ICON.file.replace('<svg', '<svg style="width:26px;height:26px;color:var(--teal)"')}<input type="file" id="fMct" accept=".mct,.txt"></label>
    <details class="more"><summary>範例與進階匯入</summary><div class="stack" style="margin-top:10px"><label class="file" id="dropRoles"><span><b style="font-size:14.5px">roles.json</b>（選用）<br><span class="fn">${S.rolesName ? esc(S.rolesName) : '覆蓋 .mct 裡的角色與數值'}</span></span>${ICON.file.replace('<svg', '<svg style="width:26px;height:26px;color:var(--muted)"')}<input type="file" id="fRoles" accept=".json"></label>
    <button class="src" data-src="demo" aria-pressed="${on('demo')}">${ICON.bridge}<b>線形建模器內建人行吊橋範例</b><span>80 m、3D、耐風索＋繫索、支承連結與邊界都已設定（《實務》第 50 章）</span></button>
    <button class="src" data-src="param" aria-pressed="${on('param')}">${ICON.pencil}<b>手動輸入：60 m 參數式</b><span>2D 單一索面，自動產生模型（《實務》第 44 章）</span></button></div></details>
  </div>`;
}
function bindSource() {
  const rd = (f, cb) => { const r = new FileReader(); r.onload = () => cb(r.result); r.readAsText(f); };
  const onMct = f => f && rd(f, t => loadMct(t, f.name, 'file'));
  const onRoles = f => f && rd(f, t => { if (!S.cfg || S.src === 'param') { toast('先載入 .mct'); return; } try { applyRoles(JSON.parse(t)); S.confirmed = false; invalidate(); S.rolesName = f.name; save(); render(); toast('已套用 roles.json'); } catch (e) { toast('roles.json 格式錯誤'); } });
  document.getElementById('fMct').onchange = e => onMct(e.target.files[0]);
  document.getElementById('fRoles').onchange = e => onRoles(e.target.files[0]);
  for (const [id, fn] of [['dropMct', onMct], ['dropRoles', onRoles]]) {
    const el = document.getElementById(id);
    el.ondragover = e => { e.preventDefault(); el.classList.add('drag'); };
    el.ondragleave = () => el.classList.remove('drag');
    el.ondrop = e => { e.preventDefault(); el.classList.remove('drag'); fn(e.dataTransfer.files[0]); };
  }
  document.querySelectorAll('[data-src]').forEach(b => b.onclick = () => {
    if (b.dataset.src === 'demo') loadDemo();
    else { S.src = 'param'; S.fileName = '60 m 參數式'; S.cfg = { output_kind: (S.cfg && S.cfg.output_kind) || 'Lu' }; S.extra = { ...XDEF, b: 1.5, area: { main: 6.0, hanger: 2.01 } }; S.prov = {}; S.g1 = {}; S.g2 = {}; save(); go('proj', 1); }
  });
}
async function loadDemo() {
  try { const r = await fetch('tools/examples/suspension_demo.mct', { cache: 'no-cache' }); if (!r.ok) throw 0; loadMct(await r.text(), 'suspension_demo.mct', 'demo'); }
  catch (e) { toast('讀不到範例檔：請用網站或安裝的 App 開啟'); }
}
function numRow(key, label, val, unit, prov, opts = {}) {
  return `<div class="row"><div class="lab">${label}${tag(prov)}</div><input type="number" step="any" inputmode="decimal" id="in_${key.replace(/\./g, '_')}" data-key="${key}" value="${val ?? ''}" ${opts.ph ? `placeholder="${opts.ph}"` : ''}>${unit ? `<div class="u">${unit}</div>` : ''}</div>`;
}
function valRow(label, val, unit, prov) { return `<div class="row v"><div class="lab">${label}${tag(prov)}</div><div class="val">${val}${unit ? ` <span class="muted" style="font-size:12px">${unit}</span>` : ''}</div></div>`; }
const CABLE_ROLES = [['main', '主纜'], ['hanger', '吊索'], ['wind', '耐風索'], ['tie', '繫索']];

function modelReview() {
  const m = R.m0, x = R.x;
  const candidates = [...m.groups].filter(([, g]) => g.elems.length && g.elems.every(id => {
    const el = m.elems.get(id);
    return el?.type?.toUpperCase() === 'TENSTR' && el.f[7] === '3';
  }));
  const selected = name => CABLE_ROLES.find(([k]) => S.cfg[k]?.includes(name))?.[0] || '';
  const rows = candidates.map(([name, group]) => `<tr><td class="t">${esc(name)}</td><td>${group.elems.length}</td><td><select data-cable-group="${esc(name)}" aria-label="${esc(name)} 的纜索角色"${S.src === 'file' && S.intent !== 'recalculate' ? ' disabled' : ''}><option value="">未設定</option>${CABLE_ROLES.map(([k, label]) => `<option value="${k}"${selected(name) === k ? ' selected' : ''}>${label}</option>`).join('')}</select></td></tr>`).join('');
  const blocks = ['MATERIAL', 'SECTION', 'STLDCASE', 'SELFWEIGHT', 'CONLOAD', 'BEAMLOAD', 'STAGE']
    .filter(k => m.lines.some(line => new RegExp('^\\s*\\*' + k + '(?:[\\s,;]|$)', 'i').test(line)));
  const materialIds = [...new Set([...m.elems.values()].map(e => e.f[2]))].join('、');
  const sectionIds = [...new Set([...m.elems.values()].map(e => e.f[3]))].join('、');
  const file = S.src === 'file', canEdit = !file || S.intent === 'recalculate';
  return head('專案 2', '確認模型', '核對立面、平面與群組角色，再補恆載與 EA。') +
    (file ? `<div class="seg" aria-label="模型用途"><button data-intent="review" aria-pressed="${!canEdit}">檢查現有設定</button><button data-intent="recalculate" aria-pressed="${canEdit}">重算初張力</button></div>` : '') +
    `<div class="card"><h3>檔案內容</h3><p>${esc(m.unit.join('、'))} · ${m.nodes.size} 節點 · ${m.elems.size} 元素 · ${x.cons.length} 組約束 · ${x.links.length} 條彈性連結</p>
      <p>讀到的 MCT：${blocks.length ? blocks.map(k => '<code>*' + k + '</code>').join('、') : '尚未讀到材料、斷面或載重'}</p>
      <details class="more"><summary>材料、斷面、邊界與支承</summary>
      <p>材料編號 ${esc(materialIds)} · 斷面編號 ${esc(sectionIds)}</p>
      ${x.cons.map(v => '<p>約束 ' + esc(v.group) + ' · ' + esc(compressList(v.nodes)) + ' · ' + esc(v.code) + '</p>').join('')}
      ${x.links.map(v => '<p>彈性連結 ' + esc(v.id) + ' · ' + esc(v.i + ' → ' + v.j + ' · ' + v.kind) + '</p>').join('')}
      </details></div>` +
    `<div class="card"><h3>纜索群組${S.prov.roles ? tag(S.prov.roles) : ''}</h3>${rows ? `<div class="tw"><table><thead><tr><th class="t">群組</th><th>元素數</th><th>角色</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>請在 Civil 或線形建模器依主纜、吊索等角色建立 Cable 元素群組，再重新載入。</p>'}</div>` +
    (m.unit.join(',').toUpperCase() !== 'KGF,M' ? `<div class="note">${esc(R.error)}</div>` : '') +
    (canEdit ? `<div class="card"><label class="toggle"><span>已核對角色、邊界與支承</span><input type="checkbox" id="confirmModel"${S.confirmed ? ' checked' : ''}></label>
      <label class="toggle"><span>依計算的索多邊形修正主纜</span><input type="checkbox" id="fixMain"${S.cfg.fix_main_z ? ' checked' : ''}></label></div>` : '') +
    `<div class="pager">${canEdit ? '<button class="btn solid" data-go="proj,2">補恆載與 EA</button>' : ''}${S.projectId ? `<a class="btn" href="index.html?start=resume&project=${encodeURIComponent(S.projectId)}">回線形建模器</a>` : ''}</div>`;
}

function stAuto() {
  if (!S.src) return needResult();
  if (S.src === 'param') {
    const P = S.param, k = (key, lab, u) => numRow('param.' + key, lab, P[key], u, 'manual');
    return head('專案 2', '線形（手動）', '每一索面；改任何一格都會重算。') + `<div class="card">${k('L', '主跨 L', 'm')}${k('f', '垂度 f', 'm')}${k('s', '吊索間距 s', 'm')}${k('zTop', '塔頂高程', 'm')}${k('zDeck', '橋面高程', 'm')}${k('zBase', '塔底高程', 'm')}${k('aLx', '左錨碇離塔', 'm')}${k('aLz', '左錨碇高程', 'm')}${k('aRx', '右錨碇離塔', 'm')}${k('aRz', '右錨碇高程', 'm')}</div>`;
  }
  const g = R.geo, c = S.cfg, x = R.x;
  const review = modelReview();
  if (!g || !g.planes.length) return review + `<div class="note">請設定主纜與吊索群組，再核對模型圖。${g?.err ? ' ' + esc(g.err) : ''}</div>`;
  const p = g.planes[0], two = g.planes.length > 1;
  const zd = p.zDeck.length ? `${fx(Math.min(...p.zDeck), 3)}～${fx(Math.max(...p.zDeck), 3)}` : '—';
  const roleRow = (k, lab) => (c[k] || []).length ? valRow(lab, `<span style="font-size:12.5px">${c[k].map(esc).join('、')}</span>`, '', S.prov.roles) : '';
  const windG = [...x.tags].filter(([, t]) => t.windW > 0);
  return review + `
  <div class="card"><h3>線形</h3>
    ${valRow('單位', `${esc(g.unit[0])}, ${esc(g.unit[1])}`, '', 'mct')}
    ${valRow('主跨（塔頂間水平距離）', fx(p.span, 3), 'm', 'mct')}
    ${valRow('垂度 f', fx(p.f, 4), 'm', 'mct')}
    ${valRow('塔頂高程', p.zTop.map(z => fx(z, 3)).join('／'), 'm', 'mct')}
    ${valRow('吊索（每一索面）', `${p.nh} 根，間距 ${fx(p.sMin, 2)}${p.sMax - p.sMin > 1e-6 ? '～' + fx(p.sMax, 2) : ''}`, 'm', 'mct')}
    ${valRow('吊點高程', zd, 'm', 'mct')}
    ${two ? valRow('兩索面間距', fx(g.planeGap, 3), 'm', 'mct') : ''}
    ${valRow('節點／元素', `${g.nNode}／${g.nElem}`, '', 'mct')}
  </div>
  <div class="card"><h3>群組角色</h3>${roleRow('main', '主纜（含控索）')}${roleRow('hanger', '吊索')}${roleRow('wind', '耐風索')}${roleRow('tie', '繫索')}</div>
  <div class="card"><h3>邊界、支承與受風構件</h3>
    ${valRow('邊界條件', x.cons.length ? `${x.cons.length} 組` : '未指定（建模步驟會推估）', '', x.cons.length ? 'cg' : 'auto')}
    ${valRow('支承連結', x.links.length ? `${x.links.length} 根` : '未指定（建模步驟會推估）', '', x.links.length ? 'cg' : 'auto')}
    ${valRow('受風構件', windG.length ? `${windG.length} 個群組` : '未指定', '', windG.length ? 'cg' : null)}
  </div>
  ${g.hasStage ? `<div class="note">檔案含 <code>*STAGE</code>。先做成橋恆載驗證時，匯出前在線形建模器取消勾選「把階段表寫進 .mct」，以免匯入後出現沒有邊界與載重的階段。</div>` : ''}`;
}
function stLoads() {
  if (!S.src) return needResult();
  if (S.src === 'param') {
    const P = S.param, k = (key, lab, u) => numRow('param.' + key, lab, P[key], u, 'manual');
    return head('專案 3', '恆載與 EA（手動）', '每一索面，kgf、m。') + `<div class="card">${k('wd', '加勁梁恆載 w_d', 'kgf/m')}${k('wc', '主纜自重 w_c', 'kgf/m')}${k('wh', '吊索自重 w_h', 'kgf/m')}${k('pb', '索夾 p_b', 'kgf／處')}${k('EAm', '主纜 EA', 'kgf')}${k('EAh', '吊索 EA', 'kgf')}</div>`;
  }
  const c = S.cfg, w = (c.wind || []).length, pv = k => S.prov[k] || (num(k) ? 'manual' : null);
  const num = k => { const [a, b] = k.split('.'); return b ? c[a][b] : c[a]; };
  const r = (k, lab, u) => numRow(k, lab, num(k) || '', u, pv(k), { ph: '必填' });
  return head('專案 3', '載重與 EA', `每一索面，單位同 .mct（${esc(R.geo ? R.geo.unit.join('、') : '')}）。線形建模器或 roles.json 有給的會自動帶入；空白的要填。`) + `
  <div class="card"><h3>恆載（進初張力）</h3>${r('loads.deck_per_len', '橋面恆載 deck_per_len', '橋面系自重＋附加恆載，每一索面每公尺')}${r('loads.band', '索夾 band', '每個吊點')}${r('loads.w_main', '主纜自重 w_main', '每公尺（沿弧長）')}${r('loads.w_hang', '吊索自重 w_hang', '每公尺')}${w ? r('loads.w_wind', '耐風索自重 w_wind', '每公尺') : ''}</div>
  <div class="card"><h3>軸向勁度 EA</h3>${r('EA.main', '主纜、控索', '力')}${r('EA.hanger', '吊索', '力')}${w ? r('EA.wind', '耐風索', '力') + r('EA.tie', '繫索', '力') : ''}</div>
  ${w ? `<div class="card"><h3>耐風系統（設計者決定）</h3>${r('wind_H', '耐風索水平張力 wind_H', '沿錨碇連線方向的分量 H_wc')}${r('tie_T', '繫索張力 tie_T', '每根；修正耐風索時使用')}<div class="toggle"><span>修正耐風索形狀（力密度法）</span><input type="checkbox" id="tgFix" ${c.fix_wind ? 'checked' : ''}></div></div>` : ''}
  <div class="pager"><button class="btn solid" data-go="pret,0">查看初張力</button></div>`;
}
function stExtra() {
  if (!S.src) return needResult();
  const x = S.extra, g = R.geo;
  const k = (key, lab, u, ph) => numRow('extra.' + key, lab, x[key] ?? '', u, S.prov[key] || 'manual', { ph });
  return head('專案 4', '追加載重', '不進初張力，只用在分析階段。') + `
  <div class="card"><h3>群集荷重</h3>${k('b', '幅員 b', S.prov.b === 'auto' ? 'm；預設＝兩索面間距，實際走道寬不同時修改' : 'm')}${k('qc', '主纜、塔用', 'kgf/m²（指針）')}${k('qh', '吊索、床版用', 'kgf/m²（指針）')}</div>
  <div class="card"><h3>溫度與風</h3>${k('dT', '溫度變化 ±', '°C（依設計規範）')}${k('pw', '設計風壓', 'kgf/m²（指針，不載活荷重）')}
  ${R.x && [...R.x.tags.values()].some(t => t.windW > 0) ? '<p class="muted" style="font-size:12.5px">受風投影寬已在線形建模器的各群組指定（分析 5）。</p>' : k('hw', '橋面有效投影高', g && g.deckDepth ? `m；橋面系幾何高度 ${fx(g.deckDepth, 2)} m，依充實率折減` : 'm') + k('Dc', '主纜外徑', 'm')}</div>`;
}
function bindInputs() {
  document.querySelectorAll('input[data-key]').forEach(inp => inp.addEventListener('change', () => {
    const v = parseFloat(inp.value), key = inp.dataset.key, [a, b] = key.split('.');
    if (a === 'param') { if (isFinite(v)) S.param[b] = v; }
    else if (a === 'extra') { S.extra[b] = isFinite(v) ? v : null; S.prov[b] = 'manual'; }
    else if (b) { S.cfg[a][b] = isFinite(v) ? v : 0; S.prov[key] = 'manual'; }
    else { S.cfg[a] = isFinite(v) ? v : 0; S.prov[key] = 'manual'; }
    invalidate(a !== 'extra'); save(); render(true);
  }));
  const t = document.getElementById('tgFix'); if (t) t.onchange = () => { S.cfg.fix_wind = t.checked; invalidate(); save(); render(true); };
}

// ---------------------------------------------------------------- 初張力
function planeRes() { return [...R.res.values()]; }
function stResult() {
  const n = needResult(); if (n) return n;
  const rs = planeRes(), r = rs[0], same = rs.every(x => Math.abs(x.H - r.H) < 1e-6 * r.H);
  const hang = R.rep.filter(x => x.role === 'hanger'), back = R.rep.filter(x => x.role === 'backstay');
  const u = R.unit[0];
  return head('階段 4', '初張力結果', `${rs.length > 1 ? (same ? `${rs.length} 個索面結果相同，以下為 ${esc(rs[0].ns ? R.cfg.main[0] : '')}` : '各索面結果不同，以下為第一個') : '單一索面'}。演算法與 cable_pretension.py 相同。`) +
    tiles([
      ['主纜水平力 H', fx(r.H, 1), u, `M₀(L/2)/f`],
      ['垂度 f／主跨', `${fx(r.f, 3)}／${fx(r.span, 2)}`, 'm', ''],
      ['控索張力', back.length ? fx(Math.max(...back.map(x => x.T)), 1) : '—', u, 'H·L/Lx'],
      ['吊索力', `${fx(Math.min(...hang.map(x => x.T)), 1)}～${fx(Math.max(...hang.map(x => x.T)), 1)}`, u, `${r.nHang} 根／索面`],
      ['繫索向下分力', fx(r.ptie, 1), u, '每一索面合計'],
      ['主纜節點移動', fx(r.dzmax, 1), 'mm', R.cfg.fix_main_z ? '已移到索多邊形' : '未修正']
    ]) + elevSvg(r) + '<div class="pager"><button class="btn solid" data-go="midas,1">下載 MIDAS 檔案</button></div>' + ref('《吊橋設計流程圖解》第 7 章；《實務》第 44、50 章、附錄 B。');
}
function elevSvg(r) {
  const m = R.mct, ns = r.ns, P0 = r.P0, ax = r.ax;
  const xl = p => (p[0] - P0[0]) * ax[0] + (p[1] - P0[1]) * ax[1];
  const pts = ns.map(n => { const p = m.nodes.get(n); return [xl(p), p[2]]; });
  const hs = [...r.hang].map(([t, [e, b]]) => [xl(m.nodes.get(t)), m.nodes.get(t)[2], m.nodes.get(b)[2]]);
  const xs = pts.map(p => p[0]), zs = [...pts.map(p => p[1]), ...hs.map(h => h[2])];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const W = 480, H = 200, pad = 22, sx = (W - 2 * pad) / (x1 - x0), sz = (H - 2 * pad - 14) / (z1 - z0 || 1);
  const X = x => pad + (x - x0) * sx, Z = z => H - pad - 14 - (z - z0) * sz;
  let s = '';
  s += `<line x1="${X(0)}" y1="${Z(r.P0[2])}" x2="${X(0)}" y2="${Z(z0)}" stroke="var(--tower)" stroke-width="4"/><line x1="${X(r.span)}" y1="${Z(r.P1[2])}" x2="${X(r.span)}" y2="${Z(z0)}" stroke="var(--tower)" stroke-width="4"/>`;
  const hsorted = hs.slice().sort((a, b) => a[0] - b[0]);
  s += `<polyline fill="none" stroke="var(--deck)" stroke-width="2.5" points="${[[0, hsorted[0][2]], ...hsorted.map(h => [h[0], h[2]]), [r.span, hsorted[hsorted.length - 1][2]]].map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}"/>`;
  hs.forEach(h => s += `<line x1="${X(h[0])}" y1="${Z(h[2])}" x2="${X(h[0])}" y2="${Z(h[1])}" stroke="var(--hang)" stroke-width="1"/>`);
  s += `<polyline fill="none" stroke="var(--cable)" stroke-width="2.2" points="${pts.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}"/>`;
  s += `<text x="${W / 2}" y="${H - 8}" text-anchor="middle">${esc(R.cfg.main[0])}　垂直放大 ${fx(sz / sx, 1)} 倍</text>`;
  return `<svg class="elev" viewBox="0 0 ${W} ${H}" role="img" aria-label="主纜立面">${s}</svg>`;
}
function stWind() {
  const n = needResult(); if (n) return n;
  const t = [...R.ties.values()], wi = R.windInfo || [];
  return head('階段 6-2 前置', '耐風系統', '耐風索與繫索的初張力由設計者決定；繫索的向下分力回頭加到吊索與主纜。') +
    tiles([
      ['繫索張力', t.length ? `${fx(Math.min(...t.map(x => x.t)), 1)}～${fx(Math.max(...t.map(x => x.t)), 1)}` : '—', R.unit[0], `${t.length} 根`],
      ['方向夾角最大', t.length ? fx(Math.max(...t.map(x => x.mis)), 2) : '—', '°', '≤ 2° 才可靠'],
      ['力密度法迭代', wi.length && wi[0].ffIt ? wi[0].ffIt : '未修正', wi.length && wi[0].ffIt ? '次' : '', R.cfg.fix_wind ? 'fix_wind' : '可在載重與 EA 開啟'],
      ['向下分力（每索面）', fx(planeRes()[0].ptie, 1), R.unit[0], 'TIE_EQ 合計']
    ]) + `<div class="note k">找形時繫索還不存在，以等值節點力 <code>TIE_EQ</code> 代替；加入耐風系統時移除，否則算兩次（建模頁「恆載」有 MCT）。</div>` + ref('《吊橋設計流程圖解》第 11 章；《實務》第 49、50 章。');
}
const ROLE_NAME = { main: '主纜', backstay: '控索', hanger: '吊索', wind: '耐風索', tie: '繫索' };
function stValues() {
  const n = needResult(); if (n) return n;
  const roles = ['main', 'backstay', 'hanger', 'wind', 'tie'].filter(x => R.rep.some(r => r.role === x)), f = roles.includes(S.roleFilter) ? S.roleFilter : 'all';
  const ord = { main: 0, backstay: 1, hanger: 2, wind: 3, tie: 4 };
  const rows = R.rep.filter(r => f === 'all' || r.role === f).sort((a, b) => ord[a.role] - ord[b.role] || a.elem - b.elem);
  const csv = ['group,elem,role,L,Lh,T,T_horizontal,EA,Lu,Lu_over_L'].concat(R.rep.map(r => [r.group, r.elem, r.role, fmt(r.L), fmt(r.Lh), fmt(r.T), fmt(r.T * r.Lh / r.L), fmt(r.EA), r.LuStr, (r.Lu / r.L).toFixed(8)].join(','))).join('\n');
  CODES.csv = csv;
  const k = R.kind;
  return head('階段 4', '纜索輸入值', '寫入 .mct 的 Cable 元素 EXVAL／EXVAL2；L_u 不捨入。') + `
  <div class="seg" role="group" aria-label="輸入方式">${['Lu', 'Pretension', 'Horizontal'].map(m => `<button data-kind="${m}" aria-pressed="${k === m}">${m === 'Lu' ? 'Lu（建議）' : m}</button>`).join('')}</div>
  <div class="chips" style="padding-bottom:0">${['all', ...roles].map(r => `<button class="chip" data-rf="${r}" aria-current="${f === r ? 'step' : 'false'}">${r === 'all' ? '全部' : ROLE_NAME[r]} <span style="opacity:.7">${r === 'all' ? R.rep.length : R.rep.filter(x => x.role === r).length}</span></button>`).join('')}</div>
  <div class="tw"><table><thead><tr><th>元素</th><th class="t">角色</th><th>L</th><th>T</th><th>L<sub>u</sub></th><th>L<sub>u</sub>/L</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${r.elem}</td><td class="t">${ROLE_NAME[r.role]}</td><td>${fx(r.L, 4)}</td><td>${fx(r.T, 1)}</td><td>${r.LuStr}</td><td>${(r.Lu / r.L).toFixed(7)}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="codebar"><span class="t">報表（與 _report.csv 同格式）</span><span class="btns"><button class="btn sm solid" data-code="csv">複製</button><button class="btn sm" data-dl="csv" data-name="${esc(baseName())}_report.csv">下載</button></span></div>
  <p class="muted" style="font-size:13px">${k === 'Horizontal' ? 'Horizontal 只適合 2D 手算的主纜；鉛直吊索的水平分量為 0，引擎會拒絕輸出。' : k === 'Pretension' ? 'Pretension：每根元素的軸力 T。' : 'Lu：之後加構件或做施工階段時，平衡狀態不會被重算。'}</p>`;
}
function stChecks() {
  const n = needResult(); if (n) return n;
  const lu = R.rep.every(r => r.Lu < r.L), rr = R.rep.map(r => r.Lu / r.L);
  const t = [...R.ties.values()], mis = t.length ? Math.max(...t.map(x => x.mis)) : 0;
  const warns = R.log.filter(l => l.k === 'warn');
  const items = [
    [lu, '所有 L_u < L'],
    [Math.min(...rr) > 0.99 && Math.max(...rr) < 1, `L_u/L 在 ${fx(Math.min(...rr), 5)}～${fx(Math.max(...rr), 6)}`],
    [R.cfg.fix_main_z, R.cfg.fix_main_z ? `主纜節點已移到索多邊形（最大 ${fx(planeRes()[0].dzmax, 1)} mm）` : '主纜節點未修正'],
    ...(t.length ? [[mis <= 2, `繫索方向與耐風索合力夾角 ${fx(mis, 2)}°（≤ 2°）`]] : []),
    [!warns.length, warns.length ? `${warns.length} 則警告（見下方紀錄）` : '沒有警告']
  ];
  return head('階段 4', '檢查', '全部通過再進入建模。') + `<div class="card"><ul class="checks">${items.map(([ok, s]) => `<li>${pill(ok ? 'ok' : 'warn', ok ? '通過' : '注意')}<span>${esc(s)}</span></li>`).join('')}</ul></div>
  <details class="more"><summary>計算紀錄</summary><div class="log">${R.log.map(l => `<div class="${l.k === 'warn' ? 'w' : ''}">${esc(l.t)}</div>`).join('')}</div></details>
  <div class="note">以上是<b>每一索面</b>的值。2D 模型只建一個索面，載重也只放一半；放全橋恆載卻輸入單一索面張力，結果會差一倍。</div>`;
}

// ---------------------------------------------------------------- 建模
function baseName() { return (S.fileName || 'model').replace(/\.[^.]+$/, '').replace(/\s+/g, '_'); }
function mUnit() {
  const u = R && R.geo ? R.geo.unit : ['KGF', 'M'];
  return head('建模 1', '單位與結構型式') + path('Tools > Setting > Unit System') + `<p>力 <b>${esc(u[0])}</b>、長度 <b>${esc(u[1])}</b>，與 .mct 的 <code>*UNIT</code> 相同（匯入時也會自動切換）。</p>` +
    (S.src === 'param' ? path('Structure > Type > Structure Type') + '<p>2D 單一索面：選 <b>X-Z Plane</b>。</p>' : '<p class="muted">3D 模型不用改 Structure Type。</p>');
}
function mImport() {
  const n = needResult() || requireConfirmedModel(); if (n) return n;
  return head('建模 2', '下載 MIDAS 檔案', `已計算 ${R.rep.length} 根 Cable 元素的 EXVAL（${R.kind}）。`) +
    path('File > Import > midas Civil MCT File') +
    `<div class="card"><h3>匯入 Civil 後核對</h3><p>確認材料斷面、邊界、支承、恆載與非線性控制，再填回 G1。已有載重時先核對工況，以免重複施加。</p></div>` +
    `<details class="more"><summary>查看節點與纜索差異</summary>${modelChanges()}</details>` +
    code('mctOut', '新檔（含纜索輸入值）', R.text, baseName() + '_tensioned.mct') +
    civilHandoff();
}
function civilHandoff() {
  const steps = [
    ['核對單位與結構型式', 'midas,0'],
    ['確認材料與斷面', 'midas,2'],
    ['檢查邊界與支承', 'midas,3'],
    ['檢查橋面支承', 'midas,4'],
    ['設定旋轉自由度', 'midas,5'],
    ['設定恆載工況 DL', 'midas,6'],
    ['設定幾何非線性分析', 'midas,7'],
    ['分析並填回 G1', 'midas,8']
  ];
  return `<div class="card"><h3>Civil 2022 匯入後設定</h3>
    <p>本檔有 ${R.m0.nodes.size} 個節點與 ${R.m0.elems.size} 個元素。匯入後先核對數量，再完成設定。</p>
    <ol class="stack">${steps.map(([label, target]) => `<li><button class="btn sm" data-go="${target}">${label}</button></li>`).join('')}</ol>
    <p>完成 G1 後再保存基準檔並設定追加載重。</p></div>`;
}
function modelChanges() {
  const changes = [], updated = new Mct(R.text);
  for (const [id, xyz] of updated.nodes) {
    const original = R.m0.nodes.get(id);
    if (original && xyz.some((v, i) => Math.abs(v - original[i]) > 1e-9)) {
      changes.push(['節點 ' + id, original.map(fmt).join(', '), xyz.map(fmt).join(', ')]);
    }
  }
  for (const { elem } of R.rep) {
    const from = R.m0.elems.get(elem).f, to = updated.elems.get(elem).f;
    if (from[8] !== to[8] || from[9] !== to[9]) changes.push(['纜索 ' + elem, from.slice(8, 10).join(' / '), to.slice(8, 10).join(' / ')]);
  }
  return `<div class="tw"><table><thead><tr><th class="t">項目</th><th>原值</th><th>新值</th></tr></thead><tbody>${changes.map(row => '<tr>' + row.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('')}</tbody></table></div>`;
}
function roleSect() {
  const m = R.m0, out = [];
  const add = (role, groups, ea, w) => { for (const g of groups || []) { const gr = m.groups.get(g); if (!gr || !gr.elems.length) continue; const f = m.elems.get(gr.elems[0]).f; out.push({ role, g, mat: f[2], sec: f[3], EA: ea, w }); } };
  const c = R.cfg, l = c.loads;
  add('main', c.main, c.EA.main, l.w_main); add('hanger', c.hanger, c.EA.hanger, l.w_hang);
  if (c.wind) { add('wind', c.wind, c.EA.wind, l.w_wind); add('tie', c.tie, c.EA.tie, null); }
  return out;
}
function mMat() {
  const n = needResult(); if (n) return n;
  const rows = roleSect(), uniq = new Map();
  for (const r of rows) { const k = r.role; if (!uniq.has(k)) uniq.set(k, r); }
  const A = S.extra.area || {};
  const mats = new Map();
  const lines = [...uniq.values()].map(r => {
    const a = A[r.role]; const am2 = a > 0 ? a * 1e-4 : null;
    const E = am2 ? r.EA / am2 : null, gam = am2 && r.w ? r.w / am2 : null;
    if (E) { if (!mats.has(r.mat)) mats.set(r.mat, []); mats.get(r.mat).push({ role: r.role, E, gam }); }
    return { ...r, a, E, gam };
  });
  const conflict = [...mats].filter(([, v]) => v.length > 1 && v.some(x => Math.abs(x.E - v[0].E) > 1e-3 * v[0].E || (x.gam && v[0].gam && Math.abs(x.gam - v[0].gam) > 1e-3 * v[0].gam)));
  return head('建模 3', '材料與斷面', '在 Midas 建好斷面積 A 後填入，換算出材料要輸入的 E 與單位重，讓 Midas 的 EA 與自重等於初張力計算用的值。') +
    path('Properties > Material > Material Properties') + path('Properties > Section > Section Properties') +
    `<div class="card">${lines.map(r => `<div class="row"><div class="lab"><b>${ROLE_NAME[r.role]}</b> <span class="muted" style="font-size:12px">材料 ${r.mat}／斷面 ${r.sec}</span></div><input type="number" step="any" inputmode="decimal" data-area="${r.role}" value="${r.a ?? ''}" placeholder="A cm²"><div class="u">EA ${fmt(r.EA)}${r.w ? `、自重 ${fmt(r.w)}/m` : ''} → ${r.E ? `<b>E = ${(r.E / 1e4).toFixed(1)}</b> ${esc(R.unit[0])}/cm²${r.gam ? `、<b>單位重 = ${fx(r.gam, 1)}</b> ${esc(R.unit[0])}/m³` : ''}` : '填 A 後計算'}</div></div>`).join('')}</div>` +
    (conflict.length ? `<div class="note">${pill('warn', '材料共用')} 材料 ${conflict.map(c => c[0]).join('、')} 被 ${conflict.map(c => c[1].map(x => ROLE_NAME[x.role]).join('、')).join('；')} 共用，但需要的 E 或單位重不同。改成各自的材料編號，或調整斷面積。</div>` : '') +
    `<div class="note k">橋面系與塔的材料單位重建議設 0，橋面恆載改在「恆載」步驟以梁載重輸入 deck_per_len，與初張力用的值一眼對照。纜索 E 用工廠預拉後的值。</div>`;
}
function freeEnds() {
  const m = R.m0, deg = new Map();
  for (const [, v] of m.elems) { deg.set(v.i, (deg.get(v.i) || 0) + 1); deg.set(v.j, (deg.get(v.j) || 0) + 1); }
  const free = [...deg].filter(([, d]) => d === 1).map(([n]) => n);
  const ends = g => { try { const [ns] = chain(m, g); return [ns[0], ns[ns.length - 1]]; } catch (e) { return []; } };
  const anc = new Set((R.cfg.main || []).flatMap(ends)), wan = new Set((R.cfg.wind || []).flatMap(ends));
  const cableEl = new Set(); for (const k of ['main', 'hanger', 'wind', 'tie']) for (const g of R.cfg[k] || []) (m.groups.get(g) || { elems: [] }).elems.forEach(e => cableEl.add(e));
  const bot = new Set(); R.rep.filter(r => r.role === 'hanger').forEach(r => bot.add(r.bot));
  const out = { anchor: [], wanchor: [], tower: [], other: [] };
  for (const n of free.sort((a, b) => a - b)) {
    if (anc.has(n)) out.anchor.push(n); else if (wan.has(n)) out.wanchor.push(n);
    else if (bot.has(n)) out.other.push(n);
    else out.tower.push(n);
  }
  return out;
}
const CODE_NAME = { '111111': '固定', '111000': '鉸', '111100': '固定（不含 Ry、Rz）', '001000': '只束制垂直' };
function mBnd() {
  const n = needResult(); if (n) return n;
  const f = freeEnds(), cons = R.x.cons;
  if (cons.length) {
    const cov = new Set(cons.flatMap(c => c.nodes));
    const miss = [...f.tower, ...f.anchor, ...f.wanchor].filter(v => !cov.has(v));
    return head('建模 4', '邊界', '線形建模器已指定，匯入 .mct 時一起建立，這一步不用再做。') +
      `<div class="tw"><table><thead><tr><th class="t">邊界群組</th><th class="t">節點</th><th>約束</th></tr></thead><tbody>${cons.map(c => `<tr><td class="t">${esc(c.group)}</td><td class="t">${esc(compressList(c.nodes))}</td><td>${esc(c.code)} ${esc(CODE_NAME[c.code] || '')}</td></tr>`).join('')}</tbody></table></div>` +
      (miss.length ? `<div class="note">${pill('warn', '注意')} 自由端 ${miss.join(' ')} 沒有約束：回到線形建模器「檢查與匯出 > 邊界條件」指定。</div>` : `<div class="note k">${pill('ok', '完整')} 全部 ${f.tower.length + f.anchor.length + f.wanchor.length} 個自由端都有約束。</div>`) +
      (f.other.length ? `<div class="note">${pill('bad', '注意')} 吊索下端 ${f.other.join(' ')} 懸空，沒有傳力路徑。</div>` : '') +
      path('Boundary > Supports > Define Supports') + '<p class="muted">要改約束，回到線形建模器修改後重新開啟吊橋助手。</p>';
  }
  const L = ['*BNDR-GROUP', '; NAME', '   BG_TOWER', '   BG_ANCHOR', ...(f.wanchor.length ? ['   BG_WANCHOR'] : []), '*CONSTRAINT', '; NODE_LIST, CONST(Dx,Dy,Dz,Rx,Ry,Rz), GROUP'];
  if (f.tower.length) L.push(`   ${f.tower.join(' ')}, 111111, BG_TOWER`);
  if (f.anchor.length) L.push(`   ${f.anchor.join(' ')}, 111111, BG_ANCHOR`);
  if (f.wanchor.length) L.push(`   ${f.wanchor.join(' ')}, 111111, BG_WANCHOR`);
  return head('建模 4', '邊界', '.mct 裡沒有約束：依自由端（只連一根元素的節點）與所屬群組推估。建議改在線形建模器「檢查與匯出 > 邊界條件」指定。') +
    `<div class="card">${valRow('塔底', f.tower.join(' ') || '—', '', 'auto')}${valRow('主纜錨碇', f.anchor.join(' ') || '—', '', 'auto')}${f.wanchor.length ? valRow('耐風索錨碇', f.wanchor.join(' '), '', 'auto') : ''}${f.other.length ? valRow('懸空的吊索下端', f.other.join(' '), '', 'auto') : ''}</div>` +
    path('Boundary > Supports > Define Supports') + code('mctBnd', 'MCT：邊界群組與固定支承', L.join('\n'));
}
function bearings() {
  const m = R.m0, f = freeEnds(), towerNodes = new Set(), cableEl = new Set();
  for (const k of ['main', 'hanger', 'wind', 'tie']) for (const g of R.cfg[k] || []) (m.groups.get(g) || { elems: [] }).elems.forEach(e => cableEl.add(e));
  // 塔：含塔底自由端、且不是全模型的群組
  const all = m.elems.size;
  for (const [g, v] of m.groups) if (v.elems.length < all && v.elems.some(e => { const el = m.elems.get(e); return el && (f.tower.includes(el.i) || f.tower.includes(el.j)); })) v.elems.forEach(e => { const el = m.elems.get(e); if (el) { towerNodes.add(el.i); towerNodes.add(el.j); } });
  const deckNodes = new Set(); for (const [e, v] of m.elems) if (!cableEl.has(e)) for (const n of [v.i, v.j]) if (!towerNodes.has(n)) deckNodes.add(n);
  const pairs = [];
  for (const t of towerNodes) { const tp = m.nodes.get(t); let best = null, bd = 1e9; for (const d of deckNodes) { const dp = m.nodes.get(d); const dd = Math.hypot(dp[0] - tp[0], dp[1] - tp[1], dp[2] - tp[2]); if (dd < bd) { bd = dd; best = d; } } if (best !== null && bd < 3) pairs.push([best, t, bd]); }
  const byDeck = new Map(); for (const p of pairs) if (!byDeck.has(p[0]) || byDeck.get(p[0])[2] > p[2]) byDeck.set(p[0], p);
  const v = [...byDeck.values()]; if (!v.length) return v; const dmin = Math.min(...v.map(p => p[2]));
  return v.filter(p => p[2] <= dmin * 1.5 + 1e-6).sort((a, b) => a[0] - b[0]);
}
function mBrg() {
  const n = needResult(); if (n) return n;
  const lk = R.x.links;
  if (lk.length) {
    const nm = ['SDx', 'SDy', 'SDz'];
    return head('建模 5', '橋面支承', '線形建模器已用彈性連結建立，匯入 .mct 時一起建立。') + path('Boundary > Link > Elastic Link') +
      `<div class="tw"><table><thead><tr><th>連結</th><th class="t">節點 i → j</th><th class="t">型式</th>${nm.map(x => `<th>${x}</th>`).join('')}<th class="t">群組</th></tr></thead><tbody>${lk.map(l => `<tr><td>${l.id}</td><td class="t">${l.i} → ${l.j}</td><td class="t">${esc(l.kind)}</td>${[0, 1, 2].map(k => `<td>${l.sd[k] !== undefined ? fmt(l.sd[k]) : '—'}</td>`).join('')}<td class="t">${esc(l.group)}</td></tr>`).join('')}</tbody></table></div>` +
      `<p class="muted">由上往下的連結：局部 x＝−Z，依 Midas 的 Beta 角規則局部 y＝橋寬方向、局部 z＝橋軸方向。縱向（SDz）兩端可動、一端弱彈簧；匯入後在 Midas 顯示連結局部軸確認（附錄 E B40）。G1 時讀弱彈簧的力應接近 0。</p>`;
  }
  const ps = S.src === 'param' ? [[1, 302, 0], [1 + Math.round(S.param.L / S.param.s), 304, 0]] : bearings();
  return head('建模 5', '橋面支承：Elastic Link', '.mct 裡沒有支承連結：依最近距離推估橋面端點與塔節點。建議改在線形建模器用「對接＋彈性連結」建立。') + path('Boundary > Link > Elastic Link') +
    `<div class="tw"><table><thead><tr><th>橋面</th><th>塔</th><th>距離</th></tr></thead><tbody>${ps.map(p => `<tr><td>${p[0]}</td><td>${p[1]}</td><td>${fx(p[2], 3)}</td></tr>`).join('') || '<tr><td colspan="3" class="t">找不到 3 m 內的橋面—塔節點對，請手動指定</td></tr>'}</tbody></table></div>
    <div class="card">${valRow('型式', 'General', '', '')}${valRow('垂直、橫向', '大（例 1.0e8）', 'kgf/m', '')}${valRow('縱向', '0；只一端加弱彈簧', '', '')}${valRow('弱彈簧', '約 1000', 'kgf/m', '')}${valRow('三個轉動', '0', '', '')}</div>
    <p class="muted">「大」的檢查：放大 10 倍後反力與位移幾乎不變。找形時不要用只壓支承或多折線彈簧。</p>`;
}
function mRot() { return head('建模 6', '主纜節點的旋轉自由度') + path('Analysis > Main Control > Main Control Data') + '<p>勾選 <b>Auto Rotational DOF Constraint for Truss/Plane Stress/Solid Elements</b>。主纜節點只連 Cable 元素，沒有旋轉勁度。</p>'; }
function deckBeams() {
  // 每一索面：吊索下端所在的梁群組（不含全模型群組）
  const m = R.m0, all = m.elems.size, out = [];
  for (const r of planeRes()) {
    const mine = new Set([...r.hang.values()].map(([, b]) => b));
    let best = null, cnt = 0;
    for (const [g, v] of m.groups) { if (v.elems.length >= all || !v.elems.length) continue; const el = v.elems.map(e => m.elems.get(e)).filter(Boolean); if (!el.every(e => /^BEAM$/i.test(e.type))) continue; const c = el.filter(e => mine.has(e.i) || mine.has(e.j)).length; if (c > cnt) { cnt = c; best = g; } }
    if (!best) continue;
    const station = node => (node[0] - r.P0[0]) * r.ax[0] + (node[1] - r.P0[1]) * r.ax[1];
    const els = m.groups.get(best).elems.map(e => {
      const el = m.elems.get(e);
      const i = station(m.nodes.get(el.i)), j = station(m.nodes.get(el.j));
      return { e, x: (i + j) / 2, start: Math.min(i, j), end: Math.max(i, j) };
    }).sort((a, b) => a.start - b.start);
    const tol = Math.max(1e-5, r.span * 1e-6);
    const wholeSpan = Math.abs(els[0].start) <= tol && Math.abs(els.at(-1).end - r.span) <= tol &&
      els.every((el, i) => el.end - el.start > tol && (i === 0 || Math.abs(el.start - els[i - 1].end) <= tol));
    out.push({ g: best, els, span: r.span, wholeSpan });
  }
  return out;
}
function deckLoadPlan() {
  const groups = deckBeams();
  const assigned = new Set();
  let overlap = false;
  for (const group of groups) for (const { e } of group.els) {
    if (assigned.has(e)) overlap = true;
    assigned.add(e);
  }
  const ready = groups.length === R.res.size && !overlap && groups.every(g => g.wholeSpan);
  const issue = overlap ? '不同索面用到同一梁元素。請確認各索面的橋面梁群組。'
    : ready ? '' : '有索面的橋面梁未跨越全橋。請確認群組與吊索下端。';
  return { groups, ready, issue };
}

const beamLoadHeader = ['*BEAMLOAD', '; ELEM_LIST, CMD, TYPE, DIR, bPROJ, D1, P1, D2, P2, D3, P3, D4, P4, GROUP'];

function dlBlock(extra, groups = deckBeams()) {
  const c = R.cfg, tops = R.rep.filter(r => r.role === 'hanger').map(r => r.top);
  const L = ['*SELFWEIGHT, 0, 0, -1,', '*CONLOAD', '; NODE_LIST, FX, FY, FZ, MX, MY, MZ, GROUP', `; 索夾 band = ${fmt(c.loads.band)}（吊索上端）`, `   ${compressList(tops)}, 0, 0, ${fmt(-c.loads.band)}, 0, 0, 0,`];
  if (S.deckBeam) {
    L.push(...beamLoadHeader);
    for (const d of groups) L.push(`; ${d.g}：橋面恆載 deck_per_len = ${fmt(c.loads.deck_per_len)}`, `   ${compressList(d.els.map(x => x.e))}, BEAM, UNILOAD, GZ, NO, 0, ${fmt(-c.loads.deck_per_len)}, 1, ${fmt(-c.loads.deck_per_len)}, 0, 0, 0, 0, `);
  }
  if (extra) L.push(...extra);
  return L.join('\n');
}
function mDL() {
  const n = needResult(); if (n) return n;
  const deck = deckLoadPlan();
  const dl = ['*STLDCASE', '; LCNAME, LCTYPE, DESC', '   DL, D, Dead load (all in one case)', '*USE-STLD, DL', dlBlock(null, deck.groups)].join('\n');
  const te = R.tieEq && R.tieEq.length ? ['*STLDCASE', '; LCNAME, LCTYPE, DESC', '   TIE_EQ, D, Tie equivalent force', '*USE-STLD, TIE_EQ', '*CONLOAD', '; NODE_LIST, FX, FY, FZ, MX, MY, MZ, GROUP', ...R.tieEq.map(t => `   ${t.node}, ${fmt(t.F[0])}, ${fmt(t.F[1])}, ${fmt(t.F[2])}, 0, 0, 0,`)].join('\n') : null;
  const wind = R.cfg.wind && R.cfg.wind.length;
  return head('建模 7', '恆載：全部放在同一個工況', 'Self Weight＋索夾節點力＋橋面梁載重全部放在 DL。非線性不能疊加：分成幾個工況，每個都從初張力獨立出發。') +
    path('Load > Static Load > Static Load Cases') + path('Load > Static Load > Self Weight') + path('Load > Static Load > Nodal Loads') + path('Load > Static Load > Element Beam Loads') +
    `<div class="toggle"><span>橋面恆載以梁載重輸入（橋面系單位重設 0）</span><input type="checkbox" id="tgDeck" ${S.deckBeam ? 'checked' : ''}></div>` +
    (deck.groups.length ? `<div class="card"><h3>核對橋面載重使用的梁元素</h3>${deck.groups.map(g => `<p>${esc(g.g)} · ${esc(compressList(g.els.map(e => e.e)))}</p>`).join('')}</div>` : '') +
    (S.deckBeam && !deck.ready ? `<div class="note">${esc(deck.issue)} 請先在 Civil 確認載重元素。</div>` : code('mctDL', 'MCT：工況 DL', dl)) +
    `<div class="note">*BEAMLOAD 依官方手冊 MCT Quick Reference 的欄位，尚未以實機匯出樣本核對。匯入報錯時刪掉這段，改在 GUI 對同一組元素輸入 Uniform Loads、GZ。不論哪種方式，都由 G1 的反力合計核對。</div>` +
    (wind ? `<div class="seg" role="group" aria-label="分析路線">${['A', 'B'].map(x => `<button data-route="${x}" aria-pressed="${S.route === x}">${x === 'A' ? '全橋直接非線性分析' : 'MIDAS SBAC 找形'}</button>`).join('')}</div>` +
      (S.route === 'A' ? '<p class="muted" style="font-size:13px">耐風系統一起保留，不加 TIE_EQ（小規模吊橋推薦）。</p>' : `<p class="muted" style="font-size:13px">找形模型先不啟用耐風索與繫索，把 TIE_EQ 與恆載一起選入找形工況；保存平衡後加入耐風系統、移除 TIE_EQ。</p>${code('mctTie', 'MCT：TIE_EQ（繫索等值節點力）', te || '')}`) : '') +
    `<p class="muted" style="font-size:13px">恆載要和初張力用的一致：Midas 每一索面的橋面恆載若不是 ${fmt(R.cfg.loads.deck_per_len)}/m，G1 不會平衡。</p>`;
}
function mNL() {
  return head('建模 8', '非線性分析控制') + path('Analysis > Analysis Control > Nonlinear') +
    `<div class="card">${valRow('Nonlinear Type', 'Geometry Nonlinear', '', '')}${valRow('Iteration Method', 'Newton-Raphson', '', '')}${valRow('Number of Load Steps', '1（最多 2）', '', '')}${valRow('Max Iterations/Load Step', '30', '', '')}${valRow('Convergence', 'Displacement 0.001', '', '')}</div>
    <p class="muted" style="font-size:13px">初張力在第 1 步就全部存在，恆載卻逐步加上；載重步多時前幾步會先上拱（60 m 例題 10 步時約 +19 cm）。幾何非線性的梁只輸出 i、j 兩端。</p>`;
}
function g1Def() {
  const rs = planeRes(), r = rs[0], L = Math.min(...rs.map(p => p.span)), lim = L * 1000 / 10000;
  const hang = R.rep.filter(x => x.role === 'hanger'), hmin = Math.min(...hang.map(x => x.T)), hmax = Math.max(...hang.map(x => x.T));
  const ties = R.rep.filter(x => x.role === 'tie'), u = R.unit[0];
  const c = R.cfg, l = c.loads;
  const wTie = (() => { for (const g of c.tie || []) { const t = R.x.tags.get(g); if (t && t.w > 0) return t.w; } return 0; })();
  let W = 0; for (const x of R.rep) { if (x.role === 'main' || x.role === 'backstay') W += (l.w_main || 0) * x.L; else if (x.role === 'hanger') W += (l.w_hang || 0) * x.L + (l.band || 0); else if (x.role === 'wind') W += (l.w_wind || 0) * x.L; else if (x.role === 'tie') W += wTie * x.L; }
  W += rs.reduce((a, p) => a + (l.deck_per_len || 0) * p.span, 0);
  const tmin = ties.length ? Math.min(...ties.map(x => x.T)) : 0;
  return [
    ['dv', '吊點最大垂直位移 |δ|', 'mm', `≤ L/10000 = ${fx(lim, 1)} mm`, v => Math.abs(v) <= lim ? 'ok' : Math.abs(v) <= 3 * lim ? 'warn' : 'bad'],
    ['tower', '塔頂最大位移', 'mm', `≤ L/10000 = ${fx(lim, 1)} mm`, v => Math.abs(v) <= lim ? 'ok' : 'bad'],
    ...rs.map((p, i) => [i ? 'H' + (i + 1) : 'H', '主纜水平力 H' + (rs.length > 1 ? ' ' + R.cfg.main[i] : ''), u, `${fx(p.H, 1)} ± 1 %`, v => Math.abs(v - p.H) <= 0.01 * p.H ? 'ok' : 'bad']),
    ['hmin', '吊索力最小', u, `> 0，≥ ${fx(hmin * 0.99, 1)}`, v => v <= 0 ? 'bad' : v >= hmin * 0.99 ? 'ok' : 'warn'],
    ['hmax', '吊索力最大', u, `≤ ${fx(hmax * 1.01, 1)}`, v => v > 0 && v >= +S.g1.hmin && v <= hmax * 1.01 ? 'ok' : 'warn'],
    ...(ties.length ? [['tie', '繫索張力（最小）', u, `${fx(tmin, 1)} ± 1 %，左右相同`, v => Math.abs(v - tmin) <= 0.01 * tmin ? 'ok' : 'bad'], ['dy', '橋面側向位移 |δ|', 'mm', `≈ 0（≤ ${fx(lim, 1)} mm）`, v => Math.abs(v) <= lim ? 'ok' : 'warn']] : []),
    ['R', '反力合計 ΣFZ', u, `與總恆載相差 ≤ 0.1 %（計算值 ${fx(W, 2)}；另有自重時填本案總量）`,
      v => { const weight = +S.g1.weight > 0 ? +S.g1.weight : W; return Math.abs(v - weight) <= 0.001 * weight ? 'ok' : 'warn'; }],
    ['spr', '縱向弱彈簧力', u, `< 0.1 % H = ${fx(r.H * 0.001, 1)}`, v => Math.abs(v) < r.H * 0.001 ? 'ok' : 'warn']
  ];
}
function mG1() {
  const n = needResult(); if (n) return n;
  const gate = requireConfirmedModel(); if (gate) return gate;
  const d = g1Def();
  return head('建模 9', '關卡 G1：恆載驗證', '填入 Midas 的結果。張力和手算一樣不代表正確，位移接近零才代表 L_u 對了。') +
    path('Results > Results > Deformations > Deformed Shape') + path('Results > Results > Forces > Truss Forces') + path('Results > Results > Reactions > Reaction Forces/Moments') +
    `<div class="card"><label class="toggle"><span>恆載分析已收斂</span><input type="checkbox" data-g1="converged"${S.g1.converged ? ' checked' : ''}></label>
    <label class="gin"><span>本案總恆載（kgf，可選填）</span><input type="number" min="0" step="any" data-g1="weight" value="${esc(S.g1.weight ?? '')}"></label>
    ${d.map(([id, lab, u, exp]) => `<div class="gin"><label for="g1_${id}">${esc(lab)}（${esc(u)}）</label><input type="number" step="any" inputmode="decimal" id="g1_${id}" data-g1="${id}" value="${esc(S.g1[id] ?? '')}"><span id="r1_${id}">${pill('idle', '—')}</span><span class="exp">${esc(exp)}</span></div>`).join('')}</div><div id="g1diag"></div>` +
    ref('《吊橋設計流程圖解》第 9 章；《實務》表 45.3、50.x（範例：H ≈ 29616、跨中吊索 ≈ 930、繫索 250）。');
}
function evalG1() {
  if (!document.getElementById('g1diag')) return;
  const d = g1Def(), st = {};
  for (const [id, , , , fn] of d) { const v = parseFloat(S.g1[id]); st[id] = isFinite(v) ? fn(v) : 'idle'; document.getElementById('r1_' + id).innerHTML = pill(st[id], { ok: '通過', warn: '注意', bad: '不通過', idle: '—' }[st[id]]); }
  const missing = Object.values(st).filter(s => s === 'idle').length, bad = Object.entries(st).filter(([, s]) => s === 'bad' || s === 'warn').map(([k]) => k);
  let h = '';
  if (g1Passed(d)) h = `<div class="note k">${pill('ok', 'G1 通過')} 存成基準檔，進入階段 6。</div>`;
  else if (bad.length) {
    const t = [];
    if (st.hmin === 'bad') t.push('有吊索受壓或鬆弛：初張力是否輸入、吊索是否懸空、恆載是否在同一工況。');
    if (bad.includes('R')) t.push('反力合計不符：載重重複或遺漏（Self Weight 與梁載重重複、橋面系單位重未設 0）。');
    if ((bad.includes('dv') || bad.includes('dy')) && st.H === 'ok') t.push('位移大但張力正確：形狀問題。查 L_u 是否被捨入、恆載總和是否等於 deck_per_len、每一索面與全橋是否混用。');
    if (st.H === 'bad') t.push('H 差超過 1 %：模型的恆載或幾何與初張力計算有一處不同。');
    if (st.tie === 'bad') t.push('繫索張力不對：耐風索幾何未修正（開啟修正耐風索），或耐風索錨碇邊界有誤。');
    if (bad.includes('spr')) t.push('弱彈簧力不小：縱向不平衡，找原因而不是加大彈簧。');
    h = `<div class="note">${pill('bad', '未通過')} 首選回到初張力修正後重算，不要靠放寬收斂準則通過。<ul style="margin:6px 0 0;padding-left:18px">${t.map(x => `<li>${esc(x)}</li>`).join('') || '<li>依標示項目逐一檢查。</li>'}</ul></div>`;
  }
  document.getElementById('g1diag').innerHTML = h || `<div class="note">${pill('idle', '未驗證')} ${missing} 項結果未填。${S.g1.converged ? '' : '請確認分析已收斂。'}</div>`;
}
function g1Passed(d = g1Def()) {
  return S.g1.converged === true && d.every(([id, , , , check]) => {
    const value = parseFloat(S.g1[id]);
    return Number.isFinite(value) && check(value) === 'ok';
  });
}
function requireG1() {
  return g1Passed() ? '' : '<div class="card"><p>請先完成 G1 恆載驗證。</p><button class="btn solid" data-go="midas,8">前往 G1</button></div>';
}
function mSave() {
  const n = needResult() || requireConfirmedModel() || requireG1();
  if (n) return n;
  return head('建模 10', '存成基準檔') + path('File > Save As') + `<p>通過 G1 的模型存成基準檔，例如 <code>${esc(baseName())}_DL_OK_R01.mcb</code>。活載、溫度、風、施工階段都從它複製；上游（恆載、EA、線形）一改，全部重新複製。</p>`; }

// ---------------------------------------------------------------- 分析
function aCases() {
  const n = needResult() || requireConfirmedModel() || requireG1(); if (n) return n;
  const deck = deckLoadPlan(), db = deck.groups;
  if (!deck.ready) return head('分析 1', '追加載重工況') + `<div class="note">${esc(deck.issue)}</div>`;
  const x = S.extra, b = Number(x.b), planes = S.src === 'param' ? 2 : R.res.size;
  if (!(b > 0)) return '<div class="card"><p>請先確認橋面幅員。</p><button class="btn solid" data-go="proj,3">設定追加載重</button></div>';
  const qc = x.qc * b / planes, qh = x.qh * b / planes;
  const all = db.map(d => compressList(d.els.map(e => e.e))).join(' '), left = db.map(d => compressList(d.els.filter(e => e.x < d.span / 2).map(e => e.e))).join(' ');
  if (!left) return '<div class="note">找不到左半跨梁元素。請核對橋面梁與載重位置。</div>';
  const cases = [['DL+LLfull', '群集全跨', qc, all, '主纜、控索、塔、錨碇', '(1) 1.00'], ['DL+LLleft', '群集左半跨', qc, left, '縱梁彎矩、撓度、索鞍', '(1) 1.00'], ['DL+LLhang', '吊索用群集全跨', qh, all, '吊索', '(1) 1.00'], ['DL+LL+Tup', '群集全跨＋升溫', qc, all, '塔', '(2) 1.15'], ['DL+LL+Tdn', '群集全跨＋降溫', qc, all, '塔、吊索最小', '(2) 1.15']];
  const mct = ['*STLDCASE', '; LCNAME, LCTYPE, DESC', ...cases.map(k => `   ${k[0]}, USER, ${k[1]} with all dead load`)];
  for (const k of cases) mct.push(`*USE-STLD, ${k[0]}`, dlBlock([...(S.deckBeam ? [] : beamLoadHeader), `; 群集 ${fmt(k[2])}/m`, `   ${k[3]}, BEAM, UNILOAD, GZ, NO, 0, ${fmt(-k[2])}, 1, ${fmt(-k[2])}, 0, 0, 0, 0, `]));
  return head('分析 1', '追加載重工況', '每個組合是一個含全部恆載的完整非線性工況。') +
    tiles([['群集（主纜用）', fx(qc, 1), 'kgf/m', `${x.qc} × ${fx(b, 2)} / ${planes}`], ['群集（吊索用）', fx(qh, 1), 'kgf/m', `${x.qh} × ${fx(b, 2)} / ${planes}`]]) +
    `<div class="tw"><table><thead><tr><th class="t">工況</th><th class="t">讀什麼</th><th class="t">組合・增額</th></tr></thead><tbody>${cases.map(k => `<tr><td class="t">${k[0]}</td><td class="t">${k[4]}</td><td class="t">${k[5]}</td></tr>`).join('')}</tbody></table></div>` +
    path('Load > Static Load > Static Load Cases') + code('mctLL', 'MCT：五個工況', mct.join('\n')) +
    path('Load > Temp/Prestress > System Temperature') + `<p class="muted" style="font-size:13px">Tup／Tdn 在 System Temperature 輸入最終溫度＝初始溫度 ±${fx(x.dT, 0)} °C（初始溫度在 Structure Type）。指針的群集荷重已含衝擊。</p>`;
}
function aComb() {
  return head('分析 2', '非線性組合怎麼做', '人行吊橋活載／恆載約 1.3，一定要幾何非線性。') +
    `<div class="note"><b>不要用 Load Combination 疊加非線性結果。</b>LL 單獨分析是從沒有恆載的狀態算的，結果沒有物理意義。</div>` + path('Results > Combination > Load Combination') + '<p class="muted" style="font-size:13px">只能用在線性或線性化分析。</p>' +
    `<div class="card"><h3>做法 1（建議）</h3><p>每個組合建一個含全部恆載的完整工況（上一步的 MCT 就是這樣）。</p><h3 style="margin-top:10px">做法 2</h3>${path('Load > Settlement/Etc. > Etc. > Loading Sequence for Nonlinear Analysis', 'Load > Type: Misc. > Etc. > Load Sequence for Nonlinear')}<p class="muted" style="font-size:13px">接在恆載之後；一個模型只有一組順序，多個組合要分檔。只對 Newton-Raphson 與位移控制有效。</p></div>` +
    path('Results > Result Tables > Displacements') + '<p class="muted" style="font-size:13px">活載撓度＝(DL+LL) 位移 − DL 位移。60 m 例題：全跨 248 mm、半跨 549／498 mm（線性化高估 66 %）。</p>';
}
function aG2() {
  const n = needResult(); if (n) return n;
  const gate = requireConfirmedModel() || requireG1(); if (gate) return gate;
  const list = g2Cases();
  return head('分析 3', '關卡 G2：收斂、不鬆弛', '每個工況各自收斂，讀吊索（與繫索）最小張力。') + path('Results > Results > Forces > Truss Forces') +
    `<div class="card">${list.map(k => `<div class="gin"><label for="g2_${k}">${k} 最小張力（kgf）</label><input type="number" step="any" inputmode="decimal" id="g2_${k}" data-g2="${k}" value="${esc(S.g2[k] ?? '')}"><span id="r2_${k}"></span><label class="exp"><input type="checkbox" data-g2="ok:${k}"${S.g2['ok:' + k] ? ' checked' : ''}> 分析已收斂</label></div>`).join('')}</div><div id="g2diag"></div>
    <p class="muted">有耐風系統時，填吊索與繫索兩者中的最小張力。先在 Civil 設定溫度荷重。</p>`;
}
function g2Cases() {
  const cases = ['DL+LLfull', 'DL+LLleft', 'DL+LLhang', 'DL+LL+Tup', 'DL+LL+Tdn'];
  if (S.src !== 'param' && (R.cfg.wind?.length || windLoads(1).sum.length)) cases.push('DL+W+Y', 'DL+W-Y');
  return cases;
}
function evalG2() {
  const diag = document.getElementById('g2diag');
  if (!diag) return;
  const cases = g2Cases();
  let passed = 0;
  for (const k of cases) {
    const value = parseFloat(S.g2[k]);
    const el = document.getElementById('r2_' + k);
    if (Number.isFinite(value) && value <= 0) el.innerHTML = pill('bad', '鬆弛');
    else if (!Number.isFinite(value) || S.g2['ok:' + k] !== true) el.innerHTML = pill('idle', '未驗證');
    else { el.innerHTML = pill('ok', '通過'); passed++; }
  }
  diag.innerHTML = `<div class="note">${passed === cases.length ? pill('ok', 'G2 通過') : pill('idle', 'G2 未完成')} ${passed}／${cases.length} 個工況通過</div>`;
}
function aEig() {
  const n = needResult(); if (n) return n;
  const r = planeRes()[0], hang = R.rep.filter(x => x.role === 'hanger' && r.hang.has(x.top));
  const wl = R.cfg.loads, W = (wl.deck_per_len || 0) * r.span + hang.reduce((a, h) => a + (wl.w_hang || 0) * h.L + (wl.band || 0) + (h.ptie || 0), 0) + (wl.w_main || 0) * r.span;
  const w = W / r.span, fS = Math.sqrt(r.H * G / w) / r.span;
  const fs = (S.g2.freqs ?? '').match(/[\d.]+/g)?.map(Number).filter(isFinite) || [];
  const flag = f => (f >= 1.25 && f <= 2.3) || (f >= 2.5 && f <= 4.6);
  return head('分析 4', '特徵值：一定要帶入恆載張力', '不帶入張力時頻率只剩 1/2～1/4。') +
    tiles([['弦公式第 1 反對稱', fx(fS, 3), 'Hz', `(1/L)√(Hg/w)，w = ${fx(w, 1)}/m`], ['漏乘 g 會得到', fx(fS / Math.sqrt(G), 3), 'Hz', 'kgf 系的 H 是重力單位']]) +
    `<details class="more"><summary>兩條路線與路徑</summary>${path('Analysis > Analysis Control > Construction Stage')}<p class="muted" style="font-size:13px">施工階段路線：一個成橋恆載階段，勾選 Convert Final Stage Member Forces to Initial Forces for PostCS，PostCS 做特徵值。</p>${path('Load > Static Load > Initial Forces > Small > Initial Forces Control Data')}<p class="muted" style="font-size:13px">初始力路線：恆載非線性的纜索張力輸入後再做特徵值。</p>${path('Analysis > Analysis Control > Eigenvalue')}${path('Load > Static Load > Loads to Masses')}</details>
    <div class="card"><h3>步行頻率檢查</h3><div class="row" style="grid-template-columns:1fr"><input type="text" id="freqs" value="${esc(S.g2.freqs ?? '')}" placeholder="Midas 垂直模態頻率，例：0.514 1.02 1.62" style="text-align:left"></div>
    <ul class="checks">${fs.map(f => `<li>${pill(flag(f) ? 'warn' : 'ok', flag(f) ? '步行範圍' : '範圍外')}<span>${fx(f, 3)} Hz</span></li>`).join('')}</ul>
    ${fs.some(flag) ? '<p class="muted" style="font-size:13px">落在 1.25～2.3 或 2.5～4.6 Hz：估算行人共振加速度（垂直 0.5～1.0 m/s² 以內）；不足時提高勁度、增加質量或加 TMD。橫向另查 0.5～1.2 Hz。</p>' : ''}</div>
    <p class="muted" style="font-size:13px">兩端縱向可動時，模態 1 常是縱向擺動（60 m 例題 0.373 Hz），垂直振形從模態 2 開始。</p>`;
}
function windLoads(sign) {
  const p = S.extra.pw || 0, m = R.ok ? R.mct : R.m0, beam = new Map(), nodal = new Map(), sum = [];
  for (const [g, t] of R.x.tags) {
    if (!(t.windW > 0) || !m.groups.has(g)) continue;
    const w = p * t.windW; let F = 0, nb = 0, nn = 0;
    for (const e of m.groups.get(g).elems) {
      const el = m.elems.get(e); if (!el) continue;
      const a = m.nodes.get(el.i), b = m.nodes.get(el.j), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
      if (!(L > 0)) continue;
      const k = Math.sqrt(Math.max(0, 1 - (d[1] / L) ** 2)); if (k < 1e-6) continue;
      F += w * k * L;
      if (/^BEAM$/i.test(el.type)) { const key = fmt(sign * w * k); if (!beam.has(key)) beam.set(key, []); beam.get(key).push(e); nb++; }
      else { for (const nd of [el.i, el.j]) nodal.set(nd, (nodal.get(nd) || 0) + sign * w * k * L / 2); nn++; }
    }
    sum.push({ g, windW: t.windW, w, F, nb, nn });
  }
  return { beam, nodal, sum };
}
function aWind() {
  if (S.src === 'param') return head('分析 5', '風') + '<div class="card"><p>2D 單一索面模型不做風；風工況要用 3D 模型並含耐風系統。</p></div>';
  const n = needResult(); if (n) return n;
  const gate = requireConfirmedModel() || requireG1(); if (gate) return gate;
  const deck = deckLoadPlan();
  if (S.deckBeam && !deck.ready) return `<div class="note">${esc(deck.issue)}</div>`;
  const x = S.extra, wy = windLoads(1);
  if (!wy.sum.length) {
    const wd = x.pw * (x.hw || 0) / 2, wc = x.pw * (x.Dc || 0);
    return head('分析 5', '風：線載重（3D）', '.mct 沒有受風投影寬：在線形建模器各群組填「受風投影寬」，這裡就能直接產生風工況。') +
      tiles([['橋面（每一索面）', fx(wd, 1), 'kgf/m', `${x.pw} × ${fx(x.hw, 2)} / 2`], ['主纜（每條）', fx(wc, 1), 'kgf/m', `${x.pw} × ${fx(x.Dc, 3)}`]]) + path('Load > Static Load > Element Beam Loads');
  }
  const mk = (sign, nm) => { const W = windLoads(sign), extra = [`; 風 ${nm}：設計風壓 ${fmt(x.pw)}`];
    if (W.beam.size) { extra.push('*BEAMLOAD', '; ELEM_LIST, CMD, TYPE, DIR, bPROJ, D1, P1, D2, P2, D3, P3, D4, P4, GROUP'); for (const [v, es] of W.beam) extra.push(`   ${compressList(es)}, BEAM, UNILOAD, GY, NO, 0, ${v}, 1, ${v}, 0, 0, 0, 0, `); }
    if (W.nodal.size) { extra.push('*CONLOAD', '; NODE_LIST, FX, FY, FZ, MX, MY, MZ, GROUP'); for (const [nd, F] of [...W.nodal].sort((a, b) => a[0] - b[0])) extra.push(`   ${nd}, 0, ${fmt(F)}, 0, 0, 0, 0,`); }
    return extra; };
  const mct = ['*STLDCASE', '; LCNAME, LCTYPE, DESC', '   DL+W+Y, USER, wind +Y with all dead load', '   DL+W-Y, USER, wind -Y with all dead load',
    '*USE-STLD, DL+W+Y', dlBlock(mk(1, '+Y')), '*USE-STLD, DL+W-Y', dlBlock(mk(-1, '-Y'))].join('\n');
  const tot = wy.sum.reduce((a, s) => a + s.F, 0);
  return head('分析 5', '風：兩個方向的完整工況', '受風投影寬由線形建模器各群組指定；不載活荷重，+Y、−Y 各做一次。') +
    tiles([['設計風壓', fx(x.pw, 0), 'kgf/m²', S.prov.pw === 'cg' ? '線形建模器設計值' : ''], ['全橋橫向風力', tf(tot, 2), 'tf', '投影於 X-Z 面']]) +
    `<div class="tw"><table><thead><tr><th class="t">群組</th><th>投影寬 (m)</th><th>線載重 (kgf/m)</th><th class="t">施加方式</th><th>合力 (tf)</th></tr></thead><tbody>${wy.sum.map(s => `<tr><td class="t">${esc(s.g)}</td><td>${fmt(s.windW)}</td><td>${fx(s.w, 2)}</td><td class="t">${s.nb ? `梁載重 ${s.nb} 根` : ''}${s.nb && s.nn ? '、' : ''}${s.nn ? `節點力 ${s.nn} 根` : ''}</td><td>${tf(s.F, 3)}</td></tr>`).join('')}</tbody></table></div>` +
    path('Load > Static Load > Static Load Cases') + code('mctW', 'MCT：DL+W+Y、DL+W−Y', mct) +
    `<p class="muted">梁元素以 Element Beam Loads（GY）施加；纜索與桁架不能加梁載重，改把每根元素的風力平分到兩端節點。斜向構件只計 X-Z 面的投影長。讀背風側繫索最小張力：本書驗收條件為不鬆弛，鬆弛時提高 tie_T 或加大平面垂度。</p>` +
    ref('《吊橋設計流程圖解》第 4、11 章；《實務》表 49.4。');
}
// ============================================================== 版面：左＝全部步驟（階段 0～6）、中＝模型圖、右＝這一步的內容（底部固定上一步／下一步）
const STAGE_NO = { proj: '0', pret: '4', midas: '5', ana: '6' };
const STAGE_NAME = { proj: '專案', pret: '初張力', midas: '建模', ana: '分析' };
// 每一步在模型圖上強調什麼
const HL = { stAuto: 'roles', stLoads: 'cables', stExtra: 'deck', stResult: 'main', stWind: 'wind', stValues: 'cables', stChecks: 'main',
  mMat: 'cables', mBnd: 'bnd', mBrg: 'brg', mRot: 'mainnodes', mDL: 'dl', mG1: 'hangbot', aCases: 'left', aWind: 'windload', aEig: 'main' };
function flat() { const out = []; for (const t of TABS) steps(t.id).forEach(([lab, fn], i) => out.push({ tab: t.id, i, lab, fn })); return out; }
function go(tab, step) { S.tab = tab; if (step !== undefined) S.step[tab] = step; save(); render(); const c = document.querySelector('.pbody'); if (c) c.scrollTop = 0; }
function move(d) { const f = flat(), k = f.findIndex(x => x.tab === S.tab && x.i === S.step[S.tab]); const n = f[k + d]; if (n) go(n.tab, n.i); }
function treeHtml() {
  let h = '';
  for (const t of TABS) {
    h += `<div class="stg"><b>${STAGE_NO[t.id]}</b>${STAGE_NAME[t.id]}</div>`;
    steps(t.id).forEach(([lab], i) => {
      const cur = t.id === S.tab && i === S.step[t.id];
      const st = (R && S.src && R.missing.length && (t.id !== 'proj' || i === 2)) ? 'warn' : (R && R.error && t.id !== 'proj') ? 'bad' : '';
      h += `<button data-nav="${t.id},${i}" aria-current="${cur ? 'step' : 'false'}"><span class="n">${i + 1}</span>${lab}${st ? `<span class="st ${st}"></span>` : ''}</button>`;
    });
  }
  return h;
}
function pagerHtml() {
  const f = flat(), k = f.findIndex(x => x.tab === S.tab && x.i === S.step[S.tab]);
  const p = f[k - 1], n = f[k + 1];
  return `<button class="btn" data-mv="-1" ${p ? '' : 'disabled'}>${p ? '← ' + p.lab : '上一步'}</button><span class="pos">${k + 1}／${f.length}</span><button class="btn solid" data-mv="1" ${n ? '' : 'disabled'}>${n ? n.lab + ' →' : '完成'}</button>`;
}
function render(keepScroll) {
  compute(); CODES = {};
  const list = steps(S.tab), i = Math.min(S.step[S.tab] || 0, list.length - 1); S.step[S.tab] = i;
  const [, fn] = list[i];
  document.getElementById('fileTag').textContent = S.src ? S.fileName : '尚未載入模型';
  const pb = document.querySelector('.pbody'), sc = keepScroll && pb ? pb.scrollTop : 0;
  document.getElementById('tree').innerHTML = treeHtml();
  document.getElementById('draw').innerHTML = drawModel(HL[fn.name]);
  document.getElementById('pbody').innerHTML = fn();
  document.getElementById('pfoot').innerHTML = pagerHtml();
  if (S.tab === 'proj' && i === 0) bindSource();
  bindInputs(); evalG1(); evalG2();
  if (keepScroll) document.querySelector('.pbody').scrollTop = sc;
  const cur = document.querySelector('#tree [aria-current="step"]'); if (cur) cur.scrollIntoView({ block: 'nearest' });
}

// ---------------------------------------------------------------- 模型圖（立面＋平面，強調這一步相關的節點與構件）
function drawModel(hl) {
  if (!S.src || !R || !R.m0) return `<svg class="draw" viewBox="0 0 800 400"><text x="400" y="200" text-anchor="middle">載入模型後顯示立面與平面</text></svg>`;
  const m = R.ok ? R.mct : R.m0, cfg = R.cfg;
  const roleOf = new Map();
  for (const k of ['main', 'hanger', 'wind', 'tie']) for (const g of cfg[k] || []) (m.groups.get(g) || { elems: [] }).elems.forEach(e => roleOf.set(e, k));
  let P0 = [0, 0, 0], ax = [1, 0];
  const pr = R.ok ? [...R.res.values()][0] : null;
  if (pr) { P0 = pr.P0; ax = [pr.ax[0], pr.ax[1]]; }
  const X = p => (p[0] - P0[0]) * ax[0] + (p[1] - P0[1]) * ax[1], Y = p => -(p[0] - P0[0]) * ax[1] + (p[1] - P0[1]) * ax[0];
  const pts = [...m.nodes.values()];
  const xs = pts.map(X), ys = pts.map(Y), zs = pts.map(p => p[2]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const W = 800, pad = 26, sx = (W - 2 * pad) / (x1 - x0 || 1);
  const ve = Math.max(1, Math.min(3, 170 / ((z1 - z0) * sx || 1)));
  const hE = (z1 - z0) * sx * ve;
  const ye = Math.max(1, Math.min(3, 120 / ((y1 - y0) * sx || 1))), hP = Math.max(30, (y1 - y0) * sx * ye);
  const H = pad + hE + 44 + hP + pad;
  const EX = p => pad + (X(p) - x0) * sx, EZ = p => pad + (z1 - p[2]) * sx * ve, PY = p => pad + hE + 44 + (Y(p) - y0) * sx * ye;
  const hiE = new Set(), hiN = [];
  const rep = R.ok ? R.rep : [];
  const addRole = (...rs) => { for (const [e, r] of roleOf) if (rs.includes(r)) hiE.add(e); };
  if (hl === 'cables' || hl === 'roles') addRole('main', 'hanger', 'wind', 'tie');
  if (hl === 'main') addRole('main', 'hanger');
  if (hl === 'wind') addRole('wind', 'tie');
  if (hl === 'mainnodes' && R.ok) for (const r of R.res.values()) r.ns.forEach(n => hiN.push([n, '']));
  if ((hl === 'dl' || hl === 'hangbot') && R.ok) rep.filter(r => r.role === 'hanger').forEach(r => hiN.push([hl === 'dl' ? r.top : r.bot, '']));
  if ((hl === 'dl' || hl === 'deck' || hl === 'left') && R.ok) for (const d of deckBeams()) d.els.forEach(x => { if (hl !== 'left' || x.x < d.span / 2) hiE.add(x.e); });
  if (hl === 'windload') for (const [g, t] of R.x.tags) if (t.windW > 0 && m.groups.has(g)) m.groups.get(g).elems.forEach(e => hiE.add(e));
  if (hl === 'bnd' && R.ok) { if (R.x.cons.length) R.x.cons.forEach(c => c.nodes.forEach((n, k) => hiN.push([n, k === 0 ? c.group : '']))); else { const f = freeEnds(); [...f.tower, ...f.anchor, ...f.wanchor].forEach(n => hiN.push([n, ''])); } }
  if (hl === 'brg' && R.ok) { if (R.x.links.length) R.x.links.forEach(l => { hiN.push([l.i, '']); hiN.push([l.j, '']); }); else bearings().forEach(p => { hiN.push([p[0], '']); hiN.push([p[1], '']); }); }
  const isTower = (a, b) => Math.abs(a[2] - b[2]) > 0.9 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) && pr && (Math.abs(X(a)) < 0.6 || Math.abs(X(a) - pr.span) < 0.6);
  const color = e => { const r = roleOf.get(e); if (r === 'main') return 'var(--cable)'; if (r === 'hanger') return 'var(--hang)'; if (r === 'wind' || r === 'tie') return 'var(--wind)'; const el = m.elems.get(e); const a = m.nodes.get(el.i), b = m.nodes.get(el.j); return isTower(a, b) ? 'var(--tower)' : 'var(--deck)'; };
  const anyHl = hiE.size > 0;
  let s = `<text x="${pad}" y="${pad - 10}">立面${ve > 1.01 ? `（垂直 ×${fx(ve, 1)}）` : ''}</text><text x="${pad}" y="${pad + hE + 30}">平面${ye > 1.01 ? `（橫向 ×${fx(ye, 1)}）` : ''}</text>`;
  const lines = [[], []];
  for (const [e, el] of m.elems) {
    const a = m.nodes.get(el.i), b = m.nodes.get(el.j); if (!a || !b) continue;
    const on = !anyHl || hiE.has(e), c = on ? color(e) : 'var(--dim)', w = (roleOf.get(e) === 'main' ? 1.8 : 1) + (hiE.has(e) ? 1 : 0);
    lines[on ? 1 : 0].push(`<line x1="${EX(a).toFixed(1)}" y1="${EZ(a).toFixed(1)}" x2="${EX(b).toFixed(1)}" y2="${EZ(b).toFixed(1)}" stroke="${c}" stroke-width="${w}"/><line x1="${EX(a).toFixed(1)}" y1="${PY(a).toFixed(1)}" x2="${EX(b).toFixed(1)}" y2="${PY(b).toFixed(1)}" stroke="${c}" stroke-width="${w}"/>`);
  }
  s += lines[0].join('') + lines[1].join('');
  const seen = new Set();
  for (const [n, lab] of hiN) { const p = m.nodes.get(n); if (!p) continue; s += `<circle cx="${EX(p).toFixed(1)}" cy="${EZ(p).toFixed(1)}" r="4" fill="var(--ochre)"/><circle cx="${EX(p).toFixed(1)}" cy="${PY(p).toFixed(1)}" r="4" fill="var(--ochre)"/>`;
    const key = Math.round(EX(p) / 30) + ',' + Math.round(EZ(p) / 14); if (!seen.has(key) && hl !== 'mainnodes' && hl !== 'dl' && hl !== 'hangbot') { seen.add(key); const rt = EX(p) > W * 0.85; s += `<text x="${(EX(p) + (rt ? -6 : 6)).toFixed(1)}" y="${(EZ(p) - 6).toFixed(1)}" class="nl"${rt ? ' text-anchor="end"' : ''}>${n}</text>`; } }
  return `<svg class="draw" viewBox="0 0 ${W} ${H.toFixed(0)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="模型立面與平面">${s}</svg>`;
}

// ---------------------------------------------------------------- 事件
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.nav) { const [t, k] = b.dataset.nav.split(','); go(t, +k); }
  else if (b.dataset.mv) move(+b.dataset.mv);
  else if (b.dataset.go) { const [t, s] = b.dataset.go.split(','); go(t, +s); }
  else if (b.dataset.copy) copyText(b.dataset.copy);
  else if (b.dataset.code) copyText(CODES[b.dataset.code]);
  else if (b.dataset.dl) download(CODES[b.dataset.dl], b.dataset.name);
  else if (b.dataset.intent) { S.intent = b.dataset.intent; S.confirmed = false; invalidate(); save(); render(true); }
  else if (b.dataset.kind) { S.cfg.output_kind = b.dataset.kind; invalidate(); save(); render(true); }
  else if (b.dataset.rf) { S.roleFilter = b.dataset.rf; save(); render(true); }
  else if (b.dataset.route) { S.route = b.dataset.route; invalidate(); save(); render(true); }
  else if (b.id === 'btnOpen') document.getElementById('fTop').click();
});
document.getElementById('fTop').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadMct(r.result, f.name, 'file'); r.readAsText(f); e.target.value = ''; });
document.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => { if (e.target.closest('label.file')) return; const f = e.dataTransfer && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); const r = new FileReader(); r.onload = () => /\.json$/i.test(f.name) ? toast('roles.json 請拖到「專案 > 來源」的 roles.json 欄') : loadMct(r.result, f.name, 'file'); r.readAsText(f); });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.g1) { S.g1[t.dataset.g1] = t.type === 'checkbox' ? t.checked : t.value; invalidate(false); save(); evalG1(); }
  else if (t.dataset.g2) { S.g2[t.dataset.g2] = t.type === 'checkbox' ? t.checked : t.value; save(); evalG2(); }
  else if (t.id === 'freqs') { S.g2.freqs = t.value; save(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.hasAttribute('data-cable-group')) {
    const name = t.dataset.cableGroup;
    for (const [key] of CABLE_ROLES) S.cfg[key] = (S.cfg[key] || []).filter(g => g !== name);
    if (t.value) S.cfg[t.value].push(name);
    S.prov.roles = 'manual'; S.confirmed = false; invalidate(); save(); render(true);
  } else if (t.id === 'confirmModel') {
    S.confirmed = t.checked; invalidate(); save();
  } else if (t.id === 'fixMain') {
    S.cfg.fix_main_z = t.checked; invalidate(); save(); render(true);
  } else if (t.dataset.area) { const v = parseFloat(t.value); S.extra.area[t.dataset.area] = isFinite(v) ? v : null; invalidate(); save(); render(true); }
  else if (t.id === 'freqs') render(true);
  else if (t.id === 'tgDeck') { S.deckBeam = t.checked; invalidate(); save(); render(true); }
});
document.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select')) return;
  if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight')) { e.preventDefault(); move(1); }
  else if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft')) { e.preventDefault(); move(-1); }
});
let tt; function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 1800); }
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('已複製'); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (er) {} ta.remove(); toast(ok ? '已複製' : '無法複製，請改用下載'); } }
function download(text, name) { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0); toast('已下載 ' + name); } catch (e) { toast('無法下載，請用複製'); } }

// ---------------------------------------------------------------- 開啟方式：線形建模器交接、雙擊 .mct（安裝為 App 時）、上次的專案
function takeHandoff() {
  let pkt = null;
  try { pkt = JSON.parse(localStorage.getItem('cg.handoff') || 'null'); } catch (e) {}
  if (pkt && pkt.mct && Date.now() - pkt.at < 10 * 60 * 1000) {
    try { localStorage.removeItem('cg.handoff'); } catch (e) {}
    if (loadMctQuiet(pkt.mct, pkt.name || '線形建模器', 'cg')) { S.fileName = '線形建模器 → ' + (pkt.name || ''); S.tab = 'proj'; S.step.proj = 1; save(); return true; }
  }
  return false;
}
window.addEventListener('message', e => {
  if (!window.opener || e.source !== window.opener || (location.protocol !== 'file:' && e.origin !== location.origin)) return;
  if (e.data && e.data.type === 'cg-flow-mct' && e.data.mct && loadMctQuiet(e.data.mct, e.data.name || '線形建模器', 'cg')) { S.fileName = '線形建模器 → ' + (e.data.name || ''); go('proj', 1); }
});
if ('launchQueue' in window) launchQueue.setConsumer(async p => { for (const h of p.files || []) { const f = await h.getFile(); if (loadMctQuiet(await f.text(), f.name, 'file')) go('proj', 1); } });
if (location.hash === '#handoff') { if (!takeHandoff() && window.opener) try { window.opener.postMessage({ type: 'cg-flow-ready' }, location.protocol === 'file:' ? '*' : location.origin); } catch (e) {} history.replaceState(null, '', location.pathname); }
if (location.hash === '#source') { S.tab = 'proj'; S.step.proj = 0; }
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
if (S.src === 'demo' && !S.mctText) S.src = null;
render();
