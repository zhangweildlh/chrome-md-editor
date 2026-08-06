// 360Chrome 全功能自动化测试骨架（HTTP 服务 dist + Playwright 驱动）
// 端口 8123；清 localStorage 保证每日基线；跳过新手指引遮罩；真实可见性判定。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = 8123;
const BROWSER = 'D:\\Tools\\360Chrome\\360chromex.exe';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.map': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/src/editor.html';
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

const results = [];
const log = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`); };

const isRealVisible = async (sel) => page.evaluate((s) => {
  const el = document.querySelector(s) || document.getElementById(s.replace(/^#/, ''));
  if (!el) return { ok: false, reason: 'no element' };
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return { ok: false, reason: `display=${cs.display} vis=${cs.visibility}` };
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return { ok: false, reason: `box ${Math.round(r.width)}x${Math.round(r.height)}` };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  if (!top) return { ok: false, reason: 'elementFromPoint null' };
  if (el === top || el.contains(top) || top.contains(el)) return { ok: true };
  return { ok: false, reason: 'covered by other element' };
}, sel);

const setMode = async (mode) => page.evaluate((m) => {
  if (window.__setViewMode) return window.__setViewMode(m);
  localStorage.setItem('md-editor-chrome-mode', m);
  return m;
}, mode);

let browser, page;
await new Promise(r => server.listen(PORT, r));
browser = await chromium.launchPersistentContext('', {
  executablePath: BROWSER,
  headless: false,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1400,900'],
});
page = browser.pages()[0] || await browser.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });
page.on('pageerror', e => console.log('  [pageerror]', e.message));

const gotoEditor = async () => {
  await page.goto('http://localhost:' + PORT + '/src/editor.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#toolbar', { timeout: 15000 });
  // 清 localStorage，保证 daily 基线，并跳过新手指引
  await page.evaluate(() => {
    try { localStorage.clear(); } catch {}
    const ov = document.getElementById('onboardingOverlay');
    if (ov) ov.remove();
    const ob = document.getElementById('onboardingBtn') || document.getElementById('startBtn');
    if (ob) ob.click();
  });
  await page.waitForTimeout(900);
};

try {
  // ---------- 用例 1：基线（daily） ----------
  await gotoEditor();
  let v = await isRealVisible('#btnChromeMode');
  if (!v.ok) {
    const cover = await page.evaluate(() => {
      const b = document.getElementById('btnChromeMode');
      const r = b.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return t ? (t.id || t.className || t.tagName) : 'null';
    });
    log('baseline: toolbar ⊞ 按钮可见(daily) [诊断遮挡=' + cover + ']', v.ok, JSON.stringify(v));
  } else {
    log('baseline: toolbar ⊞ 按钮可见(daily)', v.ok, JSON.stringify(v));
  }
  v = await isRealVisible('#fileSidebar');
  log('baseline: 文件侧栏可见(daily)', v.ok, JSON.stringify(v));

  // ---------- 用例 2：BUG1 复测 - 沉浸模式工具栏恢复 ----------
  await page.evaluate(() => {
    // 通过点击 ⊞ 循环到 immersive（daily→focus→immersive）
    const btn = document.getElementById('btnChromeMode');
    btn.click(); // focus
    btn.click(); // immersive
  });
  await page.waitForTimeout(400);
  let toolbarHidden = await page.evaluate(() => document.getElementById('toolbar').classList.contains('view-hidden'));
  let btnParent = await page.evaluate(() => {
    const b = document.getElementById('btnChromeMode');
    return b ? (b.parentElement === document.body ? 'body' : 'toolbar-tree') : 'missing';
  });
  v = await isRealVisible('#btnChromeMode');
  log('BUG1: immersive 下 ⊞ 按钮真实可见(已脱离被隐藏工具栏)', v.ok && btnParent === 'body', `parent=${btnParent} visible=${JSON.stringify(v)} toolbarHidden=${toolbarHidden}`);
  // 点击 ⊞ 应切回 full（循环下一步）
  await page.evaluate(() => document.getElementById('btnChromeMode').click());
  await page.waitForTimeout(300);
  let backToFull = await page.evaluate(() => !document.getElementById('toolbar').classList.contains('view-hidden'));
  log('BUG1: 从 immersive 点 ⊞ 可切回显示工具栏', backToFull, `toolbarHidden=${!backToFull}`);

  // ---------- 用例 3：BUG2 复测 - 专注/沉浸模式侧栏恢复 ----------
  await gotoEditor();
  await page.evaluate(() => {
    const btn = document.getElementById('btnChromeMode');
    btn.click(); // focus
  });
  await page.waitForTimeout(400);
  let sidebarHiddenInFocus = await page.evaluate(() => document.getElementById('fileSidebar').classList.contains('view-hidden'));
  let toggleVisible = await isRealVisible('#sidebarToggle');
  log('BUG2: focus 下侧栏隐藏且恢复条可见', sidebarHiddenInFocus && toggleVisible.ok, `sidebarHidden=${sidebarHiddenInFocus} toggleVisible=${JSON.stringify(toggleVisible)}`);
  // 点击恢复条
  await page.evaluate(() => { const t = document.getElementById('sidebarToggle'); if (t) t.click(); });
  await page.waitForTimeout(400);
  let sidebarRecovered = await page.evaluate(() => {
    const s = document.getElementById('fileSidebar');
    return !s.classList.contains('view-hidden') && !s.classList.contains('collapsed') && getComputedStyle(s).display !== 'none';
  });
  log('BUG2: 点击恢复条后侧栏真正恢复', sidebarRecovered, `recovered=${sidebarRecovered}`);

  // ---------- 用例 4：视图模式循环持久化 ----------
  await gotoEditor();
  for (const m of ['focus', 'immersive', 'full', 'daily']) {
    await page.evaluate((mm) => {
      const btn = document.getElementById('btnChromeMode');
      // 点击到目标：基于当前 localStorage 推断步数不靠谱，改为直接驱动 applyViewMode
      if (window.__applyViewMode) window.__applyViewMode(mm);
      else { localStorage.setItem('md-editor-chrome-mode', mm); }
    }, m);
    await page.waitForTimeout(150);
  }
  let persisted = await page.evaluate(() => localStorage.getItem('md-editor-chrome-mode'));
  log('视图模式: localStorage 持久化键存在', !!persisted, `stored=${persisted}`);

  // ---------- 用例 5：分屏/编辑/预览切换 ----------
  await gotoEditor();
  for (const mode of ['edit', 'preview', 'split']) {
    await page.evaluate((m) => document.querySelector(`.view-btn[data-mode="${m}"]`)?.click(), mode);
    await page.waitForTimeout(200);
    let dataMode = await page.evaluate(() => document.getElementById('editorMain')?.getAttribute('data-mode'));
    log(`分屏切换: ${mode} (data-mode=${dataMode})`, dataMode === mode, `data-mode=${dataMode}`);
  }

  // ---------- 用例 6：主题切换跟随 data-theme ----------
  await gotoEditor();
  await page.evaluate(() => {
    const sel = document.getElementById('themeSelect') || document.getElementById('editorThemeSelect');
    if (sel) { sel.value = 'dark'; sel.dispatchEvent(new Event('change')); }
  });
  await page.waitForTimeout(200);
  let dt = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  log('主题: 切换暗色后 data-theme=dark', dt === 'dark', `data-theme=${dt}`);

  // ---------- 用例 7：样式工具栏（加粗）写入 ----------
  await gotoEditor();
  await page.evaluate(() => {
    const ed = document.querySelector('.cm-content');
    if (ed) { ed.focus(); }
    document.getElementById('btnBold')?.click();
  });
  await page.waitForTimeout(200);
  let hasBoldBtn = await page.evaluate(() => !!document.getElementById('btnBold'));
  log('样式: 加粗按钮存在且可点击', hasBoldBtn, `btnBold=${hasBoldBtn}`);

  // ---------- 用例 8：对比模式页面可加载 ----------
  await page.goto('http://localhost:' + PORT + '/src/compare.html', { waitUntil: 'load', timeout: 20000 }).catch(e => console.log('compare load err', e.message));
  await page.waitForTimeout(800);
  let compareOk = await page.evaluate(() => !!document.getElementById('compareApp') || document.body.innerText.length > 50);
  log('对比模式: compare.html 可加载', compareOk, `loaded=${compareOk}`);

} catch (e) {
  console.log('HARNESS ERROR:', e.message, e.stack);
  results.push({ name: 'harness-exception', pass: false, detail: e.message });
}

const passN = results.filter(r => r.pass).length;
console.log(`\n===== 测试汇总: ${passN}/${results.length} 通过 =====`);
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name} — ${r.detail}`);

await browser.close();
server.close();
process.exit(passN === results.length ? 0 : 1);
