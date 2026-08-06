import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = 8126;
const BROWSER = 'D:\\Tools\\360Chrome\\360chromex.exe';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.map':'application/json' };
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/src/editor.html'; const fp=path.normalize(path.join(ROOT,p)); if(!fp.startsWith(ROOT)){res.writeHead(403);res.end();return;} fs.readFile(fp,(e,d)=>{ if(e){res.writeHead(404);res.end('404');return;} res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});res.end(d);}); });
try {
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launchPersistentContext('', { executablePath: BROWSER, headless:false, args:['--no-sandbox','--disable-gpu','--window-size=1440,900'] });
  const page = browser.pages()[0] || await browser.newPage();
  // replicate gotoEditor()
  await page.goto('http://localhost:'+PORT+'/src/editor.html',{waitUntil:'load',timeout:30000});
  await page.evaluate(() => { try { localStorage.clear(); } catch {} try { localStorage.setItem('md-editor-chrome-mode', 'daily'); } catch {} });
  await page.reload({ waitUntil:'load' });
  await page.waitForSelector('#toolbar',{timeout:15000});
  await page.evaluate(() => {
    const ov = document.getElementById('onboardingOverlay'); if (ov) ov.remove();
    const ob = document.getElementById('onboardingBtn') || document.getElementById('startBtn'); if (ob) ob.click();
    const t = document.getElementById('toolbar'); if (t) t.classList.remove('view-hidden');
    const s = document.getElementById('fileSidebar'); if (s) { s.classList.remove('view-hidden','collapsed'); }
  });
  await page.waitForTimeout(600);
  const out = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('#toolbar .toolbar-group')];
    const dividers = [...document.querySelectorAll('#toolbar .toolbar-divider')];
    const intra = [];
    const intraDetail = [];
    groups.forEach((g,gi) => { const bs = [...g.querySelectorAll('button')]; for (let i = 1; i < bs.length; i++) { const v = bs[i].getBoundingClientRect().left - bs[i-1].getBoundingClientRect().right; intra.push(v); intraDetail.push('G'+gi+' b'+i+':'+Math.round(v)); } });
    const toDiv = [];
    const toDivDetail = [];
    dividers.forEach((d,di) => { const prev = d.previousElementSibling; if (prev && prev.matches('.toolbar-group')) { const pb = prev.querySelector('button:last-child'); if (pb) { const v = d.getBoundingClientRect().left - pb.getBoundingClientRect().right; toDiv.push(v); toDivDetail.push('D'+di+' prev='+prev.className.slice(0,18)+':'+Math.round(v)); } } });
    const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
    const tb = document.getElementById('toolbar');
    const tbw = tb.getBoundingClientRect().width;
    const contentRight = Math.max(...[...document.querySelectorAll('#toolbar button')].map(b=>b.getBoundingClientRect().right));
    const seg = (sel) => { const el = document.querySelector('#toolbar '+sel); const s = getComputedStyle(el); return { jc:s.justifyContent, flex:s.flex, ml:s.marginLeft, sw:el.scrollWidth, cw:el.clientWidth }; };
    return { tbw: Math.round(tbw), tbScroll: tb.scrollWidth, tbClient: tb.clientWidth, contentRight: Math.round(contentRight),
      toolbar: seg(''), center: seg('.toolbar-center'), right: seg('.toolbar-right'),
      intraAvg: avg(intra), toDivAvg: avg(toDiv), toDivMax: toDiv.length?Math.max(...toDiv):0, intraDetail, toDivDetail };
  });
  console.log('toolbarWidth=' + out.tbw + ' contentRight=' + out.contentRight + ' tbScroll=' + out.tbScroll + ' tbClient=' + out.tbClient);
  console.log('toolbar=' + JSON.stringify(out.toolbar));
  console.log('center=' + JSON.stringify(out.center));
  console.log('right=' + JSON.stringify(out.right));
  console.log('intraAvg=' + Math.round(out.intraAvg) + ' toDivAvg=' + Math.round(out.toDivAvg) + ' toDivMax=' + Math.round(out.toDivMax));
  console.log('TO_DIV_DETAIL:'); out.toDivDetail.forEach(d=>console.log('  '+d));
  console.log('INTRA_DETAIL:'); out.intraDetail.forEach(d=>console.log('  '+d));
  await browser.close(); server.close();
} catch(e){ console.log('ERR', e.message); process.exit(1); }
