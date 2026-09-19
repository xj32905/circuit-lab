import {PRESETS} from './presets.js';
import {validateCircuit,parseAIResult,stripScopes,circuitLines,engineering,parseEngineering} from './circuit-format.js';
import {Scope} from './scope.js';
import {normalizeCircuit,elementRecords,changeRecord,changeSpeed,resetInitialState} from './native-format.js';

const $=id=>document.getElementById(id);
const icons={
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m5 12 4 4L19 6"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.8-2.5 2-2.5 3.5m0 3h.01"/>',
  settings:'<path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/><circle cx="12" cy="12" r="3"/>',
  scan:'<path d="M8 3H4v5m12-5h4v5M4 16v5h4m8 0h4v-5M2 12h20M8 7h8v10H8Z"/>',
  file:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 13h8m-8 4h5"/>',code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',play:'<path d="m8 4 12 8-12 8Z"/>',
  reset:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',speed:'<path d="M3 16a9 9 0 1 1 18 0M12 12l5-5M4 17h16"/>',
  edit:'<path d="m14 4 6 6M3 21l5-1L21 7l-5-5L3 15Z"/>',wave:'<path d="M2 12c4-15 6 15 10 0s6 15 10 0"/>',
  sliders:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
  book:'<path d="M12 5v16M3 3c4-1 6 0 9 2 3-2 5-3 9-2v16c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
  expand:'<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>',key:'<circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-3-3 3-3m-6 0 3-3"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
  transistor:'<path d="M3 12h6m0-8v16m0-8 8-7V2m-8 10 8 7v3m-5-7 5 4-1-5"/><circle cx="12" cy="12" r="10"/>',
  diode:'<path d="M2 12h5m10 0h5M7 5v14l10-7ZM17 5v14"/>',opamp:'<path d="m6 3 16 9L6 21Zm-5 5h5m-5 8h5m2-8h4m-4 8h4m-2-2v4"/>'
};
function svg(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.wave}</svg>`;}
function renderIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=svg(el.dataset.icon));}
renderIcons();
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function toast(message,error=false){const el=$('toast');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,4200);}
const state={sim:null,elements:[],current:structuredClone(PRESETS[0]),source:null,probes:[],a:0,b:1,loading:false,editMode:false,ready:false,pendingImage:null,recognized:null,recognizeController:null,recognitionTimer:null,config:{protocol:'chat',baseUrl:'',model:'',apiKey:''},lastRender:0,engineError:false};
try{Object.assign(state.config,JSON.parse(localStorage.getItem('circuit-notebook-settings')||'{}'),{apiKey:''});}catch{}
const scope=new Scope($('scopeCanvas'),({stats,count,sharedScale})=>{
  $('scopeEmpty').hidden=count>1;
  const units=scope.units;
  $('vppA').textContent=count?engineering(stats[0].vpp,units[0]):'—';$('vppB').textContent=count?engineering(stats[1].vpp,units[1]):'—';
  $('gainValue').textContent=count>20&&units[0]===units[1]&&stats[0].vpp>1e-8?(stats[1].vpp/stats[0].vpp).toFixed(2)+' ×':'—';
  $('axisNote').textContent=sharedScale?'共用纵轴 · 可直接比较幅度':'左右独立纵轴 · 电压 / 电流';
});

for(const p of PRESETS){const btn=node('button',undefined,'preset-card');btn.dataset.preset=p.id;btn.innerHTML=`<span class="preset-icon">${svg(p.icon)}</span><span><strong></strong><small></small></span>`;btn.querySelector('strong').textContent=p.title;btn.querySelector('small').textContent=p.tag;btn.addEventListener('click',()=>loadCircuit(structuredClone(p),{source:null}));$('presetList').append(btn);}

function renderCurrent(){
  const c=state.current;$('circuitTitle').textContent=c.title;$('circuitOrigin').textContent=c.id?'示例电路':c.origin||'我的电路';$('circuitSummary').textContent=c.summary||'在画布中选择元件，比较节点电压和支路电流；每次只改一个参数，观察波形变化。';
  $('questions').replaceChildren(...(c.questions||['比较输入与输出的幅度和相位。','改变一个元件的数值，再观察波形。','核对静态电压，看看元件处于什么工作状态。']).map(q=>node('li',q)));
  $('assumptions').replaceChildren(...(c.assumptions?.length?c.assumptions:['请根据原图核对元件数值、连接和模型。']).map(q=>node('li',q)));
  $('assumptionCount').textContent=c.assumptions?.length?`(${c.assumptions.length})`:'';
  document.querySelectorAll('.preset-card').forEach(b=>b.classList.toggle('active',b.dataset.preset===c.id));
  $('sourcePanel').hidden=!state.source;
  if(state.source){$('sourceThumb').src=state.source.data;$('sourceFullImage').src=state.source.data;$('sourceName').textContent=state.source.name||'教材截图';}
}

function normalizeSource(source){return source&&typeof source.data==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(source.data)&&source.data.length<11e6?{data:source.data,name:String(source.name||'电路截图').slice(0,180)}:null;}

function loadCircuit(circuit,{source=state.source,origin}={}){
  try{
    const checked=normalizeCircuit(circuit.circuit);
    const next={...circuit,circuit:checked,title:String(circuit.title||'我的电路').slice(0,100)};
    for(const key of ['questions','assumptions'])next[key]=Array.isArray(next[key])?next[key].slice(0,25).map(v=>String(v).slice(0,1600)):[];
    next.components=Array.isArray(next.components)?next.components.filter(v=>Number.isInteger(v?.element)&&v.element>=0).slice(0,450).map(v=>({element:v.element,id:String(v.id||'').slice(0,50),name:String(v.name||'').slice(0,100)})):[];
    next.probes=Array.isArray(next.probes)?next.probes.filter(v=>Number.isInteger(v?.element)&&v.element>=0&&Number.isInteger(v?.post)&&v.post>=0&&v.post<8).slice(0,25).map(v=>({...v,label:String(v.label||'测量点').slice(0,60),quantity:v.quantity==='current'?'current':'voltage'})):[];
    if(!next.questions.length)delete next.questions;
    if(origin)next.origin=origin;
    if(next.title!==state.current.title||next.id!==state.current.id){state.a=0;state.b=1;$('componentSelect').value='';}
    state.current=next;state.source=normalizeSource(source);scope.clear();
    if(circuit.timeWindow&&Number.isFinite(circuit.timeWindow)&&circuit.timeWindow>=.0001&&circuit.timeWindow<=10){scope.window=circuit.timeWindow;if([...$('timeWindow').options].some(o=>+o.value===scope.window))$('timeWindow').value=String(scope.window);}
    renderCurrent();
    if(state.sim){state.loading=true;state.sim.setSimRunning(false);state.sim.importCircuit(checked,false);state.sim.setSimRunning(true);setTimeout(()=>{state.loading=false;refreshElements();},80);}
    else toast('电路已选好，等待引擎启动。');
    return true;
  }catch(e){toast(e.message,true);return false;}
}

function elementName(index,type){
  const own=state.current.components?.find(c=>c.element===index);
  if(own)return `${own.id} · ${own.name}`;
  const names={ResistorElm:'电阻',CapacitorElm:'电容',InductorElm:'电感',RailElm:'信号源',VoltageElm:'电压源',TransistorElm:'三极管',OpAmpElm:'运算放大器',DiodeElm:'二极管',OutputElm:'输出',SwitchElm:'开关',GroundElm:'地',WireElm:'导线',LabeledNodeElm:'节点标签',CurrentElm:'电流源'};
  return `${names[type]||type.replace(/Elm$/,'')} ${index+1}`;
}
function buildProbes(){
  const list=[];const keys=new Set();
  function add(p){const e=state.elements[p.element];if(!e)return;if(p.quantity!=='current'&&(p.post<0||p.post>=e.getPostCount()))return;const key=`${p.element}:${p.quantity}:${p.post}`;if(keys.has(key))return;keys.add(key);list.push({...p,key});}
  for(const p of state.current.probes||[])add(p);
  state.elements.forEach((e,i)=>{
    const type=e.getType(),name=elementName(i,type);if(['WireElm','GroundElm','TextElm'].includes(type))return;
    if(type==='LabeledNodeElm'){add({label:e.getLabelName(),element:i,post:0,quantity:'voltage'});return;}
    for(let p=0;p<e.getPostCount();p++){const pin=type==='TransistorElm'?['B','C','E'][p]:type==='OpAmpElm'?['−','+','OUT'][p]:e.getPostCount()===1?'':`${p+1}`;add({label:`${name.split(' · ')[0]}${pin?' / '+pin:''} 电压`,element:i,post:p,quantity:'voltage'});}
    if(e.getPostCount()===2&&!['OutputElm'].includes(type))add({label:`${name.split(' · ')[0]} 电流`,element:i,post:0,quantity:'current'});
  });
  state.probes=list;
  for(const [id,selected]of [['channelA',state.a],['channelB',state.b]]){$(id).replaceChildren(...list.map((p,i)=>{const op=node('option',p.label);op.value=String(i);return op;}));$(id).value=String(Math.min(selected,Math.max(0,list.length-1)));}
  state.a=+($('channelA').value||0);state.b=+($('channelB').value||0);updateUnits();
}
function refreshElements(){
  if(!state.sim)return;try{
    const old=state.elements;state.elements=Array.from(state.sim.getElements());
    // Edits that change element ordering invalidate labels imported from the image.
    const structurallyChanged=!state.loading&&old.length&&(old.length!==state.elements.length||old.some((e,i)=>e.getType()!==state.elements[i]?.getType()));
    if(structurallyChanged){state.current.components=[];state.current.probes=[];state.a=0;state.b=1;scope.clear();}
    buildProbes();const selected=$('componentSelect').value;
    const editable=[];state.elements.forEach((e,i)=>{if(['ResistorElm','CapacitorElm','InductorElm','RailElm','VoltageElm','TransistorElm','OpAmpElm','SwitchElm','CurrentElm','DiodeElm'].includes(e.getType())){const opt=node('option',elementName(i,e.getType()));opt.value=String(i);editable.push(opt);}});
    $('componentSelect').replaceChildren(...editable);
    if(editable.some(o=>o.value===selected))$('componentSelect').value=selected;
    else if(state.current.input!==undefined&&editable.some(o=>+o.value===state.current.input))$('componentSelect').value=String(state.current.input);
    renderComponent();
  }catch(e){toast('读取电路失败：'+e.message,true);}
}
function currentExport(){return state.sim?state.sim.exportCircuit():state.current.circuit;}
function getElementRecords(){return elementRecords(currentExport());}
const fieldSpecs={r:[['电阻',6,'Ω','positive']],c:[['电容',6,'F','positive']],l:[['电感',6,'H','positive']],i:[['电流',6,'A','any']],t:[['电流放大系数 β',9,'','positive']],a:[['输出上限',6,'V','any'],['输出下限',7,'V','any']],s:[['开关状态',6,'','switch']]};
function renderComponent(){
  const index=Number($('componentSelect').value);const record=getElementRecords()[index];const box=$('componentFields');box.replaceChildren();
  if(!record){box.append(node('p','可在画布中双击元件编辑。','component-empty'));$('applyComponentBtn').disabled=true;return;}
  let fields=fieldSpecs[record.t[0]];
  if(['R','v'].includes(record.t[0]))fields=[['波形',6,'','wave'],['振幅 / 直流值',8,'V','any'],['频率',7,'Hz','frequency'],['直流偏置',9,'V','any']];
  if(!fields){box.append(node('p','这个元件可在画布中双击，打开完整参数。','component-empty'));$('applyComponentBtn').disabled=true;return;}
  $('applyComponentBtn').disabled=false;
  for(const [label,col,unit,kind]of fields){
    const row=node('div',undefined,'field-row');const lab=node('label',label,'field-label');lab.htmlFor=`field-${col}`;row.append(lab);
    let input;
    if(kind==='wave'||kind==='switch'){
      input=node('select',undefined,'wide-select');const options=kind==='wave'?[[0,'直流 DC'],[1,'正弦波'],[2,'方波'],[3,'三角波'],[4,'锯齿波'],[5,'脉冲']]:[[0,'闭合'],[1,'断开']];
      for(const[v,text]of options){const o=node('option',text);o.value=String(v);input.append(o);}input.value=record.t[col]||'0';
    }else{input=node('input');input.type='text';input.inputMode='decimal';input.value=engineering(Number(record.t[col]||0),'',5);}
    input.id=`field-${col}`;input.dataset.col=String(col);input.dataset.kind=kind;row.append(input,node('span',unit,'unit'));box.append(row);
  }
}
function applyComponent(){
  if(!state.sim)return;
  try{
    const index=Number($('componentSelect').value);const records=getElementRecords();const rec=records[index];if(!rec)throw new Error('元件已变化，请重新选择。');
    const text=currentExport();const changes={};
    for(const input of $('componentFields').querySelectorAll('[data-col]')){
      const value=parseEngineering(input.value);const kind=input.dataset.kind;
      if(kind==='positive'&&value<=0)throw new Error('这个参数必须大于 0。');
      if(kind==='frequency'&&(value<0||value>1e7))throw new Error('频率应在 0 到 10MHz 之间。');
      if(Math.abs(value)>1e12)throw new Error('数值过大。');rec.t[+input.dataset.col]=String(value);changes[input.dataset.col]=value;
    }
    if(rec.t[0]==='a'&&Number(rec.t[6])<=Number(rec.t[7]))throw new Error('输出上限应高于下限。');
    state.current.circuit=changeRecord(text,index,changes);loadCircuit(state.current);toast('参数已应用，正在重新计算。');
  }catch(e){toast(e.message,true);}
}
function updateUnits(){scope.units=[state.probes[state.a],state.probes[state.b]].map(p=>p?.quantity==='current'?'A':'V');scope.draw();}
function readProbe(p){const e=p&&state.elements[p.element];if(!e)return 0;return p.quantity==='current'?e.getCurrent():e.getVoltage(p.post);}
function onStep(sim){try{scope.add(sim.getTime(),readProbe(state.probes[state.a]),readProbe(state.probes[state.b]));}catch{}}
function updateReadings(){
  if(!state.sim)return;const now=performance.now();if(now-state.lastRender<65)return;state.lastRender=now;
  const running=state.sim.isRunning();$('runningStatus').classList.toggle('paused',!running);$('runningStatus').lastElementChild.textContent=running?'仿真运行中':'已暂停';$('scopeStatus').textContent=running?'实时':'暂停';
  const play=$('playBtn');play.firstElementChild.innerHTML=svg(running?'pause':'play');play.lastElementChild.textContent=running?'暂停':'运行';$('simTime').textContent=`t = ${state.sim.getTime().toFixed(3)} s`;
  $('valueA').textContent=engineering(readProbe(state.probes[state.a]),scope.units[0]);$('valueB').textContent=engineering(readProbe(state.probes[state.b]),scope.units[1]);
  const e=state.elements[+$('componentSelect').value];
  if(e){$('componentVoltage').textContent=engineering(e.getVoltageDiff(),'V');$('componentCurrent').textContent=e.getPostCount()===2||e.getType()==='RailElm'?engineering(e.getCurrent(),'A'):'选择引脚测量';}
  scope.draw();
}

function attachEngine(){
  const frame=$('circuitFrame');let sim;
  try{sim=frame.contentWindow.CircuitJS1;}catch{}
  if(!sim||state.ready)return;
  state.sim=sim;state.ready=true;$('engineLoading').hidden=true;$('playBtn').disabled=false;
  sim.ontimestep=onStep;sim.onupdate=updateReadings;sim.onanalyze=()=>{refreshElements();scope.clear();};
  loadCircuit(state.current);
}
const engineTimer=setInterval(()=>{attachEngine();if(state.ready)clearInterval(engineTimer);},100);
$('circuitFrame').addEventListener('load',()=>{state.ready=false;attachEngine();});
const engineParams=new URLSearchParams({hideSidebar:'true',hideMenu:'true',running:'false',conventionalCurrent:'true',usResistors:'true',positiveColor:'#65dfb4',negativeColor:'#8291f8',currentColor:'#efc57f',selectColor:'#ffffff',hideInfoBox:'true',lang:'zh'});
function engineURL(text,editing=false){const params=new URLSearchParams(engineParams);params.set('hideMenu',String(!editing));return './engine/circuitjs.html?'+params.toString()+'&ctz='+LZString.compressToEncodedURIComponent(text);}
$('circuitFrame').src=engineURL(PRESETS[0].circuit);
setTimeout(()=>{
  if(state.ready)return;
  $('engineLoading').replaceChildren(node('strong','引擎暂时没有加载完成'),node('span','检查连接后点击重试。'));
  const btn=node('button','重新载入','button subtle');btn.onclick=()=>location.reload();$('engineLoading').append(btn);
},25000);

$('playBtn').onclick=()=>{if(state.sim){state.sim.setSimRunning(!state.sim.isRunning());state.lastRender=0;updateReadings();}};
$('resetBtn').onclick=()=>{if(state.sim){state.current.circuit=resetInitialState(currentExport());loadCircuit(state.current);toast('已恢复初始储能状态并重置时间。');}};
$('speedSelect').onchange=()=>{if(!state.sim)return;state.current.circuit=changeSpeed(currentExport(),+$('speedSelect').value);loadCircuit(state.current);};
$('timeWindow').onchange=()=>{scope.window=+$('timeWindow').value;scope.clear();};
$('acCoupling').onchange=()=>{scope.ac=$('acCoupling').checked;scope.draw();};
for(const[id,key]of[['channelA','a'],['channelB','b']])$(id).onchange=()=>{state[key]=+$(id).value;updateUnits();scope.clear();};
$('componentSelect').onchange=renderComponent;$('applyComponentBtn').onclick=applyComponent;
$('editModeBtn').onclick=()=>{
  if(!state.sim)return;
  state.current.circuit=currentExport();state.editMode=!state.editMode;state.ready=false;state.sim=null;state.elements=[];
  $('editModeBtn').lastChild.textContent=state.editMode?' 收起编辑菜单':' 编辑电路';
  $('circuitFrame').src=engineURL(state.current.circuit,state.editMode);
  const retry=setInterval(()=>{attachEngine();if(state.ready)clearInterval(retry);},100);setTimeout(()=>clearInterval(retry),25000);
  toast(state.editMode?'菜单已展开，可添加元件、连线和编辑。':'编辑菜单已收起。');
};

function download(name,content,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('saveBtn').onclick=()=>{
  const data={format:'circuit-notebook',version:1,circuit:{...state.current,circuit:currentExport(),timeWindow:scope.window},source:state.source};
  download(`${state.current.title.replace(/[\\/:*?"<>|]/g,'_')}.json`,JSON.stringify(data,null,2),'application/json');toast('已下载电路文件，下次可直接导入。');
};
$('exportCsvBtn').onclick=()=>{
  const data=scope.snapshot();if(!data.length){toast('还没有波形数据。');return;}
  const labels=[state.probes[state.a]?.label||'CH1',state.probes[state.b]?.label||'CH2'];
  const csv='\ufeff'+[`time_s,"${labels[0].replaceAll('"','""')} (${scope.units[0]})","${labels[1].replaceAll('"','""')} (${scope.units[1]})"`,...data.map(r=>r.join(','))].join('\n');
  download(state.current.title+'-波形.csv',csv,'text/csv;charset=utf-8');toast('已导出当前时间窗的原始数据。');
};

function importText(raw){
  if(raw.trim().startsWith('{')){
    const parsed=JSON.parse(raw);
    if(parsed.format==='circuit-notebook'&&parsed.circuit?.circuit){const c=parsed.circuit;if(!Array.isArray(c.probes))c.probes=[];if(!Array.isArray(c.components))c.components=[];return loadCircuit(c,{source:normalizeSource(parsed.source),origin:'导入电路'});}
    const c=parseAIResult(parsed);return loadCircuit(c,{source:null,origin:'导入电路'});
  }
  return loadCircuit({title:'导入的电路',circuit:raw,probes:[],components:[],assumptions:['从 CircuitJS 文本导入，请根据原图核对参数和连接。']},{source:null,origin:'导入电路'});
}
$('importBtn').onclick=()=>$('circuitInput').click();
$('circuitInput').onchange=async()=>{const f=$('circuitInput').files[0];if(!f)return;try{if(f.size>12e6)throw new Error('电路文件超过 12 MB。');if(importText(await f.text()))toast('电路已导入。');}catch(e){toast(e.message,true);}$('circuitInput').value='';};
$('textImportBtn').onclick=()=>{$('textImportStatus').textContent='';$('textDialog').showModal();};
$('copyCurrentBtn').onclick=()=>$('circuitText').value=currentExport();
$('loadTextBtn').onclick=()=>{try{const raw=$('circuitText').value;if(!raw.trim().startsWith('{'))normalizeCircuit(raw);if(importText(raw))$('textDialog').close();}catch(e){$('textImportStatus').textContent=e.message;}};

function renderConfig(){const ready=!!(state.config.apiKey&&state.config.baseUrl&&state.config.model);$('configDot').classList.toggle('ready',ready);$('recognitionConfigNote').hidden=ready;}
function openSettings(){for(const[id,key]of[['apiProtocol','protocol'],['apiBase','baseUrl'],['apiModel','model'],['apiKey','apiKey']])$(id).value=state.config[key]||'';$('settingsStatus').textContent='';$('settingsDialog').showModal();}
$('settingsBtn').onclick=openSettings;$('uploadSettingsBtn').onclick=openSettings;
$('settingsForm').onsubmit=e=>{
  e.preventDefault();try{
    const baseUrl=$('apiBase').value.trim();const url=new URL(baseUrl);if(url.protocol!=='https:')throw new Error('请使用 HTTPS 接口地址。');
    state.config={protocol:$('apiProtocol').value,baseUrl,model:$('apiModel').value.trim(),apiKey:$('apiKey').value.trim()};
    if(!state.config.apiKey||!state.config.model)throw new Error('请填写模型名称和 API Key。');
    try{localStorage.setItem('circuit-notebook-settings',JSON.stringify({...state.config,apiKey:undefined}));}catch{}
    renderConfig();$('settingsDialog').close();toast('接口设置已保存。密钥仅用于当前页面会话。');
  }catch(err){$('settingsStatus').textContent=err.message;}
};
$('clearSettingsBtn').onclick=()=>{state.config={protocol:'chat',baseUrl:'',model:'',apiKey:''};try{localStorage.removeItem('circuit-notebook-settings');}catch{}$('apiBase').value='';$('apiModel').value='';$('apiKey').value='';renderConfig();toast('已清除接口设置。');};

async function imageData(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 PNG、JPG 或 WebP 图片。');
  if(file.size>20e6)throw new Error('图片超过 20 MB，请先裁剪到单个电路。');
  const image=await createImageBitmap(file);const scale=Math.min(1,2000/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();return canvas.toDataURL('image/jpeg',.93);
}
function showPendingImage(image){
  state.pendingImage=image;state.recognized=null;$('uploadImage').src=image.data;$('uploadFileName').textContent=image.name;$('recognitionResult').hidden=true;$('recognitionStatus').hidden=true;$('loadRecognizedBtn').hidden=true;$('recognizeBtn').hidden=false;$('recognizeBtn').disabled=false;$('referenceOnlyBtn').disabled=false;$('replaceImageBtn').disabled=false;$('cancelRecognitionBtn').hidden=true;
  renderConfig();if(!$('uploadDialog').open)$('uploadDialog').showModal();
}
async function acceptImage(file){try{showPendingImage({data:await imageData(file),name:file.name||'粘贴的电路截图'});}catch(e){toast(e.message,true);}}
$('uploadBtn').onclick=()=>$('imageInput').click();$('replaceImageBtn').onclick=()=>$('imageInput').click();
$('imageInput').onchange=()=>{const file=$('imageInput').files[0];if(file)acceptImage(file);$('imageInput').value='';};
let dragCount=0;
document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragCount++;document.body.classList.add('is-dragging');}});
document.addEventListener('dragleave',()=>{dragCount--;if(dragCount<=0)document.body.classList.remove('is-dragging');});
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
document.addEventListener('drop',e=>{e.preventDefault();dragCount=0;document.body.classList.remove('is-dragging');const f=e.dataTransfer?.files[0];if(f)acceptImage(f);});
document.addEventListener('paste',e=>{const item=[...(e.clipboardData?.items||[])].find(x=>x.type.startsWith('image/'));if(item){e.preventDefault();acceptImage(item.getAsFile());}});
$('referenceOnlyBtn').onclick=()=>{state.source=state.pendingImage;renderCurrent();$('uploadDialog').close();toast('原图已放到实验台下方；当前电路未替换。');};

function recognitionStatus(text,{error=false,loading=false}={}){const box=$('recognitionStatus');box.hidden=false;box.classList.toggle('error',error);box.replaceChildren();if(loading)box.append(node('span',undefined,'loader'));box.append(node('span',text));}
function stopRecognitionUI(){clearInterval(state.recognitionTimer);$('recognizeBtn').disabled=false;$('referenceOnlyBtn').disabled=false;$('replaceImageBtn').disabled=false;$('cancelRecognitionBtn').hidden=true;state.recognizeController=null;}
function cancelRecognition(){if(state.recognizeController){state.recognizeController.abort();stopRecognitionUI();recognitionStatus('已取消，图片仍保留。');}}
$('cancelRecognitionBtn').onclick=cancelRecognition;$('uploadDialog').addEventListener('close',cancelRecognition);
$('recognizeBtn').onclick=async()=>{
  if(!state.pendingImage)return;
  if(!state.config.apiKey||!state.config.baseUrl||!state.config.model){openSettings();return;}
  const controller=new AbortController();state.recognizeController=controller;state.recognized=null;
  $('recognizeBtn').disabled=true;$('referenceOnlyBtn').disabled=true;$('replaceImageBtn').disabled=true;$('cancelRecognitionBtn').hidden=false;$('recognitionResult').hidden=true;$('loadRecognizedBtn').hidden=true;
  let elapsed=0;recognitionStatus('正在发送图片并识别元件、连线…',{loading:true});state.recognitionTimer=setInterval(()=>{elapsed++;recognitionStatus(`正在识别和重建… ${elapsed} 秒\n较复杂的电路可能需要一两分钟。`,{loading:true});},1000);
  try{
    const response=await fetch('./api/recognize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...state.config,image:state.pendingImage.data,instruction:$('imageInstruction').value}),signal:controller.signal});
    let payload;try{payload=await response.json();}catch{throw new Error('识别服务未返回有效结果，请稍后重试。');}
    if(!response.ok)throw new Error(payload.error||'识别失败。');
    if(controller.signal.aborted)return;
    const result=parseAIResult(payload.result);state.recognized=result;
    const box=$('recognitionResult');box.replaceChildren(node('strong',result.title),node('p',result.summary||'电路已重建，请先核对模型和假设。'));
    if(result.assumptions.length){box.append(node('small','请核对以下假设'));const ul=node('ul');ul.append(...result.assumptions.map(a=>node('li',a)));box.append(ul);}
    box.append(node('small',`${validateCircuit(result.circuit).count} 个电路元素 · ${result.probes.length} 个建议测量点`));box.hidden=false;
    recognitionStatus('重建完成。载入后请对照原图核对接线和数值。');$('loadRecognizedBtn').hidden=false;$('recognizeBtn').hidden=true;
  }catch(e){if(e.name!=='AbortError')recognitionStatus(e.message,{error:true});}
  finally{if(state.recognizeController===controller)stopRecognitionUI();}
};
$('loadRecognizedBtn').onclick=()=>{if(state.recognized&&loadCircuit({...state.recognized,origin:'截图识别'},{source:state.pendingImage,origin:'截图识别'})){$('uploadDialog').close();toast('已载入识别电路，可以开始观察。');}};
$('openSourceBtn').onclick=()=>$('sourceDialog').showModal();$('sourceThumb').onclick=()=>$('sourceDialog').showModal();
$('reRecognizeBtn').onclick=()=>{if(state.source)showPendingImage(state.source);};
for(const id of ['helpBtn','aboutBtn','engineNoticeBtn'])$(id).onclick=()=>$('helpDialog').showModal();
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('playBtn').click();}});
renderCurrent();renderConfig();
// Exposes only simulator diagnostics, never API settings or image data.
window.circuitNotebook={get ready(){return state.ready;},get sim(){return state.sim;},get scope(){return scope;},get circuitTitle(){return state.current.title;},loadPreset:id=>{const p=PRESETS.find(p=>p.id===id);if(p)loadCircuit(structuredClone(p),{source:null});},get probes(){return state.probes.map(p=>({...p}));}};
