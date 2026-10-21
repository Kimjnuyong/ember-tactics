// Extract the connected figure, excluding neighboring swords inside its rectangle.
function isolateSprite(rgba,width,height,seedX,seedY){
 const out=new Uint8ClampedArray(rgba.length),seen=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=0;
 const seed=seedY*width+seedX;if(seed<0||seed>=seen.length||rgba[seed*4+3]<128)throw new Error('Sprite seed outside silhouette');
 queue[tail++]=seed;seen[seed]=1;
 while(head<tail){let p=queue[head++],offset=p*4;out[offset]=rgba[offset];out[offset+1]=rgba[offset+1];out[offset+2]=rgba[offset+2];out[offset+3]=rgba[offset+3];const x=p%width,y=Math.floor(p/width);
  for(const n of [x>0?p-1:-1,x+1<width?p+1:-1,y>0?p-width:-1,y+1<height?p+width:-1])if(n>=0&&!seen[n]&&rgba[n*4+3]>=128){seen[n]=1;queue[tail++]=n}
 }
 return out;
}
const $=id=>document.getElementById(id);let scene;
class Field extends Phaser.Scene{
 constructor(){super('field')}
 preload(){for(const [k,f]of [['forest','forest-map.png'],['battleground','battle-field-v6.png'],['north','hero-16-v7.png'],['south','foe-16-v7.png'],['evade','evade-perspective-v6.png'],['faces','faces-perspective-v6.png'],['walk','hero-walk-v10.png'],['ice','ice-storm-v3.png'],['cast','hero-cast-v1.png'],['idle','hero-idle-v1.png']])this.load.image(k,window.JRPG_ASSETS?.[k]||'assets/'+f);this.add.text(400,280,'성문의 숲을 불러오는 중…',{fontSize:18,color:'#d7b878'}).setOrigin(.5);}
 unit(x,y,key,height){const atlas=key==='hero'?'north':'south',p=this.battlePoseData[atlas][0];return this.add.image(x,y+27,this.spriteKeys[atlas],'pose0').setOrigin(p.ax,p.ay).setScale(46/p.bodyHeight);}

 create(){scene=this;this.turn=1;this.ultimateReady=true;this.movesLeft=3;this.walking=false;this.facing='north';this.nextKeyAt=0;this.attackKind='jump';this.menuOpen=false;this.commandPending=false;this.commandIndex=0;this.dodgeChance=.5;this.busy=false;this.selected=false;this.p={x:3,y:6,hp:48,mp:50};this.foes=[{x:6,y:5,hp:30},{x:8,y:3,hp:30},{x:5,y:2,hp:30}];this.target=null;this.moved=false;this.art();this.draw();this.bindCommandUI();$('previewUltimate').onclick=()=>this.fight('ultimate',true);$('previewIce').onclick=()=>this.fight('ice',true);$('end').onclick=()=>this.end();$('reset').onclick=()=>this.scene.restart();this.setupKeyboard();this.sync();}
 packSpriteAtlas(key,entries){
  const packed=key+'-packed',cellW=Math.max(...entries.map(e=>e.rect[2]))+4,cellH=Math.max(...entries.map(e=>e.rect[3]))+4;
  if(this.textures.exists(packed))return packed;
  const image=this.textures.get(key).getSourceImage(),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const source=canvas.getContext('2d',{willReadFrequently:true});source.drawImage(image,0,0);
  const texture=this.textures.createCanvas(packed,cellW*4,cellH*Math.ceil(entries.length/4)),ctx=texture.getContext();ctx.imageSmoothingEnabled=false;
  for(let i=0;i<entries.length;i++){
   const{name,rect}=entries[i],[x,y,w,h,pivotX,pivotY,bodyHeight,seedX,seedY]=rect;
   let rgba=source.getImageData(x,y,w,h),clean=ctx.createImageData(w,h);clean.data.set(isolateSprite(rgba.data,w,h,seedX-x,seedY-y));
   const px=i%4*cellW+2,py=Math.floor(i/4)*cellH+2;ctx.putImageData(clean,px,py);texture.add(name,0,px,py,w,h);
  }
  texture.refresh();texture.setFilter(Phaser.Textures.FilterMode.NEAREST);return packed;
 }
 prepareIdleAtlas(){
  const texture=this.textures.get('idle'),directions=['north','south','west','east'],anchors=[[390,598,474],[858,598,474],[380,1156,482],[870,1156,482]];
  this.idlePoseData={};for(let i=0;i<4;i++){const x=i%2*627,y=Math.floor(i/2)*627,[px,py,height]=anchors[i],name=directions[i];if(!texture.has(name))texture.add(name,0,x,y,627,627);this.idlePoseData[name]={ax:(px-x)/627,ay:(py-y)/627,bodyHeight:height}}
 }
 setIdlePose(){
  const p=this.idlePoseData[this.facing];if(!this.mapHero||!p)return;
  this.mapHero.setTexture('idle',this.facing).setOrigin(p.ax,p.ay).setScale(46/p.bodyHeight);this.mapHero.y=0;
  if(this.mapShadow){this.mapShadow.scaleX=1;this.mapShadow.scaleY=1}
 }
 prepareCastAtlas(){
  const texture=this.textures.get('cast'),anchors=[[275,481,397,354,220],[785,483,386,897,206],[1289,483,389,1415,134],[280,963,389,438,626],[793,965,392,940,628],[1289,963,391,1360,718]];
  this.castFrames=anchors.map(([px,py,height,hx,hy],i)=>{const x=i%3*512,y=Math.floor(i/3)*512,name='cast'+i;if(!texture.has(name))texture.add(name,0,x,y,512,512);return{name,ax:(px-x)/512,ay:(py-y)/512,scale:92/height,handX:(hx-px)*92/height,handY:(hy-py)*92/height}});
 }
 setCastPose(f,index){const p=this.castFrames[index];f.sprite.setTexture('cast',p.name).setOrigin(p.ax,p.ay).setScale(p.scale);f.castHand={x:p.handX,y:p.handY};}
 prepareIceAtlas(){
  // The approved sheet has uneven row gutters; preserve its ground anchors.
  const xs=[0,330,653,974,1295],rows=[[150,490,470],[490,878,861],[878,1180,1158]],centers=[175,500,813,1129],texture=this.textures.get('ice');
  this.iceFrames=[];
  for(let i=0;i<12;i++){const col=i%4,row=Math.floor(i/4),[y,end,ground]=rows[row],x=xs[col],w=xs[col+1]-x,h=end-y,name='ice'+i;
   if(!texture.has(name))texture.add(name,0,x,y,w,h);
   this.iceFrames.push({name,ax:(centers[col]-x)/w,ay:(ground-y)/h});
  }
 }
 art(){
  this.prepareIceAtlas();this.prepareCastAtlas();this.prepareIdleAtlas();
  const data=window.SPRITE_DATA;this.battlePoseData={};this.evasionPoseData={};this.spriteKeys={};
  const meta=([x,y,w,h,px,py,bodyHeight])=>({ax:(px-x)/w,ay:(py-y)/h,bodyHeight});
  for(const key of ['north','south']){
   this.spriteKeys[key]=this.packSpriteAtlas(key,data.battle[key].map((rect,i)=>({name:'pose'+i,rect})));
   this.battlePoseData[key]=data.battle[key].map(meta);this.evasionPoseData[key]=data.evade[key].map(meta);
  }
  this.spriteKeys.evade=this.packSpriteAtlas('evade',['north','south'].flatMap(key=>data.evade[key].map((rect,i)=>({name:key+i,rect}))));
  this.spriteKeys.walk=this.packSpriteAtlas('walk',Object.entries(data.walk).map(([name,rect])=>({name,rect})));this.walkPoseData=Object.fromEntries(Object.entries(data.walk).map(([name,rect])=>[name,meta(rect)]));
  const faces=this.textures.get('faces');for(const key of ['hero','foe']){const[x,y,w,h]=data.faces[key];if(faces.has(key))faces.remove(key);faces.add(key,0,x,y,w,h)}
 }

 cell(x,y){return{x:70+x*60,y:38+y*60}}
 blocked(x,y){return x<0||x>10||y<1||y>7||(y===1&&(x<2||x>8))||(y===7&&(x<1||x>9))}
 reach(){let q=[[this.p.x,this.p.y,0]],seen=new Map;while(q.length){let[x,y,d]=q.shift(),k=x+','+y;if(seen.has(k)||this.blocked(x,y)||this.foes.some(e=>e.hp>0&&e.x===x&&e.y===y))continue;seen.set(k,d);if(d<this.movesLeft)for(let[a,b]of [[1,0],[-1,0],[0,1],[0,-1]])q.push([x+a,y+b,d+1]);}return seen}
 draw(){this.tweens.killAll();this.children.removeAll(true);this.add.image(400,280,'forest').setDisplaySize(800,560);let g=this.add.graphics();
 for(let y=1;y<8;y++)for(let x=0;x<11;x++){if(this.blocked(x,y))continue;let p=this.cell(x,y);g.lineStyle(1,0xf0e4b6,.09).strokeRect(p.x,p.y,60,60)}
 if(!this.moved&&!this.busy){for(let k of this.reach().keys()){let[x,y]=k.split(',').map(Number),p=this.cell(x,y);g.fillStyle(0x4bd2dc,.18).fillRect(p.x+2,p.y+2,55,55);g.lineStyle(1,0xc3f3f4,.55).strokeRect(p.x+2,p.y+2,55,55)}}
 for(let e of this.foes.filter(e=>e.hp>0)){let p=this.cell(e.x,e.y);if(this.target===e){g.lineStyle(2,0xe4b776).strokeRect(p.x+2,p.y+2,55,55)}g.fillStyle(0x0b1820,.38).fillEllipse(p.x+30,p.y+47,38,12);this.unit(p.x+30,p.y+20,'enemy',57,true).setDepth(31).setInteractive({useHandCursor:true}).on('pointerdown',(pointer,localX,localY,event)=>{event?.stopPropagation();return this.click(e.x,e.y)});g.fillStyle(0x121f19).fillRect(p.x+10,p.y+51,40,4);g.fillStyle(0xcb7b72).fillRect(p.x+10,p.y+51,40*e.hp/30,4)}let p=this.cell(this.p.x,this.p.y);g.lineStyle(2,0xbfdac6).strokeRect(p.x+4,p.y+3,51,53);this.createMapHero(p.x+30,p.y+47);for(let y=0;y<8;y++)for(let x=0;x<11;x++){let p=this.cell(x,y);this.add.zone(p.x+30,p.y+30,60,60).setInteractive({useHandCursor:true}).on('pointerdown',()=>this.click(x,y))}
 this.add.text(24,525,'ASHEN GATE  /  NORTH WOODS',{fontSize:10,color:'#a4b393',letterSpacing:2});this.add.text(625,525,'✦  FOREST FRONTIER',{fontSize:10,color:'#a4b393'});}
 keyboardAllowed(){const el=document.activeElement;return !el||(!el.isContentEditable&&!['INPUT','TEXTAREA','SELECT'].includes(el.tagName));}
 setupKeyboard(){
  const keyboard=this.input?.keyboard;if(!keyboard)return;
  this.keys=keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT',false);
  const directionByCode={ArrowUp:'north',KeyW:'north',ArrowDown:'south',KeyS:'south',ArrowLeft:'west',KeyA:'west',ArrowRight:'east',KeyD:'east'};
  const handler=event=>{if(!this.keyboardAllowed()||this.busy)return;if(this.handleCommandKey(event))return;const dir=directionByCode[event.code];if(dir){event.preventDefault();this.keyIntent=dir;this.nextKeyAt=0}};
  // Prevent arrow-key scrolling synchronously; Phaser still tracks the held keys.
  window.addEventListener('keydown',handler,true);this.events?.once('shutdown',()=>window.removeEventListener('keydown',handler,true));
  if(this.game?.canvas){this.game.canvas.tabIndex=0;this.game.canvas.setAttribute('aria-label','방향키 또는 WASD로 캐릭터 이동');}
 }
 update(time){
  if(!this.keys||this.busy||this.walking||this.menuOpen||this.commandPending||this.p.hp<=0||this.movesLeft<=0||!this.keyboardAllowed()||time<this.nextKeyAt)return;
  const pressed={north:this.keys.UP.isDown||this.keys.W.isDown,south:this.keys.DOWN.isDown||this.keys.S.isDown,west:this.keys.LEFT.isDown||this.keys.A.isDown,east:this.keys.RIGHT.isDown||this.keys.D.isDown};
  const dir=pressed[this.keyIntent]?this.keyIntent:Object.keys(pressed).find(k=>pressed[k]);if(!dir)return;
  const[dx,dy]={north:[0,-1],south:[0,1],west:[-1,0],east:[1,0]}[dir];this.nextKeyAt=time+170;
  const foe=this.foes.find(e=>e.hp>0&&e.x===this.p.x+dx&&e.y===this.p.y+dy);if(foe){this.openCommands(foe);this.lastStepPromise=Promise.resolve(false)}else this.lastStepPromise=this.walkTo(this.p.x+dx,this.p.y+dy);
 }
 walkPathTo(tx,ty){
  const queue=[[this.p.x,this.p.y,[]]],seen=new Set;
  while(queue.length){const[x,y,path]=queue.shift(),key=x+','+y;if(seen.has(key))continue;seen.add(key);
   if(x===tx&&y===ty)return path;if(path.length>=this.movesLeft)continue;
   for(const[dx,dy]of [[0,-1],[1,0],[0,1],[-1,0]]){const nx=x+dx,ny=y+dy;if(this.blocked(nx,ny)||this.foes.some(e=>e.hp>0&&e.x===nx&&e.y===ny))continue;queue.push([nx,ny,[...path,[nx,ny]]])}
  }
  return null;
 }
 setWalkPose(direction,frame=1){
  const key=direction+frame,p=this.walkPoseData[key];if(!this.mapHero||!p)return;
  this.mapHero.setTexture(this.spriteKeys.walk,key).setOrigin(p.ax,p.ay).setScale(46/p.bodyHeight);
 }
 createMapHero(x,y){
  const shadow=this.groundShadow(0,2,34),p=this.idlePoseData[this.facing];
  this.mapHero=this.add.image(0,0,'idle',this.facing).setOrigin(p.ax,p.ay).setScale(46/p.bodyHeight);
  this.mapShadow=shadow;this.setIdlePose();const marker=this.add.text(-9,-61,'▼',{fontSize:14,color:'#e8d19c'});
  this.mapActor=this.add.container(x,y,[shadow,this.mapHero,marker]).setDepth(30);
 }
 async walkTo(tx,ty){
  if(this.busy||this.walking||this.menuOpen||this.p.hp<=0||this.movesLeft<=0)return false;
  const path=this.walkPathTo(tx,ty);if(!path||!path.length)return false;
  this.walking=true;this.target=null;this.sync();$('hint').textContent='이동 중…';
  for(const[x,y]of path){
   const dx=x-this.p.x,dy=y-this.p.y;this.facing=dx>0?'east':dx<0?'west':dy>0?'south':'north';this.setWalkPose(this.facing,0);
   const foot=this.cell(x,y);
   await new Promise(resolve=>this.tweens.add({targets:this.mapActor,x:foot.x+30,y:foot.y+47,duration:240,ease:'Linear',onUpdate:tween=>{
    const t=tween.progress;this.setWalkPose(this.facing,Math.min(3,Math.floor(t*4)));this.mapHero.y=-Math.abs(Math.sin(t*Math.PI*2))*1.5;this.mapShadow.scaleX=1-Math.abs(Math.sin(t*Math.PI*2))*.07;
   },onComplete:resolve}));
   this.p.x=x;this.p.y=y;this.movesLeft--;this.moved=this.movesLeft===0;this.mapHero.y=0;
  }
  this.walking=false;this.draw();this.sync();$('hint').textContent=this.movesLeft?'방향키·WASD 또는 칸 클릭 · 남은 이동 '+this.movesLeft+'칸':'이동력을 모두 사용했습니다. 공격하거나 턴을 종료하세요.';return true;
 }
 async click(x,y){
  if(this.busy||this.walking||this.commandPending||this.menuOpen||this.p.hp<=0)return false;
  const foe=this.foes.find(e=>e.hp>0&&e.x===x&&e.y===y);if(foe)return this.openCommands(foe);
  if(this.menuOpen)return false;
  this.hideCommands();this.target=null;this.draw();this.sync();return this.walkTo(x,y);
 }
 dist(e){return Math.abs(e.x-this.p.x)+Math.abs(e.y-this.p.y)}
 sync(){
  const alive=this.foes.filter(e=>e.hp>0),locked=this.busy||this.walking||this.commandPending;
  $('mp').textContent=this.p.mp+' / 50';$('mpbar').style.width=this.p.mp/50*100+'%';$('previewIce').disabled=locked;
  $('hp').textContent=this.p.hp+' / 48';$('hpbar').style.width=this.p.hp/48*100+'%';$('turn').textContent='TURN '+String(this.turn).padStart(2,'0');
  $('end').disabled=locked||!alive.length||this.p.hp<=0;$('reset').disabled=locked;$('previewUltimate').disabled=locked;$('movementLeft').textContent=this.movesLeft+' / 3';
  $('ultimateStatus').textContent=this.ultimateReady?'필살기 준비 완료 · 출격당 1회':'필살기 사용 완료 · 처음부터 시작하면 충전';
  $('phase').textContent=this.busy?'BATTLE · 전투':this.walking?'MOVING · 이동':!alive.length?'VICTORY · 승리':this.p.hp<=0?'DEFEAT · 패배':this.menuOpen?'COMMAND · 공격 선택':'EXPLORATION · 탐색';
  if(!alive.length)$('hint').textContent='성문을 되찾았습니다! 처음부터 버튼으로 다시 플레이할 수 있어요.';if(this.p.hp<=0)$('hint').textContent='검사가 쓰러졌습니다. 처음부터 다시 도전하세요.';
  this.refreshCommands();
 }
 canAttackTarget(foe=this.target){return !this.busy&&!this.walking&&this.p.hp>0&&!!foe&&foe.hp>0&&this.dist(foe)<=1;}
 attackPlan(foe=this.target){
  if(!foe||foe.hp<=0||this.p.hp<=0)return null;
  if(this.dist(foe)<=1)return{x:this.p.x,y:this.p.y,cost:0};
  let best=null;for(const[dx,dy]of [[-1,0],[0,1],[1,0],[0,-1]]){const x=foe.x+dx,y=foe.y+dy;if(this.blocked(x,y)||this.foes.some(e=>e.hp>0&&e.x===x&&e.y===y))continue;const path=this.walkPathTo(x,y);if(path&&(!best||path.length<best.cost))best={x,y,cost:path.length}}
  return best;
 }
 bindCommandUI(){
  const ids=['attack','thrust','ultimate','ice'];ids.forEach((id,i)=>{$(id).onclick=event=>{event?.preventDefault();event?.stopPropagation();if($(id).disabled)return Promise.resolve(false);return this.lastCommandPromise=this.issueAttack(['jump','thrust','ultimate','ice'][i])};$(id).onpointerenter=()=>this.selectCommand(i)});
  for(const id of ['commandMenu','commandBackdrop'])for(const type of ['pointerdown','pointerup','pointermove','click','dblclick','contextmenu'])$(id)['on'+type]=event=>event.stopPropagation();
  $('cancelCommand').onclick=()=>this.closeCommands();
  this.scale?.on('resize',this.positionCommands,this);this.events?.once('shutdown',()=>this.scale?.off('resize',this.positionCommands,this));
 }
 openCommands(foe=this.target){
  if(this.busy||this.walking||this.commandPending||!foe||foe.hp<=0||this.p.hp<=0)return false;
  this.target=foe;this.menuOpen=true;this.commandIndex=['jump','thrust','ultimate','ice'].indexOf(this.attackKind);if(this.commandIndex<0||(this.commandIndex===2&&!this.ultimateReady)||(this.commandIndex===3&&this.p.mp<50))this.commandIndex=0;
  this.keyIntent=null;this.draw();this.sync();$('hint').textContent='공격 카드를 클릭하세요 · 이동 잠금 · × 또는 Esc로 취소';
  $('commandMenu').focus?.({preventScroll:true});if(window.innerWidth<=650)$('commandMenu').scrollIntoView?.({block:'nearest',behavior:'smooth'});return true;
 }
 hideCommands(){this.menuOpen=false;$('commandMenu').hidden=true;$('commandBackdrop').hidden=true;$('battleArea').classList.toggle('command-active',false);if(this.input)this.input.enabled=true;}
 closeCommands(){this.hideCommands();this.target=null;this.nextKeyAt=(this.time.now||0)+180;this.draw();this.sync();$('hint').textContent='방향키·WASD로 이동 · 적 클릭 또는 Space로 공격 메뉴';this.game?.canvas?.focus?.({preventScroll:true});}
 positionCommands(){
  if(!this.menuOpen||!this.target)return;const area=$('battleArea'),menu=$('commandMenu'),w=area.clientWidth||800,h=$('game').clientHeight||560,mw=menu.offsetWidth||336,mh=menu.offsetHeight||315,p=this.cell(this.target.x,this.target.y),x=(p.x+30)/800*w,y=(p.y+30)/560*h;
  let left=x+35;if(left+mw>w-12)left=x-mw-35;menu.style.left=Math.max(12,Math.min(left,w-mw-12))+'px';menu.style.top=Math.max(10,Math.min(y-mh*.4,h-mh-10))+'px';
 }
 refreshCommands(){
  const plan=this.attackPlan(),locked=this.busy||this.walking||this.commandPending;
  const available=!locked&&!!plan;
  $('attack').disabled=!available;$('thrust').disabled=!available;$('ultimate').disabled=!available||!this.ultimateReady;$('ice').disabled=locked||this.p.mp<50||!this.target||this.target.hp<=0||this.p.hp<=0;
  $('menuIceState').textContent=this.p.mp>=50?'적 전체 · MP 50 · 명중 100%':'마나 부족 · MP 50 필요';
  const visible=this.menuOpen&&!locked&&!!this.target&&this.target.hp>0;
  $('commandMenu').hidden=!visible;$('commandBackdrop').hidden=!visible;$('battleArea').classList.toggle('command-active',visible);if(this.input)this.input.enabled=!visible;
  if(!this.menuOpen||!this.target)return;
  $('targetName').textContent='보라 망토 용병';$('targetHP').textContent='HP '+this.target.hp+' / 30';
  $('approachInfo').textContent=this.commandIndex===3?'전장 전체를 휩쓰는 광역 마법 · 이동 없이 시전':plan?(plan.cost?'이동 '+plan.cost+'칸 후 공격 · 한 번에 실행됩니다':'공격 사거리 안 · 바로 사용할 수 있습니다'):'이번 턴의 이동력으로 접근할 수 없습니다';
  $('approachInfo').classList.toggle('unavailable',!plan&&this.commandIndex!==3);$('menuUltimateState').textContent=this.ultimateReady?'9연격 · 명중 100% · 출격당 1회':'이번 출격에서 사용 완료';
  $('hitChance').textContent=[50,75,100,100][this.commandIndex]+'%';
  ['attack','thrust','ultimate','ice'].forEach((id,i)=>{$(id).classList.toggle('is-selected',this.commandIndex===i);$(id).setAttribute('aria-pressed',String(this.commandIndex===i))});this.positionCommands();
 }
 selectCommand(index){const id=['attack','thrust','ultimate','ice'][index];if(!this.menuOpen||!id||$(id).disabled)return false;if(this.commandIndex!==index)window.GameAudio?.sfx('select');this.commandIndex=index;this.refreshCommands();return true;}
 cycleCommand(delta){for(let step=1;step<=4;step++){const index=(this.commandIndex+delta*step+12)%4;if(this.selectCommand(index))return true}return false;}
 cycleTarget(delta=1){const foes=this.foes.filter(e=>e.hp>0);if(!foes.length)return false;let i=foes.indexOf(this.target);return this.openCommands(foes[(i+delta+foes.length)%foes.length]);}
 openNearestCommands(){const foes=this.foes.filter(e=>e.hp>0).sort((a,b)=>this.dist(a)-this.dist(b));return this.openCommands(this.target?.hp>0?this.target:foes[0]);}
 handleCommandKey(event){
  if(this.walking||this.commandPending)return false;const code=event.code;
  const consume=()=>{event.preventDefault();return true};
  if(this.menuOpen){
   if(code==='Escape'){this.closeCommands();return consume()}
   if(code==='Tab'){if(!event.repeat)this.cycleTarget(event.shiftKey?-1:1);return consume()}
   if(['ArrowUp','ArrowLeft','KeyW','KeyA','ArrowDown','ArrowRight','KeyS','KeyD'].includes(code)){if(!event.repeat||(this.time.now||0)>=(this.menuKeyAt||0)){this.cycleCommand(['ArrowUp','ArrowLeft','KeyW','KeyA'].includes(code)?-1:1);this.menuKeyAt=(this.time.now||0)+130}return consume()}
   if(['Enter','Space','Digit1','Digit2','Digit3','Digit4','Numpad1','Numpad2','Numpad3','Numpad4'].includes(code)){if(!event.repeat){const n=Number(code.slice(-1)),index=Number.isInteger(n)&&n>=1&&n<=4?n-1:this.commandIndex;this.lastCommandPromise=this.issueAttack(['jump','thrust','ultimate','ice'][index])}return consume()}
  }
  if(code==='KeyE'){if(!event.repeat)this.end();return consume()}
  if((code==='Enter'||code==='Space')&&document.activeElement?.tagName!=='BUTTON'){if(!event.repeat)this.openNearestCommands();return consume()}
  return false;
 }
 async issueAttack(kind){
  if(this.busy||this.walking||this.commandPending||(kind==='ultimate'&&!this.ultimateReady)||(kind==='ice'&&this.p.mp<50))return false;
  const foe=this.target,plan=kind==='ice'&&foe?.hp>0?{cost:0}:this.attackPlan(foe);if(!plan)return false;
  window.GameAudio?.sfx('confirm');this.commandPending=true;this.attackKind=kind;this.hideCommands();this.sync();
  try{
   if(plan.cost&&!(await this.walkTo(plan.x,plan.y)))return false;
   this.target=foe;if(kind!=='ice'&&!this.canAttackTarget(foe))return false;await this.fight(kind);return true;
  }finally{this.commandPending=false;this.sync();this.game?.canvas?.focus?.({preventScroll:true});}
 }
 setCombatPose(f,i){const p=this.battlePoseData[f.key][i];f.sprite.setTexture(this.spriteKeys[f.key],'pose'+i).setOrigin(p.ax,p.ay).setScale(92/p.bodyHeight);return f;}
 groundShadow(x,y,width=52){
  // Layered stepped silhouettes read as a grounded pixel shadow, not a UI oval.
  let g=this.add.graphics();
  g.fillStyle(0x15221a,.13).fillRect(-width*.48,-5,width*.96,10).fillRect(-width*.34,-8,width*.68,16);
  g.fillStyle(0x102019,.23).fillRect(-width*.39,-4,width*.78,8).fillRect(-width*.29,-6,width*.58,12);
  g.fillStyle(0x0d1a16,.28).fillRect(-width*.22,-3,width*.44,6);
  return this.add.container(x,y,[g]).setDepth(y-2);
 }
 combatFighter(key,y){
  let p=this.battlePoseData[key][0],shadow=this.groundShadow(400,y+3,52),sprite=this.add.image(0,0,this.spriteKeys[key],'pose0').setOrigin(p.ax,p.ay).setScale(92/p.bodyHeight);
  let root=this.add.container(400,y,[sprite]).setDepth(y);
  return{key,root,sprite,shadow,homeY:y,dir:key==='north'?-1:1};
 }
 combatCard(f,name,hp,max,x,y,portraitY){
  let g=this.add.graphics().setDepth(100);g.fillStyle(0x392b27,.98).fillRoundedRect(x,y,194,66,3);g.lineStyle(3,0x9f7954).strokeRoundedRect(x,y,194,66,3);g.lineStyle(1,0xe0c38d,.75).strokeRoundedRect(x+4,y+4,186,58,2);
  this.add.text(x+13,y+10,name,{fontSize:12,color:'#f3e6cb',fontFamily:'sans-serif'}).setDepth(101);let label=this.add.text(x+130,y+11,'HP '+hp,{fontSize:12,color:'#f7ead5'}).setDepth(101);
  this.add.rectangle(x+13,y+38,168,8,0x0d151e).setOrigin(0).setDepth(101);let bar=this.add.rectangle(x+13,y+38,168,8,f.key==='north'?0x9fc4e3:0xc28a8d).setScale(hp/max,1).setOrigin(0).setDepth(102);
  let px=f.key==='north'?x+108:x;g.fillStyle(0x233035,.97).fillRect(px,portraitY,86,88);g.lineStyle(3,0x9f7954).strokeRect(px,portraitY,86,88);
  this.add.image(px+43,portraitY+45,'faces',f.key==='north'?'hero':'foe').setDisplaySize(78,80).setDepth(101);
  return{set:(v)=>{label.setText('HP '+v);this.tweens.add({targets:bar,scaleX:v/max,duration:180,ease:'Sine.easeOut'})}};
 }
 rollEvasion(chance=this.dodgeChance){return chance>0&&Math.random()<chance;}
 async evade(f,speed){
  window.GameAudio?.sfx('evade');
  const wait=ms=>new Promise(r=>this.time.delayedCall(ms*speed,r)),move=(target,props,ms)=>new Promise(resolve=>this.tweens.add({targets:target,...props,duration:ms*speed,ease:'Cubic.easeOut',onComplete:resolve}));
  const side=f.key==='north'?-1:1,setPose=i=>{const p=this.evasionPoseData[f.key][i];f.sprite.setTexture(this.spriteKeys.evade,f.key+i).setOrigin(p.ax,p.ay).setScale(92/p.bodyHeight)};
  setPose(0);this.tweens.add({targets:f.shadow,x:400+side*64,y:f.homeY+8,duration:105*speed});
  await move(f.root,{x:400+side*64,y:f.homeY+8},105);await wait(280);
  setPose(1);this.tweens.add({targets:f.shadow,x:400,y:f.homeY+3,duration:160*speed});
  await move(f.root,{x:400,y:f.homeY},160);this.setCombatPose(f,0);
 }
 async videoAttack(a,b,kind,speed,onHit){
  const wait=ms=>new Promise(r=>this.time.delayedCall(ms*speed,r));
  const move=(target,props,ms,ease='Sine.easeInOut')=>new Promise(resolve=>this.tweens.add({targets:target,...props,duration:ms*speed,ease,onComplete:resolve}));
  const dir=a.dir,home=a.homeY,contact=home+dir*72,dodged=this.rollEvasion(a.key==='north'&&kind==='thrust'?.25:this.dodgeChance);let evasion=null;window.GameAudio?.sfx(kind);
  this.setCombatPose(a,kind==='jump'?0:8);await wait(45);
  if(kind==='jump'){
   this.setCombatPose(a,1);await move(a.root,{y:home-dir*2},70,'Sine.easeOut');
   this.setCombatPose(a,2);await move(a.root,{y:home-dir*5},75,'Sine.easeIn');
   if(dodged)evasion=this.evade(b,speed);
   this.setCombatPose(a,3);this.tweens.add({targets:a.shadow,y:contact+3,scaleX:.64,scaleY:.64,alpha:.56,duration:240*speed});
   await move(a.root,{y:contact-20},90,'Cubic.easeOut');
   this.setCombatPose(a,4);await move(a.root,{y:contact-46},90,'Sine.easeOut');
   this.setCombatPose(a,5);await move(a.root,{y:contact-15},65,'Sine.easeIn');
   this.setCombatPose(a,6);await move(a.root,{y:contact},55,'Cubic.easeIn');
  }else{
   this.setCombatPose(a,9);await move(a.root,{y:home-dir*2},70,'Sine.easeOut');
   this.setCombatPose(a,10);await move(a.root,{y:home-dir*5},90,'Sine.easeIn');
   if(dodged)evasion=this.evade(b,speed);
   this.setCombatPose(a,11);this.tweens.add({targets:a.shadow,y:contact+3,duration:180*speed});
   await move(a.root,{y:home+dir*20},70,'Cubic.easeIn');
   this.setCombatPose(a,12);await move(a.root,{y:home+dir*48},60,'Sine.easeIn');
   this.setCombatPose(a,13);await move(a.root,{y:contact},50,'Cubic.easeIn');
  }
  a.shadow.setScale(1);a.shadow.alpha=1;
  if(kind==='jump'){let dust=this.add.ellipse(400,contact+5,20,5,0xd4bb7f,.36).setDepth(contact-3);this.tweens.add({targets:dust,scaleX:2.7,scaleY:1.4,alpha:0,duration:220*speed,onComplete:()=>dust.destroy()})}
a.root.setDepth(a.homeY+dir*45);
  let fx=this.add.graphics().setDepth(90),cx=400,cy=b.homeY-43;
  if(kind==='jump'){fx.lineStyle(10,0xc8e6ff,.45).lineBetween(cx-24,cy-32,cx+24,cy+26);fx.lineStyle(3,0xffffdf).lineBetween(cx-27,cy-35,cx+27,cy+29)}
  else{fx.lineStyle(9,0xd5f2ff,.4).lineBetween(cx,cy-dir*38,cx,cy+dir*22);fx.lineStyle(2,0xffffef).lineBetween(cx,cy-dir*41,cx,cy+dir*26)}
  this.tweens.add({targets:fx,alpha:0,duration:160*speed,onComplete:()=>fx.destroy()});
  for(let i=0;i<7;i++){let angle=i*Math.PI*2/7,s=this.add.rectangle(cx,cy,2,5,0xffe2a6).setDepth(91).setRotation(angle);this.tweens.add({targets:s,x:cx+Math.cos(angle)*24,y:cy+Math.sin(angle)*22,alpha:0,duration:190*speed,onComplete:()=>s.destroy()})}
  if(!dodged)window.GameAudio?.sfx('hit');
  onHit(dodged);
  if(dodged){let miss=this.add.text(b.root.x,b.homeY-85,'회피',{fontSize:17,color:'#d9f4ed',stroke:'#294238',strokeThickness:3}).setOrigin(.5).setDepth(111);this.tweens.add({targets:miss,y:miss.y-16,alpha:0,duration:650*speed,onComplete:()=>miss.destroy()});await wait(65)}
  else{this.cameras.main.shake(70*speed,.003);b.sprite.setTintFill(0xe8e5cd);await wait(65);b.sprite.clearTint();this.tweens.add({targets:b.root,y:b.homeY+dir*9,duration:80*speed,yoyo:true})}
  await wait(100);this.setCombatPose(a,kind==='jump'?7:14);await move(a.root,{y:contact-dir*12},90);
  this.setCombatPose(a,kind==='jump'?0:15);this.tweens.add({targets:a.shadow,y:home+3,duration:190*speed});await move(a.root,{y:home},190,'Cubic.easeOut');a.root.setDepth(home);this.setCombatPose(a,0);if(evasion)await evasion;await wait(90);
 }
 async ultimateAttack(a,b,speed,onHit,forceHit=false){
  const wait=ms=>new Promise(r=>this.time.delayedCall(ms*speed,r));
  const move=(target,props,ms,ease='Sine.easeInOut')=>new Promise(resolve=>this.tweens.add({targets:target,...props,duration:ms*speed,ease,onComplete:resolve}));
  const dodged=false,cx=400,cy=b.homeY-42;window.GameAudio?.sfx('charge');
  let dark=this.add.rectangle(400,280,800,560,0x06132b,0).setDepth(80);await move(dark,{fillAlpha:.74},200);
  let banner=this.add.rectangle(400,140,800,132,0x142b48,.96).setDepth(700),edge=this.add.rectangle(400,205,800,2,0x9edfff,.8).setDepth(701);
  let portrait=this.add.image(-100,135,'faces','hero').setDisplaySize(148,150).setDepth(702),name=this.add.text(280,109,'奥義  ·  월광난무',{fontSize:32,color:'#e6f6ff',stroke:'#162641',strokeThickness:3}).setDepth(702),sub=this.add.text(283,158,'MOONLIT MIRAGE  /  NINEFOLD BLADE',{fontSize:10,color:'#a4cbef',letterSpacing:2}).setDepth(702);
  await move(portrait,{x:146},220,'Cubic.easeOut');await wait(260);
  await Promise.all([move(portrait,{x:950,alpha:0},190,'Cubic.easeIn'),move(banner,{alpha:0},190),move(edge,{alpha:0},190),move(name,{alpha:0},190),move(sub,{alpha:0},190)]);portrait.destroy();banner.destroy();edge.destroy();name.destroy();sub.destroy();
  let combo=this.add.text(570,240,'',{fontSize:28,color:'#d9f4ff',stroke:'#152945',strokeThickness:4}).setDepth(600),comboSub=this.add.text(573,275,'',{fontSize:11,color:'#b2d2ec'}).setDepth(600);
  const ghost=(pose)=>{const p=this.battlePoseData[a.key][pose];let g=this.add.image(a.root.x,a.root.y,this.spriteKeys[a.key],'pose'+pose).setOrigin(p.ax,p.ay).setScale(92/p.bodyHeight).setTint(0x82cfff).setAlpha(.28).setDepth(340);this.tweens.add({targets:g,alpha:0,duration:160*speed,onComplete:()=>g.destroy()})};
  const quickCut=(i)=>{
   const angle=[-.62,.68,-.12,1.1,-.96,.3,-.4,.95][i],g=this.add.graphics().setPosition(cx,cy).setRotation(angle).setDepth(520);
   g.fillStyle(0x589fff,.16).fillPoints([{x:-84,y:0},{x:-10,y:-12},{x:83,y:0},{x:6,y:10}],true);
   g.fillStyle(0xc2edff,.7).fillPoints([{x:-78,y:0},{x:-6,y:-4},{x:78,y:0},{x:6,y:3}],true);
   g.lineStyle(1.5,0xf8fdff,.95).lineBetween(-65,0,70,0);
   this.tweens.add({targets:g,alpha:0,scaleX:1.17,duration:120*speed,onComplete:()=>g.destroy()});
   for(let j=0;j<3;j++){let spark=this.add.rectangle(cx+(j-1)*8,cy,2,4,0xd9f4ff).setDepth(525);this.tweens.add({targets:spark,x:cx+Math.cos(angle+j)*29,y:cy+Math.sin(angle+j)*23,alpha:0,duration:150*speed,onComplete:()=>spark.destroy()})}
  };
  // A translucent circular afterglow becomes two halves only when the blade lands.
  // No lunar surface or literal moon illustration: the split light carries the image.
  const makeFullLight=()=>{
   const axis=Math.PI*.335,radius=80;
   return [0,1].map(side=>{let g=this.add.graphics().setPosition(cx,cy).setDepth(530),start=axis+side*Math.PI;
    g.fillStyle(0xc9e4ff,.085).beginPath().moveTo(0,0).arc(0,0,radius,start,start+Math.PI,false).closePath().fillPath();
    g.lineStyle(9,0x75baff,.09).beginPath().arc(0,0,radius,start,start+Math.PI,false).strokePath();
    g.lineStyle(2,0xd5f0ff,.55).beginPath().arc(0,0,radius,start,start+Math.PI,false).strokePath();
    g.lineStyle(1,0xffffff,.25).beginPath().arc(0,0,radius-4,start+.12,start+Math.PI-.12,false).strokePath();
    g.setScale(.55);this.tweens.add({targets:g,scaleX:1,scaleY:1,duration:120*speed,ease:'Sine.easeOut'});return g;
   });
  };
  if(dodged){const p=this.evasionPoseData[b.key][0];b.sprite.setTexture(this.spriteKeys.evade,b.key+'0').setOrigin(p.ax,p.ay).setScale(92/p.bodyHeight);this.tweens.add({targets:b.shadow,x:475,duration:100*speed});await move(b.root,{x:475},100,'Cubic.easeOut');combo.setText('MISS');comboSub.setText('적이 검로를 벗어났다')}
  // Approach once; every rapid cut shares this same ground position.
  a.root.setDepth(350);this.setCombatPose(a,11);await move(a.root,{x:400,y:302},160,'Cubic.easeOut');a.shadow.x=400;a.shadow.y=305;
  const prep=[2,10,5,12,2,10,5,12],strike=[5,12,6,13,5,12,6,13];
  for(let i=0;i<8;i++){
   this.setCombatPose(a,prep[i]);await wait(22);ghost(prep[i]);this.setCombatPose(a,strike[i]);quickCut(i);window.GameAudio?.sfx('cut');
   if(!dodged){b.sprite.setTintFill(0xe3f3ff);onHit(false,3,i);combo.setText((i+1)+' HIT');comboSub.setText('찰나의 연참');this.cameras.main.shake(32*speed,.0018)}
   await wait(25);b.sprite.clearTint();await wait(18);
  }
  this.setCombatPose(a,2);await wait(100);
  let charge=this.add.ellipse(400,306,88,20,0x8edbff,.17).setDepth(79);this.tweens.add({targets:charge,scaleX:.3,scaleY:.3,alpha:0,duration:200*speed,onComplete:()=>charge.destroy()});
  this.setCombatPose(a,3);this.tweens.add({targets:a.shadow,x:400,y:305,scaleX:.55,scaleY:.55,alpha:.45,duration:170*speed});ghost(3);await move(a.root,{x:400,y:180},170,'Cubic.easeOut');
  this.setCombatPose(a,4);const halves=makeFullLight();await wait(135);
  this.setCombatPose(a,5);ghost(4);await move(a.root,{y:238},70,'Sine.easeIn');this.setCombatPose(a,6);await move(a.root,{y:302},65,'Cubic.easeIn');a.shadow.setScale(1);a.shadow.alpha=1;
  window.GameAudio?.sfx('finish');
  // The descending sword opens a clean diagonal seam through the circular glow.
  let seam=this.add.graphics().setPosition(cx,cy).setDepth(540);seam.lineStyle(18,0x88c9ff,.17).lineBetween(-53,-94,53,94);seam.lineStyle(5,0xe7f8ff,.9).lineBetween(-53,-94,53,94);seam.lineStyle(1.5,0xffffff).lineBetween(-57,-101,57,101);
  this.tweens.add({targets:seam,alpha:0,duration:340*speed,onComplete:()=>seam.destroy()});
  for(let side=0;side<2;side++){const direction=side===0?-1:1;this.tweens.add({targets:halves[side],x:cx+direction*25,y:cy-direction*15,alpha:0,angle:direction*5,duration:450*speed,ease:'Cubic.easeOut',onComplete:()=>halves[side].destroy()})}
  let shock=this.add.ellipse(400,306,28,7,0xc7e5ff,.32).setDepth(79);this.tweens.add({targets:shock,scaleX:5,scaleY:2.1,alpha:0,duration:300*speed,onComplete:()=>shock.destroy()});
  for(let i=0;i<14;i++){const t=i/13,sign=i%2?1:-1;let shard=this.add.rectangle(cx-42+t*84,cy-75+t*150,2,5,0xe1f5ff).setRotation(-.5).setDepth(545);this.tweens.add({targets:shard,x:cx-42+t*84+sign*(20+i%3*10),y:cy-75+t*150-12,alpha:0,duration:(260+i%4*55)*speed,onComplete:()=>shard.destroy()})}
  if(!dodged){onHit(false,14,8);b.sprite.setTintFill(0xf4fbff);combo.setText('9 HIT');combo.setColor('#ffe2a4');comboSub.setText('FINISH · 만월단');this.cameras.main.shake(140*speed,.008);this.cameras.main.flash(75*speed,155,190,225);await wait(90);b.sprite.clearTint()}else{onHit(true,0,8);combo.setText('회피');comboSub.setText('피해 0');await wait(90)}
  await wait(300);this.setCombatPose(a,7);await move(a.root,{y:316},100);this.setCombatPose(a,0);this.tweens.add({targets:a.shadow,x:400,y:a.homeY+3,duration:240*speed});await move(a.root,{x:400,y:a.homeY},240,'Cubic.easeOut');a.root.setDepth(a.homeY);
  if(dodged){this.setCombatPose(b,0);this.tweens.add({targets:b.shadow,x:400,duration:180*speed});await move(b.root,{x:400,y:b.homeY},180)}
  await wait(180);await move(dark,{fillAlpha:0},230);dark.destroy();combo.destroy();comboSub.destroy();
 }
 async iceStorm(caster,defenders,speed,onHit){
  const wait=ms=>new Promise(r=>this.time.delayedCall(ms*speed,r));
  const move=(target,props,ms,ease='Sine.easeInOut')=>new Promise(resolve=>this.tweens.add({targets:target,...props,duration:ms*speed,ease,onComplete:resolve}));
  const owned=[],keep=o=>(owned.push(o),o),tau=Math.PI*2;
  const dark=keep(this.add.rectangle(400,280,800,560,0x04152e,0).setDepth(75));
  await move(dark,{fillAlpha:.8},300);window.GameAudio?.sfx('iceCharge');
  const title=keep(this.add.text(400,93,'絶氷  ·  빙결폭풍',{fontSize:32,color:'#e4fcff',stroke:'#17436c',strokeThickness:5}).setOrigin(.5).setDepth(710));
  const sub=keep(this.add.text(400,132,'GLACIAL TEMPEST  /  MANA RELEASE',{fontSize:10,color:'#83d9ef',letterSpacing:3}).setOrigin(.5).setDepth(710));
  const ring=keep(this.add.graphics().setPosition(400,385).setDepth(78));
  ring.lineStyle(2,0x8ae7ff,.85).strokeEllipse(0,0,150,48);ring.lineStyle(1,0xc4ffff,.4).strokeEllipse(0,0,182,60);
  for(let i=0;i<12;i++){const a=i*tau/12;ring.lineStyle(2,0xc2f8ff,.8).lineBetween(Math.cos(a)*65,Math.sin(a)*21,Math.cos(a)*86,Math.sin(a)*28)}
  const handSigil=keep(this.add.graphics().setDepth(610).setAlpha(0).setScale(.4));
  handSigil.lineStyle(1,0xc3f8ff,.95).strokeCircle(0,0,18);handSigil.lineStyle(1,0x7ccbe8,.65).strokeCircle(0,0,23);
  for(let i=0;i<6;i++){const a=i*tau/6,b=(i+2)*tau/6;handSigil.lineStyle(1,0xdefcff,.85).lineBetween(Math.cos(a)*15,Math.sin(a)*15,Math.cos(b)*15,Math.sin(b)*15);handSigil.fillStyle(0xdcffff,.9).fillRect(Math.round(Math.cos(a)*23)-1,Math.round(Math.sin(a)*23)-1,2,2)}
  const castPose=index=>{this.setCastPose(caster,index);handSigil.setPosition(caster.root.x+caster.castHand.x,caster.root.y+caster.castHand.y)};
  castPose(0);await wait(100);castPose(1);await wait(110);castPose(2);await wait(110);castPose(3);
  this.tweens.add({targets:handSigil,alpha:1,scaleX:1,scaleY:.68,duration:230*speed,ease:'Sine.easeOut'});
  this.tweens.add({targets:handSigil,angle:180,duration:3400*speed});
  for(let i=0;i<24;i++){const a=i*2.399,r=28+(i%5)*10,p=keep(this.add.rectangle(handSigil.x+Math.cos(a)*r,handSigil.y+Math.sin(a)*r*.6,2,2,0xd8ffff).setDepth(605));this.tweens.add({targets:p,x:handSigil.x,y:handSigil.y,alpha:0,duration:(350+i*12)*speed,delay:i*9*speed})}
  await wait(360);this.cameras.main.flash(90*speed,100,176,210);await Promise.all([move(title,{alpha:0,y:75},250),move(sub,{alpha:0},250)]);
  // Ground sigils establish each enemy's position before the storm envelops them.
  const seals=[];for(const f of defenders){const g=keep(this.add.graphics().setPosition(f.root.x,f.homeY+4).setDepth(79));g.lineStyle(2,0x9af2ff,.75).strokeEllipse(0,0,110,32);g.lineStyle(1,0x72bfff,.45).strokeEllipse(0,0,137,42);for(let j=0;j<6;j++){const a=j*tau/6;g.lineStyle(2,0x9af2ff,.75).lineBetween(Math.cos(a)*45,Math.sin(a)*13,0,0)}seals.push(g)}
  const vortex=keep(this.add.graphics().setDepth(490)),snow=keep(this.add.graphics().setDepth(540));
  this.tweens.add({targets:{phase:0},phase:1,duration:2400*speed,onUpdate:t=>{
   const p=t.progress;vortex.clear();snow.clear();
   for(let band=0;band<7;band++){const y=135+band*29,r=78+band*25;for(let j=0;j<15;j++){const a=j*tau/15+p*12+band*.48,x=400+Math.cos(a)*r,yy=y+Math.sin(a)*r*.21;vortex.lineStyle(j%3===0?3:1,band%2?0xc9f9ff:0x67baff,.15+(j%3)*.1).lineBetween(x,yy,x+Math.sin(a)*25,yy-Math.cos(a)*6)}}
   for(let i=0;i<95;i++){const x=((i*137+p*990)%950)-75,y=((i*73+p*610)%650)-60;snow.fillStyle(i%4?0xc4efff:0xffffff,.35+(i%4)*.14).fillRect(x,y,i%3===0?3:2,2);if(i%6===0)snow.lineStyle(1,0x96daff,.28).lineBetween(x,y,x+24,y-13)}
  }});
  window.GameAudio?.sfx('iceWind');
  // Animate the approved raster sprites at a fixed scale and ground anchor.
  const iceSprites=defenders.map((f,i)=>keep(this.add.image(f.root.x,f.homeY+12,'ice','ice0').setDepth(510+i).setScale(.64)));
  const showFrame=index=>{const frame=this.iceFrames[index];for(const sprite of iceSprites)sprite.setTexture('ice',frame.name).setOrigin(frame.ax,frame.ay)};
  showFrame(0);await wait(160);showFrame(1);await wait(180);
  for(let wave=0;wave<4;wave++){
   showFrame(2+wave);await wait(150);window.GameAudio?.sfx('iceHit');onHit(4);
   for(const f of defenders){f.sprite.setTintFill(0xbef4ff);this.tweens.add({targets:f.root,y:f.homeY-5,duration:70*speed,yoyo:true})}
   this.cameras.main.shake(80*speed,.003);await wait(100);for(const f of defenders)f.sprite.setTint(0x87d1f4);
  }
  window.GameAudio?.sfx('iceCharge');await wait(280);
  castPose(4);showFrame(6);window.GameAudio?.sfx('iceBreak');this.cameras.main.flash(110*speed,181,231,255);this.cameras.main.shake(220*speed,.008);onHit(12);
  for(let i=0;i<36;i++){const a=i*2.399,x=400+Math.cos(a)*105,y=240+Math.sin(a)*42,g=keep(this.add.rectangle(x,y,i%3===0?4:2,3,i%3?0xb7e6f7:0xf4ffff).setDepth(550));this.tweens.add({targets:g,x:x+Math.cos(a)*95,y:y+Math.sin(a)*65+45,alpha:0,duration:(380+i%5*65)*speed,ease:'Cubic.easeOut'})}
  const finish=keep(this.add.text(400,137,'WHITEOUT',{fontSize:28,color:'#e8fcff',stroke:'#20567b',strokeThickness:4,letterSpacing:6}).setOrigin(.5).setDepth(710));
  const result=keep(this.add.text(400,174,'빙결 파쇄 · 적 전체 28 피해',{fontSize:12,color:'#a9eaff'}).setOrigin(.5).setDepth(710));
  for(let frame=7;frame<12;frame++){await wait(125);showFrame(frame)}
  await Promise.all(iceSprites.map(sprite=>move(sprite,{alpha:0},230)));for(const f of defenders)f.sprite.clearTint();await move(handSigil,{alpha:0,scaleX:.25,scaleY:.18},150);castPose(5);await wait(160);caster.sprite.clearTint();this.setCombatPose(caster,0);
  await Promise.all([move(dark,{fillAlpha:0},380),move(vortex,{alpha:0},260),move(snow,{alpha:0},330),move(finish,{alpha:0},300),move(result,{alpha:0},300),move(ring,{alpha:0},300),...seals.map(g=>move(g,{alpha:0},300))]);
  for(const o of owned)o.destroy();
 }

 async fight(overrideKind=null,preview=false){
  if(this.busy||this.walking||(!preview&&((overrideKind||this.attackKind)==='ice'?(!this.target||this.target.hp<=0||this.p.hp<=0||this.p.mp<50):!this.canAttackTarget()))||(!preview&&(overrideKind||this.attackKind)==='ultimate'&&!this.ultimateReady))return;let foe=preview?{hp:overrideKind==='ice'?30:38,maxHP:overrideKind==='ice'?30:38}:this.target,kind=overrideKind||this.attackKind||'jump',events=[];if(kind==='ultimate'&&!preview)this.ultimateReady=false;if(kind==='ice'&&!preview)this.p.mp-=50;this.hideCommands();this.busy=true;this.sync();
  const speed=$('fast').checked?.55:1,wait=ms=>new Promise(r=>this.time.delayedCall(ms*speed,r));
  const move=(target,props,ms)=>new Promise(resolve=>this.tweens.add({targets:target,...props,duration:ms*speed,ease:'Sine.easeInOut',onComplete:resolve}));
  let veil=this.add.rectangle(400,280,800,560,0x0d1811,0).setDepth(200);await move(veil,{fillAlpha:1},170);
  this.tweens.killAll();this.children.removeAll(true);
  this.add.image(400,280,'battleground').setDisplaySize(800,560);let shade=this.add.graphics();shade.fillStyle(0x182c21,.1).fillRect(0,0,800,560);
  // Match the reference: overhead combat on an enlarged field, units above/below.
  let enemy=this.combatFighter('south',222),hero=this.combatFighter('north',374);
  let enemyHP=this.combatCard(enemy,'보라 망토 용병',foe.hp,foe.maxHP||30,24,24,103),heroHP=this.combatCard(hero,'루나',preview?48:this.p.hp,48,580,463,365);
  let title=this.add.text(400,30,kind==='ice'?'마법 필살기 · 빙결폭풍':kind==='ultimate'?(preview?'연출 미리보기 · 월광난무':'필살기 · 월광난무'):kind==='jump'?'낙성참 · 내려찍기':'섬광돌 · 찌르기',{fontSize:13,color:'#fff2cd',stroke:'#243325',strokeThickness:4}).setOrigin(.5).setDepth(101);
  const damage=(defender,amount)=>{let n=this.add.text(defender.root.x+42,defender.root.y-62,String(amount),{fontSize:23,color:'#fff3c5',stroke:'#433127',strokeThickness:3}).setDepth(110);this.tweens.add({targets:n,y:n.y-22,alpha:0,duration:650*speed,onComplete:()=>n.destroy()})};
  await wait(240);
  if(kind==='ice'){
   const victims=preview?[{hp:30},{hp:30},{hp:30}]:this.foes.filter(e=>e.hp>0),fighters=[enemy];
   enemy.root.x=280;enemy.shadow.x=280;
   for(let i=1;i<victims.length;i++){const f=this.combatFighter('south',222+(i%2)*13);f.root.x=280+i*120;f.shadow.x=f.root.x;fighters.push(f)}
   this.add.text(596,449,'MP '+(preview?50:this.p.mp)+' / 50',{fontSize:11,color:'#90e4ff'}).setDepth(105);
   await this.iceStorm(hero,fighters,speed,amount=>{for(const v of victims)v.hp=Math.max(0,v.hp-amount);enemyHP.set(preview?victims[0].hp:foe.hp);for(const f of fighters)damage(f,amount)});
   events.push('적 전체에 빙결폭풍！ 각 28 피해.'+(preview?'':' MP 50 소모.'));
  }else if(kind==='ultimate')await this.ultimateAttack(hero,enemy,speed,(dodged,amount,index)=>{if(dodged){events.push('적이 필살기를 회피했다.')}else{foe.hp=Math.max(0,foe.hp-amount);enemyHP.set(foe.hp);if(index===8)damage(enemy,amount);if(index===8)events.push('9연격！ 총 38 피해.')}},preview);
  else await this.videoAttack(hero,enemy,kind,speed,dodged=>{if(dodged){events.push('적이 회피했다.')}else{foe.hp=Math.max(0,foe.hp-18);enemyHP.set(foe.hp);damage(enemy,18);events.push('적에게 18 피해.')}});
  if(foe.hp>0&&!preview&&kind!=='ice'){title.setText('반격');await wait(170);await this.videoAttack(enemy,hero,'thrust',speed,dodged=>{if(dodged){events.push('루나가 반격을 회피했다.')}else{this.p.hp=Math.max(0,this.p.hp-7);heroHP.set(this.p.hp);damage(hero,7);events.push('반격으로 7 피해.')}})}
  else if(foe.hp<=0){await move(enemy.root,{alpha:0},280);await move(enemy.shadow,{alpha:0},100)}
  $('log').textContent=(preview?'[미리보기] ':kind==='ice'?'빙결폭풍！ ':kind==='ultimate'?'월광난무！ ':kind==='jump'?'낙성참！ ':'섬광돌！ ')+events.join(' ')+(foe.hp<=0?' 적을 쓰러뜨렸다.':'');await wait(350);
  let fade=this.add.rectangle(400,280,800,560,0x0d1811,0).setDepth(200);await move(fade,{fillAlpha:1},170);
  this.busy=false;if(!preview){this.target=null;this.moved=false;this.movesLeft=3;this.turn++}this.draw();this.sync();$('hint').textContent=preview?'미리보기 완료. 이동과 체력, 필살기 사용 횟수는 그대로입니다.':this.foes.some(e=>e.hp>0)?'새로운 턴입니다. 이동하거나 공격하세요.':'성문을 되찾았습니다! 처음부터 다시 플레이할 수 있어요.';
 }

 end(){
  if(this.busy||$('end').disabled)return;window.GameAudio?.sfx('turn');this.hideCommands();this.turn++;this.moved=false;this.movesLeft=3;this.target=null;
  let logs=[],dodges=0,totalDamage=0;
  for(let e of this.foes.filter(e=>e.hp>0)){
   if(this.p.hp<=0)break;
   if(this.dist(e)<=1){if(this.rollEvasion()){dodges++;logs.push('루나가 적의 공격을 회피했다.')}else{this.p.hp=Math.max(0,this.p.hp-4);totalDamage+=4;logs.push('인접한 적의 공격으로 4 피해.')}continue}
   for(let[dx,dy]of [[Math.sign(this.p.x-e.x),0],[0,Math.sign(this.p.y-e.y)]]){let x=e.x+dx,y=e.y+dy;if((dx||dy)&&!this.blocked(x,y)&&!(x===this.p.x&&y===this.p.y)&&!this.foes.some(o=>o!==e&&o.hp>0&&o.x===x&&o.y===y)){e.x=x;e.y=y;break}}
  }
  $('log').textContent=logs.length?logs.join(' '):'적이 접근합니다. 찌르기 명중 75% · 월광난무 필중.';$('hint').textContent='새로운 턴입니다. 이동할 칸이나 인접한 적을 선택하세요.';this.draw();this.sync();
  let p=this.cell(this.p.x,this.p.y);
  if(dodges){this.tweens.add({targets:this.mapHero,x:this.mapHero.x-17,duration:100,yoyo:true,ease:'Sine.easeOut'});let t=this.add.text(p.x+30,p.y-18,'회피'+(dodges>1?' ×'+dodges:''),{fontSize:13,color:'#efffe4',stroke:'#294238',strokeThickness:3}).setOrigin(.5);this.tweens.add({targets:t,y:t.y-15,alpha:0,duration:850,onComplete:()=>t.destroy()})}
  if(totalDamage){let t=this.add.text(p.x+52,p.y+12,'−'+totalDamage,{fontSize:15,color:'#ffd3ba',stroke:'#342d28',strokeThickness:3});this.tweens.add({targets:t,y:t.y-16,alpha:0,duration:850,onComplete:()=>t.destroy()})}
 }

}
new Phaser.Game({type:Phaser.AUTO,parent:'game',width:800,height:560,backgroundColor:'#17261e',pixelArt:true,roundPixels:true,scene:Field,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},banner:false});

let portraitImage=new Image();portraitImage.onload=()=>{const c=document.getElementById('portrait');if(c){c.style.width='61px';c.style.height='69px';const ctx=c.getContext('2d'),r=window.SPRITE_DATA.faces.hero;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,150,170);ctx.drawImage(portraitImage,r[0],r[1],r[2],r[3],0,0,150,170)}};portraitImage.src=window.JRPG_ASSETS.faces;
