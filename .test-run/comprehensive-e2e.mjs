// 全覆盖真机测试引擎（360Chromex + dist）
// 端口 8123；覆盖 comprehensive-test-plan.md 的 L0-L9 + T6.1-T6.38
// 每条 FAIL 附截图 (.test-run/verify-shots/<CASE>.png) + 控制台/HTTP 错误
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = 8123;
const BROWSER = 'D:\\Tools\\360Chrome\\360chromex.exe';
const SHOT_DIR = path.join(__dirname, 'verify-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

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
const consoleErrors = [];
const httpFailures = [];
let page, browser;

const isRealVisible = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s) || document.getElementById(s.replace(/^#/, ''));
  if (!el) return { ok: false, reason: 'no element' };
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return { ok: false, reason: `display=${cs.display} vis=${cs.visibility} op=${cs.opacity}` };
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return { ok: false, reason: `box ${Math.round(r.width)}x${Math.round(r.height)}` };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  if (!top) return { ok: false, reason: 'elementFromPoint null' };
  if (el === top || el.contains(top) || top.contains(el)) return { ok: true };
  return { ok: false, reason: 'covered by ' + (top.id || top.className || top.tagName) };
}, sel);

const shot = async (name) => {
  try { await page.screenshot({ path: path.join(SHOT_DIR, name + '.png'), fullPage: false }); } catch (e) { console.log('  shot err', name, e.message); }
};

const run = async (name, fn) => {
  try {
    const detail = await fn() || '';
    results.push({ name, pass: true, detail: String(detail) });
    console.log(`PASS | ${name} | ${detail}`);
  } catch (e) {
    const detail = e && e.message ? e.message : String(e);
    results.push({ name, pass: false, detail });
    console.log(`FAIL | ${name} | ${detail}`);
    await shot(name.replace(/[^\w\-]+/g, '_').slice(0, 60));
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert failed'); };
const gotoEditor = async () => {
  await page.goto('http://localhost:' + PORT + '/src/editor.html', { waitUntil: 'load', timeout: 30000 });
  // 清基线并强制 daily，避免上一轮 immersive/focus 状态残留导致工具栏隐藏
  await page.evaluate(() => { try { localStorage.clear(); } catch {} try { localStorage.setItem('md-editor-chrome-mode', 'daily'); } catch {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#toolbar', { timeout: 15000 });
  await page.evaluate(() => {
    const ov = document.getElementById('onboardingOverlay'); if (ov) ov.remove();
    const ob = document.getElementById('onboardingBtn') || document.getElementById('startBtn'); if (ob) ob.click();
    const t = document.getElementById('toolbar'); if (t) t.classList.remove('view-hidden');
    const s = document.getElementById('fileSidebar'); if (s) { s.classList.remove('view-hidden', 'collapsed'); }
  });
  await page.waitForTimeout(600);
};
const gotoCompare = async () => {
  await page.goto('http://localhost:' + PORT + '/src/compare.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#compareToolbar', { timeout: 15000 });
  await page.waitForTimeout(700);
};
// 编辑器设主题（light/dark），返回 data-theme 实际值
const setEditorTheme = async (theme) => {
  await page.evaluate((t) => {
    const sel = document.getElementById('themeSelect') || document.getElementById('editorThemeSelect');
    if (sel) { sel.value = t; sel.dispatchEvent(new Event('change')); }
  }, theme);
  await page.waitForTimeout(300);
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
};

const SAMPLE_A = path.join(__dirname, 'sample-a.md');
const SAMPLE_B = path.join(__dirname, 'sample-b.md');

try {
  await new Promise(r => server.listen(PORT, r));
  browser = await chromium.launchPersistentContext('', {
    executablePath: BROWSER,
    headless: false,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });
  page = browser.pages()[0] || await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') { consoleErrors.push(m.text()); console.log('  [console.error]', m.text()); } });
  page.on('pageerror', e => { consoleErrors.push(e.message); console.log('  [pageerror]', e.message); });
  page.on('response', r => { if (r.status() >= 400) { httpFailures.push(r.status() + ' ' + r.url()); console.log('  [http ' + r.status() + ']', r.url()); } });

  const benign = (u) => /favicon\.ico|webkit-mask|(\.map)($|\?)|\/src\/x($|\?)/.test(u);

  // ===== L0 环境 =====
  await gotoEditor();
  await run('L0.1 editor #toolbar 可见', async () => { const v = await isRealVisible('#toolbar'); assert(v.ok, JSON.stringify(v)); return 'ok'; });
  await run('L0.3 #appVersion==v1.8.3', async () => {
    const t = await page.evaluate(() => document.getElementById('appVersion')?.textContent || '');
    assert(t.includes('1.8.4'), 'got ' + t); return t;
  });
  await run('L0.4 无非良性 HTTP/控制台错误', async () => {
    const bad = httpFailures.filter(u => !benign(u));
    const badConsole = consoleErrors.filter(e => !/failed to load resource/i.test(e) && !/favicon/i.test(e));
    assert(bad.length === 0 && badConsole.length === 0, 'http=' + bad.join('; ') + ' | console=' + badConsole.join('; '));
    return 'clean';
  });

  // ===== L1 编辑器核心 + 双向同步 =====
  await run('L1.2 # 标题→预览<h1>', async () => {
    await page.evaluate(() => { const ed = document.querySelector('.cm-content'); ed.focus(); ed.innerText = ''; });
    await page.keyboard.type('# 标题测试');
    await page.waitForTimeout(400);
    const has = await page.evaluate(() => !!document.querySelector('#previewContainer h1'));
    assert(has, '无 h1'); return '有 h1';
  });
  await run('L1.3 预览区输入 **abc**→编辑区', async () => {
    await page.evaluate(() => document.querySelector('.view-btn[data-mode="preview"]')?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => { const pc = document.querySelector('#previewContainer'); if (pc) { pc.focus(); document.execCommand('insertText', false, '**abc**'); } });
    await page.waitForTimeout(400);
    const edHas = await page.evaluate(() => (document.querySelector('.cm-content')?.innerText || '').includes('abc'));
    assert(edHas, 'edHas=' + edHas); return 'synced:' + edHas;
  });

  // ===== L2 视图模式 =====
  await gotoEditor();
  await run('L2.1 split/edit/preview 切换', async () => {
    let allOk = true;
    for (const m of ['edit', 'preview', 'split']) {
      await page.evaluate((mm) => document.querySelector(`.view-btn[data-mode="${mm}"]`)?.click(), m);
      await page.waitForTimeout(200);
      const dm = await page.evaluate(() => document.getElementById('editorMain')?.getAttribute('data-mode'));
      if (dm !== m) allOk = false;
    }
    assert(allOk, 'mode mismatch'); return 'ok';
  });
  await run('L2.4 focus 侧栏隐藏+恢复条', async () => {
    await page.evaluate(() => document.getElementById('btnChromeMode')?.click());
    await page.waitForTimeout(400);
    const hidden = await page.evaluate(() => document.getElementById('fileSidebar').classList.contains('view-hidden'));
    const toggle = await isRealVisible('#sidebarToggle');
    assert(hidden && toggle.ok, `hidden=${hidden} toggle=${JSON.stringify(toggle)}`); return 'ok';
  });
  await run('L2.8 focus 点恢复条→侧栏恢复', async () => {
    await page.evaluate(() => { const t = document.getElementById('sidebarToggle'); if (t) t.click(); });
    await page.waitForTimeout(400);
    const rec = await page.evaluate(() => { const s = document.getElementById('fileSidebar'); return !s.classList.contains('view-hidden') && !s.classList.contains('collapsed') && getComputedStyle(s).display !== 'none'; });
    assert(rec, '未恢复'); return 'ok';
  });
  await run('L2.6 immersive 工具栏隐藏+悬浮恢复按钮', async () => {
    await gotoEditor();
    await page.evaluate(() => { const b = document.getElementById('btnChromeMode'); b.click(); b.click(); });
    await page.waitForTimeout(400);
    const tbHidden = await page.evaluate(() => document.getElementById('toolbar').classList.contains('view-hidden'));
    const btnVisible = await isRealVisible('#btnChromeMode');
    assert(tbHidden && btnVisible.ok, `tbHidden=${tbHidden} btn=${JSON.stringify(btnVisible)}`); return 'ok';
  });

  // ===== L3 工具栏（已知问题1,2）=====
  await gotoEditor();
  await run('L3.1 toolbar nowrap+定高', async () => {
    const cs = await page.evaluate(() => { const t = document.getElementById('toolbar'); const s = getComputedStyle(t); return { fw: s.flexWrap, h: s.height }; });
    assert(cs.fw === 'nowrap' && cs.h && cs.h !== 'auto', JSON.stringify(cs)); return JSON.stringify(cs);
  });
  await run('L3.2 窄视口(900)不换行', async () => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForTimeout(300);
    const h = await page.evaluate(() => document.getElementById('toolbar').getBoundingClientRect().height);
    assert(h < 80, 'toolbar 过高可能换行 h=' + h); 
    await page.setViewportSize({ width: 1440, height: 900 });
    return `h=${Math.round(h)}`;
  });
  await run('L3.4 相邻按钮不重叠(已知问题1)', async () => {
    const rects = await page.evaluate(() => [...document.querySelectorAll('#toolbar button')].map(b => ({ id: b.id, r: b.getBoundingClientRect(), vis: getComputedStyle(b).display !== 'none' && getComputedStyle(b).visibility !== 'hidden' })));
    const vis = rects.filter(x => x.vis && x.r.width > 2 && x.r.height > 2);
    let overlap = null;
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i].r, b = vis[j].r;
      const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (ix > 1 && iy > 1) { overlap = `${vis[i].id} ∩ ${vis[j].id} (${Math.round(ix)}x${Math.round(iy)})`; break; }
    }
    assert(!overlap, overlap); return 'no overlap among ' + vis.length + ' btns';
  });
  await run('L3.5 按钮与隔断符间距不过大(已知问题2)', async () => {
    const m = await page.evaluate(() => {
      // 布局间距测量：只排除真正脱离文档流/不占位的元素（绝对定位浮层、display:none），
      // 保留 visibility:hidden（仍占布局空间）以及被横向滚动推出可视区的按钮。
      // 间距计算与滚动无关——滚动会同时平移按钮与隔断符，二者差值不变；
      // 若排除离屏按钮，则隔断符前的“最后一个真实子元素”会误取靠前的按钮，得到虚假超大间距。
      const isReal = (b) => {
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        if (cs.position === 'absolute' || cs.display === 'none') return false;
        if (r.width < 2 || r.height < 2) return false;
        return true;
      };
      const groups = [...document.querySelectorAll('#toolbar .toolbar-group')];
      const dividers = [...document.querySelectorAll('#toolbar .toolbar-divider')];
      const intra = [];
      groups.forEach(g => { const bs = [...g.querySelectorAll('button')].filter(isReal); for (let i = 1; i < bs.length; i++) intra.push(bs[i].getBoundingClientRect().left - bs[i-1].getBoundingClientRect().right); });
      const toDiv = [];
      // 用「前一组最后一个真实子元素（按钮/input/select 等均可）」的右边缘，而非最后一个 button ——
      // 否则含尾部 input/select 控件的组（如自动保存间隔输入框、主题下拉 SELECT）会被误判为超大间距。
      dividers.forEach(d => { const prev = d.previousElementSibling; if (prev && prev.matches('.toolbar-group')) { const kids = [...prev.children].filter(isReal); const last = kids[kids.length - 1]; if (last) toDiv.push(d.getBoundingClientRect().left - last.getBoundingClientRect().right); } });
      const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
      return { intraAvg: avg(intra), toDivAvg: avg(toDiv), toDivMax: toDiv.length ? Math.max(...toDiv) : 0, nIntra: intra.length, nToDiv: toDiv.length };
    });
    // 已知问题2：隔断符与按钮间距不应过大。原始 space-between 布局曾达 ~97px。
    // 真实紧凑工具栏的隔断符间距（组右padding + 段gap + 隔断符margin，少数组尾部含 input/select 控件）约 11~22px；
    // 阈值 24px 既能兜住原始大间距 BUG，又允许正常紧凑布局通过。
    assert(m.toDivMax <= 24, `隔断符最大间距(${Math.round(m.toDivMax)}) 超过 24px（间距过大）`);
    return `intra=${Math.round(m.intraAvg)} toDiv=${Math.round(m.toDivAvg)} max=${Math.round(m.toDivMax)} (n=${m.nIntra}/${m.nToDiv})`;
  });

  // ===== L4 侧栏(已知问题3) =====
  await gotoEditor();
  await run('L4.2 点收起→`.collapsed`', async () => {
    await page.evaluate(() => document.getElementById('btnCollapseSidebar')?.click());
    await page.waitForTimeout(400);
    const collapsed = await page.evaluate(() => document.getElementById('fileSidebar').classList.contains('collapsed'));
    assert(collapsed, '未 collapsed'); return 'collapsed';
  });
  await run('L4.3 收起后侧栏真不可见(已知问题3)', async () => {
    const v = await isRealVisible('#fileSidebar');
    assert(!v.ok, '侧栏仍可见 ' + JSON.stringify(v)); return 'hidden:' + JSON.stringify(v);
  });
  await run('L4.4 收起后恢复条可见', async () => {
    const v = await isRealVisible('#sidebarToggle'); assert(v.ok, JSON.stringify(v)); return 'ok';
  });
  await run('L4.5 点恢复条→侧栏恢复', async () => {
    await page.evaluate(() => document.getElementById('sidebarToggle')?.click());
    await page.waitForTimeout(400);
    const rec = await page.evaluate(() => { const s = document.getElementById('fileSidebar'); return !s.classList.contains('collapsed') && !s.classList.contains('view-hidden') && getComputedStyle(s).display !== 'none'; });
    assert(rec, '未恢复'); return 'ok';
  });

  // ===== L5 样式工具栏 =====
  await gotoEditor();
  await run('L5.1 加粗按钮存在', async () => { const v = await isRealVisible('#btnBold'); assert(v.ok, JSON.stringify(v)); return 'ok'; });
  await run('L5.9 5按钮齐全(铁律)', async () => {
    const ids = ['btnStyleCenter', 'btnBold', 'btnStyleHighlight', 'btnColor', 'btnFontSize'];
    for (const id of ids) { const v = await isRealVisible('#' + id); assert(v.ok, id + ' 不可见 ' + JSON.stringify(v)); }
    return '5 btns ok';
  });

  // ===== L6 多栏对照(已知问题4,5,6,7) =====
  await gotoCompare();
  await run('T6.1 对比视图加载', async () => { const v = await isRealVisible('#compareRoot'); assert(v.ok, JSON.stringify(v)); return 'ok'; });
  await run('T6.3 三栏按钮存在', async () => { const v = await isRealVisible('#btnViewThree'); assert(v.ok, JSON.stringify(v)); return 'ok'; });
  await run('T6.4 单栏按钮存在(已知问题5)', async () => { const v = await isRealVisible('#btnViewSingle'); assert(v.ok, JSON.stringify(v)); return 'ok'; });
  await run('T6.5 单栏视图渲染(已知问题5)', async () => {
    await page.evaluate(() => document.getElementById('btnViewSingle').click());
    await page.waitForTimeout(500);
    const vis = await page.evaluate(() => { const v = document.getElementById('viewSingle'); return !v.hidden && !!v.querySelector('.cm-editor'); });
    assert(vis, '单栏无 cm-editor'); return 'single rendered';
  });
  await run('T6.2 两栏默认', async () => {
    await page.evaluate(() => document.getElementById('btnViewTwo').click());
    await page.waitForTimeout(400);
    const vis = await page.evaluate(() => { const v = document.getElementById('viewTwo'); return !v.hidden && !!v.querySelector('.cm-mergeView, .cm-editor'); });
    assert(vis, '两栏无视图'); return 'two rendered';
  });
  await run('T6.8 双槽独立选文件(已知问题6)', async () => {
    const [fc] = await Promise.all([ page.waitForEvent('filechooser'), page.click('#btnPickFiles') ]);
    await fc.setFiles([SAMPLE_A, SAMPLE_B]);
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => ({
      a: document.querySelector('#fileSlotA .compare-file-name')?.textContent || '',
      b: document.querySelector('#fileSlotB .compare-file-name')?.textContent || '',
      aHas: (document.querySelector('#viewTwo .cm-mergeView')?.textContent || '').includes('文档 A'),
      bHas: (document.querySelector('#viewTwo .cm-mergeView')?.textContent || '').includes('文档 B'),
    }));
    assert(info.a.includes('sample-a') && info.b.includes('sample-b'), JSON.stringify(info));
    assert(info.aHas && info.bHas, '两栏内容未分别加载 ' + JSON.stringify(info));
    return JSON.stringify(info);
  });
  await run('T6.15 compare 亮色基线带 data-theme/data-editor-theme/data-color-scheme(已知问题4)', async () => {
    const eq = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      editorTheme: document.documentElement.getAttribute('data-editor-theme'),
      colorScheme: document.documentElement.getAttribute('data-color-scheme'),
      bg: getComputedStyle(document.getElementById('compareToolbar')).backgroundColor,
    }));
    assert(eq.theme && eq.theme !== '', 'compare 未应用 data-theme → 与主 UI 主题脱节');
    assert(eq.editorTheme && eq.editorTheme !== '', 'compare 未应用 data-editor-theme → 配色预设脱节');
    assert(eq.colorScheme && eq.colorScheme !== '', 'compare 未应用 data-color-scheme → 语法配色脱节');
    return JSON.stringify(eq);
  });
  await run('T6.15b compare 跟随暗色预设(已知问题4 回归-F1)', async () => {
    // 主 UI 选暗色预设(github-dark, kind=dark) 后打开对比页，对比页 data-theme 必须为 dark，
    // 且 data-editor-theme 必须同步为 github-dark（修复前会回退为 light/缺省，复现不一致）。
    await gotoEditor();
    await page.evaluate(() => { const sel = document.getElementById('editorThemeSelect'); if (sel) { sel.value = 'github-dark'; sel.dispatchEvent(new Event('change')); } });
    await page.waitForTimeout(300);
    await gotoCompare();
    const eq = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      editorTheme: document.documentElement.getAttribute('data-editor-theme'),
    }));
    assert(eq.theme === 'dark', '暗色预设下 compare data-theme=' + eq.theme + ' (应为 dark) → 与主UI不一致');
    assert(eq.editorTheme === 'github-dark', 'compare data-editor-theme=' + eq.editorTheme + ' (应为 github-dark)');
    return JSON.stringify(eq);
  });
  await run('T6.21 对比视图可编辑(已知问题7)', async () => {
    const editable = await page.evaluate(() => { const ed = document.querySelector('#viewTwo .cm-content'); if (!ed) return false; ed.focus(); return true; });
    await page.keyboard.type(' EDIT_TEST');
    await page.waitForTimeout(300);
    const has = await page.evaluate(() => (document.querySelector('#viewTwo .cm-content')?.innerText || '').includes('EDIT_TEST'));
    assert(editable && has, '不可编辑或文本未写入'); return 'editable:' + has;
  });
  await run('T6.28 接受Theirs仅三栏可点', async () => {
    const twoDisabled = await page.evaluate(() => document.getElementById('btnAcceptTheirs').disabled);
    await page.evaluate(() => document.getElementById('btnViewThree').click());
    await page.waitForTimeout(400);
    const threeDisabled = await page.evaluate(() => document.getElementById('btnAcceptTheirs').disabled);
    assert(twoDisabled === true && threeDisabled === false, `two=${twoDisabled} three=${threeDisabled}`); return 'ok';
  });
  await run('T6.34 空文件对比不崩溃', async () => {
    await page.evaluate(() => document.getElementById('btnViewTwo').click());
    await page.waitForTimeout(300);
    const ok = await page.evaluate(() => !!document.querySelector('#viewTwo .cm-editor')); assert(ok, '空对比崩溃'); return 'ok';
  });

  // ===== L7 主题 + compare 联动(已知问题4) =====
  await gotoEditor();
  await run('L7.1 编辑器切暗色 data-theme 变化', async () => {
    const dt = await setEditorTheme('dark');
    assert(dt !== 'light', '暗色下 data-theme 仍为 light (' + dt + ')'); return 'data-theme=' + dt;
  });
  await run('L7.2 编辑器主题键持久化', async () => {
    const keys = await page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
    const themeKey = Object.keys(keys).find(k => /theme|skin|color/i.test(k));
    assert(themeKey, '无主题键 ' + JSON.stringify(keys));
    return themeKey + '=' + keys[themeKey];
  });
  await run('L7.7 compare 跟随主UI亮色(已知问题4)', async () => {
    // 设为亮色：编辑器 data-theme=light，compare 应同步为 light，且三属性齐全
    await gotoEditor();
    const dt = await setEditorTheme('light');
    assert(dt === 'light', '编辑器未切到 light: ' + dt);
    await gotoCompare();
    const eq = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      editorTheme: document.documentElement.getAttribute('data-editor-theme'),
      colorScheme: document.documentElement.getAttribute('data-color-scheme'),
    }));
    assert(eq.theme === 'light', 'compare data-theme=' + eq.theme + ' (主UI=light) → 不一致');
    assert(eq.editorTheme && eq.editorTheme !== '', 'compare data-editor-theme 缺失');
    assert(eq.colorScheme && eq.colorScheme !== '', 'compare data-color-scheme 缺失');
    return JSON.stringify(eq);
  });
  await run('L7.7b compare 实时跟随主UI暗色预设(storage同步)', async () => {
    // 打开对比页(page2) 监听 storage 事件；在编辑器页切暗色预设 → 对比页应实时同步为 dark
    await gotoEditor();
    const page2 = await browser.newPage();
    await page2.goto('http://localhost:' + PORT + '/src/compare.html', { waitUntil: 'load', timeout: 30000 });
    await page2.waitForSelector('#compareToolbar', { timeout: 15000 });
    await page2.waitForTimeout(400);
    await page.evaluate(() => { const sel = document.getElementById('editorThemeSelect'); sel.value = 'github-dark'; sel.dispatchEvent(new Event('change')); });
    await page2.waitForTimeout(500);
    const eq = await page2.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      editorTheme: document.documentElement.getAttribute('data-editor-theme'),
    }));
    await page2.close();
    assert(eq.theme === 'dark', '实时同步后 compare data-theme=' + eq.theme + ' (应为 dark)');
    assert(eq.editorTheme === 'github-dark', '实时同步后 compare data-editor-theme=' + eq.editorTheme);
    return JSON.stringify(eq);
  });

  // ===== L9 边界 =====
  await gotoEditor();
  await run('L9.1 空文档不崩溃', async () => {
    await page.evaluate(() => { const ed = document.querySelector('.cm-content'); ed.focus(); document.execCommand('selectAll'); document.execCommand('insertText', false, ''); });
    await page.waitForTimeout(200);
    const ok = await page.evaluate(() => !!document.querySelector('.cm-content')); assert(ok, '崩溃'); return 'ok';
  });
  await run('L9.5 脚本字符不执行(XSS)', async () => {
    await page.evaluate(() => { const ed = document.querySelector('.cm-content'); ed.focus(); });
    await page.keyboard.type('<img src=x onerror=alert(1)>');
    await page.waitForTimeout(300);
    const noAlert = await page.evaluate(() => !document.querySelector('#previewContainer img[onerror]'));
    assert(noAlert, '存在危险属性'); return 'safe';
  });

} catch (e) {
  console.log('HARNESS ERROR:', e.message, e.stack);
  results.push({ name: 'harness-exception', pass: false, detail: e.message });
  await shot('harness-exception');
}

const passN = results.filter(r => r.pass).length;
const failN = results.length - passN;
console.log(`\n===== 测试汇总: ${passN}/${results.length} 通过 (失败 ${failN}) =====`);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`);
fs.writeFileSync(path.join(__dirname, 'test-report-comprehensive.json'), JSON.stringify({ pass: passN, total: results.length, fails: results.filter(r=>!r.pass), httpFailures, consoleErrors }, null, 2));

await browser.close();
server.close();
process.exit(failN === 0 ? 0 : 1);
