/* Original, locally synthesized JRPG score and sword sounds. No downloads required. */
(()=>{
 let ctx,bgm,sfxBus,timer,next=0,step=0,music=true,effects=true;
 const note=n=>440*2**((n-69)/12);
 function tone(bus,freq,time,len,volume=.12,type='triangle',end=freq){
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(Math.max(1,freq),time);o.frequency.exponentialRampToValueAtTime(Math.max(1,end),time+len);g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume,time+.008);g.gain.exponentialRampToValueAtTime(.0001,time+len);o.connect(g);g.connect(bus);o.start(time);o.stop(time+len+.02);
 }
 function noise(time,len,volume,cutoff){
  const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*len),ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();source.buffer=buffer;filter.type='highpass';filter.frequency.value=cutoff;g.gain.setValueAtTime(volume,time);g.gain.exponentialRampToValueAtTime(.0001,time+len);source.connect(filter);filter.connect(g);g.connect(sfxBus);source.start(time);source.stop(time+len);
 }
 // Eight bars in A minor: harp arpeggios, a soft lead and sustained bass.
 const chords=[[45,52,57,60],[41,48,53,57],[48,55,60,64],[43,50,55,59],[45,52,57,60],[41,48,53,57],[38,45,50,53],[40,47,56,59]];
 const melody=[76,0,79,76,74,72,71,0,72,0,76,79,77,76,74,0,76,0,79,83,81,79,76,0,74,0,77,76,74,71,69,0];
 function schedule(){if(!ctx||ctx.state!=='running'||document.hidden)return;if(next<ctx.currentTime)next=ctx.currentTime+.04;while(next<ctx.currentTime+.18){const chord=chords[Math.floor(step/8)%8],beat=step%8;if(music){tone(bgm,note(chord[[0,1,2,3,2,1,3,1][beat]]+12),next,.48,.1);if(beat===0)tone(bgm,note(chord[0]-12),next,1.7,.16,'sine');if(step%2===0){const n=melody[Math.floor(step/2)%32];if(n){tone(bgm,note(n),next,.55,.09,'triangle');tone(bgm,note(n+12),next+.015,.38,.018,'sine')}}}step=(step+1)%64;next+=.24}}
 function unlock(){try{if(!ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;ctx=new Audio();bgm=ctx.createGain();bgm.gain.value=.48;sfxBus=ctx.createGain();sfxBus.gain.value=.52;const compressor=ctx.createDynamicsCompressor();bgm.connect(compressor);sfxBus.connect(compressor);compressor.connect(ctx.destination);timer=window.setInterval(schedule,80)}if(ctx.state==='suspended')ctx.resume().then(schedule).catch(()=>{});else schedule()}catch{}}
 function sfx(kind){if(!effects)return;unlock();if(!ctx||ctx.state!=='running')return;const t=ctx.currentTime+.005;
  if(kind==='iceCharge'){[69,76,81,88,93].forEach((n,i)=>tone(sfxBus,note(n),t+i*.09,.65,.12,'sine'));noise(t,.55,.12,3600)}
  if(kind==='iceWind'){noise(t,1.8,.23,1400);tone(sfxBus,130,t,1.7,.11,'sine',400)}
  if(kind==='iceHit'){[92,99,104].forEach((n,i)=>tone(sfxBus,note(n),t+i*.022,.22,.13,'sine'));noise(t,.13,.15,2800)}
  if(kind==='iceBreak'){noise(t,.85,.45,1900);tone(sfxBus,150,t,.65,.4,'sine',30);[88,95,100,107].forEach((n,i)=>tone(sfxBus,note(n),t+i*.03,.8,.12,'sine'))}
  if(kind==='select'){tone(sfxBus,880,t,.055,.13,'sine');tone(sfxBus,1320,t+.035,.065,.09,'sine')}
  if(kind==='confirm'){[76,81,88].forEach((n,i)=>tone(sfxBus,note(n),t+i*.045,.15,.13,'triangle'))}
  if(kind==='turn'){[76,72,69,64].forEach((n,i)=>tone(sfxBus,note(n),t+i*.075,.24,.15,'triangle'));tone(sfxBus,110,t,.3,.15,'sine')}
  if(kind==='jump'){noise(t,.18,.24,700);tone(sfxBus,240,t,.2,.15,'sine',550)}
  if(kind==='victory'){[69,73,76,81,76,81,85,88].forEach((n,i)=>tone(sfxBus,note(n),t+i*.12,.4,.15,'triangle'));[45,52,57].forEach(n=>tone(sfxBus,note(n),t+.48,1.1,.12,'sine'))}
  if(kind==='bossCharge'){[40,47,52].forEach((n,i)=>tone(sfxBus,note(n),t+i*.09,.5,.15,'triangle'));noise(t,.3,.14,450)}
  if(kind==='bossSpinCharge'){tone(sfxBus,75,t,.55,.13,'triangle',230);tone(sfxBus,420,t+.2,.34,.06,'sine',1200);noise(t,.48,.09,350)}
  if(kind==='bossSlam'){noise(t,.65,.45,250);tone(sfxBus,105,t,.6,.45,'sine',25);for(let i=0;i<7;i++)noise(t+.07+i*.045,.09,.11,800+i*190)}
  if(kind==='bossSpin'){for(let i=0;i<4;i++)noise(t+i*.1,.14,.23,650+i*200);tone(sfxBus,200,t,.45,.1,'triangle',65)}
  if(kind==='thrustCharge'){tone(sfxBus,180,t,.43,.09,'triangle',660);tone(sfxBus,1100,t+.26,.18,.05,'sine',1700)}
  if(kind==='thrust'){noise(t,.12,.27,2100);tone(sfxBus,1100,t,.13,.13,'triangle',280)}
  if(kind==='hit'){noise(t,.1,.22,900);tone(sfxBus,150,t,.12,.3,'triangle',45)}
  if(kind==='evade'){noise(t,.2,.16,2600)}
  if(kind==='cut'){noise(t,.07,.23,1600);tone(sfxBus,1450,t,.08,.1,'triangle',450)}
  if(kind==='charge'){[69,76,81,84,88].forEach((n,i)=>tone(sfxBus,note(n),t+i*.075,.5,.16,'sine'));tone(sfxBus,100,t,.6,.16,'triangle',650)}
  if(kind==='finish'){noise(t,.5,.45,550);tone(sfxBus,180,t,.5,.4,'sine',32);[81,88,93].forEach((n,i)=>tone(sfxBus,note(n),t+i*.035,.85,.13,'triangle'))}
 }
 window.GameAudio={sfx};
 document.addEventListener('pointerdown',unlock,{capture:true});document.addEventListener('keydown',unlock,{capture:true});
 document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden)ctx.suspend().catch(()=>{});else unlock()});
 document.getElementById('musicToggle').onclick=()=>{music=!music;unlock();bgm?.gain.setTargetAtTime(music?.48:0,ctx.currentTime,.08);const b=document.getElementById('musicToggle');b.textContent=music?'♫ BGM 켜짐':'♫ BGM 꺼짐';b.setAttribute('aria-pressed',String(music))};
 document.getElementById('sfxToggle').onclick=()=>{effects=!effects;const b=document.getElementById('sfxToggle');b.textContent=effects?'♪ 효과음 켜짐':'♪ 효과음 꺼짐';b.setAttribute('aria-pressed',String(effects))};
})();
