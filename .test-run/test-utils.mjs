// Chrome-Markdown-Edit Playwright/360Chromex 测试公共模块
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
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

export const EXEC = 'D:/Tools/360Chrome/360chromex.exe';
export const USER_DATA_SOURCE = 'D:/Tools/360Chrome/User Data';
export const DIST = path.resolve('dist');
export const TEST_RUN = path.resolve('.test-run');
export const SCREENSHOTS = path.join(TEST_RUN, 'screenshots');
export const LOGS = path.join(TEST_RUN, 'logs');
export const BUGS_FILE = path.join(TEST_RUN, 'BUGS.md');

if (!fs.existsSync(SCREENSHOTS)) fs.mkdirSync(SCREENSHOTS, { recursive: true });
if (!fs.existsSync(LOGS)) fs.mkdirSync(LOGS, { recursive: true });

let previewProc = null;
let browserCtx = null;
let activeProfile = null;
const consoleBuffer = [];

// ==================== Preview Server ====================
export async function startPreview() {
  const pidFile = path.join(TEST_RUN, 'preview.pid');
  if (fs.existsSync(pidFile)) {
    const oldPid = fs.readFileSync(pidFile, 'utf8').trim();
    try { process.kill(Number(oldPid)); } catch {}
    fs.rmSync(pidFile, { force: true });
  }

  return new Promise((resolve, reject) => {
    previewProc = spawn(
      'node',
      [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', '5173', '--strictPort'],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
    );
    previewProc.stdout.on('data', d => fs.appendFileSync(path.join(LOGS, 'preview.log'), d));
    previewProc.stderr.on('data', d => fs.appendFileSync(path.join(LOGS, 'preview.log'), d));
    fs.writeFileSync(pidFile, String(previewProc.pid));

    let settled = false;
    const check = async () => {
      try {
        const res = await fetch('http://localhost:5173/src/editor.html');
        if (res.status === 200 && !settled) { settled = true; resolve(); }
      } catch {}
    };
    const timer = setInterval(check, 500);
    setTimeout(() => {
      if (!settled) { settled = true; clearInterval(timer); reject(new Error('vite preview 启动超时')); }
    }, 20000);
    check();
  });
}

export async function stopPreview() {
  if (previewProc) {
    previewProc.kill();
    await new Promise(r => setTimeout(r, 1000));
    previewProc = null;
  }
  const pidFile = path.join(TEST_RUN, 'preview.pid');
  if (fs.existsSync(pidFile)) fs.rmSync(pidFile, { force: true });
}

// ==================== Browser ====================
export async function launchBrowser(profileName = 'profile') {
  activeProfile = path.join(TEST_RUN, profileName);
  if (fs.existsSync(activeProfile)) {
    try { fs.rmSync(activeProfile, { recursive: true, force: true }); }
    catch {
      // 若旧 profile 仍被浏览器进程占用，换用时间戳目录避免冲突
      activeProfile = path.join(TEST_RUN, `${profileName}-${Date.now()}`);
    }
  }
  fs.cpSync(USER_DATA_SOURCE, activeProfile, { recursive: true });

  browserCtx = await chromium.launchPersistentContext(activeProfile, {
    executablePath: EXEC,
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  return browserCtx;
}

export async function closeBrowser() {
  if (browserCtx) { await browserCtx.close(); browserCtx = null; }
  if (activeProfile) {
    try { fs.rmSync(activeProfile, { recursive: true, force: true }); }
    catch {}
    activeProfile = null;
  }
}

export async function withBrowser(fn, profileName = 'profile') {
  const ctx = await launchBrowser(profileName);
  try { return await fn(ctx); }
  finally { await closeBrowser(); }
}

// ==================== Page helpers ====================
export function attachListeners(page) {
  page.on('pageerror', e => consoleBuffer.push({ type: 'pageerror', text: e.message, t: Date.now() }));
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      consoleBuffer.push({ type, text: msg.text(), t: Date.now() });
    }
  });
  page.on('requestfailed', req => {
    consoleBuffer.push({ type: 'network-fail', text: `${req.method()} ${req.url()}`, t: Date.now() });
  });
}

export function clearConsoleBuffer() { consoleBuffer.length = 0; }
export function getConsoleBuffer() { return consoleBuffer.slice(); }

// 关闭新手引导遮罩。优先点击「先空白开始 / 关闭说明」按钮；
// 若按钮点击因指针拦截失败，则直接移除遮罩节点作为兜底。
export async function dismissOnboarding(page) {
  const el = await page.$('#onboardingOverlay');
  if (!el) return false;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) return false;
  const clicked = await page
    .click('[data-action="close-empty"], [data-action="close"]', { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) {
    await page.evaluate(() => {
      const node = document.getElementById('onboardingOverlay');
      if (node) node.remove();
    });
  }
  await page.waitForTimeout(150);
  return true;
}

export async function openEditor(context, query = '', opts = {}) {
  const { dismissOnboarding: dismiss = true } = opts;
  const page = await context.newPage();
  attachListeners(page);
  await page.goto(`http://localhost:5173/src/editor.html${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cm-editor', { timeout: 15000 });
  if (dismiss) await dismissOnboarding(page);
  return page;
}

export async function openCompare(context) {
  const page = await context.newPage();
  attachListeners(page);
  await page.goto('http://localhost:5173/src/compare.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.compare-root, #compareApp, body', { timeout: 15000 });
  return page;
}

// 用例间 UI 状态清理：关闭所有可能残留的弹窗/侧栏/模态，避免相互遮挡污染断言。
export async function resetUI(page) {
  await page.evaluate(() => {
    // 关闭弹层（hidden 属性类）
    const popovers = ['#colorPopover', '#fontSizePopover', '#displaySettingsPopover'];
    for (const sel of popovers) {
      const el = document.querySelector(sel);
      if (el) el.hidden = true;
    }
    // 关闭模态（hidden 属性类）
    const modals = ['#translateSettingsModal', '#snapshotsDialog'];
    for (const sel of modals) {
      const el = document.querySelector(sel);
      if (el) el.hidden = true;
    }
    // 关闭侧栏面板（.open class 类）
    const panels = ['#outlinePanel', '#taskListPanel'];
    for (const sel of panels) {
      const el = document.querySelector(sel);
      if (el) el.classList.remove('open');
    }
    // 取消 focus / typewriter / 主题等 body/html class 状态（通过再次点击按钮复位）
    const toggles = ['#btnFocusMode', '#btnTypewriter'];
    for (const sel of toggles) {
      const btn = document.querySelector(sel);
      if (btn && btn.classList.contains('active')) btn.click();
    }
    document.documentElement.classList.remove('focus-mode', 'typewriter-mode');
    // 关闭 CM 搜索面板
    const closeBtn = document.querySelector('.cm-search .cm-button[name="close"], .cm-panels .cm-search .cm-button');
    if (closeBtn) closeBtn.click();
  });
  await page.waitForTimeout(150);
}

// ==================== Editor operations ====================
// 通过键盘注入（先聚焦 .cm-content），验证项已确认在 360Chromex 下可用。
export async function setEditorText(page, text) {
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
  // 等待 CodeMirror 渲染稳定
  await page.waitForTimeout(200);
}

export async function getEditorText(page) {
  return page.$$eval('.cm-line', lines => lines.map(l => l.textContent).join('\n'));
}

// 选中编辑区全部内容（键盘方式，避免焦点竞争）
export async function selectAll(page) {
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(120);
}

// 把光标置于文档末尾（点击 .cm-content 末尾并 End）
export async function moveCursorEnd(page) {
  await page.click('.cm-content');
  await page.keyboard.press('End');
  await page.waitForTimeout(120);
}

export async function getPreviewHTML(page) {
  return page.$eval('#previewContainer', el => el.innerHTML);
}

export async function getPreviewText(page) {
  return page.$eval('#previewContainer', el => el.textContent);
}

export async function clickToolbar(page, id) {
  const sel = id.startsWith('#') ? id : `#${id}`;
  await page.click(sel);
  await page.waitForTimeout(150);
}

export async function isVisible(page, selector) {
  const el = await page.$(selector);
  if (!el) return false;
  return el.isVisible();
}

// ==================== Screenshot / Logs / Bugs ====================
export async function screenshot(page, name) {
  const file = path.join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

export function writeLog(name, data) {
  const file = path.join(LOGS, `${name}.log`);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return file;
}

export function recordBug({ id, feature, caseName, symptom, steps, screenshots = [], consoleErrors = [] }) {
  const now = new Date().toISOString();
  const entry = `
## BUG-${id} — ${feature} / ${caseName}
- **发现时间**: ${now}
- **现象**: ${symptom}
- **复现步骤**: ${steps}
- **截图**: ${screenshots.join(', ') || '无'}
- **控制台错误**:
${consoleErrors.map(e => `  - [${e.type}] ${e.text}`).join('\n') || '  无'}
- **状态**: 待修复

`;
  fs.appendFileSync(BUGS_FILE, entry);
  console.log(`[BUG 记录] BUG-${id}: ${feature} / ${caseName}`);
}

export function ensureBugsHeader() {
  if (!fs.existsSync(BUGS_FILE)) {
    fs.writeFileSync(BUGS_FILE, '# 测试确认的 BUG 清单\n\n');
  }
}

// ==================== Assertions ====================
export function assert(condition, message) {
  if (!condition) throw new Error(`断言失败: ${message}`);
}

export async function expectVisible(page, selector, message) {
  const visible = await isVisible(page, selector);
  assert(visible, message || `${selector} 应可见`);
}
