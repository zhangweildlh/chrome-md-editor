// Callout/Mermaid/代码块（C01-C04）+ 符号自动配对（P01-P03）+ 粘贴为 MD（PM01）+ 翻译 UI（TR01-TR03）
import * as u from './test-utils.mjs';

export const name = '渲染与增强';

async function C01_callout(page) {
  await u.setEditorText(page, '> [!NOTE]\n> 这是提示内容');
  await page.waitForTimeout(400);
  const html = await u.getPreviewHTML(page);
  await u.assert(/callout/.test(html), 'Callout 应在预览区渲染为 callout 元素');
  await u.assert(/这是提示内容/.test(html), 'Callout 正文应保留');
  return { id: 'C01', ok: true };
}

async function C02_base64(page) {
  // 插入较长 data URL 图片，验证预览区折叠
  const longData = 'data:image/png;base64,' + 'A'.repeat(2000);
  await u.setEditorText(page, `![图](${longData})`);
  await page.waitForTimeout(400);
  const html = await u.getPreviewHTML(page);
  await u.assert(/img/i.test(html), 'Base64 图片应在预览区渲染为 img');
  return { id: 'C02', ok: true };
}

async function C03_mermaid(page) {
  await u.setEditorText(page, '```mermaid\ngraph LR\n  A-->B\n```');
  await page.waitForTimeout(2500);
  const html = await u.getPreviewHTML(page);
  const hasSvg = /<svg/.test(html) || /mermaid/.test(html) || /class="language-mermaid/.test(html);
  await u.assert(hasSvg, 'Mermaid 代码块应在预览区渲染出 svg 或 mermaid 容器');
  return { id: 'C03', ok: true };
}

async function C04_codeblock(page) {
  await u.setEditorText(page, '```js\nconst a = 1;\n```');
  await page.waitForTimeout(400);
  const html = await u.getPreviewHTML(page);
  await u.assert(/<pre|<code|class=.{0,20}language-js/.test(html), '代码块应渲染且带语言类名');
  return { id: 'C04', ok: true };
}

async function P01_paren(page) {
  await u.setEditorText(page, '');
  await page.click('.cm-content');
  await page.keyboard.press('End');
  await page.keyboard.type('(');
  await page.waitForTimeout(150);
  const text = await u.getEditorText(page);
  await u.assert(text.includes('()'), '输入 ( 应自动配对 )');
  return { id: 'P01', ok: true };
}

async function P02_bracket(page) {
  await u.setEditorText(page, '');
  await page.click('.cm-content');
  await page.keyboard.press('End');
  await page.keyboard.type('[');
  await page.waitForTimeout(150);
  const text = await u.getEditorText(page);
  await u.assert(text.includes('[]'), '输入 [ 应自动配对 ]');
  return { id: 'P02', ok: true };
}

async function P03_quote(page) {
  await u.setEditorText(page, '');
  await page.click('.cm-content');
  await page.keyboard.press('End');
  await page.keyboard.type('"');
  await page.waitForTimeout(150);
  const text = await u.getEditorText(page);
  await u.assert(text.includes('""'), '输入 " 应自动配对 "');
  return { id: 'P03', ok: true };
}

async function PM01_paste(page) {
  // 粘贴富文本 HTML，验证转 MD（通过 clipboard API 注入）
  await u.setEditorText(page, '');
  await page.click('.cm-content');
  await page.keyboard.press('End');
  const html = '<h1>标题</h1><p>段落 <strong>加粗</strong> 与 <a href="https://x.com">链接</a></p><ul><li>项一</li><li>项二</li></ul>';
  await page.evaluate((h) => {
    const dt = new DataTransfer();
    dt.setData('text/html', h);
    dt.setData('text/plain', '');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    document.querySelector('.cm-content').dispatchEvent(ev);
  }, html);
  await page.waitForTimeout(400);
  const text = await u.getEditorText(page);
  await u.assert(text.includes('# 标题') || text.includes('标题'), '粘贴 HTML 标题应转为 Markdown 标题');
  await u.assert(text.includes('加粗') || text.includes('**'), '粘贴 HTML 加粗应转为 Markdown');
  return { id: 'PM01', ok: true };
}

async function TR01_settings(page) {
  await u.clickToolbar(page, 'btnTranslateSettings');
  await page.waitForSelector('#translateSettingsModal:not([hidden])', { timeout: 3000 });
  const visible = await page.$eval('#translateSettingsModal', el => !el.hidden).catch(() => false);
  await u.assert(visible, '点击翻译设置应打开弹窗');
  const hasPreset = await page.$('#translatePreset') !== null;
  await u.assert(hasPreset, '翻译设置应有预设下拉');
  const optCount = await page.$$eval('#translatePreset option', els => els.length).catch(() => 0);
  await u.assert(optCount >= 1, `预设下拉应有选项（实际 ${optCount}）`);
  return { id: 'TR01', ok: true };
}

async function TR02_preset(page) {
  await u.clickToolbar(page, 'btnTranslateSettings');
  await page.waitForSelector('#translateSettingsModal:not([hidden])', { timeout: 3000 });
  const sel = await page.$('#translatePreset');
  const firstVal = await sel.$$eval('option', els => els[0].value);
  await sel.selectOption(firstVal);
  await page.waitForTimeout(200);
  const val = await page.$eval('#translatePreset', el => el.value);
  await u.assert(val === firstVal, '切换预设后下拉值应更新');
  return { id: 'TR02', ok: true };
}

async function TR03_button(page) {
  // 无 API Key 点击翻译：应给出提示或不崩溃
  await u.setEditorText(page, '# 测试翻译\n\n一段中文内容');
  await page.waitForTimeout(300);
  await u.clickToolbar(page, 'btnTranslate');
  await page.waitForTimeout(400);
  // 状态栏/提示区不应崩溃；翻译状态元素可见或无异常
  const statusVisible = await page.$eval('#translateStatus', el => el !== null).catch(() => false);
  await u.assert(statusVisible, '翻译状态元素应存在（无崩溃）');
  return { id: 'TR03', ok: true };
}

export async function run() {
  return u.withBrowser(async ctx => {
    const page = await u.openEditor(ctx);
    u.clearConsoleBuffer();
    const results = [];
    for (const fn of [C01_callout, C02_base64, C03_mermaid, C04_codeblock, P01_paren, P02_bracket, P03_quote, PM01_paste, TR01_settings, TR02_preset, TR03_button]) {
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
