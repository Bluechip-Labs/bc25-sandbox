(function(){
  "use strict";
  var fmt=function(n,d){d=d==null?2:d;return Number(n).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});};
  var usd=function(n){return "$"+fmt(n,2);};
  var BULLIMG='<img src="/bull-logo.png" class="bullimg" alt="">';
  function say(msg,face){var s=document.getElementById("mSay");if(s)s.innerHTML=msg;var f=document.getElementById("mFace");if(!f)return;if(face&&face!=="🐂"){f.textContent=face;}else{f.innerHTML=BULLIMG;}}
  var tEl=document.getElementById("toast"),tT;
  function toast(m){if(!tEl)return;tEl.textContent=m;tEl.classList.add("show");clearTimeout(tT);tT=setTimeout(function(){tEl.classList.remove("show");},2200);}
  var STAGEB=null;
  function loadStageB(){fetch("/stageb.json").then(function(r){return r.json();}).then(function(d){if(!d||!d.series||!d.series.index)return;STAGEB=d;if(typeof pg!=="undefined"&&pg&&pg.ready)pgRound();}).catch(function(){});}
  // ================= GAMES: Crypto Match =================
  var GICONS=[
    {e:"🐂",n:"BC25 Bull"},{e:"💎",n:"Diamond hands"},{e:"👀",n:"Laser eyes"},{e:"🚀",n:"Rocket"},
    {e:"🌙",n:"To the moon"},{e:"🐻",n:"Bear"},{e:"🥇",n:"Gold"},{e:"🔒",n:"HODL"},
    {e:"🐳",n:"Whale"},{e:"📈",n:"Pump"},{e:"🔥",n:"Fire"},{e:"🪙",n:"Coin"},
    {e:"🛡️",n:"Defender"},{e:"🦍",n:"Ape"},{e:"🧻",n:"Paper hands"},{e:"⚡",n:"Lightning"},
    {e:"💰",n:"Bag"},{e:"📉",n:"Dump"},{e:"🧲",n:"Magnet"},{e:"🎯",n:"Target"},
    {e:"🧠",n:"Big brain"},{e:"🫡",n:"Salute"},{e:"🖨️",n:"Printer"},{e:"🧊",n:"Cold wallet"},
    {e:"🔑",n:"Keys"},{e:"⛏️",n:"Mining"},{e:"🪂",n:"Airdrop"},{e:"🕯️",n:"Candle"},
    {e:"🐸",n:"Pepe"},{e:"🤡",n:"Clown"},{e:"🌈",n:"Rainbow"},{e:"🏦",n:"Bank"}];
  var DIFF={easy:4,medium:6,hard:8},CPUMEMP={easy:.55,medium:.78,hard:.95};
  var gDiff="easy",gMode="solo",gCols=4,gDeck=[],gUp=[],gMatched=0,gLock=false,
      gMoves=0,gStart=0,gTimer=null,gStarted=false,gTurn="you",gScoreYou=0,gScoreCpu=0,gCpuMem={},cpuWants=null;
  var gBoardEl=document.getElementById("gBoard");
  function gShuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
  function gLoad(){try{return JSON.parse(localStorage.getItem("bc25_games"))||{};}catch(e){return {};}}
  function gStore(o){try{localStorage.setItem("bc25_games",JSON.stringify(o));}catch(e){}}
  function buildDeck(){
    var cols=DIFF[gDiff];gCols=cols;var pairs=cols*cols/2;var pool=GICONS.slice(0,pairs);
    var cards=[];pool.forEach(function(ic){cards.push({id:ic.e,ic:ic});cards.push({id:ic.e,ic:ic});});
    gShuffle(cards);
    gDeck=cards.map(function(c,i){return {pos:i,id:c.id,ic:c.ic,face:false,matched:false,hot:false};});
  }
  function renderBoard(){
    if(!gBoardEl)return;gBoardEl.style.gridTemplateColumns="repeat("+gCols+",1fr)";
    gBoardEl.innerHTML=gDeck.map(function(c){
      var cls="gcard"+(c.matched?" matched":"")+(c.face?" up":"")+(c.hot?" cpu":"")+((c.face||c.matched)?" lock":"");
      var inner=(c.face||c.matched)?('<span>'+c.ic.e+'</span>'):'<span class="bk">❔</span>';
      return '<div class="'+cls+'" data-pos="'+c.pos+'">'+inner+'</div>';}).join("");
  }
  function pairsTotal(){return gDeck.length/2;}
  function updateStatus(){
    var el=document.getElementById("gStatus");if(!el)return;
    if(gMode==="solo"){var t=gStarted?((Date.now()-gStart)/1000):0;
      el.innerHTML="<span>Moves <b>"+gMoves+"</b></span><span>Time <b>"+t.toFixed(1)+"s</b></span><span>Pairs <b>"+gMatched+"/"+pairsTotal()+"</b></span>";}
    else{el.innerHTML="<span>You <b>"+gScoreYou+"</b></span><span>Bot 🤖 <b>"+gScoreCpu+"</b></span>"
      +"<span class='turn'>"+(gMatched===pairsTotal()?"":(gTurn==="you"?"Your turn":"Bot thinking…"))+"</span>";}
  }
  function maybeStart(){if(gStarted)return;gStarted=true;if(gMode==="solo"){gStart=Date.now();if(gTimer)clearInterval(gTimer);gTimer=setInterval(updateStatus,250);}}
  function rememberSee(pos){if(gMode!=="cpu")return;if(Math.random()<CPUMEMP[gDiff])gCpuMem[pos]=gDeck[pos].id;}
  function forgetId(id){for(var p in gCpuMem){if(gCpuMem[p]===id)delete gCpuMem[p];}}
  function availPos(){var a=[];for(var i=0;i<gDeck.length;i++){if(!gDeck[i].matched&&!gDeck[i].face)a.push(i);}return a;}
  function clearHot(){gDeck.forEach(function(c){c.hot=false;});}
  function playerFlip(pos){
    var c=gDeck[pos];if(c.face||c.matched)return;
    maybeStart();rememberSee(pos);c.face=true;gUp.push(pos);renderBoard();
    if(gUp.length===2){if(gMode==="solo")gMoves++;updateStatus();evaluate("you");}
  }
  function evaluate(who){
    gLock=true;var a=gDeck[gUp[0]],b=gDeck[gUp[1]],match=a.id===b.id;
    setTimeout(function(){
      clearHot();
      if(match){a.matched=b.matched=true;gUp=[];gMatched++;forgetId(a.id);
        if(who==="you")gScoreYou++;else gScoreCpu++;renderBoard();updateStatus();
        if(gMatched===pairsTotal()){gLock=false;return endGame();}
        gLock=false;if(gMode==="cpu"&&who==="cpu")cpuTurn();}
      else{a.face=b.face=false;gUp=[];renderBoard();gLock=false;
        if(gMode==="cpu"){gTurn=(who==="you")?"cpu":"you";updateStatus();if(gTurn==="cpu")cpuTurn();}}
    },match?430:820);
  }
  function findKnownPair(){var by={};for(var p in gCpuMem){var pos=+p;if(gDeck[pos].matched||gDeck[pos].face)continue;(by[gCpuMem[p]]=by[gCpuMem[p]]||[]).push(pos);}
    for(var id in by){if(by[id].length>=2)return [by[id][0],by[id][1]];}return null;}
  function cpuFirst(){var pair=findKnownPair();if(pair){cpuWants=pair[1];return pair[0];}
    var av=availPos(),unk=av.filter(function(p){return !(p in gCpuMem);});var arr=unk.length?unk:av;cpuWants=null;return arr[Math.floor(Math.random()*arr.length)];}
  function cpuSecond(id,first){
    if(cpuWants!=null&&!gDeck[cpuWants].matched&&!gDeck[cpuWants].face&&cpuWants!==first)return cpuWants;
    for(var p in gCpuMem){var pos=+p;if(pos!==first&&gCpuMem[p]===id&&!gDeck[pos].matched&&!gDeck[pos].face)return pos;}
    var av=availPos().filter(function(p){return p!==first;}),unk=av.filter(function(p){return !(p in gCpuMem);});var arr=unk.length?unk:av;return arr[Math.floor(Math.random()*arr.length)];}
  function cpuReveal(pos){var c=gDeck[pos];c.face=true;c.hot=true;gCpuMem[pos]=c.id;renderBoard();}
  function cpuTurn(){
    gLock=true;updateStatus();
    setTimeout(function(){var f=cpuFirst();cpuReveal(f);
      setTimeout(function(){var s=cpuSecond(gDeck[f].id,f);cpuReveal(s);gUp=[f,s];evaluate("cpu");},700);
    },700);
  }
  function endGame(){
    if(gTimer){clearInterval(gTimer);gTimer=null;}
    var r=document.getElementById("gResult");r.hidden=false;
    if(gMode==="solo"){var ms=Date.now()-gStart,rec=saveSolo(gDiff,gMoves,ms);
      r.innerHTML="🎉 Cleared "+pairsTotal()+" pairs in <b>"+gMoves+"</b> moves · <b>"+(ms/1000).toFixed(1)+"s</b>."+((rec.isNewMoves||rec.isNewTime)?" <b>🏅 New personal best!</b>":"");
      say("Sharp memory. 🧠🐂","🐂");}
    else{var win=gScoreYou>gScoreCpu?"you":(gScoreCpu>gScoreYou?"cpu":"tie");saveCpu(gDiff,win);
      r.innerHTML=win==="you"?"🏆 You beat the bot <b>"+gScoreYou+"–"+gScoreCpu+"</b>!":win==="cpu"?"🤖 Bot wins <b>"+gScoreCpu+"–"+gScoreYou+"</b> — rematch?":"🤝 Dead heat <b>"+gScoreYou+"–"+gScoreCpu+"</b>.";
      say(win==="you"?"You outplayed the bot. 🐂💪":win==="cpu"?"Bot got the better of you. Run it back. 🤖":"A tie — break it! 🐂","🐂");}
    renderHigh();
  }
  function saveSolo(diff,moves,ms){var o=gLoad();o.solo=o.solo||{};var c=o.solo[diff]||{};
    var isM=(c.bestMoves==null||moves<c.bestMoves),isT=(c.bestMs==null||ms<c.bestMs);
    o.solo[diff]={bestMoves:isM?moves:c.bestMoves,bestMs:isT?ms:c.bestMs};gStore(o);return {isNewMoves:isM,isNewTime:isT};}
  function saveCpu(diff,win){var o=gLoad();o.cpu=o.cpu||{};var c=o.cpu[diff]||{w:0,l:0,t:0};
    if(win==="you")c.w++;else if(win==="cpu")c.l++;else c.t++;o.cpu[diff]=c;gStore(o);}
  function renderHigh(){
    if(!document.getElementById("gHigh"))return;
    var o=gLoad(),rows=[["easy","Easy 4×4"],["medium","Medium 6×6"],["hard","Hard 8×8"]],html="";
    rows.forEach(function(d){var s=(o.solo||{})[d[0]]||{},c=(o.cpu||{})[d[0]]||{w:0,l:0,t:0};
      var solo=s.bestMoves!=null?(s.bestMoves+" mv · "+(s.bestMs/1000).toFixed(1)+"s"):"—";
      html+="<div class='ghrow'><span class='lab'>"+d[1]+"</span><span>Solo: <b>"+solo+"</b></span><span>vs Bot: <b>"+c.w+"–"+c.l+(c.t?"–"+c.t:"")+"</b></span></div>";});
    var pb=((o.price||{}).best)||0,rb=((o.run||{}).best)||0;
    html+="<div class='ghrow'><span class='lab'>Higher or Lower</span><span>Best streak: <b>"+pb+"</b></span><span></span></div>";
    html+="<div class='ghrow'><span class='lab'>Bull Run</span><span>Best score: <b>"+rb+"</b></span><span></span></div>";
    var qb=((o.quest||{}).best)||0;
    html+="<div class='ghrow'><span class='lab'>Defender's Quest</span><span>Best score: <b>"+qb+"</b></span><span></span></div>";
    document.getElementById("gHigh").innerHTML=html;
    var nn=document.getElementById("gHsNote");if(nn)nn.textContent="(saved on this device)";
  }
  function newGame(){
    if(gTimer){clearInterval(gTimer);gTimer=null;}
    gStarted=false;gMoves=0;gMatched=0;gUp=[];gLock=false;gScoreYou=0;gScoreCpu=0;gTurn="you";gCpuMem={};cpuWants=null;
    buildDeck();renderBoard();updateStatus();var r=document.getElementById("gResult");if(r)r.hidden=true;
  }
  function gamesShow(){if(!gDeck.length)newGame();if(!pg.ready)pgStart();runLoadBest();if(run.state==="idle")runIdleDraw();renderHigh();updateStatus();}

  // ---- Game 2: Higher or Lower (real Stage B series) ----
  var PGA=[{k:"index",label:"BC25",col:"#d4a73a"},{k:"btc",label:"Bitcoin",col:"#f7931a"},{k:"eth",label:"Ethereum",col:"#627eea"},{k:"sol",label:"Solana",col:"#14f195"}];
  var pg={ready:false,streak:0,best:0,A:null,iEnd:0,future:0,win:42,step:5,answered:false,lastWrong:false};
  function pgLoadBest(){var o=gLoad();pg.best=((o.price||{}).best)||0;}
  function pgSaveBest(){var o=gLoad();o.price=o.price||{};if(pg.best>(o.price.best||0)){o.price.best=pg.best;gStore(o);}}
  function pgRound(){
    if(!STAGEB||!STAGEB.series){document.getElementById("pgWho").textContent="Loading real data…";return;}
    pg.A=PGA[Math.floor(Math.random()*PGA.length)];
    var S=STAGEB.series[pg.A.k],minS=pg.win,maxS=S.length-pg.step-2;
    var i=minS+Math.floor(Math.random()*(maxS-minS));var guard=0;
    while(S[i+pg.step]===S[i]&&guard++<40){i++;if(i>maxS)i=minS;}
    pg.iEnd=i;pg.future=i+pg.step;pg.answered=false;pg.lastWrong=false;
    document.getElementById("pgWho").innerHTML="Asset: <b style='color:"+pg.A.col+"'>"+pg.A.label+"</b> · a week later it closed…";
    document.getElementById("pgResult").hidden=true;
    document.getElementById("pgUp").disabled=false;document.getElementById("pgDown").disabled=false;
    document.getElementById("pgNext").style.display="none";
    document.getElementById("pgStreak").textContent=pg.streak;document.getElementById("pgBest").textContent=pg.best;
    drawPG(false);
  }
  function drawPG(reveal){
    var c=document.getElementById("pgChart");if(!c)return;var x=c.getContext("2d"),W=c.width,H=c.height,P=26;
    x.clearRect(0,0,W,H);var cs=getComputedStyle(document.documentElement);
    var S=STAGEB.series[pg.A.k],a=pg.iEnd-pg.win+1,shown=[];for(var i=a;i<=pg.iEnd;i++)shown.push(S[i]);
    var futV=S[pg.future],up=futV>S[pg.iEnd];
    var pts=shown.slice(),endIdx=pg.win-1;
    if(reveal)pts=pts.concat([futV]);
    var mn=Math.min.apply(null,pts),mx=Math.max.apply(null,pts),pad=(mx-mn)*0.12||1;
    var n=pts.length-1;
    function X(i){return P+(W-2*P)*i/( (reveal?pg.win:pg.win-1) );}
    function Y(v){return H-P-(H-2*P)*(v-(mn-pad))/((mx+pad)-(mn-pad));}
    x.strokeStyle=cs.getPropertyValue('--line');x.lineWidth=1;[0,.5,1].forEach(function(f){var y=P+(H-2*P)*f;x.beginPath();x.moveTo(P,y);x.lineTo(W-P,y);x.stroke();});
    // known slice
    x.strokeStyle=pg.A.col;x.lineWidth=2.6;x.beginPath();for(var j=0;j<=endIdx;j++){var px=X(j),py=Y(shown[j]);j?x.lineTo(px,py):x.moveTo(px,py);}x.stroke();
    // marker at "now"
    x.fillStyle=pg.A.col;x.beginPath();x.arc(X(endIdx),Y(shown[endIdx]),3.5,0,7);x.fill();
    if(reveal){var col=up?"#37b26b":"#d9534f";x.strokeStyle=col;x.lineWidth=2.6;x.setLineDash([5,4]);
      x.beginPath();x.moveTo(X(endIdx),Y(shown[endIdx]));x.lineTo(X(pg.win),Y(futV));x.stroke();x.setLineDash([]);
      x.fillStyle=col;x.beginPath();x.arc(X(pg.win),Y(futV),4.5,0,7);x.fill();}
    else{x.fillStyle=cs.getPropertyValue('--muted');x.font="12px monospace";x.fillText("?",W-P-4,Y(shown[endIdx]));}
  }
  function pgAnswer(dir){
    if(pg.answered||!STAGEB)return;pg.answered=true;
    var S=STAGEB.series[pg.A.k],up=S[pg.future]>S[pg.iEnd],correct=(dir==="up")===up;
    var mv=(S[pg.future]/S[pg.iEnd]-1)*100;
    document.getElementById("pgUp").disabled=true;document.getElementById("pgDown").disabled=true;
    drawPG(true);
    var r=document.getElementById("pgResult");r.hidden=false;
    var moveTxt="<b>"+(up?"▲ higher":"▼ lower")+"</b> ("+(mv>=0?"+":"")+fmt(mv,1)+"%)";
    if(correct){pg.streak++;if(pg.streak>pg.best){pg.best=pg.streak;pgSaveBest();}
      r.innerHTML="✅ Right — "+pg.A.label+" went "+moveTxt+". Streak <b>"+pg.streak+"</b>."+(pg.streak===pg.best&&pg.streak>1?" 🏅 New best!":"");
      say("Called it. 🐂📈","🐂");
      document.getElementById("pgNext").textContent="Next ▶";}
    else{pg.lastWrong=true;
      r.innerHTML="❌ Nope — "+pg.A.label+" went "+moveTxt+". Final streak <b>"+pg.streak+"</b>. Best <b>"+pg.best+"</b>.";
      say("The market humbles us all. 🐻 Run it back.","🐻");
      document.getElementById("pgNext").textContent="Play again ▶";}
    document.getElementById("pgStreak").textContent=pg.streak;document.getElementById("pgBest").textContent=pg.best;
    document.getElementById("pgNext").style.display="";
    renderHigh();
  }
  function pgStart(){if(!document.getElementById("pgChart"))return;pg.ready=true;pg.streak=0;pgLoadBest();pgRound();}
  var _u=document.getElementById("pgUp");if(_u)_u.addEventListener("click",function(){pgAnswer("up");});
  var _d=document.getElementById("pgDown");if(_d)_d.addEventListener("click",function(){pgAnswer("down");});
  var _n=document.getElementById("pgNext");if(_n)_n.addEventListener("click",function(){if(pg.lastWrong)pg.streak=0;pgRound();});

  // ---- Game 3: Bull Run (3-lane endless runner) ----
  var runCv=document.getElementById("runCanvas"),runX=runCv?runCv.getContext("2d"):null;
  var bullImg=new Image();bullImg.src="/bull-logo.png";var bullOk=false;bullImg.onload=function(){bullOk=true;};
  var RW=360,RH=460,LANES=[RW*0.22,RW*0.5,RW*0.78],PLY=RH-70;
  var run={state:"idle",lane:1,px:LANES[1],ent:[],speed:0,elapsed:0,spawnT:0,score:0,best:0,jumpT:0,jumpDur:0.62,roadOff:0,last:0,raf:0};
  function runLoadBest(){var o=gLoad();run.best=((o.run||{}).best)||0;var rb=document.getElementById("runBest");if(rb)rb.textContent=run.best;}
  function runSaveBest(){var o=gLoad();o.run=o.run||{};if(run.score>(o.run.best||0)){o.run.best=Math.floor(run.score);gStore(o);}}
  function isGamesView(){var s=document.querySelector('section[data-view="games"]');return s&&!s.hidden;}
  function runReset(){run.lane=1;run.px=LANES[1];run.ent=[];run.speed=165;run.elapsed=0;run.spawnT=0.6;run.score=0;run.jumpT=0;run.roadOff=0;run.last=0;}
  function runStartGame(){runReset();run.state="play";document.getElementById("runOverlay").classList.add("hide");run.raf=requestAnimationFrame(runLoop);}
  function runPause(){if(run.state==="play"){run.state="paused";cancelAnimationFrame(run.raf);var ov=document.getElementById("runOverlay"),ms=document.getElementById("runMsg"),st=document.getElementById("runStart");if(ov){ov.classList.remove("hide");st.textContent="▶ Resume";ms.textContent="Paused";}}}
  function runResume(){if(run.state==="paused"){run.state="play";document.getElementById("runOverlay").classList.add("hide");run.last=0;run.raf=requestAnimationFrame(runLoop);}}
  function runOver(){run.state="over";cancelAnimationFrame(run.raf);runSaveBest();runLoadBest();
    var ov=document.getElementById("runOverlay"),ms=document.getElementById("runMsg"),st=document.getElementById("runStart");
    ov.classList.remove("hide");st.textContent="🔁 Run again";
    ms.innerHTML="🐻 The bears caught you! Score <b>"+Math.floor(run.score)+"</b>"+(Math.floor(run.score)>=run.best?" — 🏅 new best!":" · Best "+run.best);
    say("The bears got the bull this time. Run it back! 🐂","🐻");renderHigh();}
  function runSpawn(){var lane=Math.floor(Math.random()*3),r=Math.random(),type=r<0.55?"bear":(r<0.8?"coin":"barrier");
    run.ent.push({type:type,lane:lane,y:-30,dead:false});}
  function runLane(d){if(run.state!=="play")return;run.lane=Math.max(0,Math.min(2,run.lane+d));}
  function runJump(){if(run.state==="play"&&run.jumpT<=0)run.jumpT=run.jumpDur;}
  function runStep(dt){
    run.elapsed+=dt;run.speed=Math.min(440,165+run.elapsed*7);
    run.px+=(LANES[run.lane]-run.px)*Math.min(1,dt*12);
    if(run.jumpT>0)run.jumpT-=dt;
    run.spawnT-=dt;if(run.spawnT<=0){runSpawn();run.spawnT=Math.max(0.46,1.05-run.elapsed*0.012);}
    run.roadOff=(run.roadOff+run.speed*dt)%44;
    var air=run.jumpT>0;
    for(var i=0;i<run.ent.length;i++){var e=run.ent[i];if(e.dead)continue;e.y+=run.speed*dt;
      if(!e.scored&&e.lane===run.lane&&Math.abs(e.y-PLY)<26){
        if(e.type==="coin"){run.score+=5;e.dead=true;e.scored=true;}
        else if(e.type==="barrier"){if(!air){return runOver();}}
        else {return runOver();} // bear
      }
      if(e.y>PLY+34)e.scored=true; // passed
    }
    run.ent=run.ent.filter(function(e){return !e.dead&&e.y<RH+40;});
    run.score+=run.speed*dt*0.02;
    var sc=document.getElementById("runScore");if(sc)sc.textContent=Math.floor(run.score);
  }
  function runRender(){
    if(!runX)return;var x=runX;x.clearRect(0,0,RW,RH);
    // road
    x.fillStyle="#0b1326";x.fillRect(0,0,RW,RH);
    x.strokeStyle="rgba(255,255,255,.10)";x.lineWidth=2;
    [RW*0.36,RW*0.64].forEach(function(bx){x.setLineDash([16,16]);x.lineDashOffset=-run.roadOff;x.beginPath();x.moveTo(bx,0);x.lineTo(bx,RH);x.stroke();});
    x.setLineDash([]);
    // entities
    x.textAlign="center";x.textBaseline="middle";
    run.ent.forEach(function(e){var ex=LANES[e.lane];
      if(e.type==="bear"){x.font="30px serif";x.fillText("🐻",ex,e.y);}
      else if(e.type==="coin"){x.font="24px serif";x.fillText("🪙",ex,e.y);}
      else{x.fillStyle="#d9534f";var w=38,h=16;roundRect(x,ex-w/2,e.y-h/2,w,h,5);x.fill();x.fillStyle="#fff";x.font="bold 11px monospace";x.fillText("▼ dip",ex,e.y);}
    });
    // player
    var air=run.jumpT>0,prog=air?Math.sin((1-run.jumpT/run.jumpDur)*Math.PI):0,lift=prog*48;
    x.fillStyle="rgba(0,0,0,.35)";x.beginPath();x.ellipse(run.px,PLY+22,20-prog*8,6-prog*3,0,0,7);x.fill();
    var sz=46+prog*6;
    if(bullOk){x.drawImage(bullImg,run.px-sz/2,PLY-sz/2-lift,sz,sz);}
    else{x.font="34px serif";x.fillText("🐂",run.px,PLY-lift);}
  }
  function roundRect(x,X,Y,w,h,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();}
  function runLoop(ts){if(run.state!=="play")return;if(!run.last)run.last=ts;var dt=Math.min(0.05,(ts-run.last)/1000);run.last=ts;runStep(dt);if(run.state!=="play")return;runRender();run.raf=requestAnimationFrame(runLoop);}
  function runIdleDraw(){runReset();runRender();}
  // controls
  if(runCv){
    var sx=0,sy=0,st0=0;
    runCv.addEventListener("touchstart",function(e){var t=e.changedTouches[0];sx=t.clientX;sy=t.clientY;st0=Date.now();},{passive:true});
    runCv.addEventListener("touchend",function(e){var t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
      if(run.state!=="play"){return;}
      if(Math.abs(dx)<24&&Math.abs(dy)<24){runJump();return;} // tap
      if(Math.abs(dx)>Math.abs(dy)){runLane(dx>0?1:-1);}else if(dy<0){runJump();}
    },{passive:true});
  }
  var rL=document.getElementById("runL");if(rL)rL.addEventListener("click",function(){runLane(-1);});
  var rR=document.getElementById("runR");if(rR)rR.addEventListener("click",function(){runLane(1);});
  var rJ=document.getElementById("runJ");if(rJ)rJ.addEventListener("click",runJump);
  var rS=document.getElementById("runStart");if(rS)rS.addEventListener("click",function(){if(run.state==="paused")runResume();else runStartGame();});
  document.addEventListener("keydown",function(e){
    if(!isGamesView()||run.state!=="play")return;
    var k=e.key;
    if(k==="ArrowLeft"||k==="a"||k==="A"){runLane(-1);e.preventDefault();}
    else if(k==="ArrowRight"||k==="d"||k==="D"){runLane(1);e.preventDefault();}
    else if(k==="ArrowUp"||k==="w"||k==="W"||k===" "){runJump();e.preventDefault();}
  });
  document.addEventListener("visibilitychange",function(){if(document.hidden)runPause();});
  function gSetActive(seg,btn){document.getElementById(seg).querySelectorAll(".gbtn").forEach(function(b){b.classList.toggle("active",b===btn);});}
  if(gBoardEl)gBoardEl.addEventListener("click",function(e){var el=e.target.closest(".gcard");if(!el)return;
    if(gLock)return;if(gMode==="cpu"&&gTurn!=="you")return;playerFlip(+el.getAttribute("data-pos"));});
  var gDiffEl=document.getElementById("gDiff");if(gDiffEl)gDiffEl.addEventListener("click",function(e){var b=e.target.closest(".gbtn");if(!b)return;gSetActive("gDiff",b);gDiff=b.getAttribute("data-diff");newGame();});
  var gModeEl=document.getElementById("gMode");if(gModeEl)gModeEl.addEventListener("click",function(e){var b=e.target.closest(".gbtn");if(!b)return;gSetActive("gMode",b);gMode=b.getAttribute("data-mode");newGame();});
  var gNewEl=document.getElementById("gNew");if(gNewEl)gNewEl.addEventListener("click",newGame);
  // ================= Game 4: Defender's Quest (top-down Zelda-like) =================
  var DQ_MAPS=[
    ["################",
     "#P.....C#..C..b#",
     "#..F....#....$.#",
     "#.......#......#",
     "#...b...#..C...#",
     "#.O.....G......#",
     "#.......G....C.#",
     "#...C...#......#",
     "#.......#.....>#",
     "#..b...C#......#",
     "#.......#...C..#",
     "################"],
    ["################",
     "#g....C.....~~.#",
     "#...SS....~~..>#",
     "#....SS...~~...#",
     "#C....g....C...#",
     "#..~~.....SS...#",
     "#..~~..K..SS...#",
     "#.........g....#",
     "#<....C....$...#",
     "#...SS.........#",
     "#.g....C....C..#",
     "################"],
    ["################",
     "#<...c....C#...#",
     "#....~~...c#...#",
     "#..c.......#...#",
     "#C....SS...#...#",
     "#..........#...#",
     "#....c...O.G..>#",
     "#.....SS...#...#",
     "#C.........#...#",
     "#..~~......#...#",
     "#.c....C..$#...#",
     "################"],
    ["################",
     "#<....~~.......#",
     "#..SS...~~..C..#",
     "#....~~....SS..#",
     "#g....C...~~...#",
     "#.~~..SS......>#",
     "#.~~....C..g...#",
     "#....SS...~~...#",
     "#C.....~~....C.#",
     "#..g....SS.....#",
     "#....C....~~...#",
     "################"],
    ["################",
     "#<...c....C#...#",
     "#...F......#...#",
     "#.....SS...#...#",
     "#C....SS..c#...#",
     "#..........#..C#",
     "#....c.....G..>#",
     "#.....SS...#...#",
     "#C.........#...#",
     "#..~~......#...#",
     "#.c....C..$#...#",
     "################"],
    ["################",
     "#<....C...C....#",
     "#..F.........$.#",
     "#......gg......#",
     "#C...$.....C...#",
     "#.....SS.......#",
     "#..$.......$..>#",
     "#.....SS.......#",
     "#C....g....C...#",
     "#..$.......$...#",
     "#....C...C.....#",
     "################"],
    ["################",
     "#..............#",
     "#....C....C....#",
     "#..............#",
     "#..............#",
     "#......B.......#",
     "#<.............#",
     "#..............#",
     "#...C......C...#",
     "#..............#",
     "#..............#",
     "################"]
  ];
  var DQ_ROOMNAMES=["Oracle Gate","Mempool Caverns","Whale Tunnels","Rug-Pull Ravine","Vault Approach","Cold Storage","The Bear Market's Lair"];
  var DQ_RIDDLES=[
    {q:"I have no bank and no CEO. My ledger is public, my supply is fixed at 21 million. What am I?",a:0,opts:["Bitcoin","A checking account","A company stock"]},
    {q:"Investors lose their nerve and sell everything on the way down. Three letters name this panic.",a:1,opts:["APY","FUD","NFT"]},
    {q:"The only wallet a hacker can never reach over the internet. Which is it?",a:2,opts:["A hot wallet","An exchange account","A cold (offline) wallet"]},
    {q:"BC25's whole defensive idea in four words: on the way down, you aim to…",a:1,opts:["Win bigger","Lose less","Do nothing"]},
    {q:"Twelve to twenty-four of these words can restore your whole wallet. Guard them with your life.",a:0,opts:["Seed phrase","Gas fees","Ticker symbols"]}
  ];
  var DQ={on:false,cv:null,cx:null,raf:null,last:0,state:"title",
    T:30,COLS:16,ROWS:12,room:0,rooms:null,
    px:0,py:0,pr:11,spd:120,face:"down",atk:0,swing:0,inv:0,
    hp:4,maxHp:4,coins:0,diamonds:0,hasKey:false,armor:0,sword:0,
    key:{up:false,down:false,left:false,right:false},
    score:0,best:0,visited:null,xcool:0,riddleIdx:0,bossMax:0};
  DQ.cv=document.getElementById("dqCanvas");DQ.cx=DQ.cv?DQ.cv.getContext("2d"):null;
  var DQ_COST_A=[20,45,80],DQ_COST_S=[25,55,95];
  function dqBest(){var o=gLoad();return ((o.quest||{}).best)||0;}
  function dqSaveBest(s){var o=gLoad();o.quest=o.quest||{};if(s>(o.quest.best||0)){o.quest.best=s;gStore(o);}renderHigh();}
  function dqParse(){
    DQ.rooms=DQ_MAPS.map(function(map,ri){
      var grid=[],coins=[],dias=[],keys=[],mons=[],spikes=[],exitE=null,exitW=null,forge=[],oracle=null,boss=null,start=null,gate=null;
      for(var y=0;y<map.length;y++){var row=map[y].split(""),g=[];
        for(var x=0;x<row.length;x++){var ch=row[x],t=".";
          if(ch==="#")t="#";else if(ch==="~")t="~";else if(ch==="S")t="S";
          else if(ch==="F"){t="F";forge.push({x:x,y:y});}
          else if(ch==="O"){t="O";oracle={x:x,y:y};}
          else if(ch==="G"){t="G";gate={x:x,y:y};}
          else if(ch===">"){t=">";exitE={x:x,y:y};}
          else if(ch==="<"){t="<";exitW={x:x,y:y};}
          else{ // floor + entity
            if(ch==="C")coins.push({x:x,y:y});
            else if(ch==="$")dias.push({x:x,y:y});
            else if(ch==="K")keys.push({x:x,y:y});
            else if(ch==="P")start={x:x,y:y};
            else if(ch==="b")mons.push(dqMob("bear",x,y,ri));
            else if(ch==="g")mons.push(dqMob("fud",x,y,ri));
            else if(ch==="c")mons.push(dqMob("crab",x,y,ri));
            else if(ch==="B")boss=dqBoss(x,y);
          }
          g.push(t);}
        grid.push(g);}
      return {grid:grid,coins:coins,dias:dias,keys:keys,mons:mons,forge:forge,oracle:oracle,gate:gate,
              exitE:exitE,exitW:exitW,boss:boss,start:start,gateOpen:false,gateType:(oracle?"riddle":"key"),treasure:null,cleared:false};
    });
  }
  function dqMob(type,gx,gy,ri){var T=DQ.T,base={x:gx*T+T/2,y:gy*T+T/2,hit:-1};
    if(type==="bear"){base.hp=2+ri;base.spd=39;base.dmg=1;base.r=13;base.emoji="🐻";}
    else if(type==="fud"){base.hp=2;base.spd=53;base.dmg=1;base.r=11;base.emoji="👺";}
    else{base.hp=2;base.spd=46;base.dmg=1;base.r=11;base.emoji="🦀";base.bob=Math.random()*6;}
    base.type=type;return base;}
  function dqBoss(gx,gy){var T=DQ.T;return {x:gx*T+T/2,y:gy*T+T/2,hp:16,maxhp:16,spd:35,dmg:1,r:22,hit:-1,type:"boss",emoji:"🐻"};}
  function dqResetProgress(){
    dqParse();DQ.room=0;DQ.coins=0;DQ.diamonds=0;DQ.hasKey=false;DQ.armor=0;DQ.sword=0;
    DQ.hp=4;DQ.maxHp=4;DQ.score=0;DQ.inv=0;DQ.atk=0;DQ.face="down";DQ.xcool=0;
    DQ.visited={0:true};DQ.best=dqBest();
    var s=DQ.rooms[0].start||{x:1,y:1};DQ.px=s.x*DQ.T+DQ.T/2;DQ.py=s.y*DQ.T+DQ.T/2;
    DQ.key={up:false,down:false,left:false,right:false};
  }
  function dqSolid(gx,gy){var r=DQ.rooms[DQ.room];if(gx<0||gy<0||gy>=r.grid.length||gx>=r.grid[0].length)return true;
    var t=r.grid[gy][gx];if(t==="#"||t==="F"||t==="O"||t==="~")return true;if(t==="G"&&!r.gateOpen)return true;return false;}
  function dqHitsWall(nx,ny){var T=DQ.T,r=DQ.pr;
    var pts=[[nx-r,ny-r],[nx+r,ny-r],[nx-r,ny+r],[nx+r,ny+r]];
    for(var i=0;i<pts.length;i++){if(dqSolid(Math.floor(pts[i][0]/T),Math.floor(pts[i][1]/T)))return true;}return false;}
  function dqTileAt(x,y){var T=DQ.T,r=DQ.rooms[DQ.room];var gx=Math.floor(x/T),gy=Math.floor(y/T);
    if(gy<0||gx<0||gy>=r.grid.length||gx>=r.grid[0].length)return ".";return r.grid[gy][gx];}
  function dqGoRoom(dir){ // dir "E" -> next, "W" -> prev
    var T=DQ.T;
    if(dir==="E"){var nr=DQ.room+1;if(nr>=DQ.rooms.length)return;DQ.room=nr;DQ.visited[nr]=true;
      var e=DQ.rooms[nr].exitW;DQ.px=(e?e.x:1)*T+T+2;DQ.py=(e?e.y:6)*T+T/2;}
    else{var pr=DQ.room-1;if(pr<0)return;DQ.room=pr;DQ.visited[pr]=true;
      var e2=DQ.rooms[pr].exitE;DQ.px=(e2?e2.x:14)*T-2;DQ.py=(e2?e2.y:6)*T+T/2;}
    DQ.xcool=0.5;dqSay(DQ_ROOMNAMES[DQ.room]);
  }
  function dqSay(name){var el=document.getElementById("dqMsg");say("<b>"+name+"</b> — onward, Defender. 🛡️","🛡️");if(el)el.textContent=name;}
  function dqNear(obj,maxT){if(!obj)return false;var T=DQ.T;var cx=obj.x*T+T/2,cy=obj.y*T+T/2;
    return Math.hypot(cx-DQ.px,cy-DQ.py)<(maxT||1.4)*T;}
  function dqInteract(){
    if(DQ.state!=="play")return;var r=DQ.rooms[DQ.room];
    if(r.oracle&&!r.gateOpen&&r.gateType==="riddle"&&dqNear(r.oracle,1.6)){dqOpenRiddle();return;}
    for(var i=0;i<r.forge.length;i++){if(dqNear(r.forge[i],1.6)){dqOpenShop();return;}}
    toast("Nothing to use here");
  }
  function dqOpenRiddle(){DQ.state="riddle";DQ.riddleIdx=DQ.room%DQ_RIDDLES.length;var rid=DQ_RIDDLES[DQ.riddleIdx];
    document.getElementById("dqRiddleQ").textContent="🔮 "+rid.q;
    document.getElementById("dqRiddleOpts").innerHTML=rid.opts.map(function(o,i){return '<button class="dqopt" data-i="'+i+'">'+o+'</button>';}).join("");
    document.getElementById("dqRiddle").hidden=false;say("The Oracle poses a riddle…","🔮");}
  function dqAnswer(i){var rid=DQ_RIDDLES[DQ.riddleIdx];document.getElementById("dqRiddle").hidden=true;DQ.state="play";dqEnsureLoop();
    if(i===rid.a){DQ.rooms[DQ.room].gateOpen=true;toast("✅ Correct — the gate opens!");say("The gate grinds open. Well reasoned. 🛡️","🛡️");}
    else{toast("❌ Not quite — try again");say("The Oracle shakes its head. Approach again to retry.","🔮");}
  }
  function dqOpenShop(){DQ.state="shop";dqRenderShop();document.getElementById("dqShop").hidden=false;say("The Forge glows. Spend your coins. 🔨","🔨");}
  function dqRenderShop(){
    var aMax=DQ.armor>=DQ_COST_A.length,sMax=DQ.sword>=DQ_COST_S.length;
    var aCost=aMax?0:DQ_COST_A[DQ.armor],sCost=sMax?0:DQ_COST_S[DQ.sword];
    var h="<div class='dqrow'><span>🪙 Coins: <b>"+DQ.coins+"</b></span><span>❤ Max HP "+DQ.maxHp+" · 🗡️ Dmg "+(1+DQ.sword)+"</span></div>";
    h+="<div class='dqrow'><span>🛡️ Armor "+(aMax?"MAX":"Lv"+(DQ.armor+1)+" · +1 heart")+"</span>"+(aMax?"<span>—</span>":"<button class='btn' data-buy='armor' "+(DQ.coins<aCost?"disabled":"")+">"+aCost+" 🪙</button>")+"</div>";
    h+="<div class='dqrow'><span>🗡️ Sword "+(sMax?"MAX":"Lv"+(DQ.sword+1)+" · +1 dmg")+"</span>"+(sMax?"<span>—</span>":"<button class='btn' data-buy='sword' "+(DQ.coins<sCost?"disabled":"")+">"+sCost+" 🪙</button>")+"</div>";
    document.getElementById("dqShopBody").innerHTML=h;}
  function dqBuy(what){
    if(what==="armor"&&DQ.armor<DQ_COST_A.length&&DQ.coins>=DQ_COST_A[DQ.armor]){DQ.coins-=DQ_COST_A[DQ.armor];DQ.armor++;DQ.maxHp++;DQ.hp++;toast("🛡️ Armor upgraded");}
    else if(what==="sword"&&DQ.sword<DQ_COST_S.length&&DQ.coins>=DQ_COST_S[DQ.sword]){DQ.coins-=DQ_COST_S[DQ.sword];DQ.sword++;toast("🗡️ Sword upgraded");}
    dqRenderShop();dqSyncHud();}
  function dqCloseShop(){document.getElementById("dqShop").hidden=true;DQ.state="play";dqEnsureLoop();}
  function dqSyncHud(){
    var hud=document.getElementById("dqHud");if(hud){var h="";for(var i=0;i<DQ.maxHp;i++)h+=(i<DQ.hp?"❤":"🖤");hud.innerHTML=h+" &nbsp; 🪙"+DQ.coins+" &nbsp; 💎"+DQ.diamonds+(DQ.hasKey?" &nbsp; 🔑":"");}
    var vis=DQ.visited?Object.keys(DQ.visited).length:0;
    DQ.score=DQ.coins*10+DQ.diamonds*50+vis*100+(DQ.rooms&&DQ.rooms[3]&&DQ.rooms[3].cleared?1000:0);
    var sc=document.getElementById("dqScore");if(sc)sc.textContent=DQ.score;
    var bs=document.getElementById("dqBest");if(bs)bs.textContent=Math.max(DQ.best,DQ.score);}
  function dqHurt(dmg){if(DQ.inv>0)return;DQ.hp-=dmg;DQ.inv=1.0;dqSyncHud();
    if(DQ.hp<=0){DQ.hp=0;dqOver(false);}else{say("Hit! Shields holding. 🛡️","😣");}}
  function dqAttack(){if(DQ.state!=="play"||DQ.atk>0)return;DQ.atk=0.22;DQ.swing++;}
  function dqSwingBox(){var T=DQ.T,reach=18+DQ.sword*5,w=20;
    if(DQ.face==="up")return{x:DQ.px-w,y:DQ.py-DQ.pr-reach,w:w*2,h:reach};
    if(DQ.face==="down")return{x:DQ.px-w,y:DQ.py+DQ.pr,w:w*2,h:reach};
    if(DQ.face==="left")return{x:DQ.px-DQ.pr-reach,y:DQ.py-w,w:reach,h:w*2};
    return{x:DQ.px+DQ.pr,y:DQ.py-w,w:reach,h:w*2};}
  function dqCircleRect(cx,cy,cr,r){var nx=Math.max(r.x,Math.min(cx,r.x+r.w)),ny=Math.max(r.y,Math.min(cy,r.y+r.h));return Math.hypot(cx-nx,cy-ny)<cr;}
  function dqUpdate(dt){
    var r=DQ.rooms[DQ.room],T=DQ.T;
    if(DQ.inv>0)DQ.inv-=dt;if(DQ.atk>0)DQ.atk-=dt;if(DQ.xcool>0)DQ.xcool-=dt;
    // movement
    var vx=0,vy=0;if(DQ.key.left)vx-=1;if(DQ.key.right)vx+=1;if(DQ.key.up)vy-=1;if(DQ.key.down)vy+=1;
    if(vx||vy){var m=Math.hypot(vx,vy);vx/=m;vy/=m;
      if(Math.abs(vx)>Math.abs(vy))DQ.face=vx<0?"left":"right";else DQ.face=vy<0?"up":"down";
      var nx=DQ.px+vx*DQ.spd*dt,ny=DQ.py+vy*DQ.spd*dt;
      if(!dqHitsWall(nx,DQ.py))DQ.px=nx;if(!dqHitsWall(DQ.px,ny))DQ.py=ny;}
    // spikes (toggle ~1.2s cycle, dangerous 0.5s)
    var phase=(DQ.last/1000)%1.5,spikeOn=phase>1.0;
    if(spikeOn&&dqTileAt(DQ.px,DQ.py)==="S")dqHurt(1);
    // exits
    if(DQ.xcool<=0){var tt=dqTileAt(DQ.px,DQ.py);if(tt===">")dqGoRoom("E");else if(tt==="<")dqGoRoom("W");}
    // key gate (auto-open on contact)
    if(r.gate&&!r.gateOpen&&r.gateType==="key"&&DQ.hasKey){
      if(Math.hypot((r.gate.x+.5)*T-DQ.px,(r.gate.y+.5)*T-DQ.py)<1.3*T){r.gateOpen=true;DQ.hasKey=false;toast("🔑 The key turns — gate open!");dqSyncHud();}}
    // pickups
    function grab(list,rad,cb){for(var i=list.length-1;i>=0;i--){var o=list[i],cx=o.x*T+T/2,cy=o.y*T+T/2;
      if(Math.hypot(cx-DQ.px,cy-DQ.py)<rad){list.splice(i,1);cb();}}}
    grab(r.coins,17,function(){DQ.coins++;dqSyncHud();});
    grab(r.dias,18,function(){DQ.diamonds++;toast("💎 Diamond!");dqSyncHud();});
    grab(r.keys,18,function(){DQ.hasKey=true;toast("🔑 Private key acquired");dqSyncHud();});
    if(r.treasure){var cx=r.treasure.x*T+T/2,cy=r.treasure.y*T+T/2;if(Math.hypot(cx-DQ.px,cy-DQ.py)<20){dqOver(true);return;}}
    // monsters
    var swbox=DQ.atk>0?dqSwingBox():null;
    for(var i=r.mons.length-1;i>=0;i--){var mo=r.mons[i];
      var dx=DQ.px-mo.x,dy=DQ.py-mo.y,d=Math.hypot(dx,dy)||1;
      if(mo.type==="crab"){mo.bob+=dt*3;mo.x+=Math.cos(mo.bob)*mo.spd*dt;}
      else{mo.x+=dx/d*mo.spd*dt;mo.y+=dy/d*mo.spd*dt;}
      // keep off walls
      if(dqSolidPt(mo.x,mo.y)){mo.x-=dx/d*mo.spd*dt;mo.y-=dy/d*mo.spd*dt;}
      if(d<mo.r+DQ.pr)dqHurt(mo.dmg);
      if(swbox&&mo.hit!==DQ.swing&&dqCircleRect(mo.x,mo.y,mo.r,swbox)){mo.hit=DQ.swing;mo.hp-=(1+DQ.sword);
        if(mo.hp<=0){r.mons.splice(i,1);if(Math.random()<0.5){r.coins.push({x:Math.round((mo.x-T/2)/T),y:Math.round((mo.y-T/2)/T)});}DQ.coins+=1;dqSyncHud();}}}
    // boss
    if(r.boss){var bo=r.boss,bdx=DQ.px-bo.x,bdy=DQ.py-bo.y,bd=Math.hypot(bdx,bdy)||1;
      bo.x+=bdx/bd*bo.spd*dt;bo.y+=bdy/bd*bo.spd*dt;if(dqSolidPt(bo.x,bo.y)){bo.x-=bdx/bd*bo.spd*dt;bo.y-=bdy/bd*bo.spd*dt;}
      if(bd<bo.r+DQ.pr)dqHurt(bo.dmg);
      if(swbox&&bo.hit!==DQ.swing&&dqCircleRect(bo.x,bo.y,bo.r,swbox)){bo.hit=DQ.swing;bo.hp-=(1+DQ.sword);
        if(bo.hp<=0){r.boss=null;r.cleared=true;r.treasure={x:Math.round((bo.x-T/2)/T),y:Math.round((bo.y-T/2)/T)};toast("The Bear Market falls!");say("The Bear Market is slain — claim the vault! 🐂","🐂");dqSyncHud();}}}
  }
  function dqSolidPt(x,y){return dqSolid(Math.floor(x/DQ.T),Math.floor(y/DQ.T));}
  function dqDraw(){
    var cx=DQ.cx,T=DQ.T,r=DQ.rooms?DQ.rooms[DQ.room]:null;if(!cx)return;
    cx.clearRect(0,0,DQ.cv.width,DQ.cv.height);
    if(!r){return;}
    var phase=(DQ.last/1000)%1.5,spikeOn=phase>1.0;
    for(var y=0;y<r.grid.length;y++)for(var x=0;x<r.grid[0].length;x++){var t=r.grid[y][x],px=x*T,py=y*T;
      if(t==="#"){cx.fillStyle="#1b2a4a";cx.fillRect(px,py,T,T);cx.fillStyle="#24375f";cx.fillRect(px+2,py+2,T-4,T-4);}
      else{cx.fillStyle=((x+y)%2?"#101c38":"#0d1832");cx.fillRect(px,py,T,T);}
      if(t==="~"){cx.fillStyle="#060a16";cx.fillRect(px+3,py+3,T-6,T-6);cx.fillStyle="#d1495b";cx.font="13px sans-serif";cx.fillText("⚠",px+8,py+20);}
      else if(t==="S"){cx.fillStyle=spikeOn?"#e05a6b":"#39507e";cx.font="18px sans-serif";cx.textAlign="center";cx.fillText(spikeOn?"🔺":"▫",px+T/2,py+T-8);cx.textAlign="left";}
      else if(t==="G"&&!r.gateOpen){cx.fillStyle="#caa33a";cx.fillRect(px+3,py,T-6,T);cx.fillStyle="#201700";cx.font="14px sans-serif";cx.fillText(r.gateType==="key"?"🔒":"⛩",px+6,py+20);}
      else if(t===">"||t==="<"){cx.fillStyle="#0a1326";cx.fillRect(px+2,py+2,T-4,T-4);cx.fillStyle="#9fb4e0";cx.font="16px sans-serif";cx.textAlign="center";cx.fillText(t===">"?"➡":"⬅",px+T/2,py+T/2+6);cx.textAlign="left";}
      else if(t==="F"){cx.font="20px sans-serif";cx.textAlign="center";cx.fillText("🔨",px+T/2,py+T/2+7);cx.textAlign="left";}
      else if(t==="O"){cx.font="20px sans-serif";cx.textAlign="center";cx.fillText("🔮",px+T/2,py+T/2+7);cx.textAlign="left";}
    }
    cx.textAlign="center";cx.textBaseline="middle";cx.font="19px sans-serif";
    r.coins.forEach(function(o){cx.fillText("🪙",o.x*T+T/2,o.y*T+T/2);});
    r.dias.forEach(function(o){cx.fillText("💎",o.x*T+T/2,o.y*T+T/2);});
    r.keys.forEach(function(o){cx.fillText("🔑",o.x*T+T/2,o.y*T+T/2);});
    if(r.treasure){cx.font="24px sans-serif";cx.fillText("🏆",r.treasure.x*T+T/2,r.treasure.y*T+T/2);cx.font="19px sans-serif";}
    r.mons.forEach(function(m){cx.font="20px sans-serif";cx.fillText(m.emoji,m.x,m.y);});
    if(r.boss){cx.font="40px sans-serif";cx.fillText("🐻",r.boss.x,r.boss.y);
      // boss hp bar
      cx.fillStyle="#2a3550";cx.fillRect(r.boss.x-30,r.boss.y-34,60,6);cx.fillStyle="#d1495b";cx.fillRect(r.boss.x-30,r.boss.y-34,60*Math.max(0,r.boss.hp/r.boss.maxhp),6);}
    cx.textAlign="left";cx.textBaseline="alphabetic";
    // player — blue knight
    dqDrawKnight(cx,DQ.px,DQ.py);
    // swing arc
    if(DQ.atk>0){var b=dqSwingBox();cx.fillStyle="rgba(140,180,255,.55)";cx.fillRect(b.x,b.y,b.w,b.h);}
  }
  function dqDrawKnight(cx,x,y){
    var flick=DQ.inv>0&&Math.floor(DQ.last/80)%2===0;if(flick)return;
    cx.save();cx.translate(x,y);
    cx.fillStyle="#16305e";cx.beginPath();cx.arc(0,2,11,0,7);cx.fill(); // body
    cx.fillStyle="#2f6fd0";cx.beginPath();cx.arc(0,-6,7,0,7);cx.fill(); // helmet
    cx.fillStyle="#caa33a";cx.fillRect(-8,-9,16,3); // visor band gold
    // shield in facing dir
    cx.fillStyle="#d9b24a";var sx=0,sy=0;if(DQ.face==="left")sx=-11;else if(DQ.face==="right")sx=11;else if(DQ.face==="up")sy=-11;else sy=11;
    cx.beginPath();cx.arc(sx,sy,5,0,7);cx.fill();cx.fillStyle="#201700";cx.font="7px sans-serif";cx.textAlign="center";cx.fillText("B",sx,sy+2.5);
    cx.restore();
  }
  function dqOver(win){
    DQ.state=win?"win":"over";cancelAnimationFrame(DQ.raf);DQ.raf=null;
    DQ.score=DQ.coins*10+DQ.diamonds*50+Object.keys(DQ.visited).length*100+(win?1000:0);
    dqSaveBest(DQ.score);DQ.best=dqBest();dqSyncHud();
    var ov=document.getElementById("dqOverlay"),ms=document.getElementById("dqMsg"),st=document.getElementById("dqStart");
    ov.classList.remove("hide");st.textContent="▶ Play again";
    ms.innerHTML=win?("🏆 <b>Vault secured!</b> Score "+DQ.score+" (🪙"+DQ.coins+" · 💎"+DQ.diamonds+")"):("💀 <b>The bears won this run.</b> Score "+DQ.score);
    var res=document.getElementById("dqResult");if(res){res.hidden=false;res.innerHTML=win?"You guided the BC25 Defender to the vault — that's the whole idea: <b>survive the bears, protect the bags.</b>":"Down but not out. Upgrade armor &amp; sword at the Forge and try again.";}
    say(win?"Vault secured. Lose less, last longer. 🐂🛡️":"The bears got us. Run it back! 🐻","🛡️");
  }
  function dqLoop(ts){
    // riddle/shop keep the loop alive (movement just pauses) so play resumes cleanly on close
    if(DQ.state==="over"||DQ.state==="win"||DQ.state==="paused"||DQ.state==="title"){DQ.raf=null;return;}
    if(!DQ.last)DQ.last=ts;var dt=Math.min(0.05,(ts-DQ.last)/1000);DQ.last=ts;
    if(DQ.state==="play")dqUpdate(dt);
    dqDraw();DQ.raf=requestAnimationFrame(dqLoop);
  }
  function dqEnsureLoop(){if(!DQ.raf){DQ.last=0;DQ.raf=requestAnimationFrame(dqLoop);}}
  function dqStartGame(){
    dqResetProgress();DQ.state="play";DQ.last=0;dqSyncHud();
    document.getElementById("dqOverlay").classList.add("hide");
    document.getElementById("dqRiddle").hidden=true;document.getElementById("dqShop").hidden=true;
    var res=document.getElementById("dqResult");if(res)res.hidden=true;
    say("The quest begins in the "+DQ_ROOMNAMES[0]+". 🛡️","🛡️");
    if(DQ.raf)cancelAnimationFrame(DQ.raf);DQ.raf=requestAnimationFrame(dqLoop);
  }
  function dqPause(){if(DQ.state==="play"){DQ.state="paused";if(DQ.raf)cancelAnimationFrame(DQ.raf);DQ.raf=null;
    var ov=document.getElementById("dqOverlay"),ms=document.getElementById("dqMsg"),st=document.getElementById("dqStart");
    if(ov){ov.classList.remove("hide");st.textContent="▶ Resume";ms.textContent="Paused";}}}
  function dqResume(){if(DQ.state==="paused"){DQ.state="play";document.getElementById("dqOverlay").classList.add("hide");DQ.last=0;DQ.raf=requestAnimationFrame(dqLoop);}}
  function dqIdleDraw(){if(!DQ.rooms)dqParse();DQ.best=dqBest();dqDraw();dqSyncHud();}
  // DQ input
  document.addEventListener("keydown",function(e){
    if(!isGamesView())return;
    if(DQ.state==="riddle"||DQ.state==="shop")return;
    if(DQ.state!=="play")return;
    var k=e.key;
    if(k==="ArrowLeft"||k==="a"||k==="A"){DQ.key.left=true;e.preventDefault();}
    else if(k==="ArrowRight"||k==="d"||k==="D"){DQ.key.right=true;e.preventDefault();}
    else if(k==="ArrowUp"||k==="w"||k==="W"){DQ.key.up=true;e.preventDefault();}
    else if(k==="ArrowDown"||k==="s"||k==="S"){DQ.key.down=true;e.preventDefault();}
    else if(k===" "||k==="z"||k==="Z"){dqAttack();e.preventDefault();}
    else if(k==="e"||k==="E"){dqInteract();e.preventDefault();}
  });
  document.addEventListener("keyup",function(e){
    var k=e.key;
    if(k==="ArrowLeft"||k==="a"||k==="A")DQ.key.left=false;
    else if(k==="ArrowRight"||k==="d"||k==="D")DQ.key.right=false;
    else if(k==="ArrowUp"||k==="w"||k==="W")DQ.key.up=false;
    else if(k==="ArrowDown"||k==="s"||k==="S")DQ.key.down=false;
  });
  function dqHold(id,dir){var b=document.getElementById(id);if(!b)return;
    function on(e){e.preventDefault();DQ.key[dir]=true;}function off(){DQ.key[dir]=false;}
    b.addEventListener("pointerdown",on);b.addEventListener("pointerup",off);b.addEventListener("pointerleave",off);b.addEventListener("pointercancel",off);}
  dqHold("dqUp","up");dqHold("dqDown","down");dqHold("dqLeft","left");dqHold("dqRight","right");
  var dqA=document.getElementById("dqAtk");if(dqA)dqA.addEventListener("click",function(e){e.preventDefault();dqAttack();});
  var dqE=document.getElementById("dqUse");if(dqE)dqE.addEventListener("click",function(e){e.preventDefault();dqInteract();});
  var dqSt=document.getElementById("dqStart");if(dqSt)dqSt.addEventListener("click",function(){if(DQ.state==="paused")dqResume();else dqStartGame();});
  var dqRO=document.getElementById("dqRiddleOpts");if(dqRO)dqRO.addEventListener("click",function(e){var b=e.target.closest(".dqopt");if(!b)return;dqAnswer(+b.getAttribute("data-i"));});
  var dqSB=document.getElementById("dqShopBody");if(dqSB)dqSB.addEventListener("click",function(e){var b=e.target.closest("[data-buy]");if(!b||b.disabled)return;dqBuy(b.getAttribute("data-buy"));});
  var dqSC=document.getElementById("dqShopClose");if(dqSC)dqSC.addEventListener("click",dqCloseShop);
  document.addEventListener("visibilitychange",function(){if(document.hidden)dqPause();});

  // init
  newGame();pgStart();runLoadBest();runIdleDraw();renderHigh();updateStatus();loadStageB();dqIdleDraw();
})();
