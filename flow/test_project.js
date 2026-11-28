const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const hooks = new Map();
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { addEventListener() {}, getContext: () => ({}), style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } });
  return elements.get(id);
};
const local = new Map();
const context = vm.createContext({
  console, assert, URL,
  window: { addEventListener() {} },
  document: {
    addEventListener: (event, fn) => hooks.set(event, fn),
    getElementById: element, querySelector: element
  },
  localStorage: { getItem: k => local.get(k), setItem: (k, v) => local.set(k, v) }
});
const indexScript = [...read('index.html').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const indexStart = indexScript.lastIndexOf('\nstate = newState();');
assert.ok(indexStart > 0, '找到線形建模器啟動區塊');
const builder = vm.createContext({ ...context });
vm.runInContext(indexScript.slice(0, indexStart), builder, { filename: 'index.html' });
const geometryMct = vm.runInContext(`
  const p = { span:73, width:3, deck:10, saddle:23, sag:9, spacing:3, depth:1.7,
    bearing:0.4, baseL:0, baseR:1, anchorL:14, anchorR:18, anchorLZ:4, anchorRZ:6 };
  assert.equal(validateSuspensionGeometry(p), "");
  assert.ok(validateSuspensionGeometry({ ...p, sag:14 }));
  const panels = suspensionPanels(p.span, p.spacing);
  assert.equal(panels, 26);
  state = normState(demoSuspension({ ...p, panels }));
  state.suspensionProjectId = "test-bridge";
  const errs = [], warns = [];
  MODEL = buildModel(state, errs, warns);
  assert.deepEqual(Array.from(errs), []);
  assert.equal(state.stages.length, 0);
  assert.equal(state.design.width, 3);
  assert.equal(state.design.deck_per_len, undefined);
  assert.equal(MODEL.groups.filter(g => g.g.use === "hanger").length, 2);
  for (const g of MODEL.groups.filter(g => g.g.use === "hanger")) assert.equal(g.elems.length, 25);
  assert.equal(MODEL.groups.flatMap(g => g.links || []).length, 4);
  const layers = new Set(["Cable"]), roles = new Map([["Cable", "cable"]]);
  const dxf = { polys:[{ layer:"Cable", segs:[{ p:{x:0,y:0,z:6}, q:{x:10,y:0,z:5} }] }] };
  const [imported] = dxfGroups(dxf, { layers, roles, scale:1, ox:0, oy:0, oz:0, zMode:"dxf", maxLen:0, perLayer:true });
  assert.equal(imported.etype, "CABLE");
  assert.equal(imported.use, "cable");
  mctText();
`, builder);

vm.runInContext(read('flow/engine.js'), context, { filename: 'engine.js' });
// Initialize the browser controller without the initial render or PWA registration.
const app = read('flow/app.js');
const appStart = app.lastIndexOf('\nif (\'launchQueue\'');
assert.ok(appStart > 0, '找到流程助手啟動區塊');
vm.runInContext(app.slice(0, appStart), context, { filename: 'app.js' });
context.demoMct = read('tools/examples/suspension_demo.mct');
context.geometryMct = geometryMct;
vm.runInContext(`
  S.src = 'param';
  compute();
  assert.ok(R.ok, R.error);
  assert.equal(planeRes()[0].span, 60);
  assert.ok(loadMctQuiet(demoMct, 'demo.mct', 'demo'));
  compute();
  assert.ok(R.ok, R.error);
  assert.equal(R.res.size, 2);
  assert.equal(deckLoadPlan().ready, true);
  assert.match(mImport(), /Civil 2022/);
  assert.match(mImport(), /設定恆載工況 DL/);
  const fullDeck = deckBeams;
  deckBeams = () => {
    const [first] = fullDeck();
    return [first, first];
  };
  assert.equal(deckLoadPlan().ready, false);
  assert.doesNotMatch(mDL(), /data-code="mctDL"/);
  deckBeams = fullDeck;
  assert.ok(Math.abs(planeRes()[0].H - 29615.848) < 0.1);
  S.g1 = { dv: 0, converged: true };
  assert.equal(g1Passed(), false, '僅位移符合不能通過');
  assert.match(mSave(), /G1/);
  const expected = { dv: 0, tower: 0, H: planeRes()[0].H, H2: planeRes()[1].H,
    hmin: Math.min(...R.rep.filter(x => x.role === 'hanger').map(x => x.T)),
    hmax: Math.max(...R.rep.filter(x => x.role === 'hanger').map(x => x.T)),
    tie: Math.min(...R.rep.filter(x => x.role === 'tie').map(x => x.T)), dy: 0, spr: 0,
    R: 60000, weight: 60000 };
  S.g1 = { ...expected };
  assert.equal(g1Passed(), false, '全填仍須確認收斂');
  S.g1.converged = true;
  assert.equal(g1Passed(), true);
  S.deckBeam = false;
  aCases();
  assert.ok(CODES.mctLL.indexOf('*BEAMLOAD') >= 0 && CODES.mctLL.indexOf('*BEAMLOAD') < CODES.mctLL.indexOf('BEAM, UNILOAD'));
  S.deckBeam = true;
  S.g1.R = 61000;
  assert.equal(g1Passed(), false);
  S.g1 = { ...expected, converged: true };
  for (const key of g2Cases()) S.g2[key] = '10';
  evalG2();
  assert.doesNotMatch(document.getElementById('g2diag').innerHTML, /G2 通過/);
  for (const key of g2Cases()) S.g2['ok:' + key] = true;
  evalG2();
  assert.match(document.getElementById('g2diag').innerHTML, /G2 通過/);
  S.g2[g2Cases()[0]] = '0';
  evalG2();
  assert.doesNotMatch(document.getElementById('g2diag').innerHTML, /G2 通過/);
  invalidate();
  assert.equal(g1Passed(), false);
  assert.equal(Object.keys(S.g2).length, 0);

  assert.ok(loadMctQuiet(demoMct, 'existing.mct', 'file'));
  compute();
  assert.equal(R.ok, undefined);
  assert.match(modelReview(), /檢查現有設定/);
  assert.match(modelReview(), /data-cable-group/);
  S.intent = 'recalculate';
  compute();
  assert.ok(R.ok, R.error);
  assert.equal(R.cfg.fix_main_z, false);
  assert.match(mImport(), /請先確認/);
  S.confirmed = true;
  assert.match(mImport(), /existing_tensioned.mct/);
  assert.match(modelChanges(), /纜索/);
  assert.ok(loadMctQuiet(demoMct.replace(/KGF, M, KJ/, 'KN, M, KJ'), 'kn.mct', 'file'));
  compute();
  assert.match(R.error, /KGF/);

  assert.ok(loadMctQuiet(geometryMct, 'bridge.mct', 'cg'));
  compute();
  assert.equal(S.projectId, 'test-bridge');
  assert.equal(R.geo.planes.length, 2);
  assert.ok(R.missing.some(x => x.includes('EA')));
  S.cfg.loads = { deck_per_len: 300, band: 20, w_main: 12, w_hang: 2 };
  S.cfg.EA = { main: 17000000, hanger: 4100000 };
  S.prov['loads.deck_per_len'] = 'manual';
  compute();
  assert.ok(R.ok, R.error);
  assert.equal(planeRes()[0].span, 73);
  assert.ok(Math.abs(planeRes()[0].f - 9) < 0.001);
  assert.ok(loadMctQuiet(geometryMct, 'bridge-edited.mct', 'cg'));
  assert.equal(S.cfg.loads.deck_per_len, 300, '同專案重新交接保留已輸入的恆載');
`, context);
console.log('吊橋專案流程回歸測試通過');
