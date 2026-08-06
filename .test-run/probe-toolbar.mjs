import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = 8124;
const BROWSER = 'D:\\Tools\\360Chrome\\360chromex.exe';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.map':'application/json' };
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/src/editor.html'; const fp=path.normalize(path.join(ROOT,p)); if(!fp.startsWith(ROOT)){res.writeHead(403);res.end();return;} fs.readFile(fp,(e,d)=>{ if(e){res.writeHead(404);res.end('404');return;} res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});res.end(d);}); });
try {
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launchPersistentContext('', { executablePath: BROWSER, headless:false, args:['--no-sandbox','--disable-gpu','--window-size=1440,900'] });
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('http://localhost:'+PORT+'/src/editor.html',{waitUntil:'load',timeout:30000});
  await page.waitForSelector('#toolbar',{timeout:15000});
  await page.evaluate(()=>{ try{localStorage.clear();}catch{} const ov=document.getElementById('onboardingOverlay'); if(ov)ov.remove(); });
  await page.waitForTimeout(600);
  const data = await page.evaluate(()=>{
    const tb = document.getElementById('toolbar');
    const seq = [];
    tb.querySelectorAll('.toolbar-left, .toolbar-center, .toolbar-right').forEach(sec=>{
      seq.push('['+sec.className+']');
      [...sec.children].forEach(ch=>{ seq.push('  - '+ch.tagName+'.'+(ch.className||'')+(ch.id?'#'+ch.id:'')); });
    });
    const items = [];
    tb.querySelectorAll('.toolbar-left *, .toolbar-center *, .toolbar-right *').forEach(el=>{
      const cs=getComputedStyle(el);
      const r=el.getBoundingClientRect();
      const interesting = el.classList.contains('toolbar-divider')||el.classList.contains('toolbar-group')||el.tagName==='BUTTON';
      if(interesting) items.push({ cls:el.className, id:el.id, jc:cs.justifyContent, gap:cs.gap, ml:cs.marginLeft, mr:cs.marginRight, disp:cs.display, left:Math.round(r.left), right:Math.round(r.right), w:Math.round(r.width), h:Math.round(r.height) });
    });
    return { seq, items };
  });
  console.log('STRUCTURE:'); data.seq.forEach(s=>console.log(s));
  console.log('\nITEMS:'); data.items.forEach(i=>console.log(JSON.stringify(i)));
  await browser.close(); server.close();
} catch(e){ console.log('ERR', e.message); process.exit(1); }
