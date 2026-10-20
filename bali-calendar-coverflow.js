/* BALI calendar 2026: responsive coverflow matched to supplied reference.
   Native touch scrolling + perspective frames; no invented event data. */
(()=>{
"use strict";
const section=document.getElementById("eventsSection");
const grid=document.getElementById("eventsGrid");
const shell=document.getElementById("eventsCarouselShell");
const dialog=document.getElementById("baliEventDetailDialog");
const prev=document.getElementById("baliPosterPrevious");
const next=document.getElementById("baliPosterNext");
if(!section||!grid||!shell||!dialog||!prev||!next)return;
const reduce=matchMedia("(prefers-reduced-motion: reduce)");
const mobile=()=>matchMedia("(max-width:1179px)").matches;
const cards=()=>[...grid.querySelectorAll(".event-card[data-event-date]")];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
let activeIndex=0,raf=0,wheelTime=0,gesture=null,ignoreTapUntil=0,scrollIdle=0;
const update=()=>{
  raf=0;
  const entries=cards(),center=grid.scrollLeft+grid.clientWidth/2;
  if(!entries.length){
    activeIndex=0;prev.disabled=true;next.disabled=true;return;
  }
  let nearest=0,shortest=Infinity;
  for(const [index,card] of entries.entries()){
    const midpoint=card.offsetLeft+card.offsetWidth/2;
    const gap=midpoint-center;
    const raw=gap/Math.max(1,card.offsetWidth+parseFloat(getComputedStyle(grid).columnGap||"0"));
    const x=clamp(raw,-2,2),a=Math.min(1,Math.abs(x));
    if(Math.abs(gap)<shortest){shortest=Math.abs(gap);nearest=index;}
    const angle=reduce.matches?0:clamp(-x*35,-57,57);
    const depth=reduce.matches?0:-a*68;
    const scale=1-a*(mobile()?.21:.17);
    card.style.setProperty("--bali-poster-angle",angle.toFixed(1)+"deg");
    card.style.setProperty("--bali-poster-depth",depth.toFixed(1)+"px");
    card.style.setProperty("--bali-poster-scale",scale.toFixed(3));
    card.style.setProperty("--bali-poster-opacity",(1-a*.38).toFixed(3));
    card.style.setProperty("--bali-poster-brightness",(1-a*.30).toFixed(3));
    card.style.setProperty("--bali-poster-sat",(1-a*.2).toFixed(3));
    card.style.setProperty("--bali-poster-z",String(10-Math.round(a*4)));
  }
  activeIndex=nearest;
  prev.disabled=nearest===0;
  next.disabled=nearest===entries.length-1;
};
const schedule=()=>{if(!raf)raf=requestAnimationFrame(update);};
const focusIndex=(index,animate=true)=>{
  const entries=cards(),card=entries[clamp(index,0,entries.length-1)];
  if(!card)return;
  const left=card.offsetLeft+card.offsetWidth/2-grid.clientWidth/2;
  grid.scrollTo({left:Math.max(0,left),behavior:animate&&!reduce.matches?"smooth":"instant"});
  window.dispatchEvent(new CustomEvent("bali:calendar:active-event",{
    detail:{date:card.dataset.eventDate,forced:true}
  }));
  schedule();
};
const move=direction=>focusIndex(activeIndex+direction);
prev.addEventListener("click",()=>move(-1));
next.addEventListener("click",()=>move(1));
shell.addEventListener("wheel",event=>{
  // Reference convention: wheel DOWN goes LEFT, wheel UP goes RIGHT.
  if(mobile()||event.ctrlKey||Math.abs(event.deltaY)<=4||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const now=performance.now();
  if(now-wheelTime<490)return;
  wheelTime=now;
  move(event.deltaY>0?-1:1);
},{capture:true,passive:false});
grid.addEventListener("pointerdown",event=>{
  if(event.target.closest("button"))return;
  gesture={x:event.clientX,y:event.clientY,id:event.pointerId};
  grid.classList.add("is-swipe-active");
},{passive:true});
grid.addEventListener("pointermove",event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  if(Math.abs(event.clientX-gesture.x)>12){
    ignoreTapUntil=performance.now()+300;
  }
},{passive:true});
const endSwipe=()=>{
  gesture=null;
  clearTimeout(scrollIdle);
  scrollIdle=setTimeout(()=>{grid.classList.remove("is-swipe-active");schedule()},180);
};
grid.addEventListener("pointerup",endSwipe,{passive:true});
grid.addEventListener("pointercancel",endSwipe,{passive:true});
grid.addEventListener("scroll",schedule,{passive:true});
grid.addEventListener("scrollend",schedule,{passive:true});
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
const openDetails=card=>{
  const poster=card.querySelector(".event-poster");
  if(!poster)return;
  const title=card.querySelector(".bali-event-info h3")?.textContent||"Мероприятие BALI";
  previousFocus=document.activeElement;
  const image=document.getElementById("baliEventDetailImage");
  image.src=poster.currentSrc||poster.src;
  image.alt="Афиша "+title;
  document.getElementById("baliEventDetailTitle").textContent=title;
  document.getElementById("baliEventDetailDate").textContent=formatDate(card.dataset.eventDate);
  document.getElementById("baliEventDetailHours").textContent=card.querySelector(".bali-event-hours")?.textContent||"";
  document.getElementById("baliEventDetailDescription").textContent=
    card.querySelector(".bali-event-description")?.textContent||"Дополнительная информация появится перед мероприятием.";
  if(!dialog.open)dialog.showModal();
};
const share=async card=>{
  const title=card.querySelector(".bali-event-info h3")?.textContent||"BALI NIGHT CLUB";
  const text=title+" · "+formatDate(card.dataset.eventDate);
  const url=location.origin+location.pathname+"#events";
  try{
    if(typeof navigator.share==="function")await navigator.share({title,text,url});
    else if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(text+" — "+url);
      window.dispatchEvent(new CustomEvent("bali:toast",{detail:{message:"Ссылка на календарь скопирована"}}));
    }
  }catch(error){if(error?.name!=="AbortError")console.warn("Sharing unavailable",error)}
};
const decorate=()=>{
  for(const card of cards()){
    if(card.dataset.baliCoverflowDecorated==="1")continue;
    card.dataset.baliCoverflowDecorated="1";
    const poster=card.querySelector(".bali-event-poster-wrap");
    const actions=card.querySelector(".bali-event-actions");
    if(poster){
      poster.setAttribute("role","button");
      poster.tabIndex=0;
      poster.setAttribute("aria-label","Подробности: "+(card.querySelector(".bali-event-info h3")?.textContent||"мероприятие"));
      poster.addEventListener("click",()=>{if(performance.now()<ignoreTapUntil)return;openDetails(card)});
      poster.addEventListener("keydown",event=>{
        if(event.key==="Enter"||event.key===" "){event.preventDefault();openDetails(card)}
      });
    }
    if(actions&&!actions.querySelector(".event-share")){
      const b=document.createElement("button");
      b.type="button";b.className="event-share";b.title="Поделиться мероприятием";
      b.setAttribute("aria-label","Поделиться мероприятием");
      b.textContent="↥";
      b.addEventListener("click",()=>void share(card));
      actions.append(b);
    }
  }
  schedule();
};
new MutationObserver(decorate).observe(grid,{childList:true});
window.addEventListener("resize",schedule,{passive:true});
window.addEventListener("bali:calendar:open",()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{decorate();schedule()})));
decorate();
window.BaliCalendarShowcase=Object.freeze({move,focusIndex,getState:()=>({activeIndex,cardCount:cards().length})});
})();