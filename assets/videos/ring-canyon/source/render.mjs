import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';

const root=resolve(import.meta.dirname,'..');
const read=name=>JSON.parse(readFileSync(resolve(root,name),'utf8'));
const {cols,rows,cells}=read('cells.json');
const trace=read('writes.json');
const {operations,actors,founder}=trace;
const duration=17.6,width=1440,height=900,fps=30;
const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
const matte='#121521',ink='#b8c2dd';
const full=cells.map(({top,bottom})=>[top,bottom].map(rgb=>'rgb('+rgb.join(',')+')'));
const positions=cells.map((_,id)=>({x:id%cols,y:Math.floor(id/cols)*2}));
const paths=actors.map(()=>[]);
for(const event of operations)paths[event.id].push(event);
const progress=new Uint16Array(actors.length);
const end=operations.at(-1).time;
const timing=[[0,0],[2.5,640],[5.6,2110],[9,4470],[12.4,6870],[16.2,end],[duration,end]];
const revealDelay=.20;
const wideScale=5.95;
function playbackTime(time){
  return time<revealDelay?-1:curve(timing,time-revealDelay);
}
const completionFrame=Array.from({length:Math.round(duration*fps)},(_,i)=>i)
  .find(index=>playbackTime(index/fps)>=end);
assert.ok(completionFrame>0);
const completionTime=completionFrame/fps;
function clamp(n){return Math.min(1,Math.max(0,n));}
function mix(a,b,t){return a+(b-a)*t;}
function smooth(v){const n=clamp(v);return n*n*(3-2*n);}
function curve(keys,time){
  const index=Math.max(1,keys.findIndex(([at])=>at>=time));
  const [a,from]=keys[index-1],[b,to]=keys[index];
  const size=b-a,t=clamp((time-a)/size),t2=t*t,t3=t2*t;
  const speed=i=>{
    if(i===0||i===keys.length-1)return 0;
    const [a,p]=keys[i-1],[b,q]=keys[i],[c,r]=keys[i+1];
    const first=(q-p)/(b-a),second=(r-q)/(c-b);
    return first*second<=0?0:2*first*second/(first+second);
  };
  return mix(from,to,smooth(t))+size*((t3-2*t2+t)*speed(index-1)+(t3-t2)*speed(index));
}
const closeScale=31;
function smoother(n){
  const t=clamp(n);
  return t*t*t*(10+t*(-15+6*t));
}
function zoomVelocity(time){
  const begin=smoother((time-1.43)/1.38);
  const finish=smoother((completionTime-time)/1.06);
  const focus=Math.exp(-(((time-4.72)/2.56)**2));
  return begin*finish*(.76+1.59*focus);
}
const frameRates=Array.from({length:completionFrame},(_,i)=>zoomVelocity((i+.5)/fps));
const travel=[0];
for(const rate of frameRates)travel.push(travel.at(-1)+rate);
const peakIndex=frameRates.indexOf(Math.max(...frameRates));
assert.ok(frameRates.every((rate,i)=>i===0||(
  i<=peakIndex?rate>=frameRates[i-1]-1e-9:rate<=frameRates[i-1]+1e-9
)));
function camera(time){
  const focus=positions[founder];
  const frame=Math.min(time*fps,completionFrame);
  const previous=Math.floor(frame),next=Math.min(previous+1,completionFrame);
  const zoomProgress=mix(travel[previous],travel[next],frame-previous)/travel.at(-1);
  const transition=smooth(zoomProgress);
  const scale=time>=completionTime?wideScale:closeScale*Math.exp(Math.log(wideScale/closeScale)*zoomProgress);
  return {s:scale,x:mix(focus.x+.5,cols/2,transition),y:mix(focus.y+1,rows,transition)};
}
function drawCell(id,cam){
  const {x,y}=positions[id],left=Math.round((x-cam.x)*cam.s+width/2),top=Math.round((y-cam.y)*cam.s+height/2);
  const right=Math.round((x+1-cam.x)*cam.s+width/2),mid=Math.round((y+1-cam.y)*cam.s+height/2);
  const bottom=Math.round((y+2-cam.y)*cam.s+height/2);
  if(right<=0||bottom<=0||left>=width||top>=height)return false;
  ctx.fillStyle=full[id][0];ctx.fillRect(left,top,right-left,mid-top);
  ctx.fillStyle=full[id][1];ctx.fillRect(left,mid,right-left,bottom-mid);
  return true;
}
function screenCell(cell,cam){
  const {x,y}=positions[cell];
  return {x:(x-cam.x)*cam.s+width/2,y:(y-cam.y)*cam.s+height/2};
}
function traceStroke(event,cam,age){
  const {x,y}=screenCell(event.cell,cam),s=cam.s;
  if(x+s<0||x>width||y+2*s<0||y>height)return;
  ctx.fillStyle=actors[event.id].color;
  if(age<1/fps&&s>=13){
    ctx.fillRect(Math.round(x),Math.round(y),Math.round(s),Math.round(s*2));
  }else{
    ctx.fillRect(Math.round(x+1),Math.round(y+2*s-2),Math.max(3,Math.round(s-2)),s>13?3:2);
  }
}
function writerMarker(writer,cam){
  const s=cam.s,ink=actors[writer.id].color;
  const x=Math.round(writer.x),y=Math.round(writer.y);
  const stroke=s>=13?2:1;
  const right=Math.round(writer.x+s),bottom=Math.round(writer.y+s*2);
  ctx.strokeStyle=matte;ctx.lineWidth=stroke+2;
  ctx.strokeRect(x-.5,y-.5,right-x+1,bottom-y+1);
  ctx.strokeStyle=ink;ctx.lineWidth=stroke;
  ctx.strokeRect(x-.5,y-.5,right-x+1,bottom-y+1);
  const span=Math.max(2,Math.round(s*.35));
  ctx.fillStyle=ink;
  ctx.fillRect(x,y,span,stroke+1);
  ctx.fillRect(x,y,stroke+1,span);
}
function getWriters(now,time,cam){
  const writers=[];
  for(let id=0;id<paths.length;id++){
    const step=progress[id],track=paths[id],next=track[step],last=latest.get(id);
    if(!next&&(!last||time-last.at>.13))continue;
    if(next&&next.time-now>100)continue;
    const event=next??last.event;
    const position=screenCell(event.cell,cam);
    if(last&&next&&now>=last.event.time){
      const previous=screenCell(last.event.cell,cam);
      const distance=Math.hypot(position.x-previous.x,(position.y-previous.y)/2);
      if(distance<=cam.s*2.1){
        const phase=smooth((now-last.event.time)/(next.time-last.event.time));
        position.x=mix(previous.x,position.x,phase);
        position.y=mix(previous.y,position.y,phase);
      }
    }
    if(position.x<2||position.x+cam.s>width-3||position.y<48||position.y+2*cam.s>height-42)continue;
    writers.push({id,...position});
  }
  return writers;
}
function badges(writers,cam,time){
  const maximum=cam.s>=19?4:cam.s>=10?7:time>=13?4:8;
  const placed=[];
  const expanded=cam.s>=19;
  ctx.font=(expanded?'13':'12')+'px Menlo';
  ctx.textAlign='left';
  for(const writer of writers){
    if(placed.length>=maximum)break;
    const title=(expanded?'A':'')+String(writer.id+1).padStart(3,'0')+(expanded?'  WRITE':'');
    const w=Math.ceil(ctx.measureText(title).width)+15;
    const proposals=[
      [writer.x,writer.y-24],
      [writer.x+cam.s+5,writer.y-3],
      [writer.x-w-4,writer.y-3],
      [writer.x,writer.y+cam.s*2+6],
    ];
    const proposal=proposals.find(([x,y])=>x>=5&&x+w<width-5&&y>47&&y+18<height-40&&
      placed.every(b=>x+w+10<b.x||x>b.x+b.w+10||y+23<b.y||y>b.y+23));
    if(!proposal)continue;
    const [u,v]=proposal,x=Math.round(u),y=Math.round(v);
    const color=actors[writer.id].color;
    ctx.fillStyle='#191e2c';
    ctx.fillRect(x,y,w,18);
    ctx.fillStyle=color;
    ctx.fillRect(x,y,2,18);
    ctx.fillText(title,x+7,y+13);
    placed.push({x,y,w});
  }
  return placed.length;
}
const state=[];
const phases=[];
const eventBuckets=[];
const latest=new Map(),recent=[];
let written=0,peakVisible=0,peakBadges=0,firstFullFrame=-1,firstWideFrame=-1;
for(let i=0;i<duration*fps;i++){
  const time=i/fps;
  if(i>completionFrame){
    phases.push({...phases.at(-1),start:time});
    continue;
  }
  const span=playbackTime(time),view=camera(time);
  const prior=written;
  while(written<operations.length&&operations[written].time<=span){
    const event=operations[written];
    const mark={event,at:time};
    progress[event.id]++;
    latest.set(event.id,mark);
    recent.push(mark);
    written++;
  }
  ctx.fillStyle=matte;ctx.fillRect(0,0,width,height);
  const visible=[];
  for(let j=0;j<written;j++){
    if(drawCell(operations[j].cell,view)&&j>=prior){
      const pos=positions[operations[j].cell];
      visible.push({agent:operations[j].id,x:(pos.x-view.x)*view.s+width/2});
    }
  }
  if(written===cells.length&&firstFullFrame<0)firstFullFrame=i;
  if(view.s===wideScale&&firstWideFrame<0)firstWideFrame=i;
  const linger=view.s>=13?.15:.083;
  while(recent.length&&time-recent[0].at>linger)recent.shift();
  if(written<cells.length)for(const {event,at} of recent)traceStroke(event,view,time-at);
  const writers=written===cells.length?[]:getWriters(span,time,view);
  const active=writers.length;
  for(const writer of writers)writerMarker(writer,view);
  const badgeCount=badges(writers,view,time);
  peakVisible=Math.max(active,peakVisible);
  peakBadges=Math.max(badgeCount,peakBadges);
  if(visible.length)eventBuckets.push({at:time,visible});
  ctx.fillStyle=ink;ctx.textAlign='left';ctx.font='14px Menlo';
  ctx.fillText('CHARDESK',54,39);
  if(i%15===0)state.push({time,written,visibleWrites:visible.length,active,badgeCount,scale:view.s});
  const file=resolve(root,'png',`frame-${i}.png`);
  writeFileSync(file,canvas.toBuffer('image/png'));
  phases.push({start:time,duration:1/fps,file,label:'Ring Canyon'});
}
assert.equal(written,cells.length);
assert.equal(firstFullFrame,completionFrame);
assert.equal(firstWideFrame,firstFullFrame);
assert.ok(camera((completionFrame-1)/fps).s>wideScale);
assert.ok(peakVisible>=30&&peakBadges>=5);
assert.ok(state.some(frame=>frame.time>=4&&frame.time<7&&frame.badgeCount>=4));
writeFileSync(resolve(root,'cell-diffusion-smooth.json'),JSON.stringify({width,height,fps,duration,phases}));
writeFileSync(resolve(root,'visible-writes.json'),JSON.stringify({width,fps,duration,eventBuckets,completionFrame}));
const verification={duration,written,totalAgents:trace.totalAgents,peakConcurrent:trace.peak,peakVisible,peakBadges,state,firstFullFrame,firstWideFrame,completionTime,zoomPeak:(peakIndex+.5)/fps,oneZoomVelocityPeak:true};
writeFileSync(resolve(root,'verification.json'),JSON.stringify(verification,null,2));
console.log({duration,written,agents:trace.totalAgents,peakVisible,peakBadges,peakConcurrent:trace.peak,completionTime});
