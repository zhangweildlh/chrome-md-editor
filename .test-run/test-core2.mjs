// 核心编辑补充：E07 插入链接/表格/分隔符、E08 预览区可编辑性
import * as u from './test-utils.mjs';

export const name = '核心编辑补充';

async function E07_link(page) {
  await u.setEditorText(page, '链接文字');
  await u.selectAll(page);
  await u.clickToolbar(page, 'btnLink');
  await page.waitForTimeout(200);
  const text = await u.getEditorText(page);
  await u.assert(text.includes('[链接文字]('), '链接按钮应插入 [文字](url) 语法');
  return { id: 'E07-link', ok: true };
}

async function E07_table(page) {
  await u.setEditorText(page, '');
  await u.clickToolbar(page, 'btnTable');
  await page.waitForTimeout(200);
  const text = await u.getEditorText(page);
  await u.assert(text.includes('|') && text.includes('列'), '表格按钮应插入 Markdown 表格骨架（含列头）');
  return { id: 'E07-table', ok: true };
}

async function E07_hr(page) {
  await u.setEditorText(page, '上方');
  await u.moveCursorEnd(page);
  await u.clickToolbar(page, 'btnHR');
  await page.waitForTimeout(200);
  const text = await u.getEditorText(page);
  await u.assert(/---|\*\*\*/.test(text), '水平线按钮应插入分隔符 --- 或 ***');
  return { id: 'E07-hr', ok: true };
}

async function E08_previewEditable(page) {
  await u.setEditorText(page, '# 原标题\n\n原正文');
  await page.waitForTimeout(300);
  // 预览区应可编辑（contenteditable）
  const editable = await page.$eval('#previewContainer', el => el.getAttribute('contenteditable') === 'true' || el.isContentEditable);
  await u.assert(editable, '预览容器应为 contenteditable（支持 WYSIWYG 回写）');
  // 在预览区末尾追加文本（聚焦预览后键盘输入），验证源码同步
  await page.click('#previewContainer');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('追加内容');
  await page.waitForTimeout(900);
  const src = await u.getEditorText(page);
  await u.assert(src.includes('追加内容'), '预览区输入后编辑区源码应同步包含新内容（预览回写防抖 500ms 后）');
  return { id: 'E08', ok: true };
}

export async function run() {
  return u.withBrowser(async ctx => {
    const page = await u.openEditor(ctx);
    u.clearConsoleBuffer();
    const results = [];
    for (const fn of [E07_link, E07_table, E07_hr, E08_previewEditable]) {
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
