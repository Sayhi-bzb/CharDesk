import{readFileSync,writeFileSync,existsSync}from'node:fs';import vm from'node:vm';import{spawn}from'node:child_process';
import{dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';import{mkdirSync}from'node:fs';
const source=dirname(fileURLToPath(import.meta.url)),output=resolve(source,'..'),root=resolve(output,'frames'),S=4.35,L=180,D=L/(S*Math.sqrt(3)),PAD=8,W=900,H=96;
mkdirSync(resolve(root,'png-final'),{recursive:true});
const helpers=readFileSync(resolve(source,'scene-helpers.js'),'utf8'),actorBody=readFileSync(resolve(source,'district-actors.js'),'utf8');
const assetRead=path=>{let s=readFileSync(path,'utf8');if(path.endsWith('miniature-raster.js'))s=s.replace('frame: { width, height, data, mask }','frame: { width, height, data, mask, depth }');return s;};
const ctx=vm.createContext({ASSET_ROOT:resolve(source,'assets')+'/',readFileSync:assetRead,vm,Uint8Array,Float64Array,Math,Number,Array,RangeError,TypeError,Error});
vm.runInContext(readFileSync(resolve(source,'island-a.js'),'utf8')+'\nglobalThis.paintA=scene;',ctx);
vm.runInContext(`function part(which,stage){const centerX=which==='B'?26:50,centerZ=which==='B'?-10:2;const r=ctx.createMiniatureRaster({width:148,height:66,scale:4.35,origin:[75-(centerX-centerZ)*4.35*Math.sqrt(3)/2,29.5-(centerX+centerZ)*4.35/2],background:null});${helpers}\nconst actors=[],add=(id,kind,draw)=>actors.push({id,kind,draw});${actorBody}\nconst selected=which==='B'?actors.slice(2,11):actors.slice(22,26);for(let i=0;i<=stage;i++)selected[i].draw();for(let i=0;i<r.frame.depth.length;i++)r.frame.depth[i]-=centerX+centerZ;return r.frame;}globalThis.paintPart=part;`,ctx);
vm.runInContext(`function makeBridge(kind){const r=ctx.createMiniatureRaster({width:328,height:96,scale:4.35,origin:[75,37.5],background:null});${helpers}\nconst actors=[],add=(id,kind,draw)=>actors.push({id,kind,draw});${actorBody}\nconst d=${D};const a=kind===2?[1,.7]:[8.1,0],end=kind===1?[d-4,-d]:[d-8.1,-d];bridge(a,[a[0]+4,a[1]],[end[0]-4,end[1]],end,kind!==2);return r.frame;}globalThis.paintBridge=makeBridge;`,ctx);
const tiles={A:Array.from({length:17},(_,i)=>ctx.paintA(i)),B:Array.from({length:9},(_,i)=>ctx.paintPart('B',i)),C:Array.from({length:4},(_,i)=>ctx.paintPart('C',i))};const bridges=[0,1,2].map(i=>ctx.paintBridge(i));
const sea=[59,115,134];const levels=[3,-1,-1,-1,-1],types=['C','A','B','C','A'];const spans=[{index:0,kind:2}];
const seaActors=[];
// Static glyph samples become native ANSI Cells in each authored scene state.
function seaActor(index,kind,x,y,len=6){seaActors.push({index,kind,x:index*L+x,y,len});}
function composite(){const data=new Uint8Array(W*H*3),mask=new Uint8Array(W*H).fill(1),depth=new Float64Array(W*H).fill(-Infinity);for(let i=0;i<W*H;i++)data.set(sea,i*3);
 // Authored sea marks sit below terrain; static gull glyphs occupy the air layer.
 const dot=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<W&&y>=0&&y<H)data.set(c,(y*W+x)*3);};
 const wave=(x,y,len)=>{const c=[92,151,162],foam=[133,178,181];for(let j=1;j<len-1;j++)dot(x+j,y,c);dot(x,y+1,c);dot(x+len-1,y+1,c);for(let j=2;j<len-2;j++)dot(x+j+1,y+2,foam);};
 const buoy=(x,y)=>{const red=[193,126,103],cream=[231,215,177],dark=[66,99,108];dot(x,y-3,dark);for(const dx of[-1,0,1]){dot(x+dx,y-2,red);dot(x+dx,y-1,cream);dot(x+dx,y,dark);}wave(x-3,y+2,6);};
 const gull=(x,y)=>{const white=[240,235,207];for(const[dx,dy]of[[-2,-1],[-1,0],[0,1],[1,0],[2,-1]])dot(x+dx,y+dy,white);};
 for(const a of seaActors){if(a.kind==='wave')wave(a.x,a.y,a.len);else if(a.kind==='buoy')buoy(a.x,a.y);else if(a.kind==='gull')continue;}

 const paint=(frame,x0,y0)=>{for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){const i=y*frame.width+x;if(!frame.mask[i])continue;const xx=x+x0,yy=y+y0;if(xx<0||xx>=W||yy<0||yy>=H)continue;const k=yy*W+xx;if(frame.depth[i]>=depth[k]){depth[k]=frame.depth[i];data.set(frame.data.subarray(i*3,i*3+3),k*3);}}};
 for(let i=0;i<levels.length;i++)if(levels[i]>=0)paint(tiles[types[i]][levels[i]],i*L,PAD);for(const bridge of spans)paint(bridges[bridge.kind],bridge.index*L,0);for(const a of seaActors)if(a.kind==='gull')gull(a.x,a.y);return{width:W,height:H,data,mask};}
function ansi(f){const rows=[];for(let y=0;y<H;y+=2){let row='',last='';for(let x=0;x<W;x++){const i=y*W+x,j=i+W;const rgb=k=>Array.from(f.data.subarray(k*3,k*3+3)).join(';'),style='38;2;'+rgb(i)+';48;2;'+rgb(j);if(style!==last){row+='\x1b[0;'+style+'m';last=style;}row+='▀';}rows.push(row+'\x1b[0m');}return rows.join('\n');}
const phases=[],cameras=[],jobs=[];let time=0,current=null,previousFrame=null,stage=0;
function state(change,kind,duration,reveal,id){change?.();const frame=composite(),name=`state-${stage++}.png`;writeFileSync(`${root}/${name}.ans`,ansi(frame));jobs.push({input:`${root}/${name}.ans`,output:`${root}/png-final/${name}`});let x0=W,y0=H,x1=-1,y1=-1;if(previousFrame)for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*3;if([0,1,2].some(k=>frame.data[i+k]!==previousFrame.data[i+k])){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}else{x0=0;y0=0;x1=W-1;y1=H-1;}
 const file=`png-final/${name}`,bounds=x1<0?[0,0,0,0]:[x0*9,Math.floor(y0/2)*20,(x1-x0+1)*9,(Math.floor(y1/2)-Math.floor(y0/2)+1)*20];phases.push({start:time,file,previous:current,stage:stage-1,kind,duration,reveal,revealBounds:bounds,id});time+=duration;current=file;previousFrame=frame;}
function hold(duration){phases.push({start:time,file:current,previous:current,stage:-1,kind:'hold',duration,reveal:0,revealBounds:[0,0,0,0]});time+=duration;}
const cameraFor=i=>[(i*L+75)*9,400,1240];
function fixed(index,fn){const start=time;fn();const cam=cameraFor(index);cameras.push({start,duration:time-start,mode:'hold',from:cam,to:cam,path:[],anchor:[]});}
function travel(from,to){const start=time,duration=3.3;
 hold(.9);
 const by=from===2?18:65,gy=from===2?65:10;
 state(()=>seaActor(from,'buoy',160,by),'sea-buoy',.3,.12,'静态浮标');
 state(()=>seaActor(from,'wave',146,from===2?66:12,7),'sea-wave',.3,.12,'浪线');
 state(()=>seaActor(from,'gull',165,gy),'sea-gull',.3,.12,'静态海鸥 1');
 state(()=>seaActor(from,'gull',173,gy+3),'sea-gull',.3,.12,'静态海鸥 2');
 hold(duration-(time-start));const a=cameraFor(from),b=cameraFor(to);cameras.push({start,duration,mode:'pan',from:a,to:b,path:Array.from({length:101},(_,i)=>[a[0]+(b[0]-a[0])*i/100,400]),anchor:[]});}
const foundation=i=>state(()=>levels[i]=0,'foundation',.4,.25,types[i]+' 底座');
function build(index){const type=types[index],end=type==='A'?9:type==='B'?7:2;foundation(index);for(let s=1;s<=end;s++)state(()=>levels[index]=s,'building',.7,.2,`${type} 建筑 ${s}`);for(let s=end+1;s<tiles[type].length;s++)state(()=>levels[index]=s,'detail',.16,.08,type+' 细节');}
function drawIslandSea(index){for(const[x,y,len]of[[18,68,6],[70,index===2?16:70,7],[120,60,6]])state(()=>seaActor(index,'wave',x,y,len),'sea-wave',.2,.12,'绘制浪线');}
const connect=(index,kind)=>state(()=>spans.push({index,kind}),'bridge',.68,.28,'向前的桥');
fixed(1,()=>{state(null,'hold',.15,0,'A 起始状态');build(1);drawIslandSea(1);connect(1,0);});travel(1,2);
fixed(2,()=>{hold(.15);build(2);drawIslandSea(2);connect(2,1);});travel(2,3);
fixed(3,()=>{hold(.15);build(3);drawIslandSea(3);connect(3,2);});travel(3,4);
const tail=30-time;if(tail<.1||tail>1)throw Error('Loop timing invalid: '+tail);fixed(4,()=>hold(tail));
const plan={fps:30,width:1920,height:1080,duration:time,phases,cameras,uniqueIslands:['A','B','C'],periodPixels:3*L*9};writeFileSync(`${root}/film-plan.json`,JSON.stringify(plan,null,2));
for(const p of phases.filter(p=>p.kind==='building'))if(Math.abs(p.duration-p.reveal-.5)>1e-9)throw Error('Hold changed');for(const c of cameras)if(c.to[0]<c.from[0]||c.to[2]!==1240)throw Error('Camera reversed or zoomed');
let next=0,done=0;async function worker(){while(next<jobs.length){const job=jobs[next++];if(!existsSync(job.output))await new Promise((resolve,reject)=>{const p=spawn('chardesk',['render',job.input,'-o',job.output,'--scale','1','--padding','0','--json']);let err='';p.stderr.on('data',d=>err+=d);p.on('exit',code=>code===0?resolve():reject(Error(err)));});done++;if(done%8===0)console.log(`${done}/${jobs.length} frames exported`);}}
if(!process.argv.includes('--material-only'))await Promise.all([worker(),worker(),worker()]);console.log(JSON.stringify({seconds:time,states:jobs.length,buildings:phases.filter(p=>p.kind==='building').length,uniqueIslands:3,globalView:false,cameraForwardOnly:true,loopAt:'A-prime before foundation'}));
