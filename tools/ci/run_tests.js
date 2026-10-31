// 以 headless Chromium 開 index.html、展開「驗收測試」,有任何一項失敗就以非 0 結束(CI 用)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'));
  await p.waitForTimeout(1000);
  await p.evaluate(() => { document.querySelector('#tests-wrap').open = true; });
  await p.waitForFunction(() => document.querySelectorAll('#tests tr').length > 1, null, { timeout: 60000 });
  const r = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#tests tr')].slice(1);
    return { n: rows.length, fail: rows.filter(t => t.querySelector('td.fail')).map(t => t.textContent.replace(/\s+/g, ' ')) };
  });
  console.log(`驗收測試 ${r.n} 項,失敗 ${r.fail.length} 項`);
  r.fail.forEach(x => console.log('  ✕', x));
  if (errs.length) console.log('頁面錯誤:', errs);
  await b.close();
  process.exit(r.fail.length || errs.length || !r.n ? 1 : 0);
})();
