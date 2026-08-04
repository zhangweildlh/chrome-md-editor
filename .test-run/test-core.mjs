import * as u from './test-utils.mjs';

export const name = '核心编辑与预览';

async function E01_init(page) {
  await u.expectVisible(page, '.toolbar', '工具栏应可见');
  await u.expectVisible(page, '#editorContainer', '编辑区应可见');
  await u.expectVisible(page, '#previewContainer', '预览区应可见');
  await u.expectVisible(page, '#statusbar', '状态栏应可见');
  await u.screenshot(page, 'E01-init');
  return { id: 'E01', ok: true };
}

async function E02_viewModes(page) {
  // 默认分屏，两个区都应可见
  await u.expectVisible(page, '#editorPanel', '分屏下编辑区应可见');
  await u.expectVisible(page, '#previewPanel', '分屏下预览区应可见');

  await u.clickToolbar(page, 'btnViewEdit');
  await page.waitForTimeout(400);
  const previewHidden = await page.$eval('#previewPanel', el => el.offsetParent === null);
  await u.assert(previewHidden, '纯编辑模式下预览区应隐藏');
  await u.screenshot(page, 'E02-edit');

  await u.clickToolbar(page, 'btnViewPreview');
  await page.waitForTimeout(400);
  const editorHidden = await page.$eval('#editorPanel', el => el.offsetParent === null);
  await u.assert(editorHidden, '纯预览模式下编辑区应隐藏');
  await u.screenshot(page, 'E02-preview');

  await u.clickToolbar(page, 'btnViewSplit');
  await page.waitForTimeout(400);
  await u.expectVisible(page, '#editorPanel', '恢复分屏后编辑区应可见');
  await u.expectVisible(page, '#previewPanel', '恢复分屏后预览区应可见');
  await u.screenshot(page, 'E02-split');
  return { id: 'E02', ok: true };
}

async function E03_basicInput(page) {
  await u.setEditorText(page, '# 标题\n\n正文 **加粗**');
  const text = await u.getEditorText(page);
  await u.assert(text.includes('# 标题'), '编辑区应保留标题 Markdown');
  await u.assert(text.includes('**加粗**'), '编辑区应保留加粗语法');
  const preview = await u.getPreviewText(page);
  await u.assert(preview.includes('标题'), '预览区应渲染标题文本');
  await u.assert(preview.includes('加粗'), '预览区应渲染加粗文本');
  await u.screenshot(page, 'E03-basic');
  return { id: 'E03', ok: true };
}

async function E04_formatButtons(page) {
  // 加粗
  await u.setEditorText(page, 'Hello world');
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await u.clickToolbar(page, 'btnBold');
  let text = await u.getEditorText(page);
  await u.assert(text.includes('**Hello world**'), '加粗按钮应插入 ** 包裹');

  // 斜体
  await u.setEditorText(page, 'Hello world');
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await u.clickToolbar(page, 'btnItalic');
  text = await u.getEditorText(page);
  await u.assert(text.includes('*Hello world*'), '斜体按钮应插入 * 包裹');

  // 删除线
  await u.setEditorText(page, 'Hello world');
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await u.clickToolbar(page, 'btnStrike');
  text = await u.getEditorText(page);
  await u.assert(text.includes('~~Hello world~~'), '删除线按钮应插入 ~~ 包裹');

  await u.screenshot(page, 'E04-format');
  return { id: 'E04', ok: true };
}

async function E05_headingButtons(page) {
  await u.setEditorText(page, '一级标题');
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await u.clickToolbar(page, 'btnH1');
  let text = await u.getEditorText(page);
  await u.assert(text.startsWith('# 一级标题'), 'H1 按钮应在当前行插入 # ');

  await u.setEditorText(page, '二级标题');
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await u.clickToolbar(page, 'btnH2');
  text = await u.getEditorText(page);
  await u.assert(text.startsWith('## 二级标题'), 'H2 按钮应在当前行插入 ## ');

  await u.screenshot(page, 'E05-heading');
  return { id: 'E05', ok: true };
}

async function E06_listButtons(page) {
  await u.setEditorText(page, '列表项');
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await u.clickToolbar(page, 'btnUL');
  let text = await u.getEditorText(page);
  await u.assert(text.startsWith('- 列表项') || text.startsWith('* 列表项'), '无序列表按钮应插入 - 或 * ');

  await u.setEditorText(page, '列表项');
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await u.clickToolbar(page, 'btnOL');
  text = await u.getEditorText(page);
  await u.assert(/^1\.\s*列表项/.test(text), '有序列表按钮应插入 1. ');

  await u.setEditorText(page, '引用文本');
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await u.clickToolbar(page, 'btnQuote');
  text = await u.getEditorText(page);
  await u.assert(text.startsWith('> 引用文本'), '引用按钮应插入 > ');

  await u.screenshot(page, 'E06-list');
  return { id: 'E06', ok: true };
}

async function E07_onboarding(page) {
  // 不自动关闭引导遮罩，验证其存在与关闭行为
  const p = await u.openEditor(page.context(), '', { dismissOnboarding: false });
  try {
    await u.expectVisible(p, '#onboardingOverlay', '新用户引导遮罩应可见');
    // 点击「先空白开始」按钮应关闭遮罩
    await p.click('[data-action="close-empty"]', { timeout: 3000 });
    await p.waitForTimeout(200);
    const gone = await p.$('#onboardingOverlay').then(el => (el ? el.isVisible() : false)).catch(() => false);
    await u.assert(!gone, '点击「先空白开始」后引导遮罩应消失');
    await u.screenshot(p, 'E07-onboarding');
    return { id: 'E07', ok: true };
  } finally {
    await p.close();
  }
}

export async function run() {
  return u.withBrowser(async ctx => {
    const page = await u.openEditor(ctx);
    u.clearConsoleBuffer();
    const results = [];
    for (const fn of [E01_init, E02_viewModes, E03_basicInput, E04_formatButtons, E05_headingButtons, E06_listButtons, E07_onboarding]) {
      try {
        await u.resetUI(page);
        const r = await fn(page);
        results.push(r);
      } catch (e) {
        results.push({ id: fn.name, ok: false, error: e.message, console: u.getConsoleBuffer() });
        u.clearConsoleBuffer();
        await u.screenshot(page, `${fn.name}-fail`);
      }
    }
    return results;
  });
}
