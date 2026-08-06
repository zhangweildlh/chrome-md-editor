import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = 8127;
const BROWSER = 'D:\\Tools\\360Chrome\\360chromex.exe';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.map':'application/json' };
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/src/editor.html'; const fp=path.normalize(path.join(ROOT,p)); if(!fp.startsWith(ROOT)){res.writeHead(403);res.end();return;} fs.readFile(fp,(e,d)=>{ if(e){res.writeHead(404);res.end('404');return;} res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});res.end(d);}); });
try {
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launchPersistentContext('', { executablePath: BROWSER, headless:false, args:['--no-sandbox','--disable-gpu','--window-size=1440,900'] });
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('http://localhost:'+PORT+'/src/editor.html',{waitUntil:'load',timeout:30000});
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.waitForSelector('#toolbar',{timeout:15000});
  await page.waitForTimeout(600);
  const out = await page.evaluate(() => {
    const res = [];
    document.querySelectorAll('#toolbar .toolbar-group').forEach((g, gi) => {
      const cs = getComputedStyle(g);
      const gr = g.getBoundingClientRect();
      const kids = [...g.children].map(c => { const r = c.getBoundingClientRect(); const s = getComputedStyle(c); return { t:c.tagName, cls:(c.className||'')+ '', id:c.id, left:Math.round(r.left), right:Math.round(r.right), w:Math.round(r.width), disp:s.display, pos:s.position, ml:s.marginLeft, mr:s.marginRight, vis:s.visibility }; });
      res.push({ gi, left:Math.round(gr.left), right:Math.round(gr.right), w:Math.round(gr.width), padL:cs.paddingLeft, padR:cs.paddingRight, jc:cs.justifyContent, kids });
    });
    return res;
  });
  out.forEach(g => {
    console.log(`G${g.gi} [${g.left}-${g.right}] w=${g.w} pad=${g.padL}/${g.padR} jc=${g.jc}`);
    g.kids.forEach(k => console.log(`    ${k.t}.${k.cls}${k.id?'#'+k.id:''} [${k.left}-${k.right}] w=${k.w} disp=${k.disp} pos=${k.pos} ml=${k.ml} mr=${k.mr} vis=${k.vis}`));
  });
  await browser.close(); server.close();
} catch(e){ console.log('ERR', e.message); process.exit(1); }
