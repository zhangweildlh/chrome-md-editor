// v1.8.5 全覆盖真机测试（360Chromex + dist 构建产物，验证工具栏滚动按钮/侧栏真隐藏/间距收敛修复）
// 端口 8123；严格「先假设 BUG，用事实证伪」：每条按正确行为断言，FAIL 即证明 BUG。
// 重点：工具栏横向溢出（用户看不见窗口外按钮）、隔断符间距、侧栏真隐藏、多栏对照全覆盖。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = 'D:\\Documents\\AI_Work_Temp\\Chrome-Markdown-Edit\\dist'; // v1.8.5 构建产物（含工具栏滚动按钮修复）
const PORT = 8123;
const BROWSER = 'D:\\Tools\\360Chrome\\360chromex.exe';
const SHOT_DIR = path.join(__dirname, 'verify-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.map':'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/src/editor.html';
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

const results = [];
const consoleErrors = [];
const httpFailures = [];
let page, browser;

const isRealVisible = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s) || document.getElementById(s.replace(/^#/, ''));
  if (!el) return { ok:false, reason:'no element' };
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return { ok:false, reason:`display=${cs.display} vis=${cs.visibility} op=${cs.opacity}` };
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return { ok:false, reason:`box ${Math.round(r.width)}x${Math.round(r.height)}` };
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  const top = document.elementFromPoint(cx, cy);
  if (!top) return { ok:false, reason:'elementFromPoint null' };
  if (el === top || el.contains(top) || top.contains(el)) return { ok:true };
  return { ok:false, reason:'covered by ' + (top.id || top.className || top.tagName) };
}, sel);

const shot = async (name) => { try { await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') }); } catch(e){ console.log('  shot err', name, e.message); } };
const run = async (name, fn) => {
  try { const detail = await fn() || ''; results.push({ name, pass:true, detail:String(detail) }); console.log(`PASS | ${name} | ${detail}`); }
  catch (e) { const detail = e && e.message ? e.message : String(e); results.push({ name, pass:false, detail }); console.log(`FAIL | ${name} | ${detail}`); await shot(name.replace(/[^\w\-]+/g,'_').slice(0,60)); }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'assert failed'); };
const gotoEditor = async () => {
  await page.goto('http://localhost:' + PORT + '/src/editor.html', { waitUntil:'load', timeout:30000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} try { localStorage.setItem('md-editor-chrome-mode','daily'); } catch {} });
  await page.reload({ waitUntil:'load' });
  await page.waitForSelector('#toolbar', { timeout:15000 });
  await page.evaluate(() => {
    const ov = document.getElementById('onboardingOverlay'); if (ov) ov.remove();
    const ob = document.getElementById('onboardingBtn') || document.getElementById('startBtn'); if (ob) ob.click();
    const t = document.getElementById('toolbar'); if (t) t.classList.remove('view-hidden');
    const s = document.getElementById('fileSidebar'); if (s) { s.classList.remove('view-hidden','collapsed'); }
  });
  await page.waitForTimeout(600);
};
const gotoCompare = async () => {
  await page.goto('http://localhost:' + PORT + '/src/compare.html', { waitUntil:'load', timeout:30000 });
  await page.waitForSelector('#compareToolbar', { timeout:15000 });
  await page.waitForTimeout(700);
};

// 工具栏溢出测量：假设用户看不见容器右边界之外的按钮
const measureToolbar = async (sel, width) => {
  await page.setViewportSize({ width, height: 800 });
  await page.waitForTimeout(250);
  return page.evaluate((s) => {
    const tb = document.querySelector(s);
    if (!tb) return { error:'no toolbar' };
    const R = tb.getBoundingClientRect();
    const cs = getComputedStyle(tb);
    const kids = [...tb.querySelectorAll('button, select, input')].filter(b => {
      const bcs = getComputedStyle(b);
      if (bcs.display === 'none' || bcs.visibility === 'hidden') return false;
      const br = b.getBoundingClientRect();
      return br.width > 2 && br.height > 2;
    });
    const off = kids.filter(b => { const br = b.getBoundingClientRect(); return br.right > R.right + 1 || br.left < R.left - 1; })
      .map(b => ({ id: b.id || b.getAttribute('aria-label') || b.className, right: Math.round(br_right(b)), cutoff: Math.round(R.right) }));
    const wrapEl = tb.closest('.toolbar-wrap') || tb.parentElement;
    const hasScrollBtns = !!(wrapEl && wrapEl.querySelector('.toolbar-scroll-btn, [data-scroll-left], [data-scroll-right]'));
    return { clientWidth: Math.round(R.width), scrollWidth: tb.scrollWidth, overflow: tb.scrollWidth - tb.clientWidth, offscreenCount: off.length, offscreen: off, hasScrollBtns, overflowX: cs.overflowX };
    function br_right(b){ return b.getBoundingClientRect().right; }
  }, sel);
};

const SAMPLE_A = path.join(__dirname, 'sample-a.md');
const SAMPLE_B = path.join(__dirname, 'sample-b.md');

try {
  await new Promise(r => server.listen(PORT, r));
  browser = await chromium.launchPersistentContext('', { executablePath: BROWSER, headless:false, args:['--no-sandbox','--disable-gpu','--window-size=1280,800'] });
  page = browser.pages()[0] || await browser.newPage();
  page.on('console', m => { if (m.type()==='error'){ consoleErrors.push(m.text()); console.log('  [console.error]', m.text()); } });
  page.on('pageerror', e => { consoleErrors.push(e.message); console.log('  [pageerror]', e.message); });
  page.on('response', r => { if (r.status()>=400){ httpFailures.push(r.status()+' '+r.url()); console.log('  [http '+r.status()+']', r.url()); } });
  const benign = (u) => /favicon\.ico|webkit-mask|(\.map)($|\?)|\/src\/x($|\?)/.test(u);

  // ===== L0 环境 =====
  await gotoEditor();
  await run('L0.1 editor #toolbar 可见', async () => { const v = await isRealVisible('#toolbar'); assert(v.ok, JSON.stringify(v)); return 'ok'; });
  await run('L0.3 #appVersion==v1.8.5', async () => { const t = await page.evaluate(() => document.getElementById('appVersion')?.textContent || ''); assert(t.includes('1.8.5'), 'got '+t); return t; });
  await run('L0.4 无非良性错误', async () => { const bad = httpFailures.filter(u=>!benign(u)); const badC = consoleErrors.filter(e=>!/failed to load resource/i.test(e)&&!/favicon/i.test(e)); assert(bad.length===0 && badC.length===0, 'http='+bad.join('; ')+' | console='+badC.join('; ')); return 'clean'; });

  // ===== L1 核心 =====
  await run('L1.2 # 标题→预览<h1>', async () => {
    await page.evaluate(() => { const ed = document.querySelector('.cm-content'); ed.focus(); ed.innerText=''; });
    await page.keyboard.type('# 标题测试'); await page.waitForTimeout(400);
    const has = await page.evaluate(() => !!document.querySelector('#previewContainer h1')); assert(has, '无 h1'); return '有 h1';
  });

  // ===== L2 视图模式 =====
  await gotoEditor();
  await run('L2.1 edit/preview/split 切换', async () => {
    let ok = true;
    for (const m of ['edit','preview','split']) { await page.evaluate(mm=>document.querySelector(`.view-btn[data-mode="${mm}"]`)?.click(), m); await page.waitForTimeout(200); const dm = await page.evaluate(()=>document.getElementById('editorMain')?.getAttribute('data-mode')); if (dm!==m) ok=false; }
    assert(ok, 'mode mismatch'); return 'ok';
  });
  await run('L2.4 focus 侧栏隐藏+恢复条', async () => {
    await page.evaluate(() => document.getElementById('btnChromeMode')?.click()); await page.waitForTimeout(400);
    const hidden = await page.evaluate(()=>document.getElementById('fileSidebar').classList.contains('view-hidden'));
    const toggle = await isRealVisible('#sidebarToggle'); assert(hidden && toggle.ok, `hidden=${hidden} toggle=${JSON.stringify(toggle)}`); return 'ok';
  });
  await run('L2.8 focus 点恢复条→侧栏恢复', async () => {
    await page.evaluate(()=>{const t=document.getElementById('sidebarToggle'); if(t)t.click();}); await page.waitForTimeout(400);
    const rec = await page.evaluate(()=>{const s=document.getElementById('fileSidebar'); return !s.classList.contains('view-hidden')&&!s.classList.contains('collapsed')&&getComputedStyle(s).display!=='none';}); assert(rec,'未恢复'); return 'ok';
  });

  // ===== L3 工具栏：隔断符间距 + 横向溢出（已知问题1、3）=====
  await gotoEditor();
  await run('L3.1 toolbar nowrap+定高', async () => { const cs = await page.evaluate(()=>{const t=document.getElementById('toolbar');const s=getComputedStyle(t);return {fw:s.flexWrap,h:s.height};}); assert(cs.fw==='nowrap'&&cs.h&&cs.h!=='auto', JSON.stringify(cs)); return JSON.stringify(cs); });
  await run('L3.4 相邻按钮不重叠', async () => {
    const rects = await page.evaluate(()=>[...document.querySelectorAll('#toolbar button')].map(b=>({id:b.id,r:b.getBoundingClientRect(),vis:getComputedStyle(b).display!=='none'&&getComputedStyle(b).visibility!=='hidden'})));
    const vis = rects.filter(x=>x.vis&&x.r.width>2&&x.r.height>2); let overlap=null;
    for (let i=0;i<vis.length;i++) for (let j=i+1;j<vis.length;j++){ const a=vis[i].r,b=vis[j].r; const ix=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)); const iy=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)); if(ix>1&&iy>1){overlap=`${vis[i].id} ∩ ${vis[j].id} (${Math.round(ix)}x${Math.round(iy)})`;break;} }
    assert(!overlap, overlap); return 'no overlap among '+vis.length;
  });
  await run('L3.5 隔断符间距≤12px(已知问题1)', async () => {
    const m = await page.evaluate(() => {
      const isReal = (b) => { const r=b.getBoundingClientRect(); const cs=getComputedStyle(b); if(cs.position==='absolute'||cs.display==='none') return false; if(r.width<2||r.height<2) return false; return true; };
      const dividers = [...document.querySelectorAll('#toolbar .toolbar-divider')];
      const gaps = [];
      dividers.forEach(d => { const prev = d.previousElementSibling; if (prev && prev.matches('.toolbar-group')) { const kids=[...prev.children].filter(isReal); const last=kids[kids.length-1]; if(last) gaps.push(d.getBoundingClientRect().left - last.getBoundingClientRect().right); } });
      return { max: gaps.length?Math.max(...gaps):0, all: gaps.map(g=>Math.round(g)) };
    });
    assert(m.max <= 12, `隔断符最大间距(${Math.round(m.max)}px) > 12px（间距过大） 全部=${JSON.stringify(m.all)}`);
    return `max=${Math.round(m.max)} all=${JSON.stringify(m.all)}`;
  });
  // L3.6 工具栏横向溢出（已知问题3）—— 逐视口宽实测
  const widths = [320,480,768,900,1280,1600,1920];
  for (const W of widths) {
    await gotoEditor();
    await run(`L3.6 工具栏@${W}px 无用户不可达按钮(已知问题3)`, async () => {
      const mt = await measureToolbar('#toolbar', W);
      const reachable = mt.overflow <= 0 || mt.hasScrollBtns;
      assert(reachable, `溢出${mt.overflow}px, 不可见按钮${mt.offscreenCount}个, 有滚动按钮=${mt.hasScrollBtns} | 不可见=${JSON.stringify(mt.offscreen)}`);
      return `overflow=${mt.overflow} off=${mt.offscreenCount} scrollBtns=${mt.hasScrollBtns}`;
    });
    if (W===900 || W===1280) await shot(`overflow-editor-${W}`);
  }
  // L3.7 全屏溢出（已知问题3）
  await gotoEditor();
  await run('L3.7 全屏状态工具栏无用户不可达按钮(已知问题3)', async () => {
    await page.evaluate(() => { const el=document.documentElement; if(el.requestFullscreen) el.requestFullscreen().catch(()=>{}); });
    await page.waitForTimeout(500);
    const mt = await measureToolbar('#toolbar', 1280);
    const reachable = mt.overflow <= 0 || mt.hasScrollBtns;
    await page.evaluate(() => { if(document.exitFullscreen) document.exitFullscreen().catch(()=>{}); });
    assert(reachable, `全屏下溢出${mt.overflow}px, 不可见${mt.offscreenCount}个 | ${JSON.stringify(mt.offscreen)}`);
    return `overflow=${mt.overflow} off=${mt.offscreenCount}`;
  });

  // ===== L4 侧栏真隐藏（已知问题2）=====
  await gotoEditor();
  await run('L4.2 收起→真实宽度≈0(已知问题2)', async () => {
    await page.evaluate(()=>document.getElementById('btnCollapseSidebar')?.click()); await page.waitForTimeout(400);
    const w = await page.evaluate(()=>document.getElementById('fileSidebar').getBoundingClientRect().width);
    assert(w < 5, `收起后宽度=${Math.round(w)}px（应≈0，若≈180 证明未隐藏）`); return `width=${Math.round(w)}`;
  });
  await run('L4.3 收起后侧栏真不可见(已知问题2)', async () => {
    const v = await isRealVisible('#fileSidebar'); assert(!v.ok, '侧栏仍可见 '+JSON.stringify(v)); return 'hidden:'+JSON.stringify(v);
  });
  await run('L4.5 点恢复条→侧栏恢复', async () => {
    await page.evaluate(()=>document.getElementById('sidebarToggle')?.click()); await page.waitForTimeout(400);
    const rec = await page.evaluate(()=>{const s=document.getElementById('fileSidebar'); return !s.classList.contains('collapsed')&&!s.classList.contains('view-hidden')&&getComputedStyle(s).display!=='none';}); assert(rec,'未恢复'); return 'ok';
  });

  // ===== L5 样式工具栏 =====
  await gotoEditor();
  await run('L5.9 5按钮齐全(铁律)', async () => { const ids=['btnStyleCenter','btnBold','btnStyleHighlight','btnColor','btnFontSize']; for(const id of ids){const v=await isRealVisible('#'+id); assert(v.ok, id+' 不可见 '+JSON.stringify(v));} return '5 btns ok'; });

  // ===== L6 多栏对照全覆盖（已知问题4,5,6,7）=====
  await gotoCompare();
  await run('T6.1 对比视图加载', async () => { const v=await isRealVisible('#compareRoot'); assert(v.ok, JSON.stringify(v)); return 'ok'; });
  await run('T6.2 默认两栏', async () => { await page.evaluate(()=>document.getElementById('btnViewTwo')?.click()); await page.waitForTimeout(400); const vis=await page.evaluate(()=>{const v=document.getElementById('viewTwo'); return !v.hidden&&!!v.querySelector('.cm-mergeView,.cm-editor');}); assert(vis,'两栏无视图'); return 'two'; });
  await run('T6.3 三栏按钮', async () => { const v=await isRealVisible('#btnViewThree'); assert(v.ok,JSON.stringify(v)); return 'ok'; });
  await run('T6.4 单栏按钮+渲染(已知问题5)', async () => { const v=await isRealVisible('#btnViewSingle'); assert(v.ok,JSON.stringify(v)); await page.evaluate(()=>document.getElementById('btnViewSingle').click()); await page.waitForTimeout(500); const vis=await page.evaluate(()=>{const v=document.getElementById('viewSingle'); return !v.hidden&&!!v.querySelector('.cm-editor');}); assert(vis,'单栏无 cm-editor'); return 'single'; });
  await run('T6.8 双槽独立选文件(已知问题6)', async () => {
    await page.evaluate(()=>document.getElementById('btnViewTwo').click()); await page.waitForTimeout(400);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnPickFiles')]);
    await fc.setFiles([SAMPLE_A, SAMPLE_B]); await page.waitForTimeout(600);
    const info = await page.evaluate(()=>({ a:document.querySelector('#fileSlotA .compare-file-name')?.textContent||'', b:document.querySelector('#fileSlotB .compare-file-name')?.textContent||'', aHas:(document.querySelector('#viewTwo .cm-mergeView')?.textContent||'').includes('文档 A'), bHas:(document.querySelector('#viewTwo .cm-mergeView')?.textContent||'').includes('文档 B') }));
    assert(info.a.includes('sample-a')&&info.b.includes('sample-b'), JSON.stringify(info)); assert(info.aHas&&info.bHas,'两栏未分别加载 '+JSON.stringify(info)); return JSON.stringify(info);
  });
  await run('T6.15 compare 三属性齐全(已知问题4)', async () => {
    const eq = await page.evaluate(()=>({ theme:document.documentElement.getAttribute('data-theme'), editorTheme:document.documentElement.getAttribute('data-editor-theme'), colorScheme:document.documentElement.getAttribute('data-color-scheme') }));
    assert(eq.theme&&eq.theme!=='','data-theme 缺失'); assert(eq.editorTheme&&eq.editorTheme!=='','data-editor-theme 缺失'); assert(eq.colorScheme&&eq.colorScheme!=='','data-color-scheme 缺失'); return JSON.stringify(eq);
  });
  await run('T6.15b compare 跟随暗色预设(已知问题4)', async () => {
    await gotoEditor();
    await page.evaluate(()=>{const sel=document.getElementById('editorThemeSelect'); if(sel){sel.value='github-dark'; sel.dispatchEvent(new Event('change'));}}); await page.waitForTimeout(300);
    await gotoCompare();
    const eq = await page.evaluate(()=>({ theme:document.documentElement.getAttribute('data-theme'), editorTheme:document.documentElement.getAttribute('data-editor-theme') }));
    assert(eq.theme==='dark','data-theme='+eq.theme); assert(eq.editorTheme==='github-dark','data-editor-theme='+eq.editorTheme); return JSON.stringify(eq);
  });
  await run('T6.21 对比视图可编辑(已知问题7)', async () => {
    await gotoCompare(); await page.evaluate(()=>document.getElementById('btnViewTwo').click()); await page.waitForTimeout(300);
    const ed = await page.evaluate(()=>{const e=document.querySelector('#viewTwo .cm-content'); if(!e)return false; e.focus(); return true;});
    await page.keyboard.type(' EDIT_TEST'); await page.waitForTimeout(300);
    const has = await page.evaluate(()=>(document.querySelector('#viewTwo .cm-content')?.innerText||'').includes('EDIT_TEST'));
    assert(ed&&has,'不可编辑或文本未写入'); return 'editable:'+has;
  });
  await run('T6.28 接受Theirs仅三栏可点', async () => {
    const twoDisabled = await page.evaluate(()=>document.getElementById('btnAcceptTheirs').disabled);
    await page.evaluate(()=>document.getElementById('btnViewThree').click()); await page.waitForTimeout(400);
    const threeDisabled = await page.evaluate(()=>document.getElementById('btnAcceptTheirs').disabled);
    assert(twoDisabled===true&&threeDisabled===false,`two=${twoDisabled} three=${threeDisabled}`); return 'ok';
  });
  await run('T6.34 空文件对比不崩溃', async () => { await page.evaluate(()=>document.getElementById('btnViewTwo').click()); await page.waitForTimeout(300); const ok=await page.evaluate(()=>!!document.querySelector('#viewTwo .cm-editor')); assert(ok,'崩溃'); return 'ok'; });
  // T6.39 对比页工具栏溢出
  for (const W of [480,768,900,1280]) {
    await gotoCompare();
    await run(`T6.39 对比工具栏@${W}px 无用户不可达按钮`, async () => {
      const mt = await measureToolbar('#compareToolbar', W);
      const reachable = mt.overflow <= 0 || mt.hasScrollBtns;
      assert(reachable, `溢出${mt.overflow}px, 不可见${mt.offscreenCount}个, scrollBtns=${mt.hasScrollBtns} | ${JSON.stringify(mt.offscreen)}`);
      return `overflow=${mt.overflow} off=${mt.offscreenCount}`;
    });
  }

  // ===== L7 主题 =====
  await gotoEditor();
  await run('L7.1 切暗色 data-theme 变化', async () => {
    const dt = await page.evaluate(()=>{const sel=document.getElementById('themeSelect')||document.getElementById('editorThemeSelect'); if(sel){sel.value='dark'; sel.dispatchEvent(new Event('change'));} return document.documentElement.getAttribute('data-theme');});
    assert(dt!=='light','暗色下 data-theme 仍为 light ('+dt+')'); return 'data-theme='+dt;
  });

  // ===== L9 边界 =====
  await gotoEditor();
  await run('L9.1 空文档不崩', async () => { await page.evaluate(()=>{const ed=document.querySelector('.cm-content'); ed.focus(); document.execCommand('selectAll'); document.execCommand('insertText',false,'');}); await page.waitForTimeout(200); const ok=await page.evaluate(()=>!!document.querySelector('.cm-content')); assert(ok,'崩溃'); return 'ok'; });
  await run('L9.5 脚本字符不执行(XSS)', async () => { await page.evaluate(()=>{const ed=document.querySelector('.cm-content'); ed.focus();}); await page.keyboard.type('<img src=x onerror=alert(1)>'); await page.waitForTimeout(300); const no=await page.evaluate(()=>!document.querySelector('#previewContainer img[onerror]')); assert(no,'存在危险属性'); return 'safe'; });
  await run('L9.7 极窄480关键按钮可达', async () => {
    const mt = await measureToolbar('#toolbar', 480);
    if (mt.hasScrollBtns) return 'scrollBtns=true, 关键按钮经横向滚动可达';
    const miss = await page.evaluate((ids) => {
      const R = document.getElementById('toolbar').getBoundingClientRect();
      return ids.filter(id => { const b = document.getElementById(id); if (!b) return false; const br = b.getBoundingClientRect(); return br.right > R.right + 1 || br.left < R.left - 1; });
    }, ['btnChromeMode','btnCompare','btnBold','btnStyleCenter','btnStyleHighlight','btnColor','btnFontSize']);
    assert(miss.length === 0, '极窄下关键按钮不可达: ' + JSON.stringify(miss));
    return 'miss=' + miss.length;
  });

} catch (e) {
  console.log('HARNESS ERROR:', e.message, e.stack);
  results.push({ name:'harness-exception', pass:false, detail:e.message });
  await shot('harness-exception');
}

const passN = results.filter(r=>r.pass).length;
const failN = results.length - passN;
console.log(`\n===== 测试汇总: ${passN}/${results.length} 通过 (失败 ${failN}) =====`);
for (const r of results) console.log(`${r.pass?'PASS':'FAIL'} ${r.name} — ${r.detail}`);
fs.writeFileSync(path.join(__dirname,'test-report-full-v1.8.5.json'), JSON.stringify({ pass:passN, total:results.length, fails:results.filter(r=>!r.pass), httpFailures, consoleErrors }, null, 2));
await browser.close();
server.close();
process.exit(failN===0?0:1);
