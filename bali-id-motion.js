/* BALI ID: direct-manipulation 3D motion engine.
   Runs independently of Firebase so the card always responds, including if
   authentication/QR SDKs are temporarily unavailable. */
(()=>{
  "use strict";
  const scene=document.getElementById("baliIdFlipScene");
  const track=document.getElementById("baliIdFlipTrack");
  const front=document.getElementById("baliIdFront");
  const back=document.getElementById("baliIdBack");
  if(!scene||!track||!front||!back)return;
  const reduce=matchMedia("(prefers-reduced-motion: reduce)");
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let flipped=false,drag=null,finishTimer=0,wheelAt=0,lastTouchTap=null;
  let displayedAngle=0,cinematicEffect=null;
  function faceState(backVisible,focus=false){
    flipped=!!backVisible;
    track.classList.toggle("is-flipped",flipped);
    front.setAttribute("aria-hidden",String(flipped));
    back.setAttribute("aria-hidden",String(!flipped));
    front.tabIndex=flipped?-1:0;
    back.tabIndex=flipped?0:-1;
    if(focus)(flipped?back:front).focus({preventScroll:true});
  }
  function readAngle(){
    const transform=getComputedStyle(track).transform;
    if(!transform||transform==="none")return flipped?180:0;
    try{
      const m=new DOMMatrixReadOnly(transform);
      // CSS rotateY stores -sin(angle) in m13. Keep complete turns too,
      // otherwise interrupting a 360deg return can jump to the wrong side.
      const degrees=Math.atan2(-m.m13,m.m11)*180/Math.PI;
      return Number.isFinite(degrees)
        ? degrees+360*Math.round((displayedAngle-degrees)/360) : displayedAngle;
    }catch{return displayedAngle;}
  }
  function stopTimer(){
    clearTimeout(finishTimer);finishTimer=0;
    if(cinematicEffect){cinematicEffect.cancel();cinematicEffect=null;}
    scene.classList.remove("is-cinematic");
  }
  function frame(angle){
    displayedAngle=angle;
    track.style.transition="none";
    track.style.transform="rotateY("+angle+"deg)";
    // The cast shadow narrows as the physical edge turns toward the viewer.
    const full=Math.abs(Math.cos(angle*Math.PI/180));
    scene.style.setProperty("--bali-id-shadow-scale",(.36+full*.64).toFixed(3));
    scene.style.setProperty("--bali-id-shadow-strength",(.29+(1-full)*.31).toFixed(3));
    scene.style.setProperty("--bali-id-light-x",(32+Math.sin(angle*Math.PI/180)*38).toFixed(2)+"%");
  }
  function normalize(){
    stopTimer();
    const angle=flipped?180:0;
    frame(angle);
    void track.offsetWidth;
    track.style.transform="";
    track.style.transition="";
    displayedAngle=angle;
  }
  function animate(target,backVisible,{focus=false}={}){
    let current=readAngle();
    stopTimer();
    if(!Number.isFinite(current))current=flipped?180:0;
    frame(current);
    faceState(backVisible,focus);
    // Remove stale transitions. Allow any new pointerdown to interrupt cleanly.
    if(reduce.matches||Math.abs(current-target)<.5){normalize();return;}
    void track.offsetWidth;
    // Direct swipes remain responsive, but the remainder eases into place
    // gently: no sudden snap when the pointer is released.
    const duration=clamp(280+Math.abs(target-current)*2.6,330,850);
    track.style.transition="transform "+duration+"ms cubic-bezier(.23,.65,.17,1)";
    displayedAngle=target;
    track.style.transform="rotateY("+target+"deg)";
    finishTimer=setTimeout(normalize,duration+70);
  }
  function reset(){
    drag=null;lastTouchTap=null;
    scene.classList.remove("is-dragging");
    faceState(false);
    normalize();
  }
  function toggle(focus=false){
    if(drag)drag=null;
    // Click / double-tap: camera pulls back first, rotates, then approaches.
    // Manual dragging does NOT use this cinematic depth animation.
    const current=readAngle();
    const candidates=flipped?[-360,0,360]:[-180,180,540];
    const target=candidates.reduce((a,b)=>Math.abs(b-current)<Math.abs(a-current)?b:a);
    if(reduce.matches||typeof track.animate!=="function"){
      animate(target,!flipped,{focus});
      return;
    }
    stopTimer();
    frame(current);
    faceState(!flipped,focus);
    scene.classList.add("is-cinematic");
    const travel=target-current;
    // One easing over the complete turn keeps angular speed continuous
    // through the edge. Retreat only slightly, like turning a physical card.
    const keyframes=[
      {offset:0,transform:"translateZ(0px) rotateY("+current+"deg) scale(1)"},
      {offset:.5,transform:"translateZ(-32px) rotateY("+(current+travel*.5)+"deg) scale(.985)"},
      {offset:1,transform:"translateZ(0px) rotateY("+target+"deg) scale(1)"}
    ];
    track.style.transition="none";
    cinematicEffect=track.animate(keyframes,{
      duration:820,easing:"cubic-bezier(.3,0,.2,1)",fill:"forwards"
    });
    const running=cinematicEffect;
    running.addEventListener("finish",()=>{if(cinematicEffect===running&&!drag)normalize();},{once:true});
    finishTimer=setTimeout(()=>{if(cinematicEffect===running&&!drag)normalize();},910);
  }
  track.addEventListener("transitionend",event=>{
    if(event.target===track&&event.propertyName==="transform"&&!drag)normalize();
  });
  const dragDistance=()=>clamp(scene.clientWidth*.43,110,195);
  scene.addEventListener("pointerdown",event=>{
    if(!event.isPrimary||event.button!==0||drag)return;
    if(document.querySelector(".bali-bank-dialog[open],.bali-id-qr-dialog[open]"))return;
    const current=readAngle();
    stopTimer();
    frame(current);
    scene.classList.remove("is-dragging");
    const rect=scene.getBoundingClientRect();
    drag={
      id:event.pointerId,type:event.pointerType,
      x:event.clientX,y:event.clientY,started:performance.now(),
      current,dx:0,dy:0,lastX:event.clientX,lastTime:performance.now(),
      velocity:0,axis:null,wasFlipped:flipped
    };
    // Every touch starts capturing immediately. Avoid a synthetic ±3° kick
    // that made light touches look like a sudden unintended flip.
    if(!reduce.matches)frame(current);
    try{scene.setPointerCapture(event.pointerId);}catch{}
    if(event.pointerType==="mouse")event.preventDefault();
  });
  scene.addEventListener("pointermove",event=>{
    const g=drag;
    if(!g||g.id!==event.pointerId)return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    g.dx=dx;g.dy=dy;
    if(!g.axis&&Math.abs(dx)+Math.abs(dy)>3)
      g.axis=Math.abs(dx)>=Math.abs(dy)*.72?"horizontal":"vertical";
    if(g.axis!=="horizontal")return;
    scene.classList.add("is-dragging");
    const now=performance.now(),dt=now-g.lastTime;
    if(dt>0)g.velocity=(event.clientX-g.lastX)/dt;
    g.lastX=event.clientX;g.lastTime=now;
    // Immediately follow a drag in either direction; no easing while held.
    const progress=clamp(dx/dragDistance(),-1.15,1.15);
    if(!reduce.matches)frame(g.current+progress*180);
  });
  function finish(event,cancelled=false){
    const g=drag;
    if(!g||g.id!==event.pointerId)return;
    drag=null;
    scene.classList.remove("is-dragging");
    try{if(scene.hasPointerCapture(event.pointerId))scene.releasePointerCapture(event.pointerId);}catch{}
    const dx=g.dx,elapsed=performance.now()-g.started;
    const threshold=Math.abs(dx)/dragDistance();
    const flick=Math.abs(dx)>17&&Math.abs(g.velocity)>.24;
    const swiped=g.axis==="horizontal"&&(threshold>=.22||flick)&&!cancelled;
    if(swiped){
      lastTouchTap=null;
      const sign=dx>=0?1:-1;
      const next=!g.wasFlipped;
      // From the reverse face use ±180 about the *current* orientation.
      const stable=g.wasFlipped?180:0;
      const destination=stable+sign*180;
      animate(destination,next);
      return;
    }
    // Click: PC flip. On mobile a DOUBLE tap flips and a single tap springs
    // back; this prevents accidental flips during short exploratory touches.
    if(!cancelled&&Math.abs(dx)<10&&Math.abs(g.dy)<12&&elapsed<480){
      if(g.type==="mouse"){
        lastTouchTap=null;
        toggle();
        return;
      }
      const now=performance.now();
      if(lastTouchTap&&now-lastTouchTap.time<=390
        &&Math.hypot(g.x-lastTouchTap.x,g.y-lastTouchTap.y)<45){
        lastTouchTap=null;toggle();return;
      }
      lastTouchTap={time:now,x:g.x,y:g.y};
    }else lastTouchTap=null;
    animate(g.wasFlipped?180:0,g.wasFlipped);
  }
  scene.addEventListener("pointerup",event=>finish(event));
  scene.addEventListener("pointercancel",event=>finish(event,true));
  scene.addEventListener("lostpointercapture",event=>finish(event,true));
  reduce.addEventListener?.("change",()=>{if(reduce.matches)reset();});
  window.addEventListener("blur",()=>{
    if(!drag)return;
    const g=drag;
    finish({pointerId:g.id},true);
  });
  scene.addEventListener("wheel",event=>{
    if(Math.abs(event.deltaX)<7&&Math.abs(event.deltaY)<7)return;
    if(document.querySelector(".bali-bank-dialog[open],.bali-id-qr-dialog[open]"))return;
    event.preventDefault();
    const now=performance.now();
    if(now-wheelAt<720||drag)return;
    wheelAt=now;toggle();
  },{passive:false});
  for(const card of [front,back]){
    card.addEventListener("keydown",event=>{
      if(["Enter"," ","ArrowLeft","ArrowRight"].includes(event.key)){
        event.preventDefault();
        toggle(true);
      }
    });
  }
  // Prevent synthesized mobile clicks from starting a second unintended flip.
  scene.addEventListener("click",event=>{
    if(event.detail>0&&event.pointerType==="touch")event.preventDefault();
  });
  window.BaliIdMotion=Object.freeze({reset,toggle,getState:()=>({flipped,dragging:!!drag,cinematic:scene.classList.contains("is-cinematic")})});
  reset();
})();
