import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = 8128;
const BROWSER = 'D:\\Tools\\360Chrome\\360chromex.exe';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.map':'application/json' };
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/src/editor.html'; const fp=path.normalize(path.join(ROOT,p)); if(!fp.startsWith(ROOT)){res.writeHead(403);res.end();return;} fs.readFile(fp,(e,d)=>{ if(e){res.writeHead(404);res.end('404');return;} res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});res.end(d);}); });
try {
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launchPersistentContext('', { executablePath: BROWSER, headless:false, args:['--no-sandbox','--disable-gpu','--window-size=1440,900'] });
  const page = browser.pages()[0] || await browser.newPage();
  // replicate gotoEditor (with onboarding click + daily)
  await page.goto('http://localhost:'+PORT+'/src/editor.html',{waitUntil:'load',timeout:30000});
  await page.evaluate(() => { try { localStorage.clear(); } catch {} try { localStorage.setItem('md-editor-chrome-mode','daily'); } catch {} });
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
    const tb = document.getElementById('toolbar');
    const tbr = tb.getBoundingClientRect();
    const btns = [...document.querySelectorAll('#toolbar button')];
    return btns.map(b => { const r=b.getBoundingClientRect(); const cs=getComputedStyle(b); return { id:b.id, disp:cs.display, vis:cs.visibility, pos:cs.position, w:Math.round(r.width), left:Math.round(r.left) }; });
  });
  out.forEach(b => console.log(`BTN ${b.id} disp=${b.disp} vis=${b.vis} pos=${b.pos} w=${b.w} left=${b.left}`));
  await browser.close(); server.close();
} catch(e){ console.log('ERR', e.message); process.exit(1); }
