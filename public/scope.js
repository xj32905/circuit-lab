import {engineering} from './circuit-format.js';

export class Scope {
  constructor(canvas, onReadings) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.onReadings=onReadings;
    this.capacity=14000;this.times=new Float64Array(this.capacity);this.a=new Float64Array(this.capacity);this.b=new Float64Array(this.capacity);
    this.count=0;this.head=0;this.window=.025;this.ac=false;this.units=['V','V'];this.cursor=null;this.lastTime=-1;
    this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();this.cursor=e.clientX-r.left;this.draw();});
    canvas.addEventListener('pointerleave',()=>{this.cursor=null;this.draw();});
  }
  clear(){this.count=0;this.head=0;this.lastTime=-1;this.draw();}
  add(t,a,b){
    if(![t,a,b].every(Number.isFinite))return;
    if(t<this.lastTime-1e-10)this.clear();
    if(t-this.lastTime<this.window/2400)return;
    this.lastTime=t;this.times[this.head]=t;this.a[this.head]=a;this.b[this.head]=b;this.head=(this.head+1)%this.capacity;this.count=Math.min(this.capacity,this.count+1);
  }
  snapshot(){
    if(!this.count)return [];
    const latest=this.times[(this.head-1+this.capacity)%this.capacity];const cut=latest-this.window;const out=[];
    for(let j=0;j<this.count;j++){const i=(this.head-this.count+j+this.capacity)%this.capacity;if(this.times[i]>=cut)out.push([this.times[i],this.a[i],this.b[i]]);}
    return out;
  }
  draw(){
    const {canvas,ctx}=this;const rect=canvas.getBoundingClientRect();if(!rect.width)return;
    const dpr=Math.min(devicePixelRatio||1,2),W=rect.width,H=rect.height;
    if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    const pad={l:45,r:45,t:12,b:27},w=W-pad.l-pad.r,h=H-pad.t-pad.b;
    if(w<=0||h<=0)return;
    const rows=this.snapshot(),n=rows.length;const end=n?rows[n-1][0]:this.window;const start=Math.max(0,end-this.window);
    const stats=[1,2].map(k=>{
      if(!n)return {min:-1,max:1,mean:0,vpp:0,last:0,range:1};
      let min=Infinity,max=-Infinity,sum=0;for(const r of rows){const v=r[k];min=Math.min(min,v);max=Math.max(max,v);sum+=v;}
      const mean=sum/n;let low=this.ac?min-mean:min,high=this.ac?max-mean:max;const peak=Math.max(Math.abs(low),Math.abs(high),1e-5);
      const power=10**Math.floor(Math.log10(peak));const rough=peak/power;const step=[1,1.5,2,3,5,8,10].find(v=>v>=rough*1.13)||10;
      return {min,max,mean,vpp:max-min,last:rows[n-1][k],range:step*power};
    });
    if(this.units[0]===this.units[1]){
      const common=Math.max(stats[0].range,stats[1].range);
      stats[0].range=stats[1].range=common;
    }
    ctx.strokeStyle='#2b3a2e';ctx.lineWidth=.65;ctx.setLineDash([2,5]);
    for(let x=0;x<=8;x++){const px=pad.l+w*x/8;ctx.beginPath();ctx.moveTo(px,pad.t);ctx.lineTo(px,pad.t+h);ctx.stroke();}
    for(let y=0;y<=4;y++){const py=pad.t+h*y/4;ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(pad.l+w,py);ctx.stroke();}
    ctx.setLineDash([]);ctx.strokeStyle='#3b4c3b';ctx.beginPath();ctx.moveTo(pad.l,pad.t+h/2);ctx.lineTo(pad.l+w,pad.t+h/2);ctx.stroke();
    ctx.font='8px "DM Mono",monospace';
    const colors=['#67d4b2','#edc085'];
    for(let k=0;k<2;k++){
      ctx.fillStyle=k===0?'#64907e':'#9b825e';ctx.textAlign=k===0?'right':'left';
      for(let y=0;y<=4;y++){const value=stats[k].range*(1-y/2),py=pad.t+h*y/4;ctx.fillText(engineering(value,this.units[k],2),k===0?pad.l-7:pad.l+w+7,py+3);}
      if(n<2)continue;
      ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t,w,h);ctx.clip();
      ctx.strokeStyle=colors[k];ctx.lineWidth=1.65;ctx.lineJoin='round';ctx.beginPath();
      let first=true;
      for(const row of rows){const x=pad.l+(row[0]-start)/this.window*w;const value=row[k+1]-(this.ac?stats[k].mean:0);const y=pad.t+h/2-value/stats[k].range*h/2;first?ctx.moveTo(x,y):ctx.lineTo(x,y);first=false;}
      ctx.stroke();ctx.restore();
    }
    ctx.fillStyle='#677c64';ctx.textAlign='center';
    for(let x=0;x<=4;x++){const dt=this.window*x/4;ctx.fillText(engineering(dt,'s',2),pad.l+w*x/4,pad.t+h+18);}
    if(this.cursor!==null&&this.cursor>=pad.l&&this.cursor<=pad.l+w&&n){
      const target=start+(this.cursor-pad.l)/w*this.window;
      const near=rows.reduce((best,r)=>Math.abs(r[0]-target)<Math.abs(best[0]-target)?r:best,rows[0]);
      const px=pad.l+(near[0]-start)/this.window*w;
      ctx.setLineDash([3,3]);ctx.strokeStyle='#afc09d70';ctx.beginPath();ctx.moveTo(px,pad.t);ctx.lineTo(px,pad.t+h);ctx.stroke();ctx.setLineDash([]);
      const text=`${engineering(near[1],this.units[0])}  /  ${engineering(near[2],this.units[1])}`;
      const boxW=ctx.measureText(text).width+14;const bx=Math.min(Math.max(px+8,pad.l),W-pad.r-boxW);ctx.fillStyle='#142010ed';ctx.fillRect(bx,pad.t+3,boxW,19);ctx.fillStyle='#d5e3c9';ctx.textAlign='left';ctx.fillText(text,bx+7,pad.t+16);
    }
    this.onReadings?.({stats,count:n,start,end,ac:this.ac,sharedScale:this.units[0]===this.units[1]});
  }
}
