import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const {cols,rows,cells}=JSON.parse(readFileSync(resolve(root,'cells.json'),'utf8'));
const count=cols*rows;
const agentCount=104;
const founder=30*cols+80;
let random=4639927;
function roll(){
  random=(Math.imul(random,1664525)+1013904223)>>>0;
  return random/4294967296;
}
function metric(a,b){
  return (a%cols-b%cols)**2+4*(Math.floor(a/cols)-Math.floor(b/cols))**2;
}
function neighbors(id){
  const x=id%cols,y=Math.floor(id/cols);
  return [[1,0],[-1,0],[0,1],[0,-1]].flatMap(([dx,dy])=>{
    const a=x+dx,b=y+dy;
    return a>=0&&a<cols&&b>=0&&b<rows?[b*cols+a]:[];
  });
}
const adjacent=Array.from({length:count},(_,id)=>neighbors(id));
const seeds=[founder,27*cols+88,34*cols+76,22*cols+74,31*cols+65];
while(seeds.length<agentCount){
  const point=Math.floor(roll()*count);
  if(seeds.every(anchor=>metric(point,anchor)>82))seeds.push(point);
}
const palette=['#8ee9d2','#ffd18b','#b8c5ff','#f8a1c4','#f9a78e','#9be78f','#cbaaff','#87dcfa'];
const queue=[];
function wake(id,at){
  (queue[at]??=[]).push(id);
}
const actors=seeds.map((seed,id)=>{
  const speed=id===0?76:18+roll()*43;
  const wakeTime=id===0?0:id<5?1050+id*270+Math.floor(roll()*240):620+Math.floor(roll()**1.65*5500);
  wake(id,wakeTime);
  return {seed,speed,last:seed,frontier:new Set([seed]),color:palette[id%palette.length],written:0};
});
const owner=new Int16Array(count).fill(-1);
const operations=[];
const completed=new Map();
const baseColors=cells.map(({top,bottom})=>top.map((n,c)=>(n+bottom[c])/2));
function difference(a,b){
  return baseColors[a].reduce((sum,c,i)=>sum+Math.abs(c-baseColors[b][i]),0);
}
for(let time=0;time<queue.length;time++){
  for(const id of queue[time]??[]){
    const actor=actors[id];
    let chosen=-1,best=Infinity;
    for(const point of actor.frontier){
      if(owner[point]>=0){actor.frontier.delete(point);continue;}
      const cost=metric(point,actor.last)*.15+metric(point,actor.seed)*.055
        +difference(point,actor.last)*.09+roll()*19;
      if(cost<best){best=cost;chosen=point;}
    }
    if(chosen===-1){
      if(!actor.written){
        const nearby=owner.findIndex((current,point)=>current<0&&metric(point,actor.seed)<225);
        if(nearby>=0){
          actor.frontier.add(nearby);
          wake(id,time+20);
        }
      }
      continue;
    }
    actor.frontier.delete(chosen);
    owner[chosen]=id;
    actor.written++;
    actor.last=chosen;
    for(const next of adjacent[chosen])if(owner[next]<0)actor.frontier.add(next);
    operations.push({time,id,cell:chosen});
    completed.set(id,time);
    if(actor.frontier.size)wake(id,time+Math.ceil(actor.speed*(.67+.73*roll())));
  }
}
assert.equal(operations.length,count);
assert.equal(new Set(operations.map(event=>event.cell)).size,count);
assert.ok(completed.size>=90);
const first=new Map();
for(const event of operations)if(!first.has(event.id))first.set(event.id,event.time);
const peak=operations.reduce((value,{time},i)=>i%20===0?Math.max(value,
  [...first].filter(([id,start])=>start<=time&&completed.get(id)>=time).length):value,0);
const progress=Array.from({length:10},(_,i)=>operations[Math.floor((count-1)*(i+1)/10)].time);
writeFileSync(resolve(root,'writes.json'),JSON.stringify({
  operations,actors:actors.map(a=>({seed:a.seed,color:a.color,written:a.written})),
  founder,progress,peak,totalAgents:completed.size,
}));
console.log({count,peak,agents:completed.size,progress});
