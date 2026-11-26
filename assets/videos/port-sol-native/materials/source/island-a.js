const assets=ASSET_ROOT;
const ctx=vm.createContext({ Uint8Array,Float64Array,Math,Number,Array,RangeError,TypeError,Error });
vm.runInContext(readFileSync(assets+'procedural-frame.js','utf8')+'\n'+readFileSync(assets+'miniature-raster.js','utf8'),ctx);
const W=148,H=66;
const palettes={ivory:'#eadbb5',ochre:'#dca46d',coral:'#c77d67',teal:'#5f9793',ink:'#304950',green:'#63916f',roof:'#c87856',cream:'#fff0c9',paving:'#c8c8b1',water:'#376d80',rail:'#a7bdb2'};
function scene(stage){
 const r=ctx.createMiniatureRaster({width:W,height:H,scale:4.35,origin:[75,29.5],background:null});
 const {box,poly,disk,sphere}=r; const line=(a,b,c,w=.55)=>r.line(a,b,c,w,.055);
 const gable=(x,y,z,w,d,h,c)=>{poly([[x,y,z],[x+w,y,z],[x+w,y+h,z+d/2],[x,y+h,z+d/2]],r.shade(c,.78));poly([[x,y+h,z+d/2],[x+w,y+h,z+d/2],[x+w,y,z+d],[x,y,z+d]],c);poly([[x+w,y,z],[x+w,y+h,z+d/2],[x+w,y,z+d]],'#d9c6a3');line([x-.05,y+h,z+d/2],[x+w+.05,y+h,z+d/2],'#edd0a5',.45);for(let q=.28;q<d/2;q+=.26){const yy=y+h*(1-q/(d/2));line([x,yy,z+d/2+q],[x+w,yy,z+d/2+q],r.shade(c,.87),.35);}};
 const window=(x,y,z,w,h)=>{box(x,y,z,w,h,.045,palettes.ink);box(x+.08,y+.07,z+.05,Math.max(.06,w-.16),Math.max(.06,h-.13),.02,'#a8c5b4');line([x+w/2,y,z+.085],[x+w/2,y+h,z+.085],palettes.cream,.36);};
 const house=(x,z,w,d,h,c,roof=palettes.roof)=>{box(x,0,z,w,h,d,c);box(x-.04,.04,z-.04,w+.08,.18,d+.08,'#c2b296');gable(x-.17,h,z-.16,w+.34,d+.32,.65,roof);const count=Math.max(1,Math.floor(w/.8));for(let floor=.65;floor<h-.35;floor+=.95){for(let i=0;i<count;i++)window(x+.22+i*(w-.3)/count,floor,z+d+.018,.42,.57);}for(let zz=z+.3;zz<z+d-.2;zz+=.8)box(x+w+.01,.7,zz,.035,.64,.38,'#426568');};
 const tree=(x,z,k=1)=>{disk(x,.035,z,.48*k,'#a5b296');box(x-.065,0,z-.065,.13,1.25*k,.13,'#856f53');sphere(x,1.6*k,z,.59*k,'#729b71');sphere(x-.24*k,1.92*k,z-.08,.43*k,'#91ae7a');sphere(x+.3*k,1.5*k,z+.13,.37*k,'#547f67');};
 const person=(x,z,c)=>{box(x-.07,.03,z-.04,.07,.28,.1,'#354e53');box(x+.06,.03,z-.04,.07,.28,.1,'#354e53');box(x-.1,.3,z-.075,.25,.38,.2,c);sphere(x+.02,.82,z+.02,.13,'#e9bb91');};
 const lamp=(x,z)=>{box(x-.035,0,z-.035,.07,1.7,.07,'#47605a');box(x-.17,1.7,z-.15,.34,.08,.3,'#415b56');box(x-.1,1.47,z-.1,.2,.23,.2,'#f6d699');};
 const awning=(x,y,z,w,shade)=>{for(let i=0;i<Math.ceil(w/.24);i++){const xx=x+i*.24,ww=Math.min(.24,x+w-xx);poly([[xx,y,z],[xx+ww,y,z],[xx+ww,y-.25,z+.65],[xx,y-.25,z+.65]],i%2?'#efdfba':shade);box(xx,y-.37,z+.65,ww,.12,.04,i%2?'#efdfba':shade);}};
 const boat=(x,z,c)=>{poly([[x-.8,.03,z-.25],[x+.55,.03,z-.25],[x+.95,.03,z],[x+.55,.03,z+.3],[x-.8,.03,z+.3],[x-1.0,.03,z]],c);box(x-.32,.06,z-.19,.55,.28,.38,'#f1e3bd');line([x,.3,z],[x,1.4,z],'#e3d6b3',.45);poly([[x,.45,z],[x,1.34,z],[x+.6,.45,z]],'#f5e6c6');};
 // The ground and harbor are deliberate scene geometry; untouched outer Cells stay empty.
 if(stage>=0){box(-8.2,-.48,-5.1,16.4,.46,10.9,'#829b92');box(-8.15,-.02,-5.05,16.3,.025,7.9,palettes.paving);box(-8.15,-.015,2.85,16.3,.02,2.95,palettes.water);
 for(let x=-7.8;x<8;x+=.7)for(let z=-4.8;z<2.7;z+=.7){if(z<-.7||z>.9)box(x,.005,z,.65,.012,.65,(Math.round(x*7+z*4)%4===0?'#bfc2aa':'#d2ceb6'));}
 box(-8.1,.022,-.8,16.2,.026,1.8,'#596d6d');for(const z of [-.48,.32])line([-8.1,.067,z],[8.1,.067,z],'#b7c6b7',.42);for(let x=-7.9;x<8;x+=.65)line([x,.055,-.68],[x,.055,.52],'#7e8f83',.38);
 box(-8.1,.045,.94,16.2,.14,.22,'#e7d5b0');box(-8.1,.045,-1.04,16.2,.14,.2,'#d9c9a7');
 box(-2.2,.01,3.12,5.0,.15,.7,'#ac9872');for(let x=-2.1;x<2.9;x+=.35)line([x,.17,3.14],[x,.17,3.79],'#d4be93',.32);
 for(let x=-7.8;x<8;x+=1.2)line([x,.02,4.6],[x+.42,.02,4.6],'#59909a',.35);
 }
 if(stage>=1)house(-6.8,-2.8,2.1,1.9,1.45,'#d4b68b','#9d7464');
 if(stage>=2)house(-4.4,-3.9,1.7,1.65,1.8,'#8fac99','#b67b60');
 if(stage>=3){ box(-6.6,.015,2.8,3.7,.14,1.28,'#b7a47c'); for(let x=-6.5;x<-2.9;x+=.28) line([x,.16,2.82],[x,.16,4.07],'#d8c29b',.3); // Cafe: deep shop window, striped awning, chimney, roof seams.
 house(-6.3,1.18,3.25,1.5,2.4,palettes.ivory);window(-5.98,.43,2.72,1.5,1.13);box(-4.15,.05,2.72,.62,1.53,.07,'#496e62');box(-6.1,1.83,2.73,2.65,.43,.06,'#665e4a');awning(-6.44,1.8,2.77,3.52,'#719c81');box(-5.7,2.95,1.44,.28,.6,.3,'#a58769');
 disk(-5.3,.58,3.75,.32,'#e6cca2');box(-5.34,0,3.71,.08,.58,.08,'#6b6c57');for(const x of [-5.9,-4.72]){box(x,.27,3.6,.23,.08,.26,'#ae8c63');box(x,.36,3.8,.23,.32,.04,'#ae8c63');}
 }
 if(stage>=4)house(-1.95,-3.6,2.25,1.9,2.15,'#d4a67e','#6a8782');
 if(stage>=5)house(.62,-3.6,2.0,1.8,2.75,'#ddbd88','#b37c62');
 if(stage>=6)house(2.96,-3.7,1.9,1.9,2.0,'#9cb29b','#b58c6f');
 if(stage>=7){ // Station, platform and a simple flat canopy.
 box(.4,.02,1.45,3.25,.18,1.08,'#c3b493');box(.7,.2,1.56,2.5,1.3,.6,'#dfcfa5');for(let x=.9;x<3;x+=.63)window(x,.4,2.18,.42,.7);box(.45,1.55,1.38,3.2,.13,1.0,'#61877b');for(const x of [.55,3.3])box(x,.15,2.24,.07,1.4,.07,'#4e6c61');
 }
 if(stage>=8){ // Clock tower anchors the skyline, with four-sided trim and a tiny flag.
 box(-.95,0,1.25,1.0,3.45,1.0,'#d5b77e');for(let y=.25;y<3.5;y+=1.03)box(-1.02,y,1.18,1.14,.13,1.14,'#f0dfb3');box(-.79,2.66,2.28,.65,.63,.035,'#3a5755');disk(-.45,3.5,1.75,.43,'#647d6b');poly([[-1.15,3.55,1.05],[.23,3.55,1.05],[-.45,4.45,1.75]],'#73927c');poly([[-1.15,3.55,2.45],[.23,3.55,2.45],[-.45,4.45,1.75]],'#91a183');line([-.45,4.45,1.75],[-.45,5.0,1.75],'#d8c79a',.45);poly([[-.43,4.85,1.75],[.2,4.65,1.75],[-.43,4.52,1.75]],'#d68d63');
 }
 if(stage>=9){ // Right-hand lighthouse overlooking the harbor.
 box(5.52,.02,2.0,1.45,.2,1.42,'#cbbb98');box(5.86,.22,2.32,.74,2.9,.74,'#e6dabb');box(5.82,1.0,2.28,.82,.29,.82,'#c1856b');box(5.82,2.12,2.28,.82,.29,.82,'#c1856b');box(5.62,3.12,2.08,1.2,.13,1.2,'#45676b');box(5.86,3.25,2.32,.74,.6,.74,'#f3d590');gable(5.62,3.84,2.08,1.2,1.2,.36,'#5e817a');
 }
 if(stage>=10){ // Mint tram: wheel assemblies, warm body and dark divided windows.
 const x=-1.7,z=-.66;for(const xx of [x+.4,x+2.1])for(const zz of [z+.1,z+.98])sphere(xx,.2,zz,.18,'#2e4448');box(x,.29,z,2.65,.72,1.02,'#8bb7a5');box(x+.06,1.01,z+.06,2.53,.23,.9,'#e0d7b5');for(let xx=x+.2;xx<x+2.5;xx+=.52){box(xx,.61,z+1.03,.35,.39,.018,'#355d67');box(xx+.025,.82,z+1.055,.28,.12,.012,'#b2d0c0');}box(x+2.66,.5,z+.17,.03,.49,.65,'#416a6b');box(x+2.7,.44,z+.2,.04,.12,.14,'#f3dcaa');line([x+.8,1.25,z+.4],[x+1.2,1.65,z+.4],'#536c65',.42);line([x+1.2,1.65,z+.4],[x+1.65,1.25,z+.4],'#536c65',.42);
 }
 if(stage>=11)boat(2.4,4.9,'#d7ac74');
 if(stage>=12)boat(-2.7,4.9,'#d5a18c');
 if(stage>=13){box(4.0,.01,3.0,.6,.15,1.9,'#ac9872');for(let z=3;z<5;z+=.28)line([4.0,.17,z],[4.6,.17,z],'#d7bc8e',.3);}
 if(stage>=14){for(const [x,z,k]of [[-7.45,1.5,.85],[-2.1,1.65,.65],[4.2,1.5,.8],[6.8,-2.7,.95],[-7.5,-2,.7]])tree(x,z,k);}
 if(stage>=15){for(const [x,z]of [[-6.9,.9],[2.6,.92],[6.5,.95]])lamp(x,z);}
 if(stage>=16){for(const[x,z,c]of [[-2.6,2.5,'#be775d'],[.85,2.7,'#8ba0a3'],[3.9,2.5,'#d2aa68'],[-4.5,-1.2,'#b4c1a2'],[4.7,-.1,'#d3aa75']])person(x,z,c);for(const[x,z]of [[-7.1,3.0],[3.8,2.2],[6.8,2.85]]){box(x-.18,.01,z-.18,.36,.3,.36,'#b88e69');sphere(x,.49,z,.24,'#829e71');sphere(x-.09,.66,z,.08,'#d6b483');}}
 return r.frame;
}
