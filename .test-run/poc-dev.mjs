// POC：vite dev 本地服务器 + 360Chromex，测试编辑器页面能否渲染
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
const PROFILE = path.resolve('.test-run/profile-dev');
const SHOT = path.resolve('.test-run/poc-dev-editor.png');

if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
fs.cpSync('D:/Tools/360Chrome/User Data', PROFILE, { recursive: true });
console.log('[POC-DEV] 已复制 User Data ->', PROFILE);

const context = await chromium.launchPersistentContext(PROFILE, {
  executablePath: EXEC,
  headless: false,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
});
console.log('[POC-DEV] 浏览器已启动');

const page = await context.newPage();
page.on('pageerror', e => console.log('[PAGE ERROR]', e.message));
page.on('console', msg => {
  if (msg.type() === 'error') console.log('[CONSOLE ERROR]', msg.text());
});

const url = 'http://localhost:5173/src/editor.html';
console.log('[POC-DEV] 打开', url);
await page.goto(url, { waitUntil: 'domcontentloaded' });

let ok = false;
try {
  await page.waitForSelector('.toolbar', { timeout: 15000 });
  await page.waitForSelector('#editorContainer', { timeout: 15000 });
  ok = true;
} catch (e) {
  console.log('[POC-DEV] 元素未出现:', e.message);
}

const diag = await page.evaluate(() => ({
  href: location.href,
  readyState: document.readyState,
  bodyLen: document.body ? document.body.innerHTML.length : -1,
  bodyText: document.body ? document.body.textContent.slice(0, 120) : '',
  scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || s.textContent.slice(0, 40)),
  hasChrome: typeof chrome !== 'undefined',
  hasStorage: !!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local),
}));
console.log('[POC-DEV] 诊断:', JSON.stringify(diag, null, 2));

await page.screenshot({ path: SHOT });
console.log('[POC-DEV] 已截图 ->', SHOT, '| ok =', ok);

try { fs.rmSync(PROFILE, { recursive: true, force: true }); }
catch (e) { console.log('[POC-DEV] 清理 profile 失败(可忽略):', e.message); }
await context.close();
process.exit(ok ? 0 : 1);
