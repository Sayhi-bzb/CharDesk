import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
export const cols=224,rows=64,height=rows*2;
const tau=2*Math.PI;
const mix=(a,b,t)=>a+(b-a)*t;
const tint=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
const bound=n=>Math.min(1,Math.max(0,n));
const smooth=n=>{const t=bound(n);return t*t*(3-2*t);};
function hash(x,y,seed=0){
  let value=Math.imul(x+337191,1597334677)^Math.imul(y+689287,3812015801)^seed;
  value=Math.imul(value^(value>>>16),2246822519);
  return ((value^(value>>>13))>>>0)/4294967296;
}
function noise(x,y,seed=0){
  const i=Math.floor(x),j=Math.floor(y),u=smooth(x-i),v=smooth(y-j);
  return mix(mix(hash(i,j,seed),hash(i+1,j,seed),u),mix(hash(i,j+1,seed),hash(i+1,j+1,seed),u),v);
}
function relief(x,y){
  return .64*noise(x,y,19)+.24*noise(x*2.17,y*2.17,11)+.12*noise(x*5.4,y*5.4,35);
}
function peak(u,offset,layer){
  const p=u+offset;
  return .095*Math.sin(p*(13+layer))+.052*Math.sin(p*(27+layer*4)+layer)
    +.045*(relief(p*11,layer*2)-.5);
}
const pixels=[];
for(let y=0;y<height;y++)for(let x=0;x<cols;x++){
  const u=(x+.5-cols/2)/height,v=(y+.5)/height;
  const grain=hash(x,y,99)-.5;
  let c=tint([13,18,41],[71,57,84],smooth(v/.74));
  const horizon=smooth(1-Math.hypot((u+.16)*.62,(v-.68)*2.1));
  c=tint(c,[121,75,92],horizon*.53);
  const dust=(relief((u+.4)*4,(v+.15)*7)-.28)*smooth((.66-v)/.64);
  c=tint(c,[60,66,103],dust*.50);
  const star=hash(x,y,28);
  if(v<.66&&star>.988){
    const lift=(star-.988)/.012;
    c=tint(c,hash(y,x,11)>.65?[252,189,154]:[221,231,253],.22+lift**2*.62);
  }
  for(const [sx,sy,lift] of [[28,19,.98],[53,37,.72],[184,24,1],[198,49,.85],[22,62,.64],[121,9,.68],[67,17,.55]]){
    const dist=Math.abs(x-sx)+Math.abs(y-sy);
    if(dist===0)c=tint(c,[255,231,190],lift);
    else if(dist===1)c=tint(c,[172,183,224],lift*.43);
  }

  const du=u-.11,dv=v-.372;
  const theta=-.253,cs=Math.cos(theta),sn=Math.sin(theta);
  const a=du*cs+dv*sn,b=-du*sn+dv*cs;
  const ringRadius=Math.hypot(a,b/.247);
  const ring=ringRadius>.308&&ringRadius<.670;
  const ringTone=ring?(()=>{
    const n=noise(ringRadius*155,Math.atan2(b,a)*3.1,17);
    const distance=(ringRadius-.308)/.362;
    const gaps=(Math.abs(ringRadius-.428)<.011||Math.abs(ringRadius-.546)<.007)?.19:1;
    const lines=.52+.18*Math.cos(distance*92)+.14*Math.cos(distance*41)+.13*n;
    const opacity=bound(lines*gaps*(1.16-distance*.82)*smooth((.67-ringRadius)/.018));
    const temp=smooth(distance*.82+(.10+a*.17));
    return {paint:tint([249,189,133],[204,143,208],temp),opacity};
  })():null;
  if(ringTone&&b<0)c=tint(c,ringTone.paint,ringTone.opacity*.85);
  const radius=.261;
  const len=Math.hypot(du,dv);
  if(len<radius){
    const nx=du/radius,ny=dv/radius,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    const n=relief(3.4*nx+5.1,ny*8+3.9);
    const latitude=ny+.35*nx+.065*(n-.5)+.095*Math.sin(nx*3)*ny;
    const clouds=.50+.22*Math.sin(latitude*42+1.25)+.14*Math.sin(latitude*78)+.11*Math.sin(latitude*127+nx*3);
    const spot=Math.exp(-((nx+.32)**2/.048+(latitude-.20)**2/.012));
    const light=bound(-.62*nx-.41*ny+.71*nz);
    const base=tint([183,92,95],[253,210,156],bound(clouds+n*.2));
    const day=tint(base,[208,77,71],spot*.50);
    const shade=tint([62,48,79],[126,77,108],clouds*.62);
    c=tint(shade,day,.18+.79*light**.73);
    const rim=smooth((len/radius-.938)/.056)*light;
    c=tint(c,[255,216,167],rim*.70);
  }
  if(ringTone&&b>=0)c=tint(c,ringTone.paint,ringTone.opacity);

  for(const [index,base] of [.694,.744,.794].entries()){
    const bank=base+peak(u,index*.085,index)*(.39+index*.22);
    if(v<bank)continue;
    const shade=relief((u+.95)*20-index*1.7,(v-bank)*14);
    const ridge=smooth(1-(v-bank)/.013);
    const dusk=[[101,71,101],[77,56,83],[58,44,65]][index];
    const night=[[61,52,81],[48,41,70],[36,34,59]][index];
    c=tint(night,dusk,.34+shade*.54+ridge*.12);
  }
  const distance=bound((v-.744)/.256);
  const channel=-.23+.088*Math.sin(distance*6.8+.5)+.30*distance**1.8;
  const riverWidth=.006+.081*distance**1.67;
  if(v>.752&&Math.abs(u-channel)<riverWidth){
    const stripe=noise(u*88,v*122,287);
    const shine=.14+.53*stripe+.21*Math.sin(v*230)**2;
    c=tint([28,48,70],[240,147,122],shine*(.65+.28*distance));
    if(Math.abs(u-channel)>riverWidth*.72)c=tint(c,[182,104,116],.31);
  }
  const bankU=u-channel;
  const highSide=.693+.119*Math.exp(-((bankU*2.9)**2))+.075*Math.cos(u*3.8+1.8);
  const ridgeLine=highSide+peak(u,.16,5)*.50;
  if(v>ridgeLine&&Math.abs(bankU)>riverWidth*1.28+.018+distance*.16){
    const layer=relief(u*26+3,v*26);
    const stratum=.50+.33*Math.sin((v+.043*Math.sin(u*13))*220+layer*3);
    const light=smooth(1-(v-ridgeLine)/.09);
    c=tint([24,26,42],[99,62,78],.36*layer+.25*stratum+.39*light);
    c=tint(c,[139,83,95],smooth(1-(v-ridgeLine)/.006)*.25);
  }
  c=tint(c,[17,19,30],smooth((Math.abs(u)-.73)/.23)*.46);
  pixels.push(c.map(n=>Math.round((n+grain*5.5)/3)*3).map(n=>Math.min(255,Math.max(0,n))));
}
const rgb=(x,y)=>pixels[y*cols+x];
const cells=Array.from({length:cols*rows},(_,id)=>{
  const x=id%cols,y=Math.floor(id/cols);
  return {top:rgb(x,y*2),bottom:rgb(x,y*2+1)};
});
writeFileSync(resolve(root,'cells.json'),JSON.stringify({cols,rows,cells}));
const esc='\x1b[';
const ansi=Array.from({length:rows},(_,y)=>
  cells.slice(y*cols,(y+1)*cols).map(({top,bottom})=>
    esc+'38;2;'+top.join(';')+';48;2;'+bottom.join(';')+'m▀').join('')+esc+'0m').join('\n');
writeFileSync(resolve(root,'ring-canyon.ansi'),ansi);
