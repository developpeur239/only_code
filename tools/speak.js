// speak.js OUTDIR [singer] - short French words at speaking rate, for the intelligibility judge
global.POSTURES=require('../src/audio/postures.js');
const V=require('../src/audio/voice.js'),D=require('./dsp.js');
const S={
 nuit:'l a|n H i|d e|s a~',
 feu:'l @|f 2|s a~|d O R',
 blanc:'t u|t E|b l a~',
 coeur:'d O R|m o~|k 9 R',
 bonjour:'b o~|Z u R',
 merci:'m E R|s i',
 maman:'m a|m a~',
 papa:'p a|p a',
};
const out=process.argv[2], who=process.argv[3]||'grandpa', base={grandpa:50,grandma:60,child:64}[who];
for(const [k,s] of Object.entries(S)){
 const parts=s.split('|');let t=.5;const syl=parts.map((p,i)=>{const ph=p.split(' ');const d=.22;const o={ph,midi:base+(i===parts.length-1?-2:1),t0:t,t1:t+d,dyn:.7};t+=d;return o;});
 const r=V.sing(who,syl);const mix=new Float64Array(Math.ceil((t+1)*44100));const o=Math.round(r.t0*44100);for(let i=0;i<r.pcm.length;i++)if(o+i<mix.length)mix[o+i]+=r.pcm[i];
 D.writeWav(`${out}/${k}_${who}.wav`,[D.normalize(mix,-3)]);
}
