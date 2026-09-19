// Preserve native CircuitJS XML so custom component models survive editing/saving.
import {validateCircuit,stripScopes,circuitLines} from './circuit-format.js';

export function parseNative(text){
  if(typeof text!=='string'||text.length>150000)throw new Error('电路内容为空或超过 150 KB。');
  if(/<!DOCTYPE|<!ENTITY|<script/i.test(text))throw new Error('电路文件包含不支持的内容。');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror')||doc.documentElement.tagName!=='cir')throw new Error('无效的 CircuitJS XML 电路。');
  if(doc.querySelectorAll('*').length>800)throw new Error('电路过大，这个版本最多支持 800 个 XML 元素。');
  return doc;
}

export function normalizeCircuit(text){
  if(text.trim().startsWith('<')){
    const doc=parseNative(text.trim());
    if(![...doc.documentElement.children].some(e=>e.hasAttribute('x')))throw new Error('电路中没有元件。');
    for(const element of doc.documentElement.children){if(['scope','hint'].includes(element.tagName))element.remove();}
    return new XMLSerializer().serializeToString(doc);
  }
  return validateCircuit(stripScopes(text)).text;
}

export function resetInitialState(text){
  if(!text.trim().startsWith('<'))return text;
  const doc=parseNative(text);
  for(const el of doc.documentElement.children){
    if(el.tagName==='c')el.setAttribute('vd',el.getAttribute('iv')||'0');
    if(el.tagName==='l')el.setAttribute('i',el.getAttribute('ic')||'0');
    if(el.tagName==='t'){el.setAttribute('vbe','0');el.setAttribute('vbc','0');}
  }
  return new XMLSerializer().serializeToString(doc);
}

export function elementRecords(text){
  if(!text.trim().startsWith('<'))return circuitLines(text).map((text,line)=>({text,line,t:text.split(/\s+/)})).filter(r=>!['$','o','h'].includes(r.t[0])&&!/^[.!%&]$/.test(r.t[0]));
  const doc=parseNative(text);const records=[];
  for(const el of doc.documentElement.children){
    if(!el.hasAttribute('x'))continue;
    const attr=(n,fallback='0')=>el.getAttribute(n)??fallback;
    let type=el.tagName;if(type==='ln')type='207';
    const t=[type,...attr('x').split(/\s+/),attr('f')];const mapping={};
    function field(col,name,fallback='0'){t[col]=attr(name,fallback);mapping[col]=name;}
    if(type==='r')field(6,'r');
    if(type==='c'){field(6,'c');field(7,'vd');}
    if(type==='l'){field(6,'l');field(7,'i');}
    if(type==='i')field(6,'cu');
    if(type==='t'){field(6,'pn','1');field(7,'vbe');field(8,'vbc');field(9,'be','100');}
    if(type==='a'){field(6,'ma','15');field(7,'mi','-15');}
    if(type==='R'||type==='v'){field(6,'wf');field(7,'fr','40');field(8,'maxv','5');field(9,'bias');}
    if(type==='s')field(6,'p');
    records.push({t,element:el,doc,mapping});
  }
  return records;
}

export function changeRecord(text,index,changes){
  const records=elementRecords(text),record=records[index];
  if(!record)throw new Error('元件已变化，请重新选择。');
  for(const[col,value]of Object.entries(changes)){
    if(record.element){const name=record.mapping[col];if(!name)throw new Error('这个参数需在画布中编辑。');record.element.setAttribute(name,String(value));}
    else record.t[+col]=String(value);
  }
  if(record.element)return new XMLSerializer().serializeToString(record.doc);
  const lines=circuitLines(text);lines[record.line]=record.t.join(' ');return lines.join('\n');
}

export function changeSpeed(text,speed){
  if(text.trim().startsWith('<')){const doc=parseNative(text);doc.documentElement.setAttribute('ic',String(speed));return new XMLSerializer().serializeToString(doc);}
  const lines=circuitLines(text),h=lines[0].split(/\s+/);h[3]=String(speed);lines[0]=h.join(' ');return lines.join('\n');
}
