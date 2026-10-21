/* BALI CALENDAR / a true anchored 3D poster stage.
   All published event cards stay mounted, including older cards.
   No native horizontal scroll, DOM reordering or destructive pruning. */
(()=>{
"use strict";
const section=document.getElementById("eventsSection");
const grid=document.getElementById("eventsGrid");
const shell=document.getElementById("eventsCarouselShell");
const dialog=document.getElementById("baliEventDetailDialog");
const prev=document.getElementById("baliPosterPrevious");
const next=document.getElementById("baliPosterNext");
if(!section||!grid||!shell||!dialog||!prev||!next)return;
// A legacy high-specificity layout declaration can otherwise re-enable
// native horizontal scrolling. The CSSOM override guarantees one stage.
grid.style.setProperty("overflow-x","hidden","important");
grid.style.setProperty("overflow-y","hidden","important");
grid.style.setProperty("scroll-snap-type","none","important");
grid.scrollLeft=0;
const reduce=matchMedia("(prefers-reduced-motion: reduce)");
const mobile=()=>matchMedia("(max-width:1179px)").matches;
const cards=()=>[...grid.querySelectorAll(".event-card[data-event-date]")];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
let activeIndex=0,position=0,animation=null,raf=0,gesture=null;
let wheelAt=-Infinity,ignoreTapUntil=0,slideWidth=180,firstSync=true,lastCardId="";
const ease=t=>t*t*(3-2*t);
// Keep the two mobile action buttons down during a poster change and raise
// them only when the stage has completed its actual travel (not a fixed timer).
function lowerActions(){if(!reduce.matches)grid.classList.add("is-actions-lowered")}
function raiseActions(){grid.classList.remove("is-actions-lowered")}
// Protect the buttons against the REAL floating mobile dock, rather than
// assuming that the entire calendar stage is visible above it.
function visibleDockTop(){
  const dock=document.querySelector(".bali-bottom-nav");
  if(!dock||getComputedStyle(dock).display==="none")return window.innerHeight;
  return dock.getBoundingClientRect().top;
}
/* Mobile balance: Calendar -> equal gap -> square -> equal gap ->
   buttons -> equal gap -> upper edge of the fixed bottom navigation.
   Use layout measurements only on resize/open, NOT on animation frames. */
function measure(){
  const area=grid.getBoundingClientRect();
  if(area.width<30||area.height<30)return;
  const phone=mobile();
  const narrow=matchMedia("(max-width:767px)").matches;
  let width;
  if(narrow){
    const panel=document.getElementById("baliCalendarPanel");
    const calendarBottom=panel?.getBoundingClientRect().bottom??area.top;
    // Measure from the calendar's actual bottom, including the layout gap
    // before the stage; all THREE visible spaces then use the same value.
    const topEdge=calendarBottom;
    // Also honour the stage clipping boundary, not just the floating dock.
    const bottomEdge=Math.min(visibleDockTop()-8,area.bottom-3);
    const available=Math.max(0,bottomEdge-topEdge);
    const actions=grid.querySelector(".event-card.is-active .bali-event-actions");
    // Bounding box excludes CSS margin, so this is the buttons' real height.
    const actionsHeight=Math.max(39,Math.ceil(actions?.getBoundingClientRect().height||45));
    const targetGap=clamp(available*.05,10,22);
    width=Math.floor(Math.max(48,Math.min(390,area.width*.88,
      available-actionsHeight-3*targetGap)));
    const evenGap=Math.max(5,(available-width-actionsHeight)/3);
    const offset=Math.max(0,topEdge+evenGap-area.top);
    grid.style.setProperty("--bali-phone-poster-top",offset.toFixed(1)+"px");
    grid.style.setProperty("--bali-phone-even-gap",evenGap.toFixed(1)+"px");
  }else{
    width=Math.floor(Math.min(
      phone?390:500,
      area.width*(phone?.76:.60),
      Math.max(100,area.height-(phone?80:76))
    ));
    grid.style.removeProperty("--bali-phone-poster-top");
    grid.style.removeProperty("--bali-phone-even-gap");
  }
  if(slideWidth!==width){
    slideWidth=width;
    grid.style.setProperty("--bali-event-slide-width",width+"px");
  }
  render();
}
function render(){
  const entries=cards(),count=entries.length;
  if(!count){prev.disabled=true;next.disabled=true;raiseActions();return;}
  const stageWidth=grid.clientWidth||500;
  const angle=reduce.matches?0:64; // Mirror-turned sides sit behind the centered poster
  // The two neighbours use the same +/- offset to stay equidistant.
  // On desktop, halve the previous edge-to-edge gap, preserving the centre
  // size and both side angles. Phone/tablet geometry remains unchanged.
  const projectedHalf=slideWidth*Math.cos(Math.max(0,angle-6)*Math.PI/180)*.9*.5;
  const gap=mobile()?6:Math.max(10,stageWidth*.012);
  const safety=mobile()?Math.max(7,slideWidth*.035):Math.max(50,slideWidth*.11);
  const originalSlot=Math.max(stageWidth*(mobile()?.35:.395),
    slideWidth*.5+projectedHalf+gap)+safety;
  const projectedEdges=slideWidth*.5+projectedHalf;
  // A further 50% reduction from the previously published desktop spacing.
  const slot=mobile()?originalSlot:
    projectedEdges+Math.max(gap*.5,(originalSlot-projectedEdges)*.25);
  // Hard cap on visible poster count: one central + at most one each side.
  // All other events remain mounted in the queue but are invisible.
  const center=Math.round(position);
  const first=Math.max(0,center-1),last=Math.min(count-1,center+1);
  for(const [index,card] of entries.entries()){
    const visible=index>=first&&index<=last;
    const dist=index-position,a=Math.abs(dist),sign=Math.sign(dist);
    const extra=Math.min(.85,Math.max(0,a-1));
    const x=sign*(slot*Math.min(1,a)+extra*slideWidth*.18);
    const turn=reduce.matches?0:-sign*angle*Math.min(1,a);
    const depth=reduce.matches?0:-Math.min(120,a*66);
    const scale=Math.max(.84,1-Math.min(1,a)*.1-extra*.08);
    const fade=Math.max(.12,1-Math.min(1,a)*.15-extra*.75);
    const selected=index===center;
    card.style.setProperty("--bali-stage-x",x.toFixed(2)+"px");
    card.style.setProperty("--bali-stage-angle",turn.toFixed(2)+"deg");
    card.style.setProperty("--bali-stage-depth",depth.toFixed(2)+"px");
    card.style.setProperty("--bali-stage-scale",scale.toFixed(3));
    card.style.setProperty("--bali-stage-opacity",visible?fade.toFixed(3):"0");
    card.style.setProperty("--bali-stage-brightness",Math.max(.69,1-a*.14).toFixed(3));
    // The legacy CSS sets z-index:var(--bali-poster-z,1)!important;
    // merely setting card.style.zIndex was ignored in that cascade.
    // The active poster always sits ABOVE every side poster and edge fade.
    const layer=selected?700:(visible?250:0);
    card.style.setProperty("--bali-poster-z",String(layer));
    card.style.zIndex=String(layer);
    card.style.visibility=visible?"visible":"hidden";
    card.style.pointerEvents=selected&&visible?"auto":"none";
    card.setAttribute("aria-hidden",String(!visible));
    card.classList.toggle("is-active",selected);
    card.classList.toggle("is-neighbor",visible&&!selected);
    // Only neighboring posters fade into the left/right page boundaries.
    // Central photo and its actions never receive an edge mask.
    card.dataset.stageSide=visible&&!selected?(dist<0?"left":"right"):"center";
    card.setAttribute("aria-current",selected?"true":"false");
    const poster=card.querySelector(".bali-event-poster-wrap");
    if(poster)poster.setAttribute("aria-label",
      (selected?"Подробнее: ":"Афиша: ")+
      (card.querySelector(".bali-event-info h3")?.textContent||"мероприятие"));
  }
  prev.disabled=activeIndex===0;
  next.disabled=activeIndex===count-1;
  const counter=document.getElementById("eventsCarouselPosition");
  if(counter)counter.textContent=String(activeIndex+1).padStart(2,"0")+" / "+String(count).padStart(2,"0");
}
function notify(){
  const card=cards()[activeIndex];
  if(card)window.dispatchEvent(new CustomEvent("bali:calendar:active-event",{
    detail:{date:card.dataset.eventDate,forced:true}
  }));
}
function animateTo(next,smooth=true){
  if(animation){cancelAnimationFrame(animation.raf);animation=null;}
  const last=cards().length-1;
  if(last<0)return;
  next=clamp(next,0,last);
  const moving=smooth&&!reduce.matches&&Math.abs(position-next)>=.001;
  // Hide action rows BEFORE the selection/notification changes. All cards
  // remain hidden for the whole slide, so swapping is-active cannot blink
  // or move the buttons midway through the stage animation.
  if(moving)lowerActions();
  activeIndex=next;
  lastCardId=cards()[next]?.dataset.eventId||cards()[next]?.dataset.eventDate||"";
  notify();
  if(!moving){
    position=next;render();raiseActions();return;
  }
  const initial=position,delta=next-initial;
  const started=performance.now(),duration=clamp(570+Math.abs(delta)*145,580,1150);
  const running={raf:0};
  animation=running;
  const tick=now=>{
    if(animation!==running)return;
    const progress=clamp((now-started)/duration,0,1);
    position=initial+delta*ease(progress);
    render();
    // Once the selected poster is nearly centred (88% of travel), let the
    // controls fade in ONCE. The active poster has been stable since 50%.
    // Repeated render() frames cannot toggle this flag back.
    if(progress>=.88&&grid.classList.contains("is-actions-lowered"))raiseActions();
    if(progress<1)running.raf=requestAnimationFrame(tick);
    else{position=next;animation=null;render();raiseActions();}
  };
  running.raf=requestAnimationFrame(tick);
}
function focusIndex(index,smooth=true){animateTo(index,smooth)}
function move(delta){focusIndex(activeIndex+delta,true)}
function syncCards(){
  const entries=cards();
  // Several parties can share a date; preserve the exact event ID.
  // The first ongoing/future poster starts in the centre, archival on left.
  if(entries.length){
    const same=lastCardId?entries.findIndex(c=>(c.dataset.eventId||c.dataset.eventDate)===lastCardId):-1;
    const firstCurrent=entries.findIndex(c=>c.dataset.eventStatus!=="past");
    const fallback=firstCurrent>=0?firstCurrent:entries.length-1;
    if(firstSync){
      activeIndex=fallback;position=fallback;firstSync=false;
    }
    else if(same>=0){activeIndex=same;position=same;}
    else{activeIndex=fallback;position=fallback;}
    lastCardId=entries[activeIndex].dataset.eventId||entries[activeIndex].dataset.eventDate||"";
  }else{activeIndex=0;position=0;lastCardId="";}
  if(animation){cancelAnimationFrame(animation.raf);animation=null;}
  raiseActions();
  measure();render();
}
prev.addEventListener("click",()=>move(-1));
next.addEventListener("click",()=>move(1));
shell.addEventListener("wheel",event=>{
  if(mobile()||event.ctrlKey||Math.abs(event.deltaY)<4)return;
  if(Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const now=performance.now();
  if(now-wheelAt<400)return;
  wheelAt=now;
  // DOWN: centre moves to the LEFT and the next right card moves to centre.
  // UP: reverse, previously viewed posters slide back from the left.
  move(event.deltaY>0?1:-1);
},{capture:true,passive:false});
grid.addEventListener("keydown",event=>{
  if(event.target.closest("button")&&event.target!==grid)return;
  if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;
  event.preventDefault();move(event.key==="ArrowRight"?1:-1);
});
grid.addEventListener("pointerdown",event=>{
  if(!event.isPrimary||event.button!==0||event.target.closest("button"))return;
  if(animation){cancelAnimationFrame(animation.raf);animation=null;}
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,
    start:position,startIndex:activeIndex,dragged:false};
},{passive:true});
grid.addEventListener("pointermove",event=>{
  const g=gesture;
  if(!g||event.pointerId!==g.id)return;
  const dx=event.clientX-g.x,dy=event.clientY-g.y;
  if(!g.dragged&&Math.abs(dx)>7&&Math.abs(dx)>Math.abs(dy)*.7){
    g.dragged=true;grid.classList.add("is-swipe-active");
    lowerActions();
    if(event.pointerType==="mouse"){
      try{grid.setPointerCapture(event.pointerId)}catch{}
    }
  }
  if(!g.dragged)return;
  if(event.cancelable)event.preventDefault();
  const step=Math.max(75,slideWidth*(mobile()?.75:.79));
  position=clamp(g.start-dx/step,0,Math.max(0,cards().length-1));
  ignoreTapUntil=performance.now()+450;
  render();
},{passive:false});
function endGesture(event,cancel=false){
  const g=gesture;if(!g||event.pointerId!==g.id)return;
  gesture=null;grid.classList.remove("is-swipe-active");
  try{if(grid.hasPointerCapture(event.pointerId))grid.releasePointerCapture(event.pointerId)}catch{}
  const dx=event.clientX-g.x;
  if(cancel||!g.dragged||Math.abs(dx)<19){
    focusIndex(g.startIndex,true);return;
  }
  // Drag LEFT = posters move left = next event; drag RIGHT = previous.
  const step=clamp(Math.round(Math.abs(dx)/Math.max(75,slideWidth*.75)),1,3);
  focusIndex(g.startIndex+(dx<0?step:-step),true);
}
grid.addEventListener("pointerup",event=>endGesture(event),{passive:true});
grid.addEventListener("pointercancel",event=>endGesture(event,true),{passive:true});
grid.addEventListener("lostpointercapture",event=>{if(gesture)endGesture(event,true)});
const close=document.getElementById("baliEventDetailClose");
if(close)close.addEventListener("click",()=>dialog.close());
dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
let previousFocus=null;
dialog.addEventListener("close",()=>{
  if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  previousFocus=null;
});
const formatDate=date=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||""))return "";
  return new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})
    .format(new Date(date+"T12:00:00Z"));
};
let activeDetailCard=null;
const detailLike=document.getElementById("baliEventDetailLike");
const detailShare=document.getElementById("baliEventDetailShare");
const detailComments=document.getElementById("baliEventDetailComments");
function syncDetailLike(){
  if(!activeDetailCard||!detailLike)return;
  const button=activeDetailCard.querySelector(".event-want-to-go");
  const past=activeDetailCard.dataset.eventStatus==="past";
  const live=activeDetailCard.dataset.eventStatus==="live";
  const selected=button?.getAttribute("aria-pressed")==="true";
  detailLike.disabled=past||!button||button.disabled;
  detailLike.hidden=past;
  detailLike.classList.toggle("is-selected",selected);
  detailLike.setAttribute("aria-pressed",String(selected));
  detailLike.setAttribute("aria-label",selected
    ?(live?"Я уже здесь":"Убрать мероприятие из моих планов")
    :(live?"Я здесь":"Хочу пойти на мероприятие"));
  const label=detailLike.querySelector("span");
  if(label)label.textContent=selected?(live?"Я здесь ✓":"В моих планах"):(live?"Я здесь":"Хочу пойти");
}
detailLike?.addEventListener("click",()=>{
  if(!activeDetailCard)return;
  const underlying=activeDetailCard.querySelector(".event-want-to-go");
  if(underlying&&!underlying.disabled)underlying.click();
  syncDetailLike();
});
detailShare?.addEventListener("click",()=>{
  if(activeDetailCard)void window.BaliShare?.openForCard?.(activeDetailCard);
});
detailComments?.addEventListener("click",()=>{
  document.getElementById("baliEventDetailCaption")?.scrollIntoView({
    behavior:reduce.matches?"instant":"smooth",block:"nearest"
  });
});
new MutationObserver(changes=>{
  if(dialog.open&&activeDetailCard&&changes.some(change=>
    activeDetailCard.contains(change.target)))syncDetailLike();
}).observe(grid,{subtree:true,attributes:true,attributeFilter:["aria-pressed","disabled"]});
dialog.addEventListener("close",()=>{activeDetailCard=null;});
const openDetails=card=>{
  const poster=card.querySelector(".event-poster");
  if(!poster)return;
  const title=card.querySelector(".bali-event-info h3")?.textContent||"Мероприятие BALI";
  previousFocus=document.activeElement;
  activeDetailCard=card;
  const image=document.getElementById("baliEventDetailImage");
  image.src=poster.currentSrc||poster.src;
  image.alt="Афиша "+title;
  document.getElementById("baliEventDetailTitle").textContent=title;
  document.getElementById("baliEventDetailDate").textContent=formatDate(card.dataset.eventDate);
  document.getElementById("baliEventDetailHours").textContent=card.querySelector(".bali-event-hours")?.textContent||"Время уточняется";
  document.getElementById("baliEventDetailDescription").textContent=
    card.querySelector(".bali-event-description")?.textContent||"Дополнительная информация появится перед мероприятием.";
  if(!dialog.open)dialog.showModal();
  dialog.scrollTop=0;
  syncDetailLike();
};
const decorate=()=>{
  for(const card of cards()){
    if(card.dataset.baliCoverflowDecorated==="1")continue;
    card.dataset.baliCoverflowDecorated="1";
    const poster=card.querySelector(".bali-event-poster-wrap");
    if(poster){
      poster.setAttribute("role","button");
      poster.tabIndex=0;
      poster.setAttribute("aria-label","Подробности: "+(card.querySelector(".bali-event-info h3")?.textContent||"мероприятие"));
      poster.addEventListener("click",()=>{
        if(performance.now()<ignoreTapUntil)return;
        const index=cards().indexOf(card);
        openDetails(card);
      });
      poster.addEventListener("keydown",event=>{
        if(event.key==="Enter"||event.key===" "){
          event.preventDefault();
          const index=cards().indexOf(card);
          openDetails(card);
        }
      });
    }
  }
  syncCards();
};
new MutationObserver(decorate).observe(grid,{childList:true});
window.addEventListener("resize",measure,{passive:true});
window.visualViewport?.addEventListener("resize",measure,{passive:true});
document.fonts?.ready.then(()=>measure());
if(typeof ResizeObserver==="function"){
  const observer=new ResizeObserver(()=>measure());
  observer.observe(grid);
}
window.addEventListener("bali:calendar:open",()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{decorate();measure()})));
window.BaliCalendarShowcase=Object.freeze({
  mode:"stage",move,focusIndex,refresh:syncCards,
  getState:()=>({activeIndex,cardCount:cards().length,position,animating:!!animation,
    wheelDirection:"down:left-up:right"})
});
decorate();
measure();
})();