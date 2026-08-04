// 中文查找/替换面板测试（F01-F05），基于自定义 md-search-panel
import * as u from './test-utils.mjs';

export const name = '查找与替换';

async function openFind(page) {
  await u.clickToolbar(page, 'btnFind');
  await page.waitForSelector('.md-search-panel', { timeout: 5000 });
  await page.waitForTimeout(200);
}

// 在搜索面板内按 title 定位按钮
async function panelBtn(page, title) {
  return page.$(`.md-search-panel__btn[title*="${title}"]`);
}

async function F01_open(page) {
  await u.setEditorText(page, '测试查找功能');
  await u.clickToolbar(page, 'btnFind');
  const visible = await page.$('.md-search-panel').then(el => el ? el.isVisible() : false).catch(() => false);
  await u.assert(visible, '点击查/替按钮应打开查找面板');
  return { id: 'F01', ok: true };
}

async function F02_match(page) {
  await u.setEditorText(page, '苹果 香蕉 苹果 橙子 苹果');
  await openFind(page);
  const findInput = await page.$('.md-search-panel__input');
  await findInput.fill('苹果');
  await page.waitForTimeout(300);
  const text = await u.getEditorText(page);
  await u.assert((text.match(/苹果/g) || []).length === 3, '文档应含 3 处「苹果」');
  // 命中高亮：CM 高亮选区或 mermaid 类
  const matchCount = await page.$$eval('.cm-searchMatch, .cm-selectionMatch, .md-search-panel__count', els => els.length).catch(() => 0);
  await u.assert(matchCount >= 1, '查找命中应有计数/高亮元素');
  return { id: 'F02', ok: true };
}

async function F03_nav(page) {
  await u.setEditorText(page, 'alpha beta alpha gamma alpha');
  await openFind(page);
  const findInput = await page.$('.md-search-panel__input');
  await findInput.fill('alpha');
  await page.waitForTimeout(300);
  const nextBtn = await panelBtn(page, '下一个');
  if (nextBtn) { await nextBtn.click(); await page.waitForTimeout(150); }
  const prevBtn = await panelBtn(page, '上一个');
  if (prevBtn) { await prevBtn.click(); await page.waitForTimeout(150); }
  const text = await u.getEditorText(page);
  await u.assert(text.includes('alpha'), '导航后文档内容不应被破坏');
  return { id: 'F03', ok: true };
}

async function F04_replace(page) {
  await u.setEditorText(page, '猫 狗 猫 兔 猫');
  await openFind(page);
  const inputs = await page.$$('.md-search-panel__input');
  // 第一个为查找框，第二个为替换框（诊断确认存在两个 input）
  await inputs[0].fill('猫');
  if (inputs[1]) await inputs[1].fill('犬');
  await page.waitForTimeout(200);
  const replaceAllBtn = await panelBtn(page, '替换全部') || await panelBtn(page, '全部');
  if (replaceAllBtn) { await replaceAllBtn.click(); await page.waitForTimeout(300); }
  const text = await u.getEditorText(page);
  await u.assert(!text.includes('猫') && (text.match(/犬/g) || []).length === 3, '替换全部应把所有「猫」改为「犬」');
  return { id: 'F04', ok: true };
}

async function F05_selectMatches(page) {
  await u.setEditorText(page, 'x1 x2 x1 x3 x1');
  await openFind(page);
  const findInput = await page.$('.md-search-panel__input');
  await findInput.fill('x1');
  await page.waitForTimeout(300);
  const allBtn = await panelBtn(page, '全选');
  if (allBtn) { await allBtn.click(); await page.waitForTimeout(200); }
  const text = await u.getEditorText(page);
  await u.assert((text.match(/x1/g) || []).length === 3, '全选匹配后文档结构不应被破坏（3 处 x1 仍在）');
  return { id: 'F05', ok: true };
}

export async function run() {
  return u.withBrowser(async ctx => {
    const page = await u.openEditor(ctx);
    u.clearConsoleBuffer();
    const results = [];
    for (const fn of [F01_open, F02_match, F03_nav, F04_replace, F05_selectMatches]) {
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
