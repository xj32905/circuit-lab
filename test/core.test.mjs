import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCircuit,parseAIResult,parseEngineering,stripScopes} from '../public/circuit-format.js';
import {PRESETS} from '../public/presets.js';
import {isPublicAddress,buildVisionPayload,server} from '../server.mjs';

test('all presets pass validation and probe indices stay in bounds',()=>{
  for(const p of PRESETS){const checked=validateCircuit(p.circuit,{strict:true});for(const q of p.probes){assert(q.element>=0&&q.element<checked.count);}assert(checked.count>2);}
});
test('engineering unit parsing preserves milli and mega distinction',()=>{
  assert.equal(parseEngineering('4.7k'),4700);assert.equal(parseEngineering('2M'),2e6);assert.equal(parseEngineering('2m'),.002);assert.equal(parseEngineering('2meg'),2e6);
  assert(Math.abs(parseEngineering('100nF')-1e-7)<1e-15);assert.throws(()=>parseEngineering('NaN'));assert.throws(()=>parseEngineering('3;alert(1)'));
});
test('model result validation refuses invalid data instead of substituting a template',()=>{
  assert.throws(()=>parseAIResult({unsupported:true,reason:'图片不清晰'}),/图片不清晰/);
  assert.throws(()=>parseAIResult('not json'),/有效/);
  assert.throws(()=>parseAIResult({circuit:PRESETS[1].circuit.replace('0 1000','0 -1000')}),/正数/);
  const result=parseAIResult('```json\n'+JSON.stringify({title:'识别图',circuit:PRESETS[1].circuit,assumptions:['输入设为100Hz'],probes:[{element:0,post:0,label:'Vin',quantity:'voltage'}]})+'\n```');
  assert.equal(result.title,'识别图');assert.equal(result.assumptions[0],'输入设为100Hz');assert.equal(result.probes.length,1);
});
test('zener records require a positive forward drop and breakdown voltage',()=>{
  const base='$ 1 0.000005 4 55 5 50\nz 144 144 368 144 1 0.805904783 5.6\nw 144 144 144 240 0\nw 368 144 368 240 0\ng 144 240 144 272 0\n';
  const checked=validateCircuit(base,{strict:true});assert.equal(checked.count,4);
  assert.throws(()=>validateCircuit(base.replace(' 5.6','')),/不完整/);
  assert.throws(()=>validateCircuit(base.replace('5.6','0')),/正数/);
  assert.throws(()=>validateCircuit(base.replace('5.6','-3')),/正数/);
});
test('AI result accepts a zener diode and keeps its label',()=>{
  const circuit='$ 1 0.000005 4 55 5 50\nz 144 144 368 144 1 0.805904783 5.6\ng 144 144 144 176 0\n';
  const result=parseAIResult({title:'稳压管',circuit,components:[{element:0,id:'D1',name:'齐纳二极管'}]});
  assert.match(result.circuit,/^z /m);assert.equal(result.components[0].id,'D1');
});
test('invalid timesteps, missing fields and unsupported AI element types fail early',()=>{
  const p=PRESETS[1].circuit;assert.throws(()=>validateCircuit(p.replace('0.000005','0')));
  assert.throws(()=>validateCircuit(p.replace('r 144 176 384 176 0 1000','r 144 176 384 176')));
  assert.throws(()=>validateCircuit(p+'999 1 2 3 4 0\n',{strict:true}));
  assert(!stripScopes(p+'o 1 64 0 2 5 1\nh 3 1 2\n').includes('\no '));
});
test('proxy rejects local and metadata addresses for both IP families',()=>{
  for(const ip of ['127.0.0.1','10.2.3.4','169.254.169.254','172.16.0.3','192.168.1.5','100.64.0.1','0.0.0.0','::1','::ffff:127.0.0.1','fc00::1','fe80::1'])assert.equal(isPublicAddress(ip),false,ip);
  assert(isPublicAddress('1.1.1.1'));assert(isPublicAddress('2606:4700:4700::1111'));
});
test('image request payload uses the configured model and protocol',()=>{
  const data={model:'test-vision',image:'data:image/png;base64,AAAA',instruction:'12V'};
  const chat=buildVisionPayload({...data,protocol:'chat'});assert.equal(chat.model,'test-vision');assert.equal(chat.messages[1].content[1].image_url.url,data.image);
  const responses=buildVisionPayload({...data,protocol:'responses'});assert.equal(responses.input[0].content[1].type,'input_image');assert.equal(responses.input[0].content[1].image_url,data.image);
  assert(!JSON.stringify(chat).includes('apiKey'));
});
test('HTTP server returns assets, blocks off-origin recognition and reports missing setup',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const index=await fetch(base+'/');assert.equal(index.status,200);assert.match(await index.text(),/观电/);
    const health=await fetch(base+'/api/health');assert.equal((await health.json()).ok,true);
    const missing=await fetch(base+'/api/recognize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocol:'chat'})});assert.equal(missing.status,400);assert.match((await missing.json()).error,/API Key/);
    const origin=await fetch(base+'/api/recognize',{method:'POST',headers:{Origin:'https://unrelated.example'},body:'{}'});assert.equal(origin.status,403);
    const local=await fetch(base+'/api/recognize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocol:'chat',baseUrl:'https://127.0.0.1/v1',model:'test',apiKey:'test',image:'data:image/png;base64,AAAA'})});assert.equal(local.status,400);assert.match((await local.json()).error,/公共网络/);
    const secret=await fetch(base+'/server.mjs');assert.equal(secret.status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
