import{readFileSync,writeFileSync}from'node:fs';
const plan=JSON.parse(readFileSync(new URL('../audio-plan.json',import.meta.url)));const rate=48000,n=Math.round(plan.duration*rate),L=new Float32Array(n),R=new Float32Array(n),bars=Math.round(plan.duration/2),bar=plan.duration/bars,beat=bar/4,bpm=60/beat;
const hz=m=>440*2**((m-69)/12);let seed=0x534f4c;const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
function add(at,duration,pan,fn){const first=Math.round(at*rate),count=Math.round(duration*rate),left=Math.sqrt((1-pan)/2),right=Math.sqrt((1+pan)/2);for(let i=0;i<count;i++){const k=((first+i)%n+n)%n;const sample=fn(i/rate,i);L[k]+=sample*left;R[k]+=sample*right;}}
function pluck(at,midi,duration,amp,pan=0){const f=hz(midi);add(at,duration,pan,t=>{const a=Math.min(1,t/.004)*Math.exp(-10*t);return amp*a*(Math.sin(2*Math.PI*f*t)+.24*Math.sin(2*Math.PI*f*3*t)*Math.exp(-9*t)+.12*Math.sin(2*Math.PI*f*5*t)*Math.exp(-18*t));});}
function kick(at,amp){add(at,.22,0,t=>amp*Math.min(1,t/.002)*Math.exp(-22*t)*Math.sin(2*Math.PI*(48*t+1.3*(1-Math.exp(-35*t)))));}
function snare(at,amp){add(at,.14,-.08,t=>amp*Math.min(1,t/.001)*Math.exp(-36*t)*(.65*noise()+.35*Math.sin(2*Math.PI*190*t)));}
function hat(at,amp,open=false){let previous=0;add(at,open?.14:.055,.33,t=>{const x=noise(),high=x-previous;previous=x;return amp*high*Math.min(1,t/.001)*Math.exp(-(open?25:75)*t);});}
function bass(at,midi,duration,amp){const f=hz(midi);add(at,duration,-.08,t=>{const edge=Math.min(1,t/.008)*Math.min(1,(duration-t)/.035);return amp*edge*Math.exp(-3*t)*(Math.sin(2*Math.PI*f*t)+.22*Math.sin(2*Math.PI*f*2*t));});}
function chord(at,notes,duration,amp){for(let j=0;j<notes.length;j++){const f=hz(notes[j]),pan=(j/(notes.length-1)-.5)*.7;add(at,duration,pan,t=>{const envelope=Math.min(1,t/.065)*Math.min(1,(duration-t)/.25)*Math.exp(-.6*t);return amp*envelope*(Math.sin(2*Math.PI*f*t)+.18*Math.sin(2*Math.PI*f*2.002*t));});}}
const pans=plan.cameras.filter(c=>c.mode==='pan'),returnStart=plan.duration;
const crossing=t=>pans.some(c=>t>=c.start&&t<c.start+c.duration);
const roots=[48,45,41,43],chords=[[60,64,67,74],[57,60,64,67],[53,57,60,67],[55,59,62,69]];
const motifs=[[72,76,79,76,74,76],[76,79,81,79,76,74],[77,81,79,77,76,72],[74,79,83,81,79,74]];
for(let b=0;b<bars;b++){const start=b*bar;const harmony=b===bars-2?2:b===bars-1?3:b%4,root=roots[harmony];
 chord(start,chords[harmony],Math.min(bar*.94,returnStart-start),.016);
 for(const q of[0,1.5,2,3.25]){const t=start+q*beat;if(t<returnStart)kick(t,crossing(t)?.065:.1);}
 for(const q of[1,3]){const t=start+q*beat;if(t<returnStart)snare(t,crossing(t)?.035:.065);}
 for(let i=0;i<8;i++){const t=start+i*beat/2;if(t<returnStart)hat(t,(i%2?.018:.012)*(crossing(t)?.7:1),i===7&&b%4===3);}
 for(const[q,interval]of[[0,0],[.75,12],[1.5,7],[2,0],[2.75,12],[3.5,7]]){const t=start+q*beat;if(t<returnStart)bass(t,root+interval,.27,.075);}
 const accents=[0,.75,1.5,2.5,3,3.5];for(let i=0;i<accents.length;i++){const t=start+accents[i]*beat;if(t<returnStart&&(!crossing(t)||i%3===0))pluck(t,motifs[harmony][(i+(b>=8?2:0))%6],.45,.04,i%2?.3:-.25);}
 if(b%4===3)for(const q of[3.5,3.75])if(start+q*beat<returnStart)snare(start+q*beat,.025);
}
// Construction and arrivals retain their local accents over the continuous groove.
for(const p of plan.phases){if(p.kind==='building')pluck(p.start+p.reveal,57+p.stage%5,.13,.03,-.1);if(p.kind==='foundation'){kick(p.start+p.reveal,.10);pluck(p.start+p.reveal,72,.24,.038,.12);}if(p.kind==='bridge'){pluck(p.start+.12,76,.38,.033,-.2);pluck(p.start+.28,79,.4,.03,.2);}}
for(const c of pans){pluck(c.start+c.duration-.16,79,.36,.035,.2);pluck(c.start+c.duration,84,.45,.045,-.2);}
// The last bar is a pickup into the first downbeat; tails wrap into the start.
pluck(plan.duration-.5,67,.6,.025,-.2);pluck(plan.duration-.25,71,.6,.025,.2);
let peak=0,energy=0;for(let i=0;i<n;i++){peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));energy+=L[i]*L[i]+R[i]*R[i];}
const gain=Math.min(.78/Math.max(.001,peak),.1/Math.max(.001,Math.sqrt(energy/(2*n)))),data=Buffer.alloc(n*4);for(let i=0;i<n;i++){for(const[ch,a]of[[0,L],[1,R]]){const v=a[i]*gain;if(!Number.isFinite(v)||Math.abs(v)>1)throw Error('Invalid or clipped audio');data.writeInt16LE(Math.round(v*32767),i*4+ch*2);}}
const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+data.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*4,28);h.writeUInt16LE(4,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(data.length,40);const output=new URL('../',import.meta.url);writeFileSync(new URL('soundtrack.wav',output),Buffer.concat([h,data]));const report={bpm,channels:2,sampleRate:rate,duration:n/rate,peak:peak*gain,rms:Math.sqrt(energy/(2*n))*gain,instruments:['kick','snare','hi-hat','bass','marimba','chords'],bars,loopSeconds:plan.duration,circularTails:true,boundaryDelta:[Math.abs((L[0]-L[n-1])*gain),Math.abs((R[0]-R[n-1])*gain)],arrangement:['continuous groove','lighter bridge crossings','last-bar pickup into first downbeat']};writeFileSync(new URL('audio-checks.json',output),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
