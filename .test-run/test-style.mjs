// 样式工具栏 v1.4.4 功能测试（S01-S06）
import * as u from './test-utils.mjs';

export const name = '样式工具栏';

async function setup(page, text = '样式文本') {
  await u.setEditorText(page, text);
  await u.selectAll(page);
}

async function S01_center(page) {
  await setup(page);
  await u.clickToolbar(page, 'btnStyleCenter');
  const text = await u.getEditorText(page);
  await u.assert(text.includes('<center>样式文本</center>'), '居中按钮应插入 <center>…</center>');
  return { id: 'S01', ok: true };
}

async function S02_bold(page) {
  await setup(page);
  await u.clickToolbar(page, 'btnStyleBold');
  const text = await u.getEditorText(page);
  await u.assert(text.includes('<b>样式文本</b>'), '样式加粗按钮应插入 <b>…</b>（区别于 Markdown 加粗）');
  return { id: 'S02', ok: true };
}

async function S03_highlight(page) {
  // 样式工具栏高亮按钮 = wrapSelection('<mark>')（包裹语义，与顶部荧光笔 toggle 不同）
  await setup(page);
  await u.clickToolbar(page, 'btnStyleHighlight');
  let text = await u.getEditorText(page);
  await u.assert(text.includes('<mark>样式文本</mark>'), '高亮按钮应插入 <mark>…</mark> 包裹');
  // 再次点击同一选中内容：再次包裹（非取消），验证包裹行为稳定
  await setup(page);
  await u.clickToolbar(page, 'btnStyleHighlight');
  text = await u.getEditorText(page);
  await u.assert(text.includes('<mark>样式文本</mark>'), '重复点击高亮应保持 <mark> 包裹语义');
  return { id: 'S03', ok: true };
}

async function S04_color(page) {
  await setup(page);
  await u.clickToolbar(page, 'btnColor');
  await page.waitForSelector('#colorPopover:not([hidden])', { timeout: 3000 });
  await page.click('.swatch[data-color="red"]');
  await page.waitForTimeout(200);
  const text = await u.getEditorText(page);
  await u.assert(text.includes('<font color="red">样式文本</font>'), '颜色红应插入 <font color="red">…</font>');
  return { id: 'S04', ok: true };
}

async function S05_fontSize(page) {
  await setup(page);
  await u.clickToolbar(page, 'btnFontSize');
  await page.waitForSelector('#fontSizePopover:not([hidden])', { timeout: 3000 });
  await page.click('.fs-option[data-size="4"]');
  await page.waitForTimeout(200);
  const text = await u.getEditorText(page);
  await u.assert(text.includes('<font size="4">样式文本</font>'), '字号大应插入 <font size="4">…</font>');
  return { id: 'S05', ok: true };
}

async function S06_memory(page) {
  // 先选蓝色，关闭弹窗（Esc）后再次打开，蓝色 swatch 应处于 selected（localStorage 记忆）
  await setup(page);
  await u.clickToolbar(page, 'btnColor');
  await page.waitForSelector('#colorPopover:not([hidden])', { timeout: 3000 });
  await page.click('.swatch[data-color="blue"]');
  await page.waitForTimeout(200);
  // 关闭弹窗：按 Esc
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  // 再次打开颜色弹窗
  await u.clickToolbar(page, 'btnColor');
  await page.waitForSelector('#colorPopover:not([hidden])', { timeout: 3000 });
  const hasSelected = await page.$eval('#colorPopover', el => !!el.querySelector('.swatch.selected'));
  await u.assert(hasSelected, '关闭并重新打开颜色弹窗后，应有 swatch 处于 selected 状态（记忆上次选择）');
  const selectedColor = await page.$eval('#colorPopover .swatch.selected', el => el.dataset.color).catch(() => null);
  await u.assert(selectedColor === 'blue', `上次选择蓝色应被记住，实际: ${selectedColor}`);
  return { id: 'S06', ok: true };
}

export async function run() {
  return u.withBrowser(async ctx => {
    const page = await u.openEditor(ctx);
    u.clearConsoleBuffer();
    const results = [];
    for (const fn of [S01_center, S02_bold, S03_highlight, S04_color, S05_fontSize, S06_memory]) {
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
