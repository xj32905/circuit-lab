// Run with PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs and CHROMIUM_PATH set if needed.
// The image API is deliberately mocked in one test: it tests UI/data flow, not vision quality.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const base=process.env.TEST_BASE||'http://127.0.0.1:4175';
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const result=[];
const waitTime=t=>page.waitForFunction(t=>window.circuitNotebook?.ready&&circuitNotebook.sim.getTime()>t,t,{timeout:25000});
const snapshot=()=>page.evaluate(()=>{
  const rows=circuitNotebook.scope.snapshot();const stats=[1,2].map(k=>{let lo=Infinity,hi=-Infinity,sum=0;for(const r of rows){lo=Math.min(lo,r[k]);hi=Math.max(hi,r[k]);sum+=r[k];}return {min:lo,max:hi,mean:sum/rows.length,vpp:hi-lo};});
  let covariance=0;for(const r of rows)covariance+=(r[1]-stats[0].mean)*(r[2]-stats[1].mean);
  return {t:circuitNotebook.sim.getTime(),running:circuitNotebook.sim.isRunning(),stats,gain:stats[1].vpp/stats[0].vpp,covariance};
});
try{
  await page.goto(base,{waitUntil:'networkidle'});await waitTime(.07);
  const ce=await snapshot();assert(ce.running);assert(ce.gain>3.4&&ce.gain<3.9);assert(ce.covariance<0);result.push({test:'共射极反相放大',gain:ce.gain});
  await page.locator('#playBtn').click();const stopped=await page.evaluate(()=>circuitNotebook.sim.getTime());await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>circuitNotebook.sim.getTime()),stopped);await page.locator('#playBtn').click();
  await page.locator('[data-preset="rc"]').click();await waitTime(.07);const rc=await snapshot();const expected=1/Math.sqrt(1+(2*Math.PI*100*1000*1e-6)**2);assert(Math.abs(rc.gain-expected)<.004);result.push({test:'RC理论幅频响应',actual:rc.gain,expected});
  await page.locator('#componentSelect').selectOption('1');await page.locator('#field-6').fill('2k');await page.locator('#applyComponentBtn').click();await waitTime(.07);const rcChanged=await snapshot();assert(rcChanged.gain<.64&&rcChanged.gain>.6);result.push({test:'电阻变更影响仿真',gain:rcChanged.gain});
  await page.locator('#field-6').fill('-1');await page.locator('#applyComponentBtn').click();assert.match(await page.locator('#toast').innerText(),/大于 0/);
  await page.locator('[data-preset="opamp"]').click();await waitTime(.07);const op=await snapshot();assert(Math.abs(op.gain-3)<.003);assert(op.covariance<0);result.push({test:'运放闭环增益',gain:op.gain});
  await page.locator('#componentSelect').selectOption('0');await page.locator('#field-8').fill('6');await page.locator('#applyComponentBtn').click();await waitTime(.07);const clipped=await snapshot();assert(clipped.stats[1].max>14.9&&clipped.stats[1].max<15.1);assert(clipped.stats[1].min< -14.9&&clipped.stats[1].min> -15.1);result.push({test:'运放电源限幅',min:clipped.stats[1].min,max:clipped.stats[1].max});
  await page.locator('[data-preset="rectifier"]').click();await waitTime(.18);const rect=await snapshot();assert(rect.stats[1].min>5&&rect.stats[1].max<8);result.push({test:'半波整流滤波',range:[rect.stats[1].min,rect.stats[1].max]});
  await page.locator('#channelB').selectOption('2');await waitTime(.21);assert.equal(await page.evaluate(()=>circuitNotebook.scope.units[1]),'A');
  await page.locator('#acCoupling').check();assert.equal(await page.evaluate(()=>circuitNotebook.scope.ac),true);await page.locator('#acCoupling').uncheck();
  await page.locator('[data-preset="ce"]').click();await waitTime(.05);
  const beforeEdit=await page.evaluate(()=>circuitNotebook.sim.getElements().length);
  await page.locator('#editModeBtn').click();await waitTime(.02);assert.equal(await page.evaluate(()=>circuitNotebook.sim.getElements().length),beforeEdit);assert(await page.frameLocator('#circuitFrame').locator('.gwt-MenuBar-horizontal').isVisible());
  await page.locator('#editModeBtn').click();await waitTime(.03);result.push({test:'原生编辑菜单、XML 往返',passed:true});
  const savePromise=page.waitForEvent('download');await page.locator('#saveBtn').click();const save=await savePromise;const savePath=await save.path();const saved=JSON.parse(await readFile(savePath,'utf8'));assert(saved.circuit.circuit.startsWith('<cir'));
  await page.locator('[data-preset="rc"]').click();await waitTime(.02);await page.locator('#circuitInput').setInputFiles({name:'恢复.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await waitTime(.04);assert.match(await page.locator('#circuitTitle').innerText(),/共射极/);result.push({test:'保存下载、重新导入',passed:true});
  const csvPromise=page.waitForEvent('download');await page.locator('#exportCsvBtn').click();const csv=await csvPromise;assert((await readFile(await csv.path(),'utf8')).split('\n').length>100);
  // Create a genuine image from the running simulator as the upload fixture.
  const picture=await page.locator('#circuitFrame').screenshot();
  await page.locator('#imageInput').setInputFiles({name:'教材电路.png',mimeType:'image/png',buffer:picture});await page.locator('#uploadDialog').waitFor({state:'visible'});
  await page.locator('#referenceOnlyBtn').click();assert(await page.locator('#sourcePanel').isVisible());
  await page.locator('#settingsBtn').click();await page.locator('#apiBase').fill('https://vision.example/v1');await page.locator('#apiModel').fill('test-vision-model');await page.locator('#apiKey').fill('test-secret-do-not-save');await page.locator('#settingsForm button[type=submit]').click();
  assert(!await page.evaluate(()=>JSON.stringify(localStorage).includes('test-secret-do-not-save')));
  await page.route('**/api/recognize',async route=>{
    const request=route.request().postDataJSON();assert.equal(request.model,'test-vision-model');assert(request.image.startsWith('data:image/jpeg;base64,'));
    const {PRESETS}=await import('../public/presets.js');
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:{...PRESETS[1],title:'测试接口返回的RC电路',assumptions:['这是测试替身返回结果，用于验证流程，不代表识图实测。']}})});
  });
  await page.locator('#reRecognizeBtn').click();await page.locator('#recognizeBtn').click();await page.locator('#loadRecognizedBtn').waitFor({state:'visible'});assert.match(await page.locator('#recognitionResult').innerText(),/测试替身/);await page.locator('#loadRecognizedBtn').click();await waitTime(.06);assert.match(await page.locator('#circuitTitle').innerText(),/测试接口/);result.push({test:'图片上传→配置→识别结果审核→仿真（API为测试替身）',passed:true});
  await page.unroute('**/api/recognize');
  await page.route('**/api/recognize',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'测试：图片连线不清楚'})}));
  await page.locator('#reRecognizeBtn').click();await page.locator('#recognizeBtn').click();await page.waitForFunction(()=>document.querySelector('#recognitionStatus').textContent.includes('测试：'));assert(await page.locator('#loadRecognizedBtn').isHidden());await page.locator('#uploadDialog .modal-close button').click();
  await page.locator('#textImportBtn').click();await page.locator('#circuitText').fill('invalid circuit');await page.locator('#loadTextBtn').click();assert.match(await page.locator('#textImportStatus').innerText(),/CircuitJS/);await page.locator('#textDialog .modal-close button').click();
  await page.locator('[data-preset="ce"]').click();await waitTime(.055);await page.screenshot({path:'/tmp/circuit-notebook-desktop.png',fullPage:true});
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base,{waitUntil:'networkidle'});await mobile.waitForFunction(()=>circuitNotebook?.ready&&circuitNotebook.sim.getTime()>.05);assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await mobile.locator('[data-preset="rc"]').click();await mobile.waitForFunction(()=>circuitNotebook.sim.getTime()>.04);await mobile.locator('#playBtn').click();assert.equal(await mobile.evaluate(()=>circuitNotebook.sim.isRunning()),false);await mobile.locator('#playBtn').click();
  await mobile.screenshot({path:'/tmp/circuit-notebook-mobile.png',fullPage:true});await mobile.locator('#settingsBtn').click();assert(await mobile.locator('#settingsDialog').isVisible());assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));result.push({test:'手机布局、切换和暂停',passed:true});await mobile.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results:result,pageErrors:errors},null,2));
}finally{await browser.close();}
