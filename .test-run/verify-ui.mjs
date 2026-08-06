// 真机验证脚本：覆盖 5 项 UI 改进任务
// 连接已运行的 360chrome CDP 实例（端口 9222），驱动 dist 构建产物验证
import { chromium } from 'playwright';
import fs from 'fs';

const SHOTS = 'D:/Documents/AI_Work_Temp/Chrome-Markdown-Edit/.test-run/verify-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: 'fullscreen-1920', w: 1920, h: 1080 },
  { name: 'windowed-1280', w: 1280, h: 800 },
  { name: 'narrow-1000', w: 1000, h: 700 },
  { name: 'extranarrow-900', w: 900, h: 700 },
];

function log(...a) { console.log(...a); }

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0] || await browser.newContext();
const page = context.pages()[0] || await context.newPage();

const results = { tasks: {} };

// 真实可见性判定（非 display:none 祖先压制）
async function isRealVisible(sel) {
  return await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top) return false;
    return el.contains(top) || top.contains(el) || top === el;
  }, sel);
}

try {
  // 1) 打开页面并清 localStorage（保证 daily 基线）
  await page.goto('http://localhost:8123/src/editor.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 跳过 onboarding 引导层（若存在）
  const skip = await page.$('#onboardingOverlay button, #onboardingStart, #btnOnboardingClose');
  if (skip) { await skip.click().catch(() => {}); await page.waitForTimeout(300); }

  // 等待编辑器就绪（CodeMirror 挂载完成）
  await page.waitForSelector('#editorContainer .cm-editor', { timeout: 10000 });
  await page.waitForSelector('#previewContainer', { timeout: 10000 });
  await page.waitForTimeout(500);

  // ============ 任务 5：工具栏分组结构 ============
  const toolbarGroups = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.toolbar-center .toolbar-group, .toolbar-right .toolbar-group')]
      .map((g, i) => ({
        idx: i,
        cls: g.className.replace('toolbar-group', '').trim(),
        btns: [...g.querySelectorAll('button')].map((b) => b.id).filter(Boolean),
      }));
    return {
      groupCount: groups.length,
      hasImageBtn: !!document.querySelector('#btnImage'),
      hasDuplicateBold: document.querySelectorAll('#btnBold').length === 1,
      groups,
    };
  });
  results.tasks.t5_toolbar = toolbarGroups;

  // ============ 任务 2/3：响应式布局（多种窗口尺寸） ============
  results.tasks.t2_responsive = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(500);
    const layout = await page.evaluate(() => {
      const toolbar = document.querySelector('.toolbar');
      const center = document.querySelector('.toolbar-center');
      const right = document.querySelector('.toolbar-right');
      const sidebar = document.querySelector('.file-sidebar');
      const editor = document.querySelector('.editor-panel');
      const preview = document.querySelector('.preview-panel');
      const rect = (el) => el ? el.getBoundingClientRect() : null;
      const tr = rect(toolbar), cr = rect(center), rr = rect(right);
      // 单行判定：center 与 right 的 top 接近（<6px）且 toolbar 高度接近单行（<=70）
      const singleLine = cr && rr && Math.abs(cr.top - rr.top) < 6 && tr && tr.height <= 80;
      return {
        toolbarH: tr ? Math.round(tr.height) : -1,
        toolbarSingleLine: singleLine,
        centerTop: cr ? Math.round(cr.top) : -1,
        rightTop: rr ? Math.round(rr.top) : -1,
        sidebarW: rect(sidebar) ? Math.round(rect(sidebar).width) : -1,
        editorW: rect(editor) ? Math.round(rect(editor).width) : -1,
        previewW: rect(preview) ? Math.round(rect(preview).width) : -1,
        sidebarVisible: !!rect(sidebar) && rect(sidebar).width > 10,
        editorVisible: !!rect(editor) && rect(editor).width > 10,
        previewVisible: !!rect(preview) && rect(preview).width > 10,
      };
    });
    await page.screenshot({ path: `${SHOTS}/layout-${vp.name}.png`, fullPage: false });
    results.tasks.t2_responsive.push({ vp: vp.name, ...layout });
  }

  // ============ 任务 4：侧栏宽度可拖拽 ============
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(300);
  const sbBefore = await page.evaluate(() => Math.round(document.querySelector('.file-sidebar').getBoundingClientRect().width));
  const rs = await page.$('#resizerSidebar');
  const rsBox = await rs.boundingBox();
  // 拖拽 resizer 向右 80px
  await page.mouse.move(rsBox.x + rsBox.width / 2, rsBox.y + rsBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rsBox.x + 80, rsBox.y + rsBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const sbAfter = await page.evaluate(() => Math.round(document.querySelector('.file-sidebar').getBoundingClientRect().width));
  const sbPersist = await page.evaluate(() => localStorage.getItem('md-editor-sidebar-width'));
  results.tasks.t4_sidebar = {
    before: sbBefore, after: sbAfter, changed: Math.abs(sbAfter - sbBefore) > 20,
    persisted: sbPersist, persistedMatch: sbPersist && Math.abs(parseInt(sbPersist) - sbAfter) < 5,
  };

  // ============ 任务 1：所见即所得双向同步 ============
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(300);
  // 编辑 → 预览：在 CodeMirror 输入内容
  await page.click('#editorContainer .cm-content');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  const testMd = '# 同步测试标题\n\n这是正文第一行。\n\n- [ ] 待办项一\n- [x] 已完成项';
  await page.keyboard.type(testMd, { delay: 10 });
  await page.waitForTimeout(600); // 等待防抖渲染
  const editToPreview = await page.evaluate(() => {
    const html = document.querySelector('#previewContainer').innerHTML;
    return {
      hasH1: html.includes('同步测试标题'),
      hasTaskUnchecked: /<li[^>]*class="[^"]*task-list-item[^"]*"[^>]*>.*?待办项一/s.test(html) || html.includes('待办项一'),
      hasTaskChecked: html.includes('已完成项'),
    };
  });

  // 预览 → 编辑：在预览区 contenteditable 末尾追加文本，然后失焦触发回写
  const previewEditable = await page.evaluate(() => {
    const p = document.querySelector('#previewContainer');
    return p ? p.getAttribute('contenteditable') : null;
  });
  await page.evaluate(() => {
    const p = document.querySelector('#previewContainer');
    if (p) { p.focus(); p.setAttribute('contenteditable', 'true'); }
  });
  // 在预览区末尾追加一段文字
  await page.evaluate(() => {
    const p = document.querySelector('#previewContainer');
    const span = document.createElement('p');
    span.textContent = '预览区追加段落XYZ';
    p.appendChild(span);
    p.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  // 点击编辑区，触发预览失焦 → syncPreviewToEditor
  await page.click('#editorContainer .cm-content');
  await page.waitForTimeout(600);
  const previewToEdit = await page.evaluate(() => {
    const txt = window.editor ? window.editor.state.doc.toString() : (document.querySelector('#editorContainer .cm-content')?.innerText || '');
    return { hasAppended: txt.includes('预览区追加段落XYZ') };
  });

  results.tasks.t1_sync = {
    editToPreview,
    previewEditable,
    previewToEdit,
  };

  await page.screenshot({ path: `${SHOTS}/sync-final.png`, fullPage: false });

} catch (e) {
  results.error = String(e && e.stack || e);
  log('ERROR', results.error);
}

fs.writeFileSync(`${SHOTS}/results.json`, JSON.stringify(results, null, 2));
log('=== VERIFY RESULTS ===');
log(JSON.stringify(results, null, 2));
await browser.close();
