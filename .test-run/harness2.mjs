// 扩展功能测试骨架（HTTP 服务 dist + 360Chrome）：覆盖工具栏各面板/模式/会话恢复/主题
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve('.', 'dist'); const PORT = 8127;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/src/editor.html'; const fp = path.normalize(path.join(ROOT, p)); if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; } fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); res.end(d); }); });
const results = [];
const log = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${n} | ${d}`); };
const browser = await chromium.launchPersistentContext('', { executablePath: 'D:\\Tools\\360Chrome\\360chromex.exe', headless: false, viewport: { width: 1440, height: 900 }, args: ['--no-sandbox', '--disable-gpu'] });
const page = browser.pages()[0] || await browser.newPage();
page.on('pageerror', e => console.log('  [pageerror]', e.message));
await new Promise(r => server.listen(PORT, r));
const goto = async () => { await page.goto('http://localhost:' + PORT + '/src/editor.html', { waitUntil: 'load', timeout: 30000 }); await page.waitForSelector('#toolbar', { timeout: 15000 }); await page.evaluate(() => { try { localStorage.clear(); } catch {} const ov = document.getElementById('onboardingOverlay'); if (ov) ov.remove(); }); await page.waitForTimeout(900); };
const click = async (id) => page.evaluate((i) => document.getElementById(i)?.click(), id);
const hasClass = (sel, cls) => page.evaluate(([s, c]) => { const e = document.querySelector(s) || document.getElementById(s.replace(/^#/, '')); return e ? e.classList.contains(c) : null; }, [sel, cls]);
const visible = async (sel) => page.evaluate((s) => { const e = document.querySelector(s) || document.getElementById(s.replace(/^#/, '')); if (!e) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden) return false; const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; }, sel);
try {
  await goto();
  // 1. 专注模式
  await click('btnFocusMode'); await page.waitForTimeout(200);
  log('专注模式: 点击后 html 含 focus-mode', await hasClass('html', 'focus-mode'), 'focus-mode=' + await hasClass('html', 'focus-mode'));
  await click('btnFocusMode'); await page.waitForTimeout(150);
  // 1b. 首屏玻璃皮肤（审计 F-01）：init 即挂载 data-skin=glass
  const skin = await page.evaluate(() => document.documentElement.getAttribute('data-skin'));
  log('玻璃皮肤: 首屏 data-skin=glass', skin === 'glass', 'data-skin=' + skin);
  // 2. 打字机模式（状态由 focus-mode.js 写 localStorage 标志驱动，无 CSS 类）
  await click('btnTypewriter'); await page.waitForTimeout(200);
  const twFlag = await page.evaluate(() => localStorage.getItem('md-editor-typewriter'));
  log('打字机模式: 点击后 localStorage 标志=1', twFlag === '1', 'flag=' + twFlag);
  await click('btnTypewriter'); await page.waitForTimeout(150);
  // 3. 大纲面板
  await click('btnOutline'); await page.waitForTimeout(300);
  log('大纲面板: 点击后 #outlinePanel 可见', await visible('#outlinePanel'), 'visible=' + await visible('#outlinePanel'));
  await click('btnOutline'); await page.waitForTimeout(200);
  // 4. 任务面板
  await click('btnTasks'); await page.waitForTimeout(300);
  log('任务面板: 点击后 #taskListPanel 可见', await visible('#taskListPanel'), 'visible=' + await visible('#taskListPanel'));
  await click('btnTasks'); await page.waitForTimeout(200);
  // 5. 显示设置弹窗
  await click('btnDisplaySettings'); await page.waitForTimeout(300);
  const pop = await page.evaluate(() => { const e = document.getElementById('displaySettingsPopover'); return e ? { hidden: e.hidden, vis: getComputedStyle(e).visibility, w: e.getBoundingClientRect().width } : null; });
  log('显示设置: 点击后弹窗可见', !!(pop && !pop.hidden && pop.vis !== 'hidden' && pop.w > 1), JSON.stringify(pop));
  await page.evaluate(() => document.body.click()); await page.waitForTimeout(200);
  // 6. 新建文件
  await click('btnNew'); await page.waitForTimeout(300);
  const empty = await page.evaluate(() => { const c = document.querySelector('.cm-content'); return c ? c.innerText.trim().length : -1; });
  log('新建文件: 点击后编辑器清空', empty === 0, 'contentLen=' + empty);
  // 7. 会话自恢复：输入文本（等防抖 800ms 落 chrome.storage 草稿）→ 重载 → 接受恢复确认
  page.on('dialog', async (d) => { try { await d.accept(); } catch {} });
  await page.evaluate(() => { const c = document.querySelector('.cm-content'); c.focus(); });
  await page.keyboard.type('AUTOSAVE_RESTORE_TEST_12345'); await page.waitForTimeout(1200);
  const draftSaved = await page.evaluate(() => { try { return !!chrome.storage && !!chrome.storage.local; } catch { return false; } });
  await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#toolbar', { timeout: 15000 }); await page.waitForTimeout(1500);
  const restored = await page.evaluate(() => document.querySelector('.cm-content')?.innerText.includes('AUTOSAVE_RESTORE_TEST_12345'));
  log('会话恢复: 重载后文本保留', !!restored, 'restored=' + restored + ' chromeStorage=' + draftSaved);
  // 8. 主题预设切换
  await goto();
  const themeOk = await page.evaluate(() => { const s = document.getElementById('editorThemeSelect'); if (!s || !s.options.length) return 'no-select'; const before = document.documentElement.getAttribute('data-editor-theme'); s.selectedIndex = Math.min(3, s.options.length - 1); s.dispatchEvent(new Event('change')); const after = document.documentElement.getAttribute('data-editor-theme'); return before + '->' + after; });
  log('主题预设: 切换后 data-editor-theme 变化', themeOk.includes('->') && !themeOk.endsWith('->'), themeOk);
  // 9. Mermaid 渲染
  await goto();
  await page.evaluate(() => { const c = document.querySelector('.cm-content'); c.focus(); });
  await page.keyboard.type('```mermaid\n graph TD; A-->B;\n```'); await page.waitForTimeout(1500);
  const mermaid = await page.evaluate(() => !!document.querySelector('#previewContainer svg') || !!document.querySelector('.cm-preview svg, .markdown-body svg'));
  log('Mermaid: 代码块渲染出 SVG', mermaid, 'svg=' + mermaid);
  // 10. 快照对话框
  await goto();
  await click('btnSnapshots'); await page.waitForTimeout(400);
  const snap = await page.evaluate(() => { const d = document.querySelector('.snapshots-dialog, #snapshotsDialog, [class*="snapshot"]'); return d ? { found: true, vis: getComputedStyle(d).visibility, disp: getComputedStyle(d).display } : { found: false }; });
  log('快照对话框: 点击后对话框出现', snap.found && snap.vis !== 'hidden' && snap.disp !== 'none', JSON.stringify(snap));
} catch (e) { console.log('HARNESS2 ERROR:', e.message); results.push({ n: 'exception', ok: false, d: e.message }); }
const passN = results.filter(r => r.ok).length;
console.log(`\n===== 扩展测试汇总: ${passN}/${results.length} 通过 =====`);
await browser.close(); server.close(); process.exit(passN === results.length ? 0 : 1);
