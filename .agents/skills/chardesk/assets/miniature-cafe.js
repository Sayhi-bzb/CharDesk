// Reference composition; adapt scene geometry, materials and scale to the task.
// No target selection or Canvas writes. Requires miniature-raster.js.
function drawMiniatureCafe(raster) {
  const { box, poly, triangle, disk, sphere, color } = raster;
  // This scene uses thin surface details. Bias is local, in world-depth units.
  const line = (a, b, value, radius) => raster.line(a, b, value, radius, .12);
  // A small beveled street tile.
box(-5,-.65,-5,10,.65,10,'#7c8b89');box(-4.95,-.03,-4.95,9.9,.03,7.45,'#c7c8b4');box(-4.95,-.025,2.5,9.9,.025,2.45,'#53656a');
for(let x=-5;x<5;x+=.8)for(let z=-4.8;z<2.4;z+=.8)box(x+.025,.002,z+.025,.75,.012,.75,(Math.floor(x*10+z*5)%3===0?'#c7c6b0':'#d0d0bb'));
for(let x=-4.9;x<5;x+=.5)box(x,.02,2.4,.47,.14,.22,'#e1d7ba');
for(let x=-3.5;x<3.5;x+=1.4)box(x,.005,4.1,.72,.003,.055,'#d6d5b9');
disk(-1.2,.022,.6,2.2,'#526b62',.17);disk(3.3,.023,-.8,1.35,'#2c4d43',.18);
// Cream shop with a warm terracotta gable roof.
box(-4,0,-3.8,4.8,4.45,3.5,'#e2d5b2');box(-4,.05,-.29,4.8,.34,.16,'#7e9b87');
box(.805,.1,-3.5,.08,4.15,.16,'#cfbc98');
for(let z=-3.4;z<-.35;z+=.6){box(.82,1.1,z,.03,1.5,.42,'#426b6b');box(.855,1.18,z+.04,.015,1.32,.08,'#a9c4ae');}
// Shopfront window, timber frames, shelves and door.
box(-3.65,.6,-.278,2.25,2.05,.07,'#35575a');box(-3.55,.72,-.19,2.04,1.8,.025,'#c2b385');
for(let i=0;i<6;i++)box(-3.46+i*.29,.84,-.15,.19,.27,.018,i%2?'#e1b065':'#a2764b');
box(-3.6,1.35,-.12,2.13,.065,.08,'#675d48');box(-2.62,.65,-.1,.07,1.96,.07,'#e8d9b4');
box(-3.6,.66,-.085,2.13,.065,.07,'#eadab8');box(-3.6,2.56,-.085,2.13,.065,.07,'#eadab8');
box(-1.02,.05,-.23,1.12,2.55,.12,'#466c60');box(-.88,.73,-.09,.84,1.63,.02,'#35565a');box(-.86,.9,-.06,.04,1.35,.01,'#8ba89b');sphere(-.08,1.2,-.025,.045,'#e7ba70');
box(-1.15,.01,-.02,1.35,.10,.48,'#ddd3b4');
// Loft windows above the fascia.
for(const x of [-3.5,-1.45]){box(x,3.5,-.265,1.15,.65,.04,'#486960');box(x+.1,3.56,-.21,.94,.5,.025,'#b2c4ac');box(x+.53,3.55,-.16,.055,.51,.03,'#e6d8b7');}
box(-3.75,2.92,-.20,4.25,.6,.1,'#756952');
const font={C:['111','100','100','100','111'],A:['010','101','111','101','101'],F:['111','100','110','100','100'],E:['111','100','110','100','111']};
for(const [n,ch]of [...'CAFE'].entries())for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(font[ch][row][col]==='1')box(-2.95+n*.53+col*.115,3.00+(4-row)*.10,-.088,.09,.08,.018,'#f0dfb8');
// Striped awning slopes out over the storefront.
for(let i=0;i<12;i++){const x=-4.15+i*.43,c=color(i%2?'#e8dcc0':'#689d87');poly([[x,2.9,-.32],[x+.43,2.9,-.32],[x+.43,2.56,.82],[x,2.56,.82]],c);box(x,2.38,.82,.43,.18,.035,c);}
for(const x of [-4.07,.91])box(x,0,.77,.055,2.5,.055,'#527567');
// Roof planes and tiled seams.
poly([[-4.2,4.5,-4.02],[1.01,4.5,-4.02],[1.01,6.05,-2],[ -4.2,6.05,-2]],color('#9d6353'));
poly([[-4.2,6.05,-2],[1.01,6.05,-2],[1.01,4.5,-.08],[-4.2,4.5,-.08]],color('#bf7961'));
poly([[1.01,4.47,-4.02],[1.01,6.05,-2],[1.01,4.47,-.08]],color('#c5b08c'));
for(let z=-1.85;z<-.08;z+=.25){const y=6.05-(z+2)/1.92*1.55+.012;line([-4.2,y,z],[1.01,y,z],'#a86b57',.65);}
for(let x=-4.15;x<1;x+=.35)line([x,6.065,-2],[x,4.51,-.08],'#c88a70',.6);
box(-3.25,5.35,-2.7,.5,.85,.5,'#b28e70');box(-3.3,6.2,-2.75,.6,.12,.6,'#d3b99a');box(-3.2,6.325,-2.65,.4,.01,.4,'#564d44');
// Terrace furniture and cups.
function table(x,z){disk(x,.76,z,.44,'#decba0');box(x-.06,0,z-.06,.12,.76,.12,'#6b7060');for(const dx of [-.58,.58]){box(x+dx-.17,.36,z-.18,.34,.075,.36,'#b08860');box(x+dx-.16,.04,z-.16,.04,.32,.04,'#5b675b');box(x+dx+.11,.04,z+.11,.04,.32,.04,'#5b675b');box(x+dx-.16,.43,z+.13,.3,.45,.04,'#ad8d64');}box(x-.06,.78,z-.04,.12,.1,.12,'#f4e7cd');box(x-.02,.89,z-.02,.04,.006,.04,'#674d39');}
table(-2.6,1.45);table(-.35,1.55);
// A small parasol on the left terrace.
box(-2.6,0,1.45,.045,2.35,.045,'#a28b65');for(let i=0;i<8;i++){const a=i*Math.PI/4,b=(i+1)*Math.PI/4;triangle([-2.6,2.52,1.45],[-2.6+.85*Math.cos(a),2.18,1.45+.85*Math.sin(a)],[-2.6+.85*Math.cos(b),2.18,1.45+.85*Math.sin(b)],color(i%2?'#dfcfaa':'#b78c70'));}
// Street trees, planters, flowers.
for(const [x,z,r]of [[3.3,-2.6,.95],[3.7,.8,.78]]){box(x-.5,.04,z-.5,1,.25,1,'#a3b39a');box(x-.42,.3,z-.42,.84,.015,.84,'#667763');box(x-.09,.3,z-.09,.18,2.0,.18,'#806c50');sphere(x,2.3,z,r,'#698e66');sphere(x-.4,2.55,z+.1,r*.66,'#83a477');sphere(x+.35,2.15,z+.25,r*.65,'#527c60');}
for(const [x,z]of [[1.3,-.15],[-4.5,.5],[1.7,1.7]]){box(x-.22,.03,z-.22,.44,.4,.44,'#b98064');sphere(x,.58,z,.29,'#77986c');for(let i=0;i<5;i++)sphere(x+.2*Math.cos(i*2),.76,z+.2*Math.sin(i*2),.055,i%2?'#e4c789':'#c88c89');}
// Streetlamp and pocket-sized mint car.
box(-4.25,0,3.6,.10,3.1,.10,'#3a5553');box(-4.43,3.03,3.42,.46,.08,.46,'#3b5551');sphere(-4.2,2.9,3.65,.15,'#f0cd87');
box(-1.65,.35,3.55,2.12,.55,1.05,'#8bb4a5');box(-1.14,.9,3.64,1.03,.48,.86,'#bbc7ab');box(-1.08,.99,4.51,.84,.29,.02,'#41616a');box(-.09,.98,3.75,.02,.28,.65,'#41616a');
for(const x of [-1.25,.02])for(const z of [3.51,4.57])sphere(x,.38,z,.22,'#364b4d');
box(.48,.6,3.65,.025,.15,.19,'#e9c782');box(.48,.6,4.27,.025,.15,.19,'#e9c782');
// Bicycle by the curb, built as readable line geometry.
const bz=2.88;for(const x of [2.1,3.18]){let last;for(let i=0;i<=24;i++){const a=i*Math.PI/12,p=[x+.36*Math.cos(a),.42+.36*Math.sin(a),bz];if(last)line(last,p,'#3b5554',.65);last=p;}line([x-.3,.42,bz],[x+.3,.42,bz],'#a1b0a0',.4);}
for(const [a,b]of [[[2.1,.42,bz],[2.52,.98,bz]],[[2.52,.98,bz],[2.73,.42,bz]],[[2.73,.42,bz],[2.1,.42,bz]],[[2.73,.42,bz],[2.95,1.05,bz]],[[2.95,1.05,bz],[2.52,.98,bz]],[[2.95,1.05,bz],[3.18,.42,bz]]])line(a,b,'#b58a60',.7);
line([2.38,1.01,bz],[2.69,1.01,bz],'#435751',.8);line([2.95,1.05,bz],[2.93,1.25,bz],'#5d756b',.65);
// One pedestrian supplies a familiar scale reference.
box(1.4,.45,1.3,.29,.58,.25,'#d5aa76');sphere(1.55,1.26,1.43,.16,'#d9b493');box(1.4,.02,1.32,.10,.43,.11,'#4e6465');box(1.6,.02,1.44,.10,.43,.11,'#4e6465');

  return raster.frame;
}
