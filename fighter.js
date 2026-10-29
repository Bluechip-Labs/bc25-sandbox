/* fighter.js — "Defender's Duel": an 80s-style side-view fighter for the BC25 Arcade.
   Self-contained (does NOT use games.js). You always play the BC25 Defender bull;
   arcade ladder vs 5 crypto-themed CPU opponents across 5 stages.
   Canvas 2D, dt loop. Scores in localStorage key bc25_games.fight.
   Sim-only, for fun — nothing on-chain. */
(function(){
"use strict";
var cv=document.getElementById("fgCanvas");
if(!cv) return;                      // only runs on fighter.html
var ctx=cv.getContext("2d");
var W=cv.width, H=cv.height;         // internal 720x360
var GROUND=304, WALL=40;

// ---------- storage ----------
function load(){try{return JSON.parse(localStorage.getItem("bc25_games"))||{};}catch(e){return {};}}
function save(o){try{localStorage.setItem("bc25_games",JSON.stringify(o));}catch(e){}}
function getFight(){var o=load();return o.fight||{best:0,clears:0,fastestMs:null};}
function setFight(f){var o=load();o.fight=f;save(o);}

function toast(msg){var t=document.getElementById("toast");if(!t)return;t.textContent=msg;t.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove("show");},1600);}

// ---------- roster ----------
// pal: [primary, secondary(armor/accent), dark-shade, eye] ; build affects body proportions
var ROSTER={
  bull:{name:"BC25 Defender", pal:["#1f3a8a","#f0b429","#0f1f4d","#ffe08a"], build:"hero", hp:100, speed:150, power:1.0, reach:1.0,
        special:"Golden Gore", specType:"charge", blurb:"Balanced. Horns down, charge through."},
  bear:{name:"The Bear Market", pal:["#6b4a2b","#9aa0a6","#3a2817","#ff5a5a"], build:"brute", hp:120, speed:108, power:1.35, reach:1.05,
        special:"Capitulation Slam", specType:"slam", blurb:"Slow, brutal. Drags the market down."},
  rug:{name:"Rug Puller", pal:["#7a1020","#111318","#3a0710","#ff3b3b"], build:"lean", hp:84, speed:182, power:0.82, reach:0.95,
        special:"Exit Scam", specType:"teleport", blurb:"Fast, slippery. Blink behind you."},
  whale:{name:"The Whale", pal:["#0e6b7a","#8fe3f0","#063b44","#bfffff"], build:"titan", hp:140, speed:96, power:1.2, reach:1.15,
        special:"Market Maker", specType:"splash", blurb:"A wall of liquidity. Immense."},
  fud:{name:"FUD Specter", pal:["#4b1f7a","#8df0b0","#260f3d","#c9ff8d"], build:"wraith", hp:88, speed:150, power:0.9, reach:1.25,
       special:"Spread FUD", specType:"projectile", blurb:"Haunts from range. Throws fear."},
  gas:{name:"Gas Golem", pal:["#8a5a1f","#c9922e","#4a2f0e","#ffd34d"], build:"brute", hp:128, speed:102, power:1.3, reach:1.0,
       special:"Gas Spike", specType:"slam", blurb:"Rock-hard. Fees hurt."}
};
var LADDER=["rug","fud","whale","gas","bear"]; // increasing difficulty

// ---------- stages ----------
var STAGES=[
  {key:"floor", name:"The Exchange", sky:["#0a1230","#132a63"], make:drawFloor},
  {key:"mempool", name:"The Mempool", sky:["#05121a","#0a2a33"], make:drawMempool},
  {key:"vault", name:"Cold Storage", sky:["#12100a","#2a2410"], make:drawVault},
  {key:"cliffs", name:"Bear Market Cliffs", sky:["#0a0a14","#2a1430"], make:drawCliffs},
  {key:"moon", name:"To The Moon", sky:["#02040f","#0a1140"], make:drawMoon}
];

// ---------- input ----------
var keys={};
var MAP={ArrowLeft:"L",KeyA:"L",ArrowRight:"R",KeyD:"R",ArrowUp:"U",KeyW:"U",Space:"U",
         ArrowDown:"D",KeyS:"D",KeyJ:"P",KeyZ:"P",KeyK:"K",KeyX:"K",KeyL:"S",KeyC:"S"};
function onKey(e,down){
  var m=MAP[e.code];
  if(m){ keys[m]=down; if(down&&(m==="U"||e.code==="Space"))e.preventDefault(); }
  if(down){
    if(GAME.screen==="title"&&(e.code==="Enter"||e.code==="Space")) startLadder();
    else if(GAME.screen==="vs"&&(e.code==="Enter"||e.code==="Space")) beginFight();
    else if((GAME.screen==="win"||GAME.screen==="lose")&&(e.code==="Enter"||e.code==="Space")) toTitle();
    if(!running()) draw();
  }
}
document.addEventListener("keydown",function(e){onKey(e,true);});
document.addEventListener("keyup",function(e){onKey(e,false);});

// touch buttons (created in fighter.html); map via data-k
function bindTouch(){
  Array.prototype.forEach.call(document.querySelectorAll("[data-k]"),function(btn){
    var k=btn.getAttribute("data-k");
    var set=function(v){return function(ev){ev.preventDefault();keys[k]=v;
      if(v&&GAME.screen!=="fight"){ // menu taps
        if(GAME.screen==="title")startLadder();
        else if(GAME.screen==="vs")beginFight();
        else if(GAME.screen==="win"||GAME.screen==="lose")toTitle();
        if(!running())draw();
      }};};
    btn.addEventListener("touchstart",set(true),{passive:false});
    btn.addEventListener("touchend",set(false),{passive:false});
    btn.addEventListener("touchcancel",set(false),{passive:false});
    btn.addEventListener("mousedown",set(true));
    btn.addEventListener("mouseup",set(false));
    btn.addEventListener("mouseleave",function(){keys[k]=false;});
  });
}

// ---------- fighter ----------
function mkFighter(key,x,facing,isCPU,diff){
  var c=ROSTER[key];
  return {key:key,c:c,x:x,y:GROUND,vx:0,vy:0,facing:facing,onGround:true,
    hp:c.hp,maxHp:c.hp,meter:0,state:"idle",t:0,animT:0,
    atk:null,stun:0,blocking:false,comboHits:0,comboTimer:0,hitBy:null,
    isCPU:!!isCPU,diff:diff||0,ai:{t:0,act:"idle",react:0},flash:0,won:0};
}

// attack definitions: startup/active/recovery in seconds, reach px, dmg, height, kb, launches
function moveData(f,kind){
  var p=f.c.power, r=f.c.reach;
  if(kind==="punch") return {startup:.05,active:.07,recovery:.14,reach:46*r,dmg:7*p,height:"mid",kb:120,hit:false,name:"punch"};
  if(kind==="punch3")return {startup:.06,active:.08,recovery:.22,reach:52*r,dmg:11*p,height:"mid",kb:220,hit:false,name:"cross"};
  if(kind==="kick")  return {startup:.09,active:.09,recovery:.20,reach:60*r,dmg:10*p,height:"mid",kb:200,hit:false,name:"kick"};
  if(kind==="low")   return {startup:.08,active:.10,recovery:.26,reach:58*r,dmg:9*p,height:"low",kb:160,sweep:true,hit:false,name:"sweep"};
  if(kind==="air")   return {startup:.06,active:.18,recovery:.10,reach:50*r,dmg:11*p,height:"over",kb:180,hit:false,name:"jump kick"};
  if(kind==="special")return {startup:.12,active:.22,recovery:.30,reach:70*r,dmg:22*p,height:"mid",kb:360,special:true,hit:false,name:f.c.special};
  return null;
}

function canAct(f){return f.state==="idle"||f.state==="walk"||f.state==="crouch";}
function startAttack(f,kind){
  if(f.meter<50&&kind==="special")return;
  var m=moveData(f,kind); if(!m)return;
  if(kind==="special")f.meter-=50;
  f.atk=m; f.state=(kind==="special")?"special":(kind==="air"?"air":(kind==="low"?"low":(kind==="kick"?"kick":"punch")));
  f.t=0; f.animT=0;
}

function faceEachOther(a,b){ if(a.state!=="air"&&canAct(a)) a.facing=(b.x>=a.x)?1:-1; }

function update(dt){
  var p=GAME.p, o=GAME.o;
  if(GAME.freeze>0){GAME.freeze-=dt; dt=0;}
  if(GAME.hitstop>0){GAME.hitstop-=dt; return;}
  GAME.time-=dt; if(GAME.time<0)GAME.time=0;

  faceEachOther(p,o); faceEachOther(o,p);
  humanControl(p,dt);
  aiControl(o,dt);
  stepFighter(p,dt,o);
  stepFighter(o,dt,p);
  resolveHit(p,o);
  resolveHit(o,p);
  separate(p,o);

  // round end?
  if(GAME.roundOver){ GAME.roundOverT-=dt; if(GAME.roundOverT<=0) nextRoundOrEnd(); return; }
  if(p.hp<=0||o.hp<=0||GAME.time<=0){ endRound(); }
}

function humanControl(f,dt){
  if(f.state==="ko"||f.state==="hit"||f.state==="knockdown"){return;}
  var toFoe=(GAME.o.x>=f.x)?1:-1, back=-toFoe;
  f.blocking=false;
  if(canAct(f)){
    // block = holding away
    var holdBack=(back<0&&keys.L)||(back>0&&keys.R);
    if(holdBack){f.blocking=true;}
    // crouch
    if(keys.D){f.state="crouch"; f.vx=0;}
    else{
      var mv=0; if(keys.L)mv-=1; if(keys.R)mv+=1;
      f.vx=mv*f.c.speed; f.state=mv?"walk":"idle";
    }
    // jump
    if(keys.U&&f.onGround){f.vy=-430;f.onGround=false;f.state="jump";}
    // attacks
    if(keys.P&&!f._pLast){ if(!f.onGround)startAttack(f,"air"); else if(keys.D)startAttack(f,"low"); else{ // combo chain
        if(f.comboTimer>0&&f.comboHits>=2)startAttack(f,"punch3"); else startAttack(f,"punch"); } }
    if(keys.K&&!f._kLast){ if(!f.onGround)startAttack(f,"air"); else if(keys.D)startAttack(f,"low"); else startAttack(f,"kick"); }
    if(keys.S&&!f._sLast){ startAttack(f,"special"); }
  }
  f._pLast=keys.P; f._kLast=keys.K; f._sLast=keys.S;
}

function aiControl(f,dt){
  if(f.state==="ko"||f.state==="hit"||f.state==="knockdown")return;
  var foe=GAME.p, d=f.c, a=f.ai;
  var dist=Math.abs(foe.x-f.x), toFoe=(foe.x>=f.x)?1:-1;
  var lvl=f.diff; // 0..4
  a.t-=dt;
  f.blocking=false;
  // block when foe is attacking and close
  var foeAtk=(foe.state==="punch"||foe.state==="kick"||foe.state==="air"||foe.state==="special"||foe.state==="low");
  var blockChance=0.25+lvl*0.12;
  if(canAct(f)&&foeAtk&&dist<90&&Math.random()<blockChance*dt*12){a.act="block";a.t=0.3;}
  if(a.t<=0){
    var r=Math.random();
    if(dist>150) a.act="approach";
    else if(dist>80) a.act=(r<0.5+lvl*0.1)?"approach":(r<0.8?"jumpin":"idle");
    else a.act=(r<0.55+lvl*0.08)?"attack":(r<0.75?"block":(r<0.9?"retreat":"idle"));
    a.t=0.18+Math.random()*(0.5-lvl*0.07);
  }
  if(a.act==="block"){f.blocking=true; f.vx=0; f.state="crouch"; return;}
  if(canAct(f)){
    if(a.act==="approach"){f.vx=toFoe*d.speed; f.facing=toFoe; f.state="walk";}
    else if(a.act==="retreat"){f.vx=-toFoe*d.speed*0.8; f.state="walk";}
    else if(a.act==="idle"){f.vx=0; f.state="idle";}
    else if(a.act==="jumpin"&&f.onGround){f.vy=-430;f.vx=toFoe*d.speed;f.onGround=false;f.state="jump";a.act="attack";}
    else if(a.act==="attack"){
      f.vx=0;
      if(f.meter>=50&&dist<moveData(f,"special").reach&&Math.random()<0.6){startAttack(f,"special");}
      else { var pick=Math.random(); if(pick<0.4)startAttack(f,"kick"); else if(pick<0.7)startAttack(f,"punch"); else startAttack(f,"low"); }
      a.act="idle"; a.t=0.25+Math.random()*0.3;
    }
  }
}

function stepFighter(f,dt,foe){
  f.t+=dt; f.animT+=dt; if(f.flash>0)f.flash-=dt;
  if(f.comboTimer>0){f.comboTimer-=dt; if(f.comboTimer<=0)f.comboHits=0;}
  // gravity
  if(!f.onGround){ f.vy+=1500*dt; f.y+=f.vy*dt; if(f.y>=GROUND){f.y=GROUND;f.onGround=true;f.vy=0; if(f.state==="jump")f.state="idle"; if(f.state==="knockdown")f.getup=0.4;} }
  // horizontal
  f.x+=f.vx*dt;
  if(f.x<WALL)f.x=WALL; if(f.x>W-WALL)f.x=W-WALL;
  // state timers
  var s=f.state;
  if(s==="punch"||s==="kick"||s==="low"||s==="special"||s==="air"){
    var m=f.atk, total=m.startup+m.active+m.recovery;
    // special movement
    if(s==="special"&&f.c.specType==="charge"&&f.t>m.startup&&f.t<m.startup+m.active){f.x+=f.facing*520*dt;}
    if(s==="special"&&f.c.specType==="teleport"&&f.t>m.startup&&!m._tp){m._tp=true; f.x=foe.x-f.facing*40; }
    if(s!=="air"&&f.t>=total){f.state=f.onGround?"idle":"jump"; f.atk=null;}
    if(s==="air"&&f.onGround){f.state="idle"; f.atk=null;}
  }else if(s==="hit"){ f.stun-=dt; if(f.stun<=0)f.state=f.onGround?"idle":"jump"; }
  else if(s==="knockdown"){ if(f.onGround){f.getup=(f.getup||0.6)-dt; if(f.getup<=0)f.state="idle";} }
  else if(s==="ko"){ /* stays */ }
  if(f.vx!==0&&f.onGround&&(s==="walk"))f.vx=f.vx; // noop keep
}

function hitboxOf(f){
  if(!f.atk)return null; var m=f.atk;
  if(f.state==="special"&&f.c.specType==="projectile"){ return null; } // handled as projectile
  if(f.t<m.startup||f.t>m.startup+m.active)return null;
  var w=m.reach, h=28;
  var y=f.y-70; if(m.height==="low")y=f.y-22; if(m.height==="over")y=f.y-96;
  var x=f.facing>0?f.x+18:f.x-18-w;
  return {x:x,y:y,w:w,h:h,m:m};
}
function hurtboxOf(f){
  var top=f.state==="crouch"?f.y-56:f.y-104;
  return {x:f.x-24,y:top,w:48,h:f.y-top};
}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}

function resolveHit(att,def){
  // projectile specials
  if(att.state==="special"&&att.c.specType==="projectile"&&att.t>att.atk.startup&&!att._shot){att._shot=true;
    GAME.projs.push({x:att.x+att.facing*30,y:att.y-64,vx:att.facing*340,dmg:att.atk.dmg,owner:att,life:2.2});}
  var hb=hitboxOf(att); if(!hb)return;
  if(hb.m.hit)return;
  var du=hurtboxOf(def);
  if(!overlap(hb,du))return;
  hb.m.hit=true; att.atk.hit=true;
  applyHit(att,def,hb.m);
}
function applyHit(att,def,m){
  var toDef=(def.x>=att.x)?1:-1;
  // block check
  var blocked=def.blocking&&canActOrBlock(def)&&!m.special; // specials unblockable-ish? keep blockable but chip more
  blocked=def.blocking&&(def.state==="idle"||def.state==="walk"||def.state==="crouch");
  // low must be blocked crouching; overhead must be blocked standing
  if(blocked){
    if(m.height==="low"&&def.state!=="crouch")blocked=false;
    if(m.height==="over"&&def.state==="crouch")blocked=false;
  }
  var dmg=m.dmg;
  if(blocked){ dmg=Math.max(1,dmg*0.18); def.state="crouch"; def.flash=0.05; def.vx=toDef*40;
    att.meter=Math.min(100,att.meter+3); def.meter=Math.min(100,def.meter+5);
    GAME.hitstop=0.03; spark(att.x+att.facing*40,def.y-60,"#9ad0ff"); }
  else{
    def.hp-=dmg; if(def.hp<0)def.hp=0;
    def.flash=0.12; GAME.hitstop=0.055;
    att.meter=Math.min(100,att.meter+8); def.meter=Math.min(100,def.meter+6);
    // combo tracking for attacker
    if(att.comboTimer>0)att.comboHits++; else att.comboHits=1;
    att.comboTimer=0.6; GAME.combo={who:att,hits:att.comboHits,t:0.9};
    // knockback / launch
    def.vx=toDef*(m.kb||150);
    if(m.sweep||m.special){ def.state="knockdown"; def.vy=-260; def.onGround=false; def.getup=0.6; }
    else{ def.state="hit"; def.stun=0.28; }
    spark(att.x+att.facing*44,def.y-64,"#ffd34d");
    if(m.special)screenShake(10);
  }
}
function canActOrBlock(f){return f.state==="idle"||f.state==="walk"||f.state==="crouch";}

function separate(a,b){
  var min=40, d=b.x-a.x;
  if(Math.abs(d)<min){ var push=(min-Math.abs(d))/2*(d>=0?1:-1); if(a.x>WALL&&a.x<W-WALL)a.x-=push; if(b.x>WALL&&b.x<W-WALL)b.x+=push; }
}

// projectiles
function stepProjectiles(dt){
  for(var i=GAME.projs.length-1;i>=0;i--){var p=GAME.projs[i];p.x+=p.vx*dt;p.life-=dt;
    var tgt=(p.owner===GAME.p)?GAME.o:GAME.p;
    if(overlap({x:p.x-10,y:p.y-10,w:20,h:20},hurtboxOf(tgt))){ applyHit(p.owner,tgt,{dmg:p.dmg,kb:200,height:"mid"}); GAME.projs.splice(i,1); continue;}
    if(p.x<0||p.x>W||p.life<=0)GAME.projs.splice(i,1);
  }
}

// sparks + shake
var sparks=[];
function spark(x,y,col){for(var i=0;i<8;i++)sparks.push({x:x,y:y,vx:(Math.random()-0.5)*220,vy:-Math.random()*220,life:0.3,col:col});}
function stepSparks(dt){for(var i=sparks.length-1;i>=0;i--){var s=sparks[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=600*dt;s.life-=dt;if(s.life<=0)sparks.splice(i,1);}}
var shake=0; function screenShake(n){shake=n;}

// ---------- round / match flow ----------
function endRound(){
  if(GAME.roundOver)return;
  var p=GAME.p,o=GAME.o,winner;
  if(p.hp<=0&&o.hp<=0)winner=null;
  else if(o.hp<=0)winner=p;
  else if(p.hp<=0)winner=o;
  else winner=(p.hp>=o.hp)?p:o; // timeout
  if(winner===p)GAME.pWins++; else if(winner===o)GAME.oWins++;
  GAME.roundOver=true; GAME.roundOverT=2.2; GAME.roundWinner=winner;
  if(winner)winner.won=1;
  if(winner===p)toast("Round won!"); else if(winner===o)toast("Round lost"); else toast("Double K.O.");
}
function nextRoundOrEnd(){
  var need=2;
  if(GAME.pWins>=need){ matchWon(); return; }
  if(GAME.oWins>=need){ matchLost(); return; }
  GAME.round++; setupRound();
}
function matchWon(){
  GAME.ladderIdx++;
  if(GAME.ladderIdx>=LADDER.length){ ladderCleared(); }
  else { GAME.screen="vs"; draw(); }
}
function matchLost(){
  var f=getFight(); if(GAME.ladderIdx>f.best)f.best=GAME.ladderIdx; setFight(f);
  GAME.screen="lose"; stopLoop(); draw();
}
function ladderCleared(){
  var f=getFight(); f.best=LADDER.length; f.clears=(f.clears||0)+1;
  var ms=Date.now()-GAME.startMs; if(f.fastestMs==null||ms<f.fastestMs)f.fastestMs=ms;
  setFight(f); GAME.screen="win"; stopLoop(); draw();
}

function setupRound(){
  var p=GAME.p,o=GAME.o;
  p.hp=p.maxHp;o.hp=o.maxHp;p.x=W*0.32;o.x=W*0.68;p.y=o.y=GROUND;
  p.vx=p.vy=o.vx=o.vy=0;p.onGround=o.onGround=true;p.state=o.state="idle";
  p.meter=Math.min(p.meter,30);o.meter=Math.min(o.meter,30);p.atk=o.atk=null;p.comboHits=o.comboHits=0;
  GAME.time=60;GAME.projs=[];sparks=[];GAME.roundOver=false;GAME.roundWinner=null;
  GAME.announce={txt:"ROUND "+GAME.round,t:1.3,sub:"FIGHT!"};
}

function startLadder(){
  GAME.ladderIdx=0; GAME.startMs=Date.now(); GAME.screen="vs"; draw();
}
function beginFight(){
  var oppKey=LADDER[GAME.ladderIdx];
  GAME.p=mkFighter("bull",W*0.32,1,false,0);
  GAME.o=mkFighter(oppKey,W*0.68,-1,true,GAME.ladderIdx);
  GAME.stage=STAGES[Math.min(GAME.ladderIdx,STAGES.length-1)];
  GAME.pWins=0;GAME.oWins=0;GAME.round=1;GAME.combo=null;
  setupRound();
  GAME.screen="fight"; startLoop();
}
function toTitle(){GAME.screen="title";stopLoop();draw();}

// ---------- loop ----------
function running(){return GAME.screen==="fight";}
function startLoop(){ if(!GAME.raf){GAME.last=0;GAME.raf=requestAnimationFrame(loop);} }
function stopLoop(){ if(GAME.raf){cancelAnimationFrame(GAME.raf);GAME.raf=null;} }
function loop(ts){
  if(GAME.screen!=="fight"){GAME.raf=null;return;}
  if(!GAME.last)GAME.last=ts; var dt=Math.min(0.045,(ts-GAME.last)/1000);GAME.last=ts;
  stepTop(dt); draw(); GAME.raf=requestAnimationFrame(loop);
}
function stepTop(dt){
  if(GAME.announce){GAME.announce.t-=dt; if(GAME.announce.t<=0)GAME.announce=null;}
  if(GAME.combo){GAME.combo.t-=dt; if(GAME.combo.t<=0)GAME.combo=null;}
  var fighting=!GAME.announce||GAME.announce.t< -999; // announce blocks input briefly
  if(!GAME.announce) update(dt); else { // during announce, just idle physics
    stepFighter(GAME.p,dt,GAME.o);stepFighter(GAME.o,dt,GAME.p);
  }
  stepProjectiles(dt); stepSparks(dt);
  if(shake>0)shake*=0.86, shake=shake<0.4?0:shake;
}

// =================== DRAWING ===================
function draw(){
  ctx.save();
  var sx=shake?(Math.random()-0.5)*shake:0, sy=shake?(Math.random()-0.5)*shake:0;
  ctx.translate(sx,sy);
  if(GAME.screen==="title")drawTitle();
  else if(GAME.screen==="vs")drawVS();
  else if(GAME.screen==="win")drawEnd(true);
  else if(GAME.screen==="lose")drawEnd(false);
  else drawFight();
  ctx.restore();
}

function clearBG(cols){var g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,cols[0]);g.addColorStop(1,cols[1]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}

function drawFight(){
  var st=GAME.stage; clearBG(st.sky); st.make();
  // shadows
  drawShadow(GAME.o); drawShadow(GAME.p);
  // order by depth (back one first): draw foe then player
  drawFighter(GAME.o); drawFighter(GAME.p);
  GAME.projs.forEach(drawProj);
  sparks.forEach(function(s){ctx.globalAlpha=Math.max(0,s.life/0.3);ctx.fillStyle=s.col;ctx.fillRect(s.x,s.y,3,3);ctx.globalAlpha=1;});
  drawHUD();
  if(GAME.announce)drawAnnounce();
  if(GAME.roundOver&&GAME.roundWinner)drawBanner(GAME.roundWinner===GAME.p?"ROUND WON":"ROUND LOST");
}

function drawShadow(f){ctx.fillStyle="rgba(0,0,0,0.3)";ctx.beginPath();ctx.ellipse(f.x,GROUND+4,30,8,0,0,7);ctx.fill();}

function drawProj(p){
  ctx.save();ctx.translate(p.x,p.y);
  var g=ctx.createRadialGradient(0,0,2,0,0,16);g.addColorStop(0,"#eaffea");g.addColorStop(0.5,"#8df0b0");g.addColorStop(1,"rgba(75,31,122,0)");
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,16,0,7);ctx.fill();
  ctx.fillStyle="#260f3d";ctx.font="bold 14px system-ui";ctx.textAlign="center";ctx.fillText("FUD",0,4);
  ctx.restore();
}

// ---- fighter rendering: shaded limbs + per-character head ----
function pose(f){
  // returns joint angles (radians) for a side-view humanoid; facing applied by caller
  var walk=Math.sin(f.animT*10)*0.5, t=f.t, p={armB:-0.3,elbowB:0.4,armF:0.3,elbowF:0.3,legB:0.2,kneeB:0.2,legF:-0.2,kneeF:0.2,lean:0,crouch:0,arm:0};
  var s=f.state;
  if(s==="walk"){p.legB=walk*0.7;p.legF=-walk*0.7;p.kneeB=0.3+Math.max(0,walk)*0.5;p.kneeF=0.3+Math.max(0,-walk)*0.5;p.armB=-walk*0.6;p.armF=walk*0.6;}
  else if(s==="crouch"){p.crouch=26;p.kneeB=1.0;p.kneeF=1.0;p.legB=0.5;p.legF=-0.5;p.lean=0.12;p.armF=0.6;p.elbowF=1.0;}
  else if(s==="jump"||s==="air"){p.legB=0.7;p.legF=0.9;p.kneeB=0.9;p.kneeF=1.0;p.armB=-1.2;p.armF=-0.8;}
  var prog=0;
  if(s==="punch"||s==="special"){var m=f.atk;prog=clamp((t-m.startup)/m.active,0,1);var ext=s==="special"?1.3:1;
     p.armF=(-0.2+prog*1.9)*ext;p.elbowF=(0.9-prog*0.9);p.lean=0.12*ext;p.legF=-0.25;p.legB=0.3;}
  if(s==="kick"){var mk=f.atk;prog=clamp((t-mk.startup)/mk.active,0,1);p.legF=-0.2-prog*1.7;p.kneeF=0.8-prog*0.7;p.lean=-0.05;p.armB=-0.6;p.armF=0.5;}
  if(s==="low"){var ml=f.atk;prog=clamp((t-ml.startup)/ml.active,0,1);p.crouch=22;p.legF=-0.3-prog*1.5;p.kneeF=0.4;p.lean=0.2;}
  if(s==="hit"){p.lean=-0.25;p.armB=-0.8;p.armF=-0.5;}
  if(s==="knockdown"){p.down=1;}
  if(s==="ko"){p.down=1;}
  return p;
}
function clamp(v,a,b){return v<a?a:v>b?b:v;}

function limb(x,y,a1,len1,a2,len2,w1,w2,col,dark,edge){
  // two-segment limb drawn as tapered capsules
  var jx=x+Math.cos(a1)*len1, jy=y+Math.sin(a1)*len1;
  var ex=jx+Math.cos(a1+a2)*len2, ey=jy+Math.sin(a1+a2)*len2;
  capsule(x,y,jx,jy,w1,col,dark,edge);
  capsule(jx,jy,ex,ey,w2,col,dark,edge);
  return {ex:ex,ey:ey,jx:jx,jy:jy};
}
function capsule(x1,y1,x2,y2,w,col,dark,edge){
  var ang=Math.atan2(y2-y1,x2-x1);
  ctx.save();ctx.translate(x1,y1);ctx.rotate(ang);
  var len=Math.hypot(x2-x1,y2-y1);
  var g=ctx.createLinearGradient(0,-w,0,w);g.addColorStop(0,edge);g.addColorStop(0.4,col);g.addColorStop(1,dark);
  ctx.fillStyle=g;ctx.strokeStyle="rgba(0,0,0,0.55)";ctx.lineWidth=2;
  ctx.beginPath();roundRectPath(-w*0.6,-w,len+w*1.2,w*2,w);ctx.fill();ctx.stroke();
  ctx.restore();
}
function roundRectPath(x,y,w,h,r){r=Math.min(r,h/2,w/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

function drawFighter(f){
  var pal=f.c.pal, col=pal[0], acc=pal[1], dark=pal[2], eye=pal[3];
  var edge=lighten(col,30), p=pose(f);
  ctx.save();
  ctx.translate(f.x,0);
  ctx.scale(f.facing,1);
  if(f.flash>0){ctx.globalAlpha=1;}
  var hipY=f.y-46+(p.crouch||0);
  if(p.down){ drawDowned(f,col,acc,dark,edge,eye); ctx.restore(); return; }
  var shColY=hipY-56; // shoulder y
  if(f.key==="bull") drawBullCape(shColY,hipY,f.animT); // cape trails behind the body
  else drawOppBack(f,shColY,hipY,f.animT,col,acc,dark); // per-opponent back layer (cape/fin/wisp/boulders)
  var noLegs=(f.key==="fud"); // the wraith floats on a wisp tail instead of legs
  // BACK leg + BACK arm first (behind torso)
  if(!noLegs) limb(0,hipY, Math.PI/2+p.legB, 26, p.kneeB, 26, 11,8, shade(col,-18),shade(dark,-18),shade(edge,-18));
  limb(2,shColY, Math.PI/2+p.armB, 22, p.elbowB, 20, 9,6, shade(col,-14),shade(dark,-14),shade(edge,-14));
  // TORSO
  drawTorso(f,hipY,shColY,col,acc,dark,edge,p);
  // FRONT leg + FRONT arm
  if(!noLegs){ var fleg=limb(0,hipY, Math.PI/2+p.legF, 27, p.kneeF, 27, 12,9, col,dark,edge); drawFoot(f,fleg,col,acc,dark); }
  var arm=limb(3,shColY, Math.PI/2+p.armF, 23, p.elbowF, 21, 10,7, col,dark,edge);
  drawFist(f,arm,col,acc,dark,eye);
  // HEAD + per-character
  drawHead(f,shColY,col,acc,dark,edge,eye,p);
  ctx.restore();
  // meter glow on special
  if(f.state==="special"){ctx.save();ctx.globalAlpha=0.4;ctx.fillStyle=acc;ctx.beginPath();ctx.arc(f.x,f.y-60,46,0,7);ctx.fill();ctx.restore();}
}

function drawTorso(f,hipY,shY,col,acc,dark,edge,p){
  var b=f.c.build, wTop=b==="titan"?34:b==="brute"?30:b==="hero"?29:b==="lean"?20:b==="wraith"?20:26;
  var wBot=wTop*0.7;
  ctx.save();
  var g=ctx.createLinearGradient(-wTop,0,wTop,0);g.addColorStop(0,shade(col,-20));g.addColorStop(0.5,col);g.addColorStop(1,edge);
  ctx.fillStyle=g;ctx.strokeStyle="rgba(0,0,0,.55)";ctx.lineWidth=2.5;
  ctx.beginPath();
  ctx.moveTo(-wBot,hipY);ctx.lineTo(-wTop,shY+6);ctx.quadraticCurveTo(0,shY-6,wTop,shY+6);ctx.lineTo(wBot,hipY);
  ctx.quadraticCurveTo(0,hipY+10,-wBot,hipY);ctx.closePath();ctx.fill();ctx.stroke();
  // ab/chest shading line
  ctx.strokeStyle="rgba(0,0,0,.25)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,shY+4);ctx.lineTo(0,hipY-4);ctx.stroke();
  // chest emblem / armor plate (gold) for hero; plating hints for others
  if(f.key==="bull"){
    // gold chest plate + BC25 emblem
    ctx.fillStyle=acc;roundRectPath(-18,shY+8,36,30,8);ctx.fill();ctx.strokeStyle="rgba(0,0,0,.5)";ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,.25)";roundRectPath(-15,shY+10,30,5,3);ctx.fill(); // plate gloss
    ctx.fillStyle=shade(acc,-32);ctx.font="bold 11px system-ui";ctx.textAlign="center";
    ctx.save();ctx.scale(f.facing,1);ctx.fillText("BC25",0,shY+28);ctx.restore();
    // gold belt + buckle
    ctx.fillStyle=acc;roundRectPath(-wBot-2,hipY-9,wBot*2+4,9,3);ctx.fill();ctx.strokeStyle="rgba(0,0,0,.5)";ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle=shade(acc,-34);ctx.beginPath();ctx.arc(0,hipY-4.5,4,0,7);ctx.fill();
    // shoulder pauldrons (layered)
    pauldron(-wTop,shY+6,acc);pauldron(wTop,shY+6,acc);
  }else if(f.key==="bear"){
    // dark chest fur + red down-arrow (bear market)
    ctx.fillStyle=shade(col,-24);ctx.globalAlpha=0.85;roundRectPath(-wTop*0.62,shY+6,wTop*1.24,hipY-shY-6,8);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle="#e74c3c";ctx.strokeStyle="rgba(0,0,0,.4)";ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(-10,shY+14);ctx.lineTo(10,shY+14);ctx.lineTo(0,shY+31);ctx.closePath();ctx.fill();ctx.stroke();
    pauldron(-wTop,shY+6,shade(col,-18));pauldron(wTop,shY+6,shade(col,-18));
  }else if(f.key==="whale"){
    // pale belly plates + cyan droplet sigil
    ctx.fillStyle=shade(acc,-6);ctx.globalAlpha=0.85;roundRectPath(-wBot*0.95,shY+8,wBot*1.9,hipY-shY-8,10);ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle="rgba(0,0,0,.18)";ctx.lineWidth=1.5;
    for(var bi=1;bi<4;bi++){var yy=shY+8+bi*((hipY-shY)/4);ctx.beginPath();ctx.moveTo(-wBot*0.8,yy);ctx.lineTo(wBot*0.8,yy);ctx.stroke();}
    var weye=f.c.pal[3];ctx.fillStyle=weye;ctx.beginPath();ctx.moveTo(0,shY+15);ctx.quadraticCurveTo(7,shY+24,0,shY+29);ctx.quadraticCurveTo(-7,shY+24,0,shY+15);ctx.closePath();ctx.fill();
  }else if(f.key==="gas"){
    // glowing lava cracks + molten core
    ctx.strokeStyle="#ffb020";ctx.lineWidth=2;ctx.globalAlpha=0.9;
    ctx.beginPath();ctx.moveTo(-11,shY+8);ctx.lineTo(-3,shY+20);ctx.lineTo(-9,hipY-6);ctx.stroke();
    ctx.beginPath();ctx.moveTo(11,shY+10);ctx.lineTo(4,shY+24);ctx.lineTo(10,hipY-8);ctx.stroke();ctx.globalAlpha=1;
    var cg=ctx.createRadialGradient(0,shY+20,1,0,shY+20,13);cg.addColorStop(0,"#fff3c0");cg.addColorStop(0.5,"#ffb020");cg.addColorStop(1,"rgba(255,120,0,0)");
    ctx.fillStyle=cg;ctx.beginPath();ctx.arc(0,shY+20,13,0,7);ctx.fill();
    ctx.fillStyle=shade(col,-22);ctx.beginPath();ctx.arc(-wTop+4,shY+4,8,0,7);ctx.arc(wTop-4,shY+4,7,0,7);ctx.fill(); // rock shoulders
  }else if(f.key==="fud"){
    // faint spectral sheen over torso
    ctx.globalAlpha=0.22;ctx.fillStyle=acc;roundRectPath(-wTop*0.5,shY+8,wTop,hipY-shY-8,8);ctx.fill();ctx.globalAlpha=1;
  }else if(f.key==="rug"){
    ctx.fillStyle=acc;ctx.globalAlpha=0.92;roundRectPath(-wTop*0.8,shY+4,wTop*1.6,hipY-shY-2,6);ctx.fill();ctx.globalAlpha=1; // cloak
    ctx.fillStyle=shade(col,-8);ctx.globalAlpha=0.55;roundRectPath(-wTop*0.5,shY+6,wTop,10,4);ctx.fill();ctx.globalAlpha=1; // collar shadow
    ctx.strokeStyle="rgba(255,60,60,.3)";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,shY+8);ctx.lineTo(0,hipY-4);ctx.stroke(); // cloak seam
  }
  ctx.restore();
}
function pauldron(x,y,acc){ctx.save();ctx.fillStyle=acc;ctx.strokeStyle="rgba(0,0,0,.5)";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,12,10,0,0,7);ctx.fill();ctx.stroke();ctx.restore();}

function drawHead(f,shY,col,acc,dark,edge,eye,p){
  var hx=0,hy=shY-16;
  ctx.save();
  if(f.key==="bull"){
    // ears (behind skull)
    ctx.fillStyle=shade(col,-10);ctx.strokeStyle="rgba(0,0,0,.6)";ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(hx-10,hy-2,6,4,0.5,0,7);ctx.fill();ctx.stroke();
    // skull
    ctx.fillStyle=col;ctx.strokeStyle="rgba(0,0,0,.6)";ctx.lineWidth=2.5;
    ctx.beginPath();ctx.ellipse(hx+4,hy,16,14,0,0,7);ctx.fill();ctx.stroke();
    // muzzle
    ctx.fillStyle=shade(col,-16);ctx.beginPath();ctx.ellipse(hx+16,hy+5,10,8,0,0,7);ctx.fill();ctx.stroke();
    // big curved gold horns, emerging from the top sides of the skull
    bullHorn(hx-1,hy-8,-1,acc); bullHorn(hx+9,hy-8,1,acc);
    // gold brow/face mask (reference's facial armor) — sits above the eyes
    ctx.fillStyle=acc;ctx.strokeStyle="rgba(0,0,0,.5)";ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(hx-11,hy-5);ctx.lineTo(hx-3,hy-11);ctx.lineTo(hx+5,hy-9);ctx.lineTo(hx+13,hy-11);ctx.lineTo(hx+17,hy-5);
    ctx.lineTo(hx+13,hy-3);ctx.lineTo(hx-7,hy-3);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,.3)";ctx.beginPath();ctx.moveTo(hx-9,hy-5);ctx.lineTo(hx-2,hy-9);ctx.lineTo(hx+2,hy-8);ctx.closePath();ctx.fill(); // mask gloss
    // gold nose guard down the muzzle
    ctx.fillStyle=acc;ctx.beginPath();roundRectPath(hx+9,hy-2,5,10,2);ctx.fill();ctx.stroke();
    // glowing eyes under the brow
    glowEye(hx-2,hy,eye); glowEye(hx+8,hy,eye);
    // nostrils
    ctx.fillStyle="#061030";ctx.beginPath();ctx.arc(hx+20,hy+6,1.7,0,7);ctx.fill();ctx.arc(hx+13,hy+7,1.7,0,7);ctx.fill();
  }else if(f.key==="bear"){
    // round ears
    ctx.fillStyle=shade(col,-8);ctx.strokeStyle="rgba(0,0,0,.6)";ctx.lineWidth=2.5;
    ctx.beginPath();ctx.arc(hx-6,hy-13,6,0,7);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(hx+13,hy-13,6,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle="#2a1a0e";ctx.beginPath();ctx.arc(hx-6,hy-13,2.6,0,7);ctx.fill();ctx.beginPath();ctx.arc(hx+13,hy-13,2.6,0,7);ctx.fill();
    // head + snout
    ctx.fillStyle=col;ctx.strokeStyle="rgba(0,0,0,.6)";ctx.beginPath();ctx.arc(hx+4,hy,15,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle=shade(col,14);ctx.beginPath();ctx.ellipse(hx+15,hy+5,9,8,0,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle="#1a1008";ctx.beginPath();ctx.ellipse(hx+22,hy+4,3,2.4,0,0,7);ctx.fill(); // nose
    // snarl + teeth
    ctx.strokeStyle="#1a0e06";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(hx+9,hy+10);ctx.lineTo(hx+21,hy+9);ctx.stroke();
    ctx.fillStyle="#fff";for(var ti=0;ti<3;ti++){ctx.beginPath();ctx.moveTo(hx+11+ti*4,hy+10);ctx.lineTo(hx+13+ti*4,hy+10);ctx.lineTo(hx+12+ti*4,hy+14);ctx.closePath();ctx.fill();}
    ctx.strokeStyle="rgba(230,80,60,.7)";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(hx-2,hy-8);ctx.lineTo(hx+2,hy+4);ctx.stroke(); // scar
    glowEye(hx+1,hy-3,eye);glowEye(hx+9,hy-3,eye);
  }else if(f.key==="rug"){
    // deep hood
    ctx.fillStyle=acc;ctx.strokeStyle="rgba(0,0,0,.65)";ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo(hx-13,hy+14);ctx.quadraticCurveTo(hx-14,hy-20,hx+4,hy-22);ctx.quadraticCurveTo(hx+22,hy-20,hx+21,hy+14);
    ctx.quadraticCurveTo(hx+4,hy+4,hx-13,hy+14);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle="rgba(255,60,60,.4)";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(hx-9,hy+8);ctx.quadraticCurveTo(hx+4,hy-14,hx+17,hy+8);ctx.stroke(); // rim glow
    ctx.fillStyle="#07030a";ctx.beginPath();ctx.ellipse(hx+4,hy+2,8,10,0,0,7);ctx.fill(); // face void
    glowEye(hx+1,hy+1,eye);glowEye(hx+8,hy+1,eye);
  }else if(f.key==="whale"){
    ctx.fillStyle=col;ctx.strokeStyle="rgba(0,0,0,.55)";ctx.lineWidth=2.5;
    ctx.beginPath();ctx.ellipse(hx+6,hy,18,14,0,0,7);ctx.fill();ctx.stroke(); // big head
    // spout mist
    ctx.strokeStyle=acc;ctx.globalAlpha=0.6;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(hx-2,hy-14);ctx.quadraticCurveTo(hx-8,hy-26,hx-2,hy-30);ctx.moveTo(hx-2,hy-14);ctx.quadraticCurveTo(hx+5,hy-26,hx+1,hy-30);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=acc;ctx.beginPath();ctx.moveTo(hx-6,hy-12);ctx.quadraticCurveTo(hx-2,hy-22,hx+6,hy-13);ctx.closePath();ctx.fill();ctx.strokeStyle="rgba(0,0,0,.4)";ctx.stroke(); // blowhole fin
    ctx.fillStyle=shade(acc,-4);ctx.beginPath();ctx.ellipse(hx+10,hy+7,10,5,0,0,7);ctx.fill(); // pale jaw
    ctx.strokeStyle="rgba(0,0,0,.45)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(hx+22,hy+5);ctx.quadraticCurveTo(hx+6,hy+12,hx-8,hy+7);ctx.stroke(); // mouth
    ctx.fillStyle=shade(col,-24);ctx.beginPath();ctx.arc(hx-6,hy-4,2.4,0,7);ctx.arc(hx-2,hy+2,2,0,7);ctx.fill(); // barnacles
    glowEye(hx+12,hy-2,eye);
  }else if(f.key==="fud"){
    ctx.globalAlpha=0.94;
    // tattered spectral hood
    ctx.fillStyle=shade(col,-6);ctx.strokeStyle=acc;ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(hx-12,hy+12);ctx.quadraticCurveTo(hx-14,hy-18,hx+4,hy-20);ctx.quadraticCurveTo(hx+20,hy-18,hx+18,hy+12);
    ctx.lineTo(hx+12,hy+6);ctx.lineTo(hx+8,hy+14);ctx.lineTo(hx+2,hy+6);ctx.lineTo(hx-4,hy+14);ctx.lineTo(hx-8,hy+6);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle="#140a22";ctx.beginPath();ctx.ellipse(hx+3,hy,8,10,0,0,7);ctx.fill(); // inner dark
    glowEye(hx,hy-1,acc);glowEye(hx+7,hy-1,acc);
    ctx.fillStyle=acc;ctx.globalAlpha=0.6;ctx.beginPath();ctx.ellipse(hx+4,hy+6,2,3,0,0,7);ctx.fill(); // wailing mouth
    ctx.globalAlpha=1;
  }else if(f.key==="gas"){
    var cg=ctx.createLinearGradient(hx-11,hy-13,hx+17,hy+14);cg.addColorStop(0,shade(col,10));cg.addColorStop(1,shade(col,-20));
    ctx.fillStyle=cg;ctx.strokeStyle="rgba(0,0,0,.65)";ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo(hx-11,hy-8);ctx.lineTo(hx-6,hy-13);ctx.lineTo(hx+10,hy-13);ctx.lineTo(hx+17,hy-6);ctx.lineTo(hx+16,hy+8);ctx.lineTo(hx+8,hy+14);ctx.lineTo(hx-7,hy+13);ctx.lineTo(hx-11,hy+4);ctx.closePath();ctx.fill();ctx.stroke(); // craggy head
    ctx.strokeStyle="#ffb020";ctx.lineWidth=1.8;ctx.globalAlpha=0.9;ctx.beginPath();ctx.moveTo(hx-4,hy-12);ctx.lineTo(hx+1,hy-3);ctx.lineTo(hx-3,hy+6);ctx.moveTo(hx+1,hy-3);ctx.lineTo(hx+9,hy);ctx.stroke();ctx.globalAlpha=1; // cracks
    ctx.fillStyle=shade(col,-26);ctx.beginPath();ctx.moveTo(hx-8,hy-3);ctx.lineTo(hx+14,hy-3);ctx.lineTo(hx+12,hy+1);ctx.lineTo(hx-6,hy+1);ctx.closePath();ctx.fill(); // brow ridge
    glowEye(hx-1,hy,eye);glowEye(hx+10,hy,eye);
    ctx.fillStyle=shade(col,16);for(var gi=0;gi<3;gi++){ctx.beginPath();ctx.moveTo(hx-2+gi*6,hy+10);ctx.lineTo(hx+2+gi*6,hy+10);ctx.lineTo(hx+gi*6,hy+14);ctx.closePath();ctx.fill();} // teeth
  }
  ctx.restore();
}
function horn(x,y,dir,acc){ctx.save();ctx.fillStyle=acc;ctx.strokeStyle="rgba(0,0,0,.5)";ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+dir*16,y-14,x+dir*10,y-26);ctx.quadraticCurveTo(x+dir*4,y-14,x,y);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
function bullHorn(x,y,dir,acc){ // thick gold horn: wide base, sweeps outward then curls up to a tip
  ctx.save();ctx.strokeStyle="rgba(0,0,0,.6)";ctx.lineWidth=2;
  var g=ctx.createLinearGradient(x,y,x+dir*24,y-26);g.addColorStop(0,shade(acc,-26));g.addColorStop(1,acc);
  ctx.fillStyle=g;
  ctx.beginPath();
  ctx.moveTo(x,y+5);                                   // base, bottom (thick)
  ctx.quadraticCurveTo(x+dir*24,y+4, x+dir*31,y-24);   // outer: out to the side, then up to tip
  ctx.quadraticCurveTo(x+dir*22,y-11, x+dir*13,y-5);   // tip underside back in
  ctx.quadraticCurveTo(x+dir*7,y-1, x,y-5);            // inner edge back to base top
  ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle="rgba(255,255,255,.6)";ctx.beginPath();ctx.arc(x+dir*31,y-24,2.6,0,7);ctx.fill(); // tip glint
  ctx.restore();
}
function drawBullCape(shY,hipY,animT){ // flowing navy cape with gold trim, trailing behind (-x local)
  var sway=Math.sin(animT*3)*7;
  ctx.save();
  var g=ctx.createLinearGradient(-50,shY,0,hipY+46);g.addColorStop(0,"#16285f");g.addColorStop(1,"#0a1434");
  ctx.fillStyle=g;ctx.strokeStyle="#c8912a";ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(8,shY-8);
  ctx.quadraticCurveTo(-46,shY+26, -42+sway, hipY+48);
  ctx.quadraticCurveTo(-20,hipY+34, -2,hipY+36);
  ctx.lineTo(12,shY-4);
  ctx.closePath();ctx.fill();ctx.stroke();
  // inner fold shading
  ctx.strokeStyle="rgba(240,180,41,.35)";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-6,shY+6);ctx.quadraticCurveTo(-30,hipY+6,-24+sway,hipY+42);ctx.stroke();
  // gold collar clasp at shoulders
  ctx.fillStyle="#f0b429";ctx.strokeStyle="rgba(0,0,0,.5)";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(2,shY-6,4,0,7);ctx.fill();ctx.stroke();
  ctx.restore();
}
function glowEye(x,y,eye){ctx.save();var g=ctx.createRadialGradient(x,y,0,x,y,6);g.addColorStop(0,"#fff");g.addColorStop(0.4,eye);g.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,6,0,7);ctx.fill();ctx.restore();}

// ---- per-opponent back layer (drawn behind the body, local -x = behind) ----
function drawOppBack(f,shY,hipY,animT,col,acc,dark){
  var sway=Math.sin(animT*3)*5;
  ctx.save();ctx.strokeStyle="rgba(0,0,0,.5)";ctx.lineWidth=2;
  if(f.key==="rug"){ // torn dark cape with jagged hem
    ctx.fillStyle="#0a0608";ctx.strokeStyle="#3a0710";
    ctx.beginPath();ctx.moveTo(6,shY-6);ctx.quadraticCurveTo(-30,shY+30,-26+sway,hipY+40);
    ctx.lineTo(-18,hipY+30);ctx.lineTo(-14,hipY+44);ctx.lineTo(-8,hipY+32);ctx.lineTo(-2,hipY+42);ctx.lineTo(4,hipY+30);
    ctx.lineTo(10,shY-2);ctx.closePath();ctx.fill();ctx.stroke();
  }else if(f.key==="whale"){ // dorsal fin + tail fluke
    ctx.fillStyle=shade(col,-18);
    ctx.beginPath();ctx.moveTo(-6,shY+8);ctx.quadraticCurveTo(-30,shY-4,-14,hipY-6);ctx.closePath();ctx.fill();ctx.stroke(); // dorsal fin
    ctx.fillStyle=acc;
    ctx.beginPath();ctx.moveTo(-10,hipY+22);ctx.quadraticCurveTo(-36,hipY+8,-30,hipY+30);ctx.quadraticCurveTo(-22,hipY+24,-14,hipY+34);ctx.closePath();ctx.fill();ctx.stroke(); // fluke
  }else if(f.key==="gas"){ // rocky boulders on the back shoulders
    ctx.fillStyle=shade(col,-20);ctx.strokeStyle="rgba(0,0,0,.6)";
    ctx.beginPath();ctx.arc(-15,shY+2,13,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle=shade(col,-30);ctx.beginPath();ctx.arc(13,shY+3,10,0,7);ctx.fill();ctx.stroke();
  }else if(f.key==="fud"){ // spectral aura + wisp tail instead of legs
    ctx.globalAlpha=0.5;var ag=ctx.createRadialGradient(0,hipY-8,6,0,hipY-8,52);ag.addColorStop(0,acc);ag.addColorStop(1,"rgba(75,31,122,0)");
    ctx.fillStyle=ag;ctx.beginPath();ctx.arc(0,hipY-6,50,0,7);ctx.fill();
    ctx.globalAlpha=0.9;ctx.fillStyle=col;ctx.strokeStyle=shade(acc,-10);ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(-16,hipY-22);
    ctx.quadraticCurveTo(-22,hipY+18,-9+sway,hipY+54);
    ctx.quadraticCurveTo(-3,hipY+42,0,hipY+56);ctx.quadraticCurveTo(3,hipY+42,9-sway,hipY+54);
    ctx.quadraticCurveTo(22,hipY+18,16,hipY-22);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.globalAlpha=1;
  }else if(f.key==="bear"){ // shaggy fur tufts behind the shoulders
    ctx.fillStyle=shade(col,-16);
    for(var i=-1;i<=1;i+=2){ctx.beginPath();ctx.moveTo(i*13,shY-2);ctx.lineTo(i*26,shY+6);ctx.lineTo(i*15,shY+14);ctx.closePath();ctx.fill();}
  }
  ctx.restore();
}
// ---- per-character front foot ----
function drawFoot(f,leg,col,acc,dark){
  ctx.save();ctx.strokeStyle="rgba(0,0,0,.5)";ctx.lineWidth=1.5;
  if(f.key==="bull"){
    ctx.fillStyle=shade(acc,-8);ctx.beginPath();ctx.arc(leg.jx,leg.jy,5.5,0,7);ctx.fill();ctx.stroke(); // knee guard
    ctx.fillStyle=acc;ctx.beginPath();ctx.ellipse(leg.ex,leg.ey,9,6,0,0,7);ctx.fill();ctx.stroke(); // boot
  }else if(f.key==="bear"||f.key==="gas"){
    ctx.fillStyle=shade(col,-18);ctx.beginPath();ctx.ellipse(leg.ex+3,leg.ey,11,6,0,0,7);ctx.fill();ctx.stroke(); // paw/rock foot
    ctx.strokeStyle=f.key==="gas"?"#ffb020":"#eee";ctx.lineWidth=1.5;
    for(var i=0;i<3;i++){ctx.beginPath();ctx.moveTo(leg.ex+7+i*3,leg.ey+1);ctx.lineTo(leg.ex+11+i*3,leg.ey+5);ctx.stroke();} // claws
  }else{ // rug, whale
    ctx.fillStyle=shade(col,-22);ctx.beginPath();ctx.ellipse(leg.ex+3,leg.ey,9,6,0,0,7);ctx.fill();ctx.stroke();
  }
  ctx.restore();
}
// ---- per-character front hand/weapon ----
function drawFist(f,arm,col,acc,dark,eye){
  ctx.save();ctx.strokeStyle="rgba(0,0,0,.5)";ctx.lineWidth=1.5;
  if(f.key==="bull"){
    ctx.fillStyle=acc;ctx.beginPath();ctx.arc(arm.ex,arm.ey,7,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle=shade(acc,-8);ctx.beginPath();ctx.arc(arm.jx,arm.jy,5,0,7);ctx.fill();ctx.stroke(); // forearm gauntlet
  }else if(f.key==="rug"){
    ctx.fillStyle=shade(col,12);ctx.beginPath();ctx.arc(arm.ex,arm.ey,6,0,7);ctx.fill();ctx.stroke();
    var a=Math.atan2(arm.ey-arm.jy,arm.ex-arm.jx);ctx.save();ctx.translate(arm.ex,arm.ey);ctx.rotate(a);
    ctx.fillStyle="#cfd6dd";ctx.beginPath();ctx.moveTo(2,-2.5);ctx.lineTo(19,-3);ctx.lineTo(24,0);ctx.lineTo(19,3);ctx.lineTo(2,2.5);ctx.closePath();ctx.fill();ctx.stroke(); // blade
    ctx.fillStyle="#7a1020";ctx.fillRect(-3,-3,5,6);ctx.restore(); // hilt
  }else if(f.key==="fud"){
    ctx.globalAlpha=0.9;ctx.fillStyle=col;ctx.beginPath();ctx.arc(arm.ex,arm.ey,5,0,7);ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle=acc;ctx.lineWidth=1.6;for(var i=0;i<3;i++){ctx.beginPath();ctx.moveTo(arm.ex,arm.ey);ctx.lineTo(arm.ex+6+i*2,arm.ey+5+(i-1)*4);ctx.stroke();} // claws
  }else if(f.key==="gas"){
    ctx.fillStyle=shade(col,-12);ctx.beginPath();roundRectPath(arm.ex-8,arm.ey-7,16,14,4);ctx.fill();ctx.stroke(); // rock fist
    ctx.fillStyle="#ffb020";ctx.globalAlpha=0.5;ctx.beginPath();ctx.arc(arm.ex,arm.ey,3,0,7);ctx.fill();ctx.globalAlpha=1;
  }else{ // bear, whale: big fist (+bear claws)
    ctx.fillStyle=shade(col,8);ctx.beginPath();ctx.arc(arm.ex,arm.ey,8,0,7);ctx.fill();ctx.stroke();
    if(f.key==="bear"){ctx.strokeStyle="#eee";ctx.lineWidth=1.5;for(var j=0;j<3;j++){ctx.beginPath();ctx.moveTo(arm.ex+3,arm.ey-5+j*4);ctx.lineTo(arm.ex+11,arm.ey-6+j*4);ctx.stroke();}}
  }
  ctx.restore();
}

function drawDowned(f,col,acc,dark,edge,eye){
  // lying on ground
  ctx.save();ctx.translate(0,f.y-14);
  capsule(-28,0,28,0,14,col,dark,edge);
  ctx.fillStyle=col;ctx.beginPath();ctx.arc(f.facing>0?-30:30,-4,12,0,7);ctx.fill();ctx.strokeStyle="rgba(0,0,0,.5)";ctx.stroke();
  glowEye(f.facing>0?-32:32,-4,eye);
  ctx.restore();
}

function lighten(hex,amt){return shade(hex,amt);}
function parseRGB(col){ // accepts #rgb, #rrggbb, or rgb(r,g,b)
  if(col.charAt(0)==="#"){var c=col.slice(1);if(c.length===3)c=c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    return [parseInt(c.substr(0,2),16),parseInt(c.substr(2,2),16),parseInt(c.substr(4,2),16)];}
  var m=col.match(/(\d+)/g);return m?[+m[0],+m[1],+m[2]]:[0,0,0];
}
function shade(col,amt){ // amt -100..100
  var p=parseRGB(col),r=p[0],g=p[1],b=p[2],f=amt/100;
  r=Math.round(clamp(r+(f>0?(255-r)*f:r*f),0,255));g=Math.round(clamp(g+(f>0?(255-g)*f:g*f),0,255));b=Math.round(clamp(b+(f>0?(255-b)*f:b*f),0,255));
  return "rgb("+r+","+g+","+b+")";
}

// ---------- HUD ----------
function drawHUD(){
  // health bars
  bar(20,16,300,true,GAME.p.hp/GAME.p.maxHp,"#2ecc71");
  bar(W-20-300,16,300,false,GAME.o.hp/GAME.o.maxHp,"#e74c3c");
  // names
  ctx.fillStyle="#fff";ctx.font="bold 13px system-ui";ctx.textAlign="left";ctx.fillText(GAME.p.c.name,22,46);
  ctx.textAlign="right";ctx.fillText(GAME.o.c.name,W-22,46);
  // meters
  meter(20,52,300,GAME.p.meter/100,true);meter(W-20-300,52,300,GAME.o.meter/100,false);
  // round pips
  pips(150,40,GAME.pWins,1);pips(W-150,40,GAME.oWins,-1);
  // timer
  ctx.fillStyle="#fff";ctx.font="bold 26px system-ui";ctx.textAlign="center";
  ctx.strokeStyle="#000";ctx.lineWidth=4;ctx.strokeText(Math.ceil(GAME.time),W/2,40);ctx.fillText(Math.ceil(GAME.time),W/2,40);
  // ladder progress
  ctx.font="11px system-ui";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Fight "+(GAME.ladderIdx+1)+"/"+LADDER.length+" · "+GAME.stage.name,W/2,56);
  // combo popup
  if(GAME.combo&&GAME.combo.hits>=2){var x=GAME.combo.who===GAME.p?W*0.3:W*0.7;
    ctx.save();ctx.globalAlpha=clamp(GAME.combo.t,0,1);ctx.fillStyle="#f0b429";ctx.font="bold 22px system-ui";ctx.textAlign="center";
    ctx.strokeStyle="#000";ctx.lineWidth=4;ctx.strokeText(GAME.combo.hits+" HIT!",x,120);ctx.fillText(GAME.combo.hits+" HIT!",x,120);ctx.restore();}
}
function bar(x,y,w,ltr,frac,col){
  frac=clamp(frac,0,1);
  ctx.fillStyle="#111";ctx.strokeStyle="#000";ctx.lineWidth=2;ctx.fillRect(x,y,w,16);
  var fw=w*frac;
  ctx.fillStyle=col;
  if(ltr)ctx.fillRect(x,y,fw,16); else ctx.fillRect(x+w-fw,y,fw,16); // drains toward center
  ctx.strokeRect(x,y,w,16);
  // gloss
  ctx.fillStyle="rgba(255,255,255,.18)";if(ltr)ctx.fillRect(x,y,fw,5);else ctx.fillRect(x+w-fw,y,fw,5);
}
function meter(x,y,w,frac,ltr){frac=clamp(frac,0,1);ctx.fillStyle="#1a1a1a";ctx.fillRect(x,y,w,6);
  var col=frac>=1?"#f0b429":"#4aa3ff";var fw=w*frac;if(ltr)ctx.fillStyle=col,ctx.fillRect(x,y,fw,6);else ctx.fillStyle=col,ctx.fillRect(x+w-fw,y,fw,6);
  if(frac>=1){ctx.fillStyle="#fff";ctx.font="8px system-ui";ctx.textAlign=ltr?"left":"right";ctx.fillText("SPECIAL READY",ltr?x+2:x+w-2,y-2);}}
function pips(cx,y,n,dir){for(var i=0;i<2;i++){ctx.beginPath();ctx.arc(cx+dir*i*16,y,5,0,7);ctx.fillStyle=i<n?"#f0b429":"#333";ctx.fill();ctx.strokeStyle="#000";ctx.stroke();}}

function drawAnnounce(){var a=GAME.announce;ctx.save();ctx.globalAlpha=clamp(a.t,0,1);
  ctx.textAlign="center";ctx.fillStyle="#fff";ctx.strokeStyle="#000";ctx.lineWidth=6;
  ctx.font="bold 40px system-ui";ctx.strokeText(a.txt,W/2,H/2-6);ctx.fillText(a.txt,W/2,H/2-6);
  if(a.sub){ctx.fillStyle="#f0b429";ctx.font="bold 30px system-ui";ctx.strokeText(a.sub,W/2,H/2+34);ctx.fillText(a.sub,W/2,H/2+34);}
  ctx.restore();}
function drawBanner(txt){ctx.save();ctx.textAlign="center";ctx.fillStyle=txt.indexOf("WON")>=0?"#2ecc71":"#e74c3c";
  ctx.strokeStyle="#000";ctx.lineWidth=6;ctx.font="bold 42px system-ui";ctx.strokeText(txt,W/2,H/2);ctx.fillText(txt,W/2,H/2);ctx.restore();}

// ---------- menus ----------
function drawTitle(){
  clearBG(["#0a0f28","#1a2a6b"]);
  // backdrop bull silhouette
  ctx.save();ctx.globalAlpha=0.12;ctx.fillStyle="#f0b429";ctx.font="bold 230px system-ui";ctx.textAlign="center";ctx.fillText("🐂",W/2,H/2+70);ctx.restore();
  ctx.textAlign="center";
  ctx.fillStyle="#f0b429";ctx.font="bold 46px system-ui";ctx.strokeStyle="#000";ctx.lineWidth=5;
  ctx.strokeText("DEFENDER'S DUEL",W/2,110);ctx.fillText("DEFENDER'S DUEL",W/2,110);
  ctx.fillStyle="#cfe0ff";ctx.font="15px system-ui";ctx.fillText("80s-style arcade fighter · you are the BC25 Defender",W/2,140);
  var f=getFight();
  ctx.fillStyle="#9fb3d9";ctx.font="13px system-ui";
  ctx.fillText("Best: beat "+(f.best||0)+"/"+LADDER.length+" opponents"+(f.clears?"  ·  Champion ×"+f.clears:""),W/2,172);
  // controls
  ctx.fillStyle="#e8eefc";ctx.font="13px system-ui";
  var lines=["MOVE  ← →      JUMP  ↑ / W      CROUCH  ↓ / S",
             "PUNCH  J / Z      KICK  K / X      SPECIAL  L / C",
             "BLOCK  hold away from foe   ·   COMBO  chain P-P-P / P-K",
             "LOW  ↓+P/K     JUMP-IN  ↑ then P/K     SPECIAL needs full meter"];
  for(var i=0;i<lines.length;i++)ctx.fillText(lines[i],W/2,210+i*22);
  blink("PRESS ENTER / TAP TO FIGHT",W/2,300);
}
function drawVS(){
  var oppKey=LADDER[GAME.ladderIdx],opp=ROSTER[oppKey];
  clearBG(STAGES[Math.min(GAME.ladderIdx,STAGES.length-1)].sky);
  ctx.textAlign="center";
  ctx.fillStyle="#fff";ctx.font="bold 30px system-ui";ctx.fillText("FIGHT "+(GAME.ladderIdx+1)+" / "+LADDER.length,W/2,54);
  // two posed fighters
  var demoP=mkFighter("bull",W*0.26,1,false,0);demoP.animT=0.0;drawShadow(demoP);drawFighter(demoP);
  var demoO=mkFighter(oppKey,W*0.74,-1,false,0);drawShadow(demoO);drawFighter(demoO);
  ctx.fillStyle="#f0b429";ctx.font="bold 54px system-ui";ctx.strokeStyle="#000";ctx.lineWidth=5;
  ctx.strokeText("VS",W/2,H/2);ctx.fillText("VS",W/2,H/2);
  ctx.fillStyle="#fff";ctx.font="bold 18px system-ui";ctx.fillText(ROSTER.bull.name,W*0.26,H-70);ctx.fillText(opp.name,W*0.74,H-70);
  ctx.fillStyle="#cfe0ff";ctx.font="12px system-ui";wrap(opp.blurb,W*0.74,H-50,180);
  ctx.fillStyle="#cfe0ff";wrap("Special: "+opp.special,W*0.74,H-24,180);
  blink("PRESS ENTER / TAP TO BEGIN",W/2,H-6);
}
function drawEnd(win){
  clearBG(win?["#0a2a1a","#0a5a2a"]:["#2a0a0a","#5a0a0a"]);
  ctx.textAlign="center";
  ctx.fillStyle=win?"#2ecc71":"#e74c3c";ctx.font="bold 50px system-ui";ctx.strokeStyle="#000";ctx.lineWidth=5;
  var t=win?"CHAMPION!":"DEFEATED";ctx.strokeText(t,W/2,H/2-20);ctx.fillText(t,W/2,H/2-20);
  ctx.fillStyle="#fff";ctx.font="16px system-ui";
  if(win)ctx.fillText("You defended the index through all "+LADDER.length+" challengers.",W/2,H/2+16);
  else ctx.fillText("You beat "+GAME.ladderIdx+" of "+LADDER.length+". The bears advance.",W/2,H/2+16);
  var f=getFight();
  if(win&&f.fastestMs!=null)ctx.fillText("Fastest clear: "+(f.fastestMs/1000).toFixed(1)+"s",W/2,H/2+42);
  blink("PRESS ENTER / TAP FOR TITLE",W/2,H/2+90);
}
var _blinkT=0;
function blink(txt,x,y){_blinkT+=0.05;ctx.save();ctx.globalAlpha=0.5+0.5*Math.sin(Date.now()/300);ctx.fillStyle="#fff";ctx.font="bold 18px system-ui";ctx.textAlign="center";ctx.fillText(txt,x,y);ctx.restore();}
function wrap(txt,cx,y,maxw){ctx.textAlign="center";var words=txt.split(" "),line="",yy=y;for(var i=0;i<words.length;i++){var t=line+words[i]+" ";if(ctx.measureText(t).width>maxw&&line){ctx.fillText(line,cx,yy);line=words[i]+" ";yy+=16;}else line=t;}ctx.fillText(line,cx,yy);}

// =================== STAGE ART ===================
function drawFloorPlatform(){ // common ground slab
  ctx.fillStyle="rgba(0,0,0,0.35)";ctx.fillRect(0,GROUND+6,W,H-GROUND);
  ctx.fillStyle="rgba(255,255,255,0.05)";ctx.fillRect(0,GROUND+6,W,3);
}
function drawFloor(){ // The Exchange — neon candles + skyline
  // skyline
  for(var i=0;i<16;i++){var bx=i*48+8,bh=40+((i*37)%90);ctx.fillStyle="rgba(30,50,110,"+(0.5+(i%3)*0.1)+")";ctx.fillRect(bx,GROUND-bh,34,bh);
    for(var w=0;w<3;w++)for(var hh=0;hh<Math.floor(bh/16);hh++){if((i+w+hh)%3===0){ctx.fillStyle="rgba(240,180,41,.5)";ctx.fillRect(bx+6+w*10,GROUND-bh+6+hh*14,4,6);}}}
  // candlesticks chart overlay
  var base=GROUND-60;ctx.globalAlpha=0.5;
  for(var c=0;c<22;c++){var cx=c*32+20,up=(c*53)%2===0,hgt=18+((c*41)%40),wick=hgt+10;
    ctx.strokeStyle=up?"#2ecc71":"#e74c3c";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,base-wick-((c*29)%30));ctx.lineTo(cx,base+10);ctx.stroke();
    ctx.fillStyle=up?"rgba(46,204,113,.6)":"rgba(231,76,60,.6)";ctx.fillRect(cx-5,base-hgt-((c*29)%30),10,hgt);}
  ctx.globalAlpha=1;
  ctx.fillStyle="#0a1024";ctx.fillRect(0,GROUND,W,H-GROUND);
  ctx.fillStyle="#1a2550";ctx.fillRect(0,GROUND,W,6);drawFloorPlatform();
}
function drawMempool(){ // glowing tx streams in a dark cavern
  ctx.fillStyle="rgba(10,40,50,0.6)";
  for(var i=0;i<6;i++){var y=40+i*34;ctx.globalAlpha=0.3+0.1*Math.sin(Date.now()/600+i);
    var grd=ctx.createLinearGradient(0,y,W,y);grd.addColorStop(0,"rgba(13,160,180,0)");grd.addColorStop(0.5,"rgba(13,200,220,.5)");grd.addColorStop(1,"rgba(13,160,180,0)");
    ctx.fillStyle=grd;ctx.fillRect(0,y,W,3);}
  ctx.globalAlpha=1;
  // floating tx blocks
  for(var b=0;b<14;b++){var bx=(b*97+ (Date.now()/40))%W, by=50+((b*61)%180);ctx.fillStyle="rgba(20,120,140,.35)";ctx.fillRect(bx,by,16,12);ctx.strokeStyle="rgba(120,240,255,.4)";ctx.strokeRect(bx,by,16,12);}
  ctx.fillStyle="#04161c";ctx.fillRect(0,GROUND,W,H-GROUND);ctx.fillStyle="#0a3b44";ctx.fillRect(0,GROUND,W,6);drawFloorPlatform();
}
function drawVault(){ // cold storage — vault door + gold bars
  ctx.fillStyle="#1a160a";ctx.fillRect(0,0,W,GROUND);
  // giant vault door
  ctx.save();ctx.translate(W/2,GROUND-90);
  ctx.fillStyle="#3a3420";ctx.strokeStyle="#0a0a06";ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,110,0,7);ctx.fill();ctx.stroke();
  ctx.fillStyle="#2a2616";ctx.beginPath();ctx.arc(0,0,86,0,7);ctx.fill();ctx.stroke();
  ctx.strokeStyle="#f0b429";ctx.lineWidth=3;for(var s=0;s<8;s++){ctx.save();ctx.rotate(s/8*Math.PI*2);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,80);ctx.stroke();ctx.restore();}
  ctx.fillStyle="#6a5a2a";ctx.beginPath();ctx.arc(0,0,20,0,7);ctx.fill();ctx.strokeStyle="#0a0a06";ctx.stroke();
  ctx.restore();
  // gold bar stacks
  for(var g=0;g<5;g++){goldBar(40+g*12,GROUND-14);goldBar(W-120+g*12,GROUND-14);}
  goldBar(60,GROUND-26);goldBar(W-100,GROUND-26);
  ctx.fillStyle="#0e0c06";ctx.fillRect(0,GROUND,W,H-GROUND);ctx.fillStyle="#2a2410";ctx.fillRect(0,GROUND,W,6);drawFloorPlatform();
}
function goldBar(x,y){ctx.fillStyle="#f0b429";ctx.strokeStyle="#7a5a10";ctx.lineWidth=1.5;ctx.beginPath();roundRectPath(x,y,34,12,3);ctx.fill();ctx.stroke();ctx.fillStyle="rgba(255,255,255,.3)";ctx.fillRect(x+3,y+2,28,3);}
function drawCliffs(){ // stormy bear-market mountain (matches reference bg)
  var g=ctx.createLinearGradient(0,0,0,GROUND);g.addColorStop(0,"#0a0a14");g.addColorStop(1,"#3a1830");ctx.fillStyle=g;ctx.fillRect(0,0,W,GROUND);
  // down-candles rain
  ctx.globalAlpha=0.35;for(var i=0;i<30;i++){var rx=(i*53+Date.now()/30)%W;ctx.strokeStyle="#e74c3c";ctx.beginPath();ctx.moveTo(rx,(i*37)%GROUND);ctx.lineTo(rx-6,((i*37)%GROUND)+18);ctx.stroke();}ctx.globalAlpha=1;
  // jagged peaks
  ctx.fillStyle="#140a1a";ctx.beginPath();ctx.moveTo(0,GROUND);
  var pk=[0,120,80,200,40,260,110,340,60,430,130,520,70,620,120,720,90];
  for(var p=0;p<pk.length;p++){ctx.lineTo(p*45,GROUND- (pk[p]||80));}
  ctx.lineTo(W,GROUND);ctx.closePath();ctx.fill();
  // lightning flicker
  if(Math.random()<0.03){ctx.fillStyle="rgba(255,255,255,0.15)";ctx.fillRect(0,0,W,GROUND);}
  ctx.fillStyle="#0c0610";ctx.fillRect(0,GROUND,W,H-GROUND);ctx.fillStyle="#2a1430";ctx.fillRect(0,GROUND,W,6);drawFloorPlatform();
}
function drawMoon(){ // to the moon — craters + earth + stars
  ctx.fillStyle="#02040f";ctx.fillRect(0,0,W,GROUND);
  for(var s=0;s<70;s++){var sx=(s*101)%W,sy=(s*57)%GROUND;ctx.fillStyle="rgba(255,255,255,"+(0.3+(s%3)*0.2)+")";ctx.fillRect(sx,sy,2,2);}
  // earth
  ctx.save();ctx.translate(W-110,70);var eg=ctx.createRadialGradient(-10,-10,4,0,0,42);eg.addColorStop(0,"#6fb3ff");eg.addColorStop(1,"#143a7a");ctx.fillStyle=eg;ctx.beginPath();ctx.arc(0,0,42,0,7);ctx.fill();
  ctx.fillStyle="rgba(46,204,113,.6)";ctx.beginPath();ctx.arc(-12,6,10,0,7);ctx.arc(14,-8,8,0,7);ctx.fill();ctx.restore();
  // moon ground craters
  ctx.fillStyle="#3a3f4a";ctx.fillRect(0,GROUND,W,H-GROUND);
  for(var c=0;c<8;c++){ctx.fillStyle="rgba(0,0,0,.25)";ctx.beginPath();ctx.ellipse(40+c*90,GROUND+22,16,5,0,0,7);ctx.fill();}
  ctx.fillStyle="#4a505c";ctx.fillRect(0,GROUND,W,6);
}

// =================== INIT ===================
var GAME={screen:"title",raf:null,last:0,ladderIdx:0,projs:[],hitstop:0,freeze:0,announce:null,combo:null};
bindTouch();
draw();

// expose a tiny restart hook for the page button
window.fgStart=function(){ if(GAME.screen==="title")startLadder(); else { toTitle(); } };
})();
