// Reference concept illustration, not a mechanically validated movement.
// Requires procedural-frame.js, miniature-raster.js and exploded-assembly.js.
// Dimensions, materials and wheel placement belong to this example.
function createWatchStudyDetails(r) {
 const {box,poly,triangle,disk,sphere,shade}=r;
 const line=(a,b,c,w=.6)=>r.line(a,b,c,w,.012);
function ring(x,y,z,outer,inner,h,c,n=80){
 for(let i=0;i<n;i++){
  const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n;
  const p=(rad,t,yy)=>[x+rad*Math.cos(t),yy,z+rad*Math.sin(t)];
  poly([p(outer,a,y+h),p(outer,b,y+h),p(inner,b,y+h),p(inner,a,y+h)],shade(c,1.1));
  poly([p(outer,a,y),p(outer,b,y),p(outer,b,y+h),p(outer,a,y+h)],shade(c,.7+.2*Math.cos((a+b)/2-.6)));
  poly([p(inner,a,y),p(inner,b,y),p(inner,b,y+h),p(inner,a,y+h)],shade(c,.62+.12*Math.sin(a)));
 }
}
function screw(x,y,z,rad=.12){disk(x,y,z,rad,'#a9b5af');line([x-rad*.65,y+.006,z-rad*.3],[x+rad*.65,y+.006,z+rad*.3],'#44585c',.55);}
function gear(x,y,z,rad,teeth,c){
 const n=teeth*4,inner=rad*.29,h=.18;
 for(let i=0;i<n;i++){
  const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n;
  const ra=rad*([.84,1,1,.84][i%4]),rb=rad*([.84,1,1,.84][(i+1)%4]);
  const p=(rr,t,yy)=>[x+rr*Math.cos(t),yy,z+rr*Math.sin(t)];
  poly([p(ra,a,y+h),p(rb,b,y+h),p(inner,b,y+h),p(inner,a,y+h)],shade(c,1.06));
  poly([p(ra,a,y),p(rb,b,y),p(rb,b,y+h),p(ra,a,y+h)],shade(c,.67+.18*Math.cos(a)));
 }
 ring(x,y+.19,z,rad*.26,rad*.095,.1,'#c8ad71',24);
 disk(x,y+.31,z,rad*.09,'#5b7477');
 // Recessed radial detail stays inside the gear's surface.
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5;line([x+rad*.38*Math.cos(a),y+.19,z+rad*.38*Math.sin(a)],[x+rad*.69*Math.cos(a),y+.19,z+rad*.69*Math.sin(a)],shade(c,.65),.9);}
}

 return {ring,screw,gear};
}
function drawExplodedWatch(raster, { amount = 1, guides = true } = {}) {
 const parts = [
  { id: 'case', label: 'CASE', origin: [0,0,0], at: [0,0,0], explodeBy: [0,0,0], anchor: [3,0.12,0],
    draw(r) {
      const {box,poly,triangle,disk,sphere,shade}=r;
      const line=(a,b,c,w=.6)=>r.line(a,b,c,w,.012);
      const {ring,screw,gear}=createWatchStudyDetails(r);
// Bottom case, lugs and winding crown.
ring(0,.05,0,3.25,2.77,.55,'#b6b7a4');disk(0,.58,0,2.77,'#46636b');
ring(0,.61,0,2.66,2.45,.11,'#c2a56b');
for(const x of [-1.5,1.5])for(const z of [-3.4,3.05])box(x-.3,.04,z,.6,.52,.65,'#aaa990');
for(const x of [-1.5,1.5])line([x,.3,-3.41],[x,.3,3.67],'#d0c9ad',.5);
box(3.13,.18,-.3,.5,.25,.6,'#a0a896');
ring(3.63,.18,0,.4,.05,.27,'#c6b179',24);
for(let i=0;i<12;i++){const a=i*Math.PI/6;screw(2.85*Math.cos(a),.64,2.85*Math.sin(a),.08);}

    } },
  { id: 'plate', label: 'PLATE', origin: [0,2.8,0], at: [0,0.7,0], explodeBy: [0,2.1,0], anchor: [3,2.92,0],
    draw(r) {
      const {box,poly,triangle,disk,sphere,shade}=r;
      const line=(a,b,c,w=.6)=>r.line(a,b,c,w,.012);
      const {ring,screw,gear}=createWatchStudyDetails(r);
// Exploded movement plate with jewels and interlocking wheel outlines.
disk(0,2.8,0,2.85,'#b49a63');ring(0,2.8,0,2.89,2.7,.14,'#d2b575');
disk(-.85,2.82,-.65,1.24,'#5a7375');disk(.95,2.82,.5,.82,'#607778');
for(let i=0;i<7;i++){const a=i*Math.PI*2/7;disk(2.3*Math.cos(a),2.85,2.3*Math.sin(a),.13,'#9b5a65');ring(2.3*Math.cos(a),2.85,2.3*Math.sin(a),.17,.13,.04,'#e0bd7d',16);}

    } },
  { id: 'wheels', label: 'WHEELS', origin: [0,4.3,0], at: [0,1.0,0], explodeBy: [0,3.3,0], anchor: [3,4.42,0],
    draw(r) {
      const {box,poly,triangle,disk,sphere,shade}=r;
      const line=(a,b,c,w=.6)=>r.line(a,b,c,w,.012);
      const {ring,screw,gear}=createWatchStudyDetails(r);
// The wheels are separated from their plate for visibility.
gear(-1.03,4.3,-.5,1.16,20,'#d2ad63');gear(.82,4.31,.16,.88,16,'#c49b55');gear(-.05,4.32,1.42,.63,12,'#d2b578');
gear(1.0,4.3,-1.3,.55,12,'#a4bab3');
ring(-1.4,4.34,1.12,.76,.56,.13,'#cbb687');
for(let i=0;i<3;i++){const a=i*Math.PI*2/3;line([-1.4,4.5,1.12],[-1.4+.59*Math.cos(a),4.5,1.12+.59*Math.sin(a)],'#a6b8ac',1.0);}
screw(-1.4,4.53,1.12,.11);

    } },
  { id: 'bridge', label: 'BRIDGE', origin: [0,5.95,0], at: [0,1.5,0], explodeBy: [0,4.45,0], anchor: [3,6.07,0],
    draw(r) {
      const {box,poly,triangle,disk,sphere,shade}=r;
      const line=(a,b,c,w=.6)=>r.line(a,b,c,w,.012);
      const {ring,screw,gear}=createWatchStudyDetails(r);
// A cut bridge, bearing bosses and visible plate machining marks.
poly([[-2.4,5.95,-1.5],[-1.4,5.95,-2.0],[1.85,5.95,-.7],[2.1,5.95,.1],[.8,5.95,.3],[-1.4,5.95,-.6]],'#9bb0a6');
for(const [x,z]of [[-1.9,-1.4],[1.6,-.45],[-.65,-.78]]){ring(x,5.96,z,.26,.13,.11,'#d3b779',24);disk(x,6.08,z,.12,'#985c69');}
for(let i=0;i<10;i++)line([-1.5+i*.2,5.962,-1.4+i*.08],[-1.5+i*.2,5.962,-.9+i*.08],'#afc0b1',.35);

    } },
  { id: 'dial', label: 'DIAL', origin: [0,7.75,0], at: [0,1.8,0], explodeBy: [0,5.95,0], anchor: [3,7.87,0],
    draw(r) {
      const {box,poly,triangle,disk,sphere,shade}=r;
      const line=(a,b,c,w=.6)=>r.line(a,b,c,w,.012);
      const {ring,screw,gear}=createWatchStudyDetails(r);
// Cream dial suspended above the movement.
disk(0,7.75,0,2.94,'#d8d0ad');ring(0,7.75,0,2.97,2.8,.14,'#b9a170');
ring(0,7.91,0,2.4,2.37,.006,'#a49e7c');
for(let i=0;i<60;i++){
 const a=i*Math.PI/30,major=i%5===0,ra=major?2.19:2.36,rb=2.59;
 line([ra*Math.cos(a),7.92,ra*Math.sin(a)],[rb*Math.cos(a),7.92,rb*Math.sin(a)],major?'#334f58':'#8c927a',major?1.0:.43);
}
// Small seconds subdial, with its own scale and pointer.
ring(.82,7.93,.85,.61,.59,.008,'#8d9c89');
for(let i=0;i<12;i++){const a=i*Math.PI/6;line([.82+.49*Math.cos(a),7.95,.85+.49*Math.sin(a)],[.82+.57*Math.cos(a),7.95,.85+.57*Math.sin(a)],'#8a9178',.45);}
line([.82,7.96,.85],[1.22,7.96,.62],'#b56c57',.75);
// Broad hands and a thin seconds hand create a legible focal point.
function hand(a,len,wide,c,y){const n=[-Math.sin(a)*wide,Math.cos(a)*wide];poly([[n[0],y,n[1]],[len*Math.cos(a),y,len*Math.sin(a)],[-n[0],y,-n[1]],[-.25*Math.cos(a),y,-.25*Math.sin(a)]],c);}
hand(-2.35,1.45,.12,'#315560',8.01);hand(-.44,2.08,.085,'#456c71',8.05);
line([-.35,.0+8.09,.12],[1.45,8.09,-.5],'#b86a54',.65);disk(0,8.12,0,.15,'#b19154');

    } },
  { id: 'bezel', label: 'BEZEL', origin: [0,10.45,0], at: [0,2.1,0], explodeBy: [0,8.35,0], anchor: [3,10.569999999999999,0],
    draw(r) {
      const {box,poly,triangle,disk,sphere,shade}=r;
      const line=(a,b,c,w=.6)=>r.line(a,b,c,w,.012);
      const {ring,screw,gear}=createWatchStudyDetails(r);
// The top bezel is open so that the dial can be read through it.
ring(0,10.45,0,3.15,2.85,.22,'#c4b886');
for(let i=0;i<40;i++){const a=i*Math.PI/20;line([3.02*Math.cos(a),10.68,3.02*Math.sin(a)],[3.12*Math.cos(a),10.68,3.12*Math.sin(a)],'#e0cc9b',.44);}

    } },
 ];
 const result = renderExplodedAssembly(raster, parts, {amount});
 // Reference-only dashed alignment guides, positioned in world coordinates.
 if (guides && amount > 0) for (const [x,z] of [[-2.4,-2.4],[2.4,2.4]]) {
   for (let y=.8; y<2.1+amount*8.2; y+=.5) raster.line([x,y,z],[x,y+.2,z],'#4a676e',.4,.012);
 }
 return result;
}
