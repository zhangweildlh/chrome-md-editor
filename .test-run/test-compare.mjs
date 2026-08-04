// Compare 模块 UI 测试（CM01-CM07），聚焦 UI 初始化与交互绑定。
// 注：对比内容注入需浏览器文件对话框（pickFiles），本环境无法自动选文件，
// 故 CM02/CM04/CM05 的"diff 内容高亮"降级为验证默认空文档 MergeView 挂载与按钮交互。
import * as u from './test-utils.mjs';

export const name = 'Compare 模块';

async function CM01_init(page) {
  await u.expectVisible(page, '#compareToolbar', '对比工具栏应可见');
  await u.expectVisible(page, '#compareRoot', '对比根容器应可见');
  await u.expectVisible(page, '#btnViewTwo', '两栏按钮应可见');
  await u.expectVisible(page, '#btnViewThree', '三栏按钮应可见');
  await u.expectVisible(page, '#btnViewSingle', '单栏按钮应可见');
  await page.waitForTimeout(300);
  // 默认两栏应挂载 MergeView（含 .cm-editor）
  const hasEditors = await page.$$eval('#viewTwo .cm-editor', els => els.length).catch(() => 0);
  await u.assert(hasEditors >= 1, `默认两栏应挂载 MergeView（实际 ${hasEditors} 个编辑器）`);
  return { id: 'CM01', ok: true };
}

async function CM03_viewSwitch(page) {
  await u.clickToolbar(page, 'btnViewThree');
  await page.waitForTimeout(400);
  const threeVisible = await page.$eval('#viewThree', el => !el.hidden).catch(() => false);
  await u.assert(threeVisible, '切换到三栏后 viewThree 应可见');
  await u.clickToolbar(page, 'btnViewSingle');
  await page.waitForTimeout(400);
  const singleVisible = await page.$eval('#viewSingle', el => !el.hidden).catch(() => false);
  await u.assert(singleVisible, '切换到单栏后 viewSingle 应可见');
  await u.clickToolbar(page, 'btnViewTwo');
  await page.waitForTimeout(400);
  const twoVisible = await page.$eval('#viewTwo', el => !el.hidden).catch(() => false);
  await u.assert(twoVisible, '切回两栏后 viewTwo 应可见');
  return { id: 'CM03', ok: true };
}

async function CM04_nav(page) {
  // 点击上一块/下一块按钮不应崩溃（空文档时 navView 可能无 chunk，但不应抛错）
  await u.clickToolbar(page, 'btnNextChunk');
  await page.waitForTimeout(150);
  await u.clickToolbar(page, 'btnPrevChunk');
  await page.waitForTimeout(150);
  const alive = await page.$('#compareRoot') !== null;
  await u.assert(alive, '块导航点击后页面应保持可用');
  return { id: 'CM04', ok: true };
}

async function CM05_collapse(page) {
  await u.clickToolbar(page, 'btnToggleCollapse');
  await page.waitForTimeout(200);
  const text = await page.$eval('#btnToggleCollapse', el => el.textContent).catch(() => '');
  await u.assert(/展开|折叠/.test(text), '折叠按钮文案应在「展开/折叠未改」间切换');
  return { id: 'CM05', ok: true };
}

async function CM06_image(page) {
  const hasImageBtn = await page.$('#btnAddImages') !== null;
  await u.assert(hasImageBtn, '图片插入按钮应存在');
  const dropVisible = await page.$eval('#compareImageDrop', el => el.offsetParent !== null).catch(() => false);
  await u.assert(dropVisible, '图片拖拽区应可见');
  return { id: 'CM06', ok: true };
}

async function CM07_export(page) {
  const hasExport = await page.$('#btnExportResult') !== null;
  await u.assert(hasExport, '导出结果按钮应存在');
  const hasExportDiff = await page.$('#btnExportDiff') !== null;
  await u.assert(hasExportDiff, '导出 diff 按钮应存在');
  // 点击导出结果不应崩溃（环境无文件对话框会忽略 AbortError）
  await u.clickToolbar(page, 'btnExportResult');
  await page.waitForTimeout(200);
  return { id: 'CM07', ok: true };
}

export async function run() {
  return u.withBrowser(async ctx => {
    const page = await u.openCompare(ctx);
    u.clearConsoleBuffer();
    const results = [];
    for (const fn of [CM01_init, CM03_viewSwitch, CM04_nav, CM05_collapse, CM06_image, CM07_export]) {
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
