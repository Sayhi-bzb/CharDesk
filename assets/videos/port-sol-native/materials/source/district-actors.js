
 const terrain=(cx,cz,tone)=>{box(cx-8.2,-.48,cz-5.1,16.4,.46,10.9,'#829b92');box(cx-8.15,-.02,cz-5.05,16.3,.025,7.9,tone);box(cx-8.15,-.015,cz+2.85,16.3,.02,2.95,'#39798c');
  for(let x=-7.8;x<8;x+=.8)for(let z=-4.8;z<2.7;z+=.8)if(z<-.8||z>1)box(cx+x,.008,cz+z,.75,.012,.75,'#d5ceb5');
  box(cx-8.1,.022,cz-.8,16.2,.026,1.8,'#596d6d');for(const z of [-.48,.32])line([cx-8.1,.067,cz+z],[cx+8.1,.067,cz+z],'#b7c6b7',.42);
  for(let x=-7.9;x<8;x+=.65)line([cx+x,.055,cz-.68],[cx+x,.055,cz+.52],'#7e8f83',.38);box(cx-8.1,.045,cz+.94,16.2,.14,.22,'#e7d5b0');box(cx-8.1,.045,cz-1.04,16.2,.14,.2,'#d9c9a7');
 };
 const seaPoint=(sx,sy,y=-.75)=>{const dif=(sx-75)/(4.35*Math.sqrt(3)/2),sum=(sy-29.5+y*4.35)/(4.35/2);return[(sum+dif)/2,y,(sum-dif)/2];};
 add('海湾地形','terrain',()=>{const outline=[[7,54],[102,27],[274,54],[315,131],[258,173],[62,171],[6,121]].map(([x,y])=>seaPoint(x,y));poly(outline,'#3b7386');
  // Sparse current highlights give the bay a scale without filling it with texture.
  for(const [x,y,len]of [[145,47,10],[133,78,8],[170,110,13],[230,110,8],[180,153,10],[29,83,7],[282,149,8]]){line(seaPoint(x,y,-.73),seaPoint(x+len,y,-.73),'#578d98',.45);}
 });
 const path=(a,b,c,d,t)=>{const s=1-t;return[a[0]*s*s*s+3*b[0]*s*s*t+3*c[0]*s*t*t+d[0]*t*t*t,a[1]*s*s*s+3*b[1]*s*s*t+3*c[1]*s*t*t+d[1]*t*t*t];};
 const bridge=(a,b,c,d,arch=true)=>{const steps=32,points=Array.from({length:steps+1},(_,i)=>path(a,b,c,d,i/steps));
  for(let i=0;i<steps;i++){const p=points[i],q=points[i+1],dx=q[0]-p[0],dz=q[1]-p[1],l=Math.hypot(dx,dz),nx=-dz/l,nz=dx/l;poly([[p[0]+nx*.82,.14,p[1]+nz*.82],[q[0]+nx*.82,.14,q[1]+nz*.82],[q[0]-nx*.82,.14,q[1]-nz*.82],[p[0]-nx*.82,.14,p[1]-nz*.82]],'#c7b994');
   for(const side of[-.38,.38])line([p[0]+nx*side,.17,p[1]+nz*side],[q[0]+nx*side,.17,q[1]+nz*side],'#b9c6b5',.45);
   if(i%2===0)line([p[0]+nx*.6,.18,p[1]+nz*.6],[p[0]-nx*.6,.18,p[1]-nz*.6],'#697f79',.4);
   for(const side of[-.78,.78]){line([p[0]+nx*side,.52,p[1]+nz*side],[q[0]+nx*side,.52,q[1]+nz*side],'#54746e',.55);if(i%3===0)line([p[0]+nx*side,.14,p[1]+nz*side],[p[0]+nx*side,.53,p[1]+nz*side],'#75938a',.45);}
  }
  for(const t of[.18,.5,.82]){const p=path(a,b,c,d,t);box(p[0]-.18,-.72,p[1]-.18,.36,.9,.36,'#899e92');}
  if(arch){for(let i=0;i<steps;i++){const p=points[i],q=points[i+1],h=.55+2.1*Math.sin(i/steps*Math.PI),hh=.55+2.1*Math.sin((i+1)/steps*Math.PI);line([p[0],h,p[1]],[q[0],hh,q[1]],'#d7cda4',.7);if(i%3===0)line([p[0],.2,p[1]],[p[0],h,p[1]],'#8ca59a',.4);}}
 };
 add('第一座跨海电车桥','bridge',()=>bridge([8.1,0],[12,0],[14,-10],[17.9,-10]));
 add('中央街区地块','terrain',()=>terrain(26,-10,'#d0c5a7'));
 const cx=26,cz=-10;
 add('中央街区 · 砖红小楼','building',()=>house(cx-6.7,cz-2.65,2.1,1.9,1.55,'#c99278','#9b705e'));
 add('中央街区 · 绿顶公寓','building',()=>house(cx-4.25,cz-3.45,2.0,2,2.0,'#e2cda2','#6d8d7f'));
 add('中央街区 · 芥黄公寓','building',()=>house(cx-1.9,cz-3.55,2.2,2,2.7,'#d7ad72','#bd8064'));
 add('中央街区 · 青灰公寓','building',()=>house(cx+.7,cz-3.5,2.1,2,2.3,'#8daaa2','#9d7666'));
 add('中央街区 · 奶油公寓','building',()=>house(cx+3.15,cz-3.4,2.05,2.0,2.5,'#e0c8a0','#68877f'));
 add('中央街区 · 大车站','building',()=>{box(cx-1.8,0,cz+1.2,4.1,3.0,1.75,'#e1cfaa');box(cx-2.0,3,cz+1.08,4.5,.22,2,'#b79d78');box(cx-.3,3.2,cz+1.55,1.1,.9,1,'#d2b789');gable(cx-.45,4.1,cz+1.4,1.4,1.35,.5,'#618478');for(let x=cx-1.5;x<cx+2;x+=.72){window(x,.65,cz+2.97,.44,1.4);box(x-.08,.05,cz+3.06,.12,2.7,.15,'#f0dfbd');}box(cx-.1,3.45,cz+2.58,.65,.52,.03,'#3c5d5b');});
 add('中央街区 · 小书店','building',()=>{house(cx-6.6,cz+1.25,2.7,1.5,2.0,'#adbbb0','#b77960');window(cx-6.3,.4,cz+2.78,1.5,1);awning(cx-6.75,1.65,cz+2.8,3,'#5e8c83');});
 add('中央广场与行道树','detail',()=>{disk(cx+4.4,.08,cz+2.1,.85,'#c6b795');disk(cx+4.4,.18,cz+2.1,.65,'#6c9997');box(cx+4.34,.18,cz+2.04,.12,.85,.12,'#e1d8b4');sphere(cx+4.4,1.05,cz+2.1,.17,'#c0d4c2');for(const[x,z]of[[-7.3,1.2],[6.6,-2.6],[6.7,1.8]])tree(cx+x,cz+z,.85);for(const[x,z]of[[-3.2,1.1],[3.1,1.1]])lamp(cx+x,cz+z);person(cx+2.7,cz+2.4,'#c88569');});
 add('第二座跨海电车桥','bridge',()=>bridge([34.1,-10],[40,-10],[8,19],[12.9,19]));
 add('花园街区地块','terrain',()=>terrain(21,19,'#c6c8ac'));
 const gx=21,gz=19;
 add('花园街区 · 鼠尾草小屋','building',()=>house(gx-6.7,gz-2.65,2.1,1.9,1.55,'#a8b99c','#b27f62'));
 add('花园街区 · 桃色小屋','building',()=>house(gx-4.3,gz-3.5,2.1,2,1.9,'#d8aa8b','#788e7e'));
 add('花园街区 · 黄墙旅馆','building',()=>house(gx-1.85,gz-3.5,2.35,2,2.8,'#dec18b','#b67b62'));
 add('花园街区 · 青绿小楼','building',()=>house(gx+.85,gz-3.3,2.15,1.8,2.3,'#90ada0','#a87861'));
 add('花园街区 · 艺术馆','building',()=>{box(gx-1.5,0,gz+1.3,3.4,2.35,1.8,'#e9d8b1');box(gx-1.75,2.35,gz+1.1,3.9,.22,2.2,'#71958a');for(let x=gx-1.3;x<gx+1.9;x+=.62){window(x,.5,gz+3.12,.38,1.25);box(x-.06,.15,gz+3.19,.1,1.95,.12,'#f2e3bf');}gable(gx-1.8,2.58,gz+1.05,4,2.3,.8,'#70958b');});
 add('花园街区 · 植物温室','building',()=>{box(gx+3.1,0,gz+1.25,3.2,.35,1.7,'#c6ba98');gable(gx+3.1,1.6,gz+1.25,3.2,1.7,.85,'#79a89b');box(gx+3.15,.35,gz+1.28,3.1,1.2,1.64,'#7b9f8d');for(let x=gx+3.2;x<gx+6.3;x+=.5){line([x,.36,gz+2.96],[x,1.62,gz+2.96],'#d5dbc0',.4);line([x,1.62,gz+2.96],[x,2.45,gz+2.1],'#d5dbc0',.4);}for(let x=gx+3.5;x<gx+6.1;x+=.85)sphere(x,.8,gz+2.85,.35,'#5d805e');});
 add('花园街区 · 街角面包店','building',()=>{house(gx-6.6,gz+1.2,2.7,1.6,1.9,'#e2c79e','#b47b62');awning(gx-6.75,1.6,gz+2.82,3,'#c4936d');});
 add('花园与小船','detail',()=>{for(const[x,z]of[[-7.3,-1.8],[-3,1.8],[6.5,-2.3],[6.7,2.2]])tree(gx+x,gz+z,.9);for(const[x,z]of[[-6,.9],[2.6,.9]])lamp(gx+x,gz+z);boat(gx-1.8,gz+4.8,'#d3a27b');person(gx+2.6,gz+2.3,'#c77f67');});
 add('通往灯塔岛的栈桥','bridge',()=>bridge([29.1,19],[35,19],[41,2],[46,2],false));
 add('灯塔岛地形','terrain',()=>{disk(50,-.4,2,4.7,'#8a9e91');disk(50,-.03,2,4.5,'#c2c5a9');box(46,0,1.3,5,.12,1.4,'#a89978');});
 add('灯塔岛 · 大灯塔','building',()=>{box(49.2,0,1.4,1.7,.3,1.7,'#b4b498');box(49.55,.3,1.75,1,4.1,1,'#e6dabc');for(const y of[1.1,2.6])box(49.5,y,1.7,1.1,.4,1.1,'#bc806b');box(49.2,4.4,1.4,1.7,.16,1.7,'#4e716c');box(49.5,4.56,1.7,1.1,.8,1.1,'#edd28d');gable(49.15,5.36,1.35,1.8,1.8,.5,'#64887a');});
 add('灯塔岛 · 看守人小屋','building',()=>house(51.2,2.4,1.6,1.4,1.3,'#d8c59e','#b87d62'));
 add('灯塔岛的树与帆船','detail',()=>{tree(51.9,.2,.65);tree(48.6,4.5,.55);boat(54.2,6,'#d8b37f');});