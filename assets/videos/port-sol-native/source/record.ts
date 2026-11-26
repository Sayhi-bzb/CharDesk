import { join, resolve } from 'node:path';
import { readFile, writeFile, copyFile, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import type { RGBA, TerminalColors } from '@opentui/core';
import { LocalSessions } from '../../../../packages/local-runtime/src/sessions.ts';
import { TerminalWorkspace } from '../../../../packages/local-runtime/src/workspace.ts';
import { resolveAppPaths } from '../../../../packages/local-runtime/src/appPaths.ts';
import { localCapabilities } from '../../../../packages/local-runtime/src/capabilities.ts';
import { CanvasSurface, CANVAS_TOP } from '../../../../packages/terminal/src/surface.ts';
import { attachControls } from '../../../../packages/terminal/src/controller.ts';

const root = resolve(import.meta.dir,'..');
const original = join(root,'materials','frames');
const plan = JSON.parse(await readFile(join(original,'film-plan.json'),'utf8'));
type Phase = { stage: number; kind: string; start: number; duration: number; id?: string };
type Camera = { mode: string; start: number; duration: number; from: number[]; to: number[] };
const load = async (stage:number) => (await readFile(join(original,`state-${stage}.png.ans`),'utf8')).split('\n').map(line => {
  const row:string[] = [];
  for (const segment of line.split('\x1b')) {
    const match = /^\[([\d;]+)m(▀+)$/.exec(segment);
    if (match) for (let index = 0; index < match[2].length; index++) row.push(match[1]);
  }
  assert.equal(row.length,900);
  return row;
});
const makeMaterial = (rows:string[][], x:number, y:number, w:number, h:number) =>
  rows.slice(y,y+h).map(row=>{
    let last = '';
    return row.slice(x,x+w).map(style=>{
      if(style===last) return '▀';
      last=style;
      return '\x1b['+style+'m▀';
    }).join('')+'\x1b[0m';
  }).join('\n');

const clock = new ManualClock();
const setup = await createTestRenderer({ width:184, height:38,clock });
const runtime = await mkdtemp(join(root, 'build', 'runtime-'));
const paths = resolveAppPaths({ environment:{ CHARDESK_HOME:runtime } });
const sessions = await LocalSessions.open(paths);
const workspace = TerminalWorkspace.empty();
await sessions.attach(workspace);
const file = await sessions.create('Port Sol');
const api = localCapabilities(workspace,sessions,true);
const surface = new CanvasSurface(setup.renderer,workspace.model,'Port Sol','darwin');
setup.renderer.root.add(surface);
const detach = attachControls(surface,()=>{},undefined,workspace,sessions);
if(surface.inspector?.isOpen) surface.inspector.close();
const sea = '#3b7386';
const palette: TerminalColors = {
  defaultForeground:'#e7ead5',defaultBackground:sea,
  palette:[sea,'#d99077','#e4f2c8','#ffe2a0','#9fdffd','#d8c4ef','#c9eedc','#e7ead5'],
  cursorColor:null,mouseForeground:null,mouseBackground:null,tekForeground:null,
  tekBackground:null,highlightForeground:null,highlightBackground:null,
};
surface.appearance.acceptPalette(palette,'dark');
const visit = (center:number) => {
  const left=center-621;
  const origin=Math.floor(left/9)-20;
  workspace.model.viewport={...workspace.model.viewport,x:origin,y:3};
  return origin*9-left;
};
visit(2295);
await setup.renderOnce();
const raster=createCanvas(1242,700), ctx=raster.getContext('2d');
function color(c:RGBA,fallback:string) {
  if(c.intent==='default')return fallback;
  const [r,g,b]=c.toInts();
  return `rgb(${r},${g},${b})`;
}
const phases:{ start:number; file:string; duration:number; label:string }[]=[];
const soundtrackCameras:{start:number;duration:number;mode:string}[]=[];
const soundtrackPhases:{start:number;kind:string;stage:number;reveal:number}[]=[];
const operations:Record<string,unknown>[]=[];
let n=0,lastHash='',lastPNG='',firstHash='',animationFrames=0,recognizableFrames=0;
const fps=30;
function extend(frames:number) {
  phases.at(-1)!.duration+=frames/fps;
  n+=frames;
}
async function snap(center:number,label:string) {
  const xOffset=visit(center);
  await setup.renderOnce();
  const spans = setup.captureSpans().lines.slice(CANVAS_TOP,CANVAS_TOP+35);
  const presentation=surface.activityEffects?.presentation;
  if(presentation) animationFrames++;
  if(presentation && presentation.visible>0&&presentation.visible<presentation.units) recognizableFrames++;
  ctx.fillStyle=sea;
  ctx.fillRect(0,0,1242,700);
  for(const [y,line] of spans.entries()){
    let x=Math.round(xOffset);
    for(const span of line.spans){
      const width=span.width*9;
      if(x<1242&&x+width>0){
        ctx.fillStyle=color(span.bg,sea);
        ctx.fillRect(x,y*20,width,20);
        if(span.text.trim()){
          assert.match(span.text,/^[▀ ]+$/);
          ctx.fillStyle=color(span.fg,palette.defaultForeground!);
          if(!span.text.includes(' '))ctx.fillRect(x,y*20,width,10);
          else for(const [i,ch] of Array.from(span.text).entries())
            if(ch==='▀')ctx.fillRect(x+i*9,y*20,9,10);
        }
      }
      x+=width;
    }
  }
  const rgba=ctx.getImageData(0,0,1242,700).data;
  const hash=createHash('sha256').update(rgba).digest('hex');
  if(n===0) firstHash=hash;
  if(hash!==lastHash){
    lastPNG=join('png',`frame-${n}.png`);
    await writeFile(join(root,lastPNG),raster.toBuffer('image/png'));
    phases.push({start:n/fps,file:lastPNG,duration:0,label});
  }
  lastHash=hash;
  extend(1);
}
async function draw(after:string[][], x:number,y:number,w:number,h:number, agent?:{id:string;name:string}) {
  const result=await api.execute('canvas_render',{
    at:[x,y],source:makeMaterial(after,x,y,w,h),format:'ansi',writeMode:'replace',
  },agent?{agent}:undefined) as {ok?:boolean;persistence?:string;version?:string;changed?:boolean};
  assert.ok(result.ok!==false && result.persistence==='saved',JSON.stringify(result));
  return result;
}
const roleFor = (kind:string) => kind.startsWith('sea-')
  ? {id:'shore',name:'Shore Agent'} : kind==='bridge'
    ? {id:'bridge',name:'Bridge Agent'} : {id:'builder',name:'Building Agent'};
const cruise=(p:number)=>{
  const r=.18;
  const entry=(u:number)=>.5*(u-r/Math.PI*Math.sin(Math.PI*u/r))/(1-r);
  return p<r ? entry(p) : p>1-r ? 1-entry(1-p) : (p-r/2)/(1-r);
};
try {
  let before=await load(0);
  for(let x=0;x<900;x+=150) await draw(before,x,0,150,48);
  await snap(2295,'Loop start');
  extend(11);
  let center=2295;
  for(const cam of plan.cameras as Camera[]){
    const start=n/fps;
    const authored=(plan.phases as Phase[]).filter(p=>p.stage>0&&p.start>=cam.start-1e-7&&p.start<cam.start+cam.duration-1e-7);
    let offset=0;
    const seek=async(target:number)=>{
      while(offset<target) {
        const p=cam.mode==='pan'?cruise(Math.min(1,offset/98)):0;
        center=cam.from[0]+(cam.to[0]-cam.from[0])*p;
        await snap(center,'Pan');
        offset++;
      }
    };
    if(cam.mode==='hold'&&cam.start>0&&authored.length){ await snap(cam.from[0],'Arrival');extend(4); }
    for(const p of authored) {
      if(cam.mode==='pan') await seek(Math.round((p.start-cam.start)*fps));
      else center=cam.from[0];
      visit(center);
      const after=await load(p.stage);
      let xmin=900,ymin=48,xmax=-1,ymax=-1;
      for(let y=0;y<48;y++)for(let x=0;x<900;x++)if(before[y][x]!==after[y][x]){
        xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);
      }
      const agent=roleFor(p.kind);
      const result=await draw(after,xmin,ymin,xmax-xmin+1,ymax-ymin+1,agent);
      const effect=surface.activityEffects?.presentation;
      const count=p.kind==='building'?19:p.kind==='bridge'?22:p.kind==='foundation'?20:p.kind==='detail'?8:9;
      const onset=n/fps;
      for(let i=0;i<count;i++){
        if(cam.mode==='pan') {
          center=cam.from[0]+(cam.to[0]-cam.from[0])*cruise(Math.min(1,offset/98));
          offset++;
        }
        if(i>0) clock.advance(Math.ceil((effect?.duration??320)/(count-1)));
        await snap(center,p.id??p.kind);
      }
      clock.advance(1500);
      if(cam.mode==='pan') {
        center=cam.from[0]+(cam.to[0]-cam.from[0])*cruise(Math.min(1,offset/98));
        offset++;
      }
      await snap(center,p.id??p.kind);
      if(p.kind==='building') extend(14);
      else if(p.kind==='bridge') extend(7);
      operations.push({kind:p.kind,stage:p.stage,start:onset,effectUnits:effect?.units??0,agent:agent.id,version:result.version,persistence:result.persistence});
      soundtrackPhases.push({start:onset,kind:p.kind,stage:p.stage,reveal:count/fps});
      before=after;
    }
    if(cam.mode==='pan') {
      await seek(99);
      center=cam.to[0];
      await snap(center,'Arrive');
    }
    soundtrackCameras.push({mode:cam.mode,start,duration:n/fps-start});
  }
  await snap(7155,'Loop end');
  assert.equal(lastHash,firstHash,'Loop endpoint pixels differ');
  extend((60-n%60)%60+12);
  assert.equal(operations.length,54);
  assert.ok(recognizableFrames>250,recognizableFrames);
  await writeFile(join(root,'film-plan.json'),JSON.stringify({
    fps,width:1920,height:1080,duration:n/fps,phases,
  },null,2));
  await writeFile(join(root,'audio-plan.json'),JSON.stringify({
    duration:n/fps,cameras:soundtrackCameras,phases:soundtrackPhases,
  },null,2));
  await writeFile(join(root,'verification.json'),JSON.stringify({
    operations,animationFrames,recognizableFrames,uniqueFrames:phases.length,duration:n/fps,
    firstHash,lastHash,threeForwardPans:true,nativeMutationEffects:true,canvasOnly:true,
  },null,2));
  await copyFile(file.path,join(root,'port-sol.chardesk'));
  console.log({duration:n/fps,animationFrames,recognizableFrames,files:phases.length});
} finally {
  detach();
  await sessions.dispose();
  workspace.dispose();
  await setup.dispose();
}
