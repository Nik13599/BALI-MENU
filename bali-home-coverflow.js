/* BALI: responsive 3D home poster carousel.
   Firestore and placeholder data still belong entirely to app.js. */
(()=>{
 "use strict";
 const track=document.getElementById("homeEventCarousel");
 if(!track)return;
 const desktop=matchMedia("(min-width:1180px)");
 const reduce=matchMedia("(prefers-reduced-motion:reduce)");
 const cards=()=>[...track.querySelectorAll(":scope>.bali-home-event-card")];
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 let index=0,key="",raf=0,lastWheel=0,start=null,previous,next;
 const identity=(el,i)=>el?.dataset.eventId||"placeholder-"+i;
 function controls(){
   if(!previous?.isConnected){
     previous=document.createElement("button");previous.type="button";
     previous.className="bali-home-coverflow-arrow bali-home-coverflow-prev";
     previous.setAttribute("aria-label","Предыдущая афиша");previous.textContent="‹";
     previous.addEventListener("click",()=>move(-1));track.append(previous);
   }
   if(!next?.isConnected){
     next=document.createElement("button");next.type="button";
     next.className="bali-home-coverflow-arrow bali-home-coverflow-next";
     next.setAttribute("aria-label","Следующая афиша");next.textContent="›";
     next.addEventListener("click",()=>move(1));track.append(next);
   }
 }
 function draw(){
   const entries=cards(),len=entries.length;
   track.dataset.baliCoverflow="on";
   controls();
   previous.disabled=index<=0||len===0;next.disabled=index>=len-1||len===0;
   if(!len)return;
   index=clamp(index,0,len-1);
   key=identity(entries[index],index);
   const area=track.getBoundingClientRect();
   if(area.width<50||area.height<30)return;
   const size=Math.floor(Math.max(45,Math.min(area.height*.95,area.width*(desktop.matches?.28:.44),desktop.matches?210:190)));
   const step=Math.min(area.width*.28,size*(desktop.matches?1.12:.87));
   track.style.setProperty("--bali-home-coverflow-size",size+"px");
   entries.forEach((card,i)=>{
     const d=i-index,a=Math.abs(d),active=a===0,visible=a<=1;
     card.style.setProperty("--bali-home-x",(d*step).toFixed(1)+"px");
     card.style.setProperty("--bali-home-turn",(!active&&!reduce.matches?-Math.sign(d)*(desktop.matches?45:24):0)+"deg");
     card.style.setProperty("--bali-home-scale",active?"1":".84");
     card.style.setProperty("--bali-home-fade",active?"1":visible?".68":"0");
     card.style.setProperty("--bali-home-layer",active?"10":visible?"2":"0");
     card.classList.toggle("is-home-active",active);
     card.classList.toggle("is-home-neighbor",visible&&!active);
     card.setAttribute("aria-hidden",String(!active));
     card.inert=!active;card.style.visibility=visible?"visible":"hidden";
   });
   previous.disabled=index===0;next.disabled=index===len-1;
   track.setAttribute("aria-label","Карусель афиш: "+(index+1)+" из "+len);
 }
 function sync(){
   const list=cards();
   const chosen=key?list.findIndex((el,i)=>identity(el,i)===key):-1;
   index=chosen>=0?chosen:0;draw();
 }
 function move(amount){if(!cards().length)return;index=clamp(index+amount,0,cards().length-1);draw()}
 new MutationObserver(records=>{
   if(!records.some(r=>r.type==="childList"))return;
   cancelAnimationFrame(raf);raf=requestAnimationFrame(sync);
 }).observe(track,{childList:true});
 track.addEventListener("wheel",event=>{
   if(!desktop.matches||event.ctrlKey||Math.abs(event.deltaY)<5||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
   event.preventDefault();
   if(performance.now()-lastWheel<350)return;
   lastWheel=performance.now();move(event.deltaY>0?1:-1);
 },{passive:false});
 track.addEventListener("keydown",event=>{
   if(event.target!==track||!["ArrowLeft","ArrowRight"].includes(event.key))return;
   event.preventDefault();move(event.key==="ArrowRight"?1:-1);
 });
 track.addEventListener("pointerdown",event=>{
   if(!event.isPrimary||event.target.closest("button"))return;
   start={id:event.pointerId,x:event.clientX,y:event.clientY};
 },{passive:true});
 track.addEventListener("pointerup",event=>{
   if(!start||event.pointerId!==start.id)return;
   const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;
   if(Math.abs(dx)>30&&Math.abs(dx)>Math.abs(dy)*1.2)move(dx<0?1:-1);
 },{passive:true});
 track.addEventListener("pointercancel",()=>{start=null},{passive:true});
 window.addEventListener("resize",()=>requestAnimationFrame(draw),{passive:true});
 desktop.addEventListener("change",()=>requestAnimationFrame(draw));
 if(typeof ResizeObserver==="function")new ResizeObserver(()=>requestAnimationFrame(draw)).observe(track);
 window.BaliHomeCarousel=Object.freeze({move,refresh:sync,getState:()=>({index,count:cards().length,key})});
 sync();
})();
