// POC：构建产物可被 360Chromex + Playwright 加载并打开编辑器页面
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function resolvePlaywright() {
  let globalRoot;
  try { globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim(); }
  catch { globalRoot = 'D:/Tools/Assembly/nodejs/node_global/node_modules'; }
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch {}
  return req(path.join(globalRoot, 'playwright'));
}
const { chromium } = resolvePlaywright();

const EXEC = 'D:/Tools/360Chrome/360chromex.exe';
const DIST = path.resolve('dist');
const PROFILE = path.resolve('.test-run/profile');
const SHOT = path.resolve('.test-run/poc-editor.png');

// 复制日常 User Data 到项目内副本（复用登录态；不写外部 User Data）
if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
fs.cpSync('D:/Tools/360Chrome/User Data', PROFILE, { recursive: true });
console.log('[POC] 已复制 User Data ->', PROFILE);

const context = await chromium.launchPersistentContext(PROFILE, {
  executablePath: EXEC,
  headless: false,
  args: [
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',
    '--disable-features=StrictOriginIsolation,SitePerProcess',
    `--load-extension=${DIST}`,
  ],
});
console.log('[POC] 浏览器已启动');

const page = await context.newPage();
page.on('pageerror', e => console.log('[PAGE ERROR]', e.message));
page.on('console', msg => {
  if (msg.type() === 'error') console.log('[CONSOLE ERROR]', msg.text());
});
page.on('framenavigated', f => {
  console.log('[NAV]', f.url());
});

// 等待扩展注册：通过 CDP 列举 target，提取 chrome-extension://<id>/
async function findExtId() {
  const client = await context.newCDPSession(page);
  for (let i = 0; i < 15; i++) {
    const { targetInfos } = await client.send('Target.getTargets');
    for (const t of targetInfos || []) {
      const m = t.url.match(/chrome-extension:\/\/([a-p]{32})\//);
      if (m) return m[1];
    }
    await new Promise(r => setTimeout(r, 800));
  }
  return null;
}

await page.goto('chrome://extensions', { waitUntil: 'domcontentloaded' }).catch(() => {});
const extId = await findExtId();
console.log('[POC] 扩展 ID =', extId);

let ok = false;
if (extId) {
  // 测试 A：用 file:// md 触发 content-script / background 拦截
  const sampleMd = path.resolve('.test-run/sample.md');
  fs.writeFileSync(sampleMd, '# Hello MD Editor\n\nThis is a test file.\n');
  const fileUrl = 'file:///' + sampleMd.replace(/\\/g, '/');
  console.log('[POC] 测试 A: 导航到', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  console.log('[POC] 测试 A 最终 URL =', page.url());

  // 测试 B：直接打开 editor.html，诊断 DOM/脚本/chrome API
  const url = `chrome-extension://${extId}/src/editor.html`;
  console.log('[POC] 测试 B: 直接打开', url);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const diag = await page.evaluate(() => ({
    href: location.href,
    readyState: document.readyState,
    bodyLen: document.body ? document.body.innerHTML.length : -1,
    bodyText: document.body ? document.body.textContent.slice(0, 120) : '',
    scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || s.textContent.slice(0, 40)),
    hasChrome: typeof chrome !== 'undefined',
    hasStorage: !!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local),
  }));
  console.log('[POC] 测试 B 诊断:', JSON.stringify(diag, null, 2));

  ok = diag.bodyLen > 100 && (await page.$('.toolbar')) !== null;
  await page.screenshot({ path: SHOT });
  console.log('[POC] 已截图 ->', SHOT);
}

// 清理临时副本（保留 .test-run 下的截图/日志）
try { fs.rmSync(PROFILE, { recursive: true, force: true }); }
catch (e) { console.log('[POC] 清理 profile 失败(可忽略):', e.message); }
await context.close();
console.log('[POC] 结果 ok =', ok, '| 清理临时 profile 完成');
process.exit(ok ? 0 : 1);
