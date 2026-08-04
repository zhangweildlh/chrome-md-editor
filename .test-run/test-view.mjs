// 视图增强（V01-V04）+ 主题与显示设置（T01-T04）测试
import * as u from './test-utils.mjs';

export const name = '视图增强与主题';

async function V01_outline(page) {
  await u.setEditorText(page, '# 一级\n\n## 二级A\n\n## 二级B\n\n正文');
  await u.clickToolbar(page, 'btnOutline');
  await page.waitForTimeout(300);
  const open = await page.$eval('#outlinePanel', el => el.classList.contains('open')).catch(() => false);
  await u.assert(open, '点击大纲按钮应展开大纲面板（.open class）');
  const items = await page.$$eval('#outlineList li, #outlineList .outline-item', els => els.map(e => e.textContent)).catch(() => []);
  await u.assert(items.length >= 3, `大纲应列出多级标题（实际 ${items.length} 项）`);
  return { id: 'V01', ok: true };
}

async function V02_tasks(page) {
  await u.setEditorText(page, '- [ ] 任务一\n- [x] 任务二\n- [ ] 任务三');
  await u.clickToolbar(page, 'btnTasks');
  await page.waitForTimeout(300);
  const open = await page.$eval('#taskListPanel', el => el.classList.contains('open')).catch(() => false);
  await u.assert(open, '点击任务按钮应展开任务面板（.open class）');
  const items = await page.$$eval('#taskList li, #taskList .task-item', els => els.length).catch(() => 0);
  await u.assert(items >= 3, `任务面板应列出 3 个任务（实际 ${items}）`);
  return { id: 'V02', ok: true };
}

async function V03_focus(page) {
  await u.clickToolbar(page, 'btnFocusMode');
  await page.waitForTimeout(200);
  const active = await page.$eval('#btnFocusMode', el => el.classList.contains('active'));
  await u.assert(active, '聚焦模式按钮应进入 active 状态');
  const htmlClass = await page.$eval('html', el => el.className);
  await u.assert(/focus-mode/.test(htmlClass), '聚焦模式应在 <html> 上添加 focus-mode class');
  await u.clickToolbar(page, 'btnFocusMode');
  await page.waitForTimeout(150);
  return { id: 'V03', ok: true };
}

async function V04_typewriter(page) {
  await u.clickToolbar(page, 'btnTypewriter');
  await page.waitForTimeout(200);
  const active = await page.$eval('#btnTypewriter', el => el.classList.contains('active'));
  await u.assert(active, '打字机按钮应进入 active 状态（功能通过光标行居中滚动生效，无独立 class）');
  await u.clickToolbar(page, 'btnTypewriter');
  await page.waitForTimeout(150);
  return { id: 'V04', ok: true };
}

async function T01_theme(page) {
  const before = await page.$eval('html', el => el.getAttribute('data-theme'));
  await u.clickToolbar(page, 'btnTheme');
  await page.waitForTimeout(200);
  const after = await page.$eval('html', el => el.getAttribute('data-theme'));
  await u.assert(before !== after, `明暗主题应切换（前=${before} 后=${after}）`);
  await u.clickToolbar(page, 'btnTheme');
  await page.waitForTimeout(150);
  return { id: 'T01', ok: true };
}

async function T02_display(page) {
  await u.clickToolbar(page, 'btnDisplaySettings');
  await page.waitForSelector('#displaySettingsPopover:not([hidden])', { timeout: 3000 });
  const visible = await page.$eval('#displaySettingsPopover', el => !el.hidden).catch(() => false);
  await u.assert(visible, '点击显示设置应展开弹窗');
  const hasControls = await page.$('#dsEditorFont') && await page.$('#dsDensity') && await page.$('#dsColorScheme');
  await u.assert(hasControls, '显示设置弹窗应含字号/密度/配色控件');
  return { id: 'T02', ok: true };
}

async function T03_fontSize(page) {
  await u.clickToolbar(page, 'btnDisplaySettings');
  await page.waitForSelector('#displaySettingsPopover:not([hidden])', { timeout: 3000 });
  const input = await page.$('#dsEditorFont');
  await input.fill('20');
  await page.waitForTimeout(200);
  const val = await page.$eval('#dsEditorFont', el => el.value);
  await u.assert(val === '20', '编辑器字号输入应被接受');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  return { id: 'T03', ok: true };
}

async function T04_density(page) {
  await u.clickToolbar(page, 'btnDisplaySettings');
  await page.waitForSelector('#displaySettingsPopover:not([hidden])', { timeout: 3000 });
  const sel = await page.$('#dsDensity');
  await sel.selectOption('comfortable');
  await page.waitForTimeout(200);
  const uiGap = await page.$eval('html', el => el.style.getPropertyValue('--ui-gap'));
  await u.assert(uiGap === '14px', `切换密度为宽松后 --ui-gap 应为 14px（实际 ${uiGap}）`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  return { id: 'T04', ok: true };
}

export async function run() {
  return u.withBrowser(async ctx => {
    const page = await u.openEditor(ctx);
    u.clearConsoleBuffer();
    const results = [];
    for (const fn of [V01_outline, V02_tasks, V03_focus, V04_typewriter, T01_theme, T02_display, T03_fontSize, T04_density]) {
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
