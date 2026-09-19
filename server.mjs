import http from 'node:http';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import {parseAIResult} from './public/circuit-format.js';
import {VISION_PROMPT} from './vision-prompt.mjs';

const root = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const MAX_BODY = 12 * 1024 * 1024;
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.txt':'text/plain; charset=utf-8','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.eot':'application/vnd.ms-fontobject','.ico':'image/x-icon','.zip':'application/zip'};
export function isPublicAddress(address) {
  const a = address.toLowerCase();
  if (net.isIP(a) === 4) {
    const [x,y] = a.split('.').map(Number);
    return !(x===0||x===10||x===127||x>=224||(x===169&&y===254)||(x===172&&y>=16&&y<=31)||(x===192&&[0,168].includes(y))||(x===100&&y>=64&&y<=127)||(x===198&&[18,19].includes(y)));
  }
  // Only global unicast IPv6; explicitly exclude IPv4 embedded addresses and documentation ranges.
  return net.isIP(a) === 6 && /^[23]/.test(a) && !a.startsWith('2001:db8') && !a.startsWith('2002:') && !a.includes('ffff:');
}

async function targetFor(baseUrl, protocol) {
  let u;
  try {u=new URL(baseUrl);} catch {throw new Error('接口地址不是有效的 HTTPS URL。');}
  if (u.protocol!=='https:' || u.username || u.password || (u.port && u.port!=='443') || u.search || u.hash) throw new Error('请填写公共 HTTPS 接口地址，不包含账号、查询参数或自定义端口。');
  const hostname=u.hostname.replace(/^\[|\]$/g,'');
  if (hostname==='localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new Error('不能使用本地或内网接口地址。');
  const resolved=net.isIP(hostname)?[{address:hostname,family:net.isIP(hostname)}]:await dns.lookup(hostname,{all:true});
  if (!resolved.length || resolved.some(x=>!isPublicAddress(x.address))) throw new Error('接口地址必须指向公共网络。');
  const suffix=protocol==='responses'?'/responses':'/chat/completions';
  u.pathname=u.pathname.replace(/\/$/,'');
  if (!u.pathname.endsWith(suffix)) u.pathname+=suffix;
  return {url:u,address:resolved[0]};
}

function sendUpstream(target, apiKey, payload, signal) {
  return new Promise((resolve,reject)=>{
    const body=JSON.stringify(payload);
    const req=https.request(target.url,{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`,'Content-Length':Buffer.byteLength(body)},signal,
      // Pin this connection to the public address checked above, preventing DNS rebinding.
      lookup:(_hostname,opts,cb)=>opts?.all?cb(null,[target.address]):cb(null,target.address.address,target.address.family),
      timeout:150000
    },res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>3*1024*1024){req.destroy(new Error('模型返回内容过大。'));return;}chunks.push(chunk);});
      res.on('end',()=>{
        let data;try {data=JSON.parse(Buffer.concat(chunks).toString());}catch{reject(new Error(`接口没有返回 JSON（HTTP ${res.statusCode}）。请检查地址和协议。`));return;}
        if(res.statusCode<200||res.statusCode>=300){
          const brief=String(data.error?.message||data.message||'接口请求失败').replaceAll(apiKey,'[redacted]').slice(0,350);
          reject(new Error(`模型接口返回 HTTP ${res.statusCode}：${brief}`));return;
        }
        resolve(data);
      });
      res.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(new Error('识别超过 150 秒，请缩小图片或换用响应更快的模型。')));
    req.on('error',reject);req.end(body);
  });
}

export function buildVisionPayload({protocol,model,image,instruction}) {
  const prompt='请重建图中的完整电路。用户补充：'+String(instruction||'无').slice(0,2500);
  if(protocol==='responses') return {model,instructions:VISION_PROMPT,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:image,detail:'high'}]}],max_output_tokens:10000};
  return {model,messages:[{role:'system',content:VISION_PROMPT},{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:image,detail:'high'}}]}],max_tokens:10000};
}

function json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function readJSON(req) {
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw new Error('上传内容超过 12 MB。');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new Error('请求不是有效的 JSON。');}
}

const active=new Map();
export const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/health'){json(res,200,{ok:true,vision:'user-configured'});return;}
  if(pathname==='/api/recognize'){
    if(req.method!=='POST'){json(res,405,{error:'只支持 POST 请求。'});return;}
    const origin=req.headers.origin;
    if(origin){try{if(new URL(origin).host!==req.headers.host){json(res,403,{error:'请从本应用页面发起识别。'});return;}}catch{json(res,403,{error:'无效来源。'});return;}}
    const peer=req.socket.remoteAddress||'unknown';
    if(active.get(peer)){json(res,429,{error:'已有识别任务运行，请等待完成或取消后再试。'});return;}
    active.set(peer,true);
    const abort=new AbortController();
    res.on('close',()=>{if(!res.writableEnded)abort.abort();});
    try {
      const data=await readJSON(req);
      if(!['chat','responses'].includes(data.protocol)) throw new Error('请选择接口协议。');
      if(typeof data.apiKey!=='string'||!data.apiKey.trim()||data.apiKey.length>2000||/[\r\n]/.test(data.apiKey)) throw new Error('请在设置里填写 API Key。');
      if(typeof data.model!=='string'||!data.model.trim()||data.model.length>150) throw new Error('请填写视觉模型名称。');
      if(typeof data.image!=='string'||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data.image)||data.image.length>10*1024*1024) throw new Error('需要 PNG、JPEG 或 WebP 图片。');
      const target=await targetFor(data.baseUrl,data.protocol);
      const upstream=await sendUpstream(target,data.apiKey,buildVisionPayload(data),abort.signal);
      let result;
      if(data.protocol==='responses') result=upstream.output_text||(upstream.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
      else result=upstream.choices?.[0]?.message?.content;
      if(Array.isArray(result))result=result.filter(p=>p.type==='text').map(p=>p.text).join('');
      if(!result)throw new Error('模型未返回电路内容。请确认该模型支持图像输入。');
      json(res,200,{result:parseAIResult(result)});
    } catch(err){if(!res.destroyed)json(res,400,{error:err.name==='AbortError'?'识别已取消。':err.message||'识别失败。'});}
    finally{active.delete(peer);}
    return;
  }
  if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Method not allowed'});return;}
  try {
    let decoded;try{decoded=decodeURIComponent(pathname);}catch{res.writeHead(400).end();return;}
    let filename=path.resolve(root,'.'+decoded);
    if(filename!==root&&!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const info=await stat(filename);if(info.isDirectory())filename=path.join(filename,'index.html');
    const data=await readFile(filename);
    res.writeHead(200,{'Content-Type':MIME[path.extname(filename)]||'application/octet-stream','Cache-Control':filename.includes('/engine/')?'public, max-age=86400':'no-cache'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
});

export function openBrowser(url) {
  const [cmd,argv]=process.platform==='darwin'?['open',[url]]
    :process.platform==='win32'?['cmd',['/c','start','',url]]
    :['xdg-open',[url]];
  try {spawn(cmd,argv,{stdio:'ignore',detached:true}).on('error',()=>{}).unref();} catch {}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const portFlag=args.find(a=>a.startsWith('--port='));
  const portIndex=args.indexOf('--port');
  const port=Number(portFlag?portFlag.slice(7):portIndex>=0?args[portIndex+1]:process.env.PORT||4175);
  const address=`http://localhost:${port}`;
  server.listen(port,'0.0.0.0',()=>{
    console.log(`Circuit Notebook listening on ${port}`);
    console.log(`打开 ${address}（Ctrl+C 停止）`);
    if(args.includes('--open')) openBrowser(address);
  });
}
