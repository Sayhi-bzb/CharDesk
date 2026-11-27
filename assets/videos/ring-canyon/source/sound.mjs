import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const {width,duration,fps,eventBuckets,completionFrame}=JSON.parse(readFileSync(resolve(root,'visible-writes.json'),'utf8'));
const rate=48000,count=Math.round(duration*rate);
const stereo=[new Float32Array(count),new Float32Array(count)];
let seed=162721;
function noise(){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/2147483648-1;
}
function add(at,pan,frequency,gain){
  const start=Math.round(at*rate);
  for(let i=0;i<rate*.048&&start+i<count;i++){
    const t=i/rate,p=2*Math.PI*frequency*t;
    const env=Math.min(1,t/.0014)*Math.exp(-t/.010)*Math.min(1,(.048-t)/.008);
    const tone=(.68*Math.sin(p)+.22*Math.sin(p*2.58)+.18*noise())*env*gain;
    stereo[0][start+i]+=tone*Math.sqrt((1-pan)/2);
    stereo[1][start+i]+=tone*Math.sqrt((1+pan)/2);
  }
}
const density=Array(Math.round(duration*fps)).fill(0);
const last=[-16,-16,-16];
let founderCues=0,groupCues=0;
for(const {at,visible} of eventBuckets){
  const frame=Math.round(at*fps);
  density[frame]=visible.length;
  if(at<3&&visible.some(event=>event.agent===0)){
    add(at,0,522+frame%7*26,at===0?.34:.24);
    founderCues++;
  }
  if(at<2.5)continue;
  for(let lane=0;lane<3;lane++){
    const events=visible.filter(event=>Math.min(2,Math.max(0,Math.floor(event.x/width*3)))===lane);
    if(!events.length||frame-last[lane]<(at<6?4:6))continue;
    const event=events.at(-1);
    const pan=Math.min(.65,Math.max(-.65,2*event.x/width-1));
    add(at,pan,555+(event.agent*81%380),.075+Math.min(.062,Math.log1p(events.length)*.025));
    groupCues++;
    last[lane]=frame;
  }
}
const finalWrite=eventBuckets.at(-1);
assert.equal(Math.round(finalWrite.at*fps),completionFrame);
add(finalWrite.at,0,448,.21);
let low=0,high=0,envelope=0;
for(let i=0;i<count;i++){
  const frame=Math.floor(i*fps/rate);
  const signal=frame<100?0:Math.log1p(density[frame])/7;
  envelope+=.0012*(signal-envelope);
  const n=noise();
  low+=.008*(n-low);
  high+=.063*(n-high);
  const layer=(high-low)*envelope*.15;
  stereo[0][i]+=layer*.91;
  stereo[1][i]+=layer;
}
const file=Buffer.alloc(44+count*4);
file.write('RIFF',0);file.writeUInt32LE(file.length-8,4);
file.write('WAVEfmt ',8);file.writeUInt32LE(16,16);file.writeUInt16LE(1,20);
file.writeUInt16LE(2,22);file.writeUInt32LE(rate,24);file.writeUInt32LE(rate*4,28);
file.writeUInt16LE(4,32);file.writeUInt16LE(16,34);
file.write('data',36);file.writeUInt32LE(count*4,40);
for(let i=0;i<count;i++)for(let channel=0;channel<2;channel++){
  const value=.86*Math.tanh(stereo[channel][i]*4.15/.86);
  file.writeInt16LE(Math.round(value*32767),44+i*4+channel*2);
}
assert.ok(founderCues>7&&groupCues>20);
writeFileSync(resolve(root,'build','write-sfx.wav'),file);
console.log({duration,founderCues,groupCues});
