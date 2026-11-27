/* 吊橋助手的回歸測試(CI):
   1. flow/engine.js 與 tools/cable_pretension.py 對內建範例三種設定的輸出 .mct、TIE_EQ 逐位元組相同
   2. 子集字型涵蓋 flow.html、flow/app.js、flow/engine.js 的每一個字(缺字時重跑 flow/build_fonts.py)
   用法:node flow/test_flow.js(需要 python3) */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const E = require('./engine.js');
const ROOT = path.resolve(__dirname, '..'), EX = path.join(ROOT, 'tools/examples');
let fail = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) fail++; console.log(`${c ? '✓' : '✕'} ${msg}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-'));
const mct = fs.readFileSync(path.join(EX, 'suspension_demo.mct'), 'utf8');
const base = JSON.parse(fs.readFileSync(path.join(EX, 'suspension_demo_roles.json'), 'utf8'));
const cases = {
  '不計繫索': (() => { const c = JSON.parse(JSON.stringify(base)); delete c.wind; delete c.tie; return c; })(),
  '耐風索未修正': base,
  '耐風索修正(tie_T 250)': { ...base, tie_T: 250, fix_wind: true }
};
for (const [nm, cfg] of Object.entries(cases)) {
  const rf = path.join(tmp, 'roles.json'); fs.writeFileSync(rf, JSON.stringify(cfg));
  execFileSync('python3', [path.join(ROOT, 'tools/cable_pretension.py'), path.join(EX, 'suspension_demo.mct'), rf, '-o', path.join(tmp, 'run')], { stdio: 'ignore' });
  const r = E.runMct(mct, JSON.parse(JSON.stringify(cfg)));
  ok(fs.readFileSync(path.join(tmp, 'run.mct'), 'utf8') === r.text, `${nm}:.mct 與 cable_pretension.py 逐位元組相同(H = ${[...r.res.values()][0].H.toFixed(3)})`);
  const te = fs.readFileSync(path.join(tmp, 'run_tie_eq.csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1);
  const tj = r.tieEq.map(t => [t.node, 'TIE_EQ', E.fmt(t.F[0]), E.fmt(t.F[1]), E.fmt(t.F[2]), 0, 0, 0].join(','));
  ok(te.join('\n') === tj.join('\n'), `${nm}:TIE_EQ ${tj.length} 列相同`);
}
const chars = fs.readFileSync(path.join(__dirname, 'fonts/chars.txt'), 'utf8');
const need = new Set();
for (const f of ['flow.html', 'flow/app.js', 'flow/engine.js']) for (const ch of fs.readFileSync(path.join(ROOT, f), 'utf8')) if (ch.charCodeAt(0) > 0x7e) need.add(ch);
const miss = [...need].filter(c => !chars.includes(c));
ok(!miss.length, `子集字型涵蓋頁面上的字${miss.length ? '(缺:' + miss.join('') + ';重跑 flow/build_fonts.py)' : ''}`);
console.log(`吊橋助手測試 ${n} 項,失敗 ${fail} 項`);
process.exit(fail ? 1 : 0);
