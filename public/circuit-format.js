// CircuitJS text is data, never executable JavaScript.
const TYPES = new Set(['w','r','c','l','d','z','t','f','j','a','g','v','R','i','s','O','x','207']);
const MIN_FIELDS = {w:6,r:7,c:8,l:8,d:6,z:8,t:10,f:7,j:7,a:6,g:6,v:10,R:10,i:7,s:8,O:6,x:8,'207':7};
const FLOAT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function stripScopes(text) {
  return text.split(/\r?\n/).filter(l => !/^(?:o|h)\s/.test(l.trim())).join('\n').trim();
}

export function circuitLines(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

export function validateCircuit(text, {strict = false} = {}) {
  if (typeof text !== 'string' || text.length > 100000) throw new Error('电路内容为空或过大（最多 100 KB）。');
  const lines = circuitLines(text);
  if (!lines.length || !lines[0].startsWith('$ ')) throw new Error('需要 CircuitJS 文本格式，第一行应以 $ 开头。');
  const header = lines[0].split(/\s+/);
  if (header.length < 6 || !header.slice(1).every(t => FLOAT.test(t) && Number.isFinite(Number(t)))) throw new Error('仿真设置行的数字格式不正确。');
  if (!(+header[2] >= 1e-10 && +header[2] <= .1)) throw new Error('仿真步长应在 0.1 ns 到 100 ms 之间。');
  if (!(+header[3] > 0 && +header[3] <= 10000)) throw new Error('仿真速度设置不在支持范围内。');
  if (lines.length > 450) throw new Error('这个学习版本最多载入 450 行电路。');
  let count = 0;
  const warnings = [];
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].split(/\s+/), type = t[0];
    if (['o','h'].includes(type) && !strict) continue;
    if (type === '$') throw new Error('电路中不能重复出现仿真设置行。');
    if (!TYPES.has(type)) {
      // Native files may contain model records and additional CircuitJS components.
      if (strict || !/^(?:[A-Za-z]|\d{1,3}|[.!%&])$/.test(type)) throw new Error(`第 ${i+1} 行：暂不支持元件类型 ${type}。`);
      warnings.push(`第 ${i+1} 行使用扩展元件或模型 ${type}，请在仿真中核对。`);
      continue;
    }
    if (t.length < MIN_FIELDS[type]) throw new Error(`第 ${i+1} 行：${type} 元件的参数不完整。`);
    for (let p = 1; p <= 5; p++) {
      if (!/^-?\d+$/.test(t[p]) || Math.abs(+t[p]) > 100000) throw new Error(`第 ${i+1} 行：坐标或标志不是有效整数。`);
    }
    if (['r','c','l'].includes(type) && !(FLOAT.test(t[6]) && +t[6] > 0 && Number.isFinite(+t[6]))) throw new Error(`第 ${i+1} 行：阻值、电容或电感必须为正数。`);
    if (type === 'z' && !(FLOAT.test(t[6]) && +t[6] > 0 && FLOAT.test(t[7]) && +t[7] > 0)) throw new Error(`第 ${i+1} 行：齐纳二极管的正向压降和击穿电压必须为正数。`);
    if (['v','R'].includes(type) && !t.slice(6,10).every(v => FLOAT.test(v) && Number.isFinite(+v))) throw new Error(`第 ${i+1} 行：信号源参数不正确。`);
    if (['v','R'].includes(type) && (+t[7] < 0 || +t[7] > 1e9)) throw new Error(`第 ${i+1} 行：信号频率超出范围。`);
    if (strict && type === 't' && !['1','-1'].includes(t[6])) throw new Error('三极管类型必须是 NPN（1）或 PNP（-1）。');
    count++;
  }
  if (!count) throw new Error('没有找到可仿真的元件。');
  if (!lines.some(l => /^(g|R)\s/.test(l))) warnings.push('没有显式地线或接地信号源，参考电位可能由引擎自动选择。');
  return {text: lines.join('\n') + '\n', count, warnings};
}

export function parseAIResult(value) {
  if (typeof value === 'string') {
    let raw = value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    if (start >= 0 && end >= start) raw = raw.slice(start,end+1);
    try { value = JSON.parse(raw); } catch { throw new Error('模型没有返回有效的电路 JSON，请换一个支持视觉和结构化输出的模型再试。'); }
  }
  if (!value || typeof value !== 'object') throw new Error('没有收到电路识别结果。');
  if (value.unsupported || !value.circuit) throw new Error(String(value.reason || '这张图暂时无法可靠地转换成支持的电路，请裁剪到一个完整的小电路再试。').slice(0,700));
  const checked = validateCircuit(stripScopes(value.circuit), {strict: true});
  return {
    title: String(value.title || '从截图重建的电路').slice(0,100),
    summary: String(value.summary || '').slice(0,1800),
    circuit: checked.text,
    assumptions: [...(Array.isArray(value.assumptions) ? value.assumptions.map(String).slice(0,20) : []), ...checked.warnings].map(s => s.slice(0,500)),
    probes: (Array.isArray(value.probes) ? value.probes : []).filter(p => Number.isInteger(p?.element) && p.element >= 0 && p.element < checked.count && Number.isInteger(p.post) && p.post >= 0 && p.post < 4).slice(0,8).map(p => ({label:String(p.label || '测量点').slice(0,50),element:p.element,post:p.post,quantity:p.quantity==='current'?'current':'voltage'})),
    components: (Array.isArray(value.components) ? value.components : []).filter(p=>Number.isInteger(p?.element)&&p.element>=0).slice(0,150).map(p=>({element:p.element,id:String(p.id||'').slice(0,30),name:String(p.name||'').slice(0,100)}))
  };
}

export function parseEngineering(raw) {
  const m = String(raw).trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(meg|[pnuµμmkMG])?\s*(?:Ω|ohm|F|H|V|A|Hz)?$/i);
  if (!m) throw new Error('请输入数字，可带单位前缀，例如 4.7k、100n、10u。');
  const scales = {p:1e-12,n:1e-9,u:1e-6,'µ':1e-6,'μ':1e-6,m:1e-3,k:1e3,K:1e3,meg:1e6,M:1e6,G:1e9};
  const suffix = m[2] || '';
  const value = +m[1] * (suffix ? scales[suffix] ?? scales[suffix.toLowerCase()] : 1);
  if (!Number.isFinite(value)) throw new Error('数值无效。');
  return value;
}

export function engineering(value, unit = '', digits = 3) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1e-14) return '0' + (unit ? ' '+unit : '');
  const choices = [[1e9,'G'],[1e6,'M'],[1e3,'k'],[1,''],[1e-3,'m'],[1e-6,'µ'],[1e-9,'n'],[1e-12,'p']];
  const [s,p] = choices.find(([s])=>Math.abs(value)>=s) || choices.at(-1);
  return Number((value/s).toPrecision(digits)).toString() + (unit ? ' ' : '') + p + unit;
}
