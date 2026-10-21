/* BALI calendar — real Minsk clock, month/day controls and event-carousel sync.
   Never manufactures event dates; it reads only the existing Firebase-backed cards. */
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const panel=$("baliCalendarPanel"),grid=$("eventsGrid");
 if(!panel||!grid)return;
 const dateLabel=$("baliCalendarCurrentDate"),clock=$("baliCalendarClock"),
   monthName=$("baliCalendarMonthName"),days=$("baliCalendarDays"),
   weekstrip=$("baliCalendarWeekstrip"),selection=$("baliCalendarSelection"),
   toggle=$("baliCalendarToggle"),monthGrid=$("baliCalendarGrid");
 const zone="Europe/Minsk";
 const isoPattern=/^\d{4}-\d{2}-\d{2}$/;
 const iso=(y,m,d)=>String(y).padStart(4,"0")+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0");
 const utcDay=s=>new Date(s+"T12:00:00Z");
 const getNow=()=>{
   const parts=new Intl.DateTimeFormat("en-GB",{
     timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",
     hour:"2-digit",minute:"2-digit",hourCycle:"h23"
   }).formatToParts(new Date());
   const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
   return {date:iso(p.year,p.month,p.day),time:p.hour+":"+p.minute};
 };
 const describe=(s,options)=>new Intl.DateTimeFormat("ru-RU",{
   timeZone:"UTC",...options
 }).format(utcDay(s));
 const eventCards=()=>[...grid.querySelectorAll(".event-card[data-event-date]")];
 const valid=s=>isoPattern.test(s||"")&&!Number.isNaN(utcDay(s).valueOf());
 const current=getNow();
 let selected=current.date,year=Number(selected.slice(0,4)),
   month=Number(selected.slice(5,7));
 let hasInteracted=false,lockUntil=0,opened=0;
 let lastEventDate=null,expanded=false;
 let plannedDates=new Set(),eventSnapshot=[];
 const planDates=values=>new Set((Array.isArray(values)?values:[])
   .filter(value=>typeof value==="string")
   .map(value=>value.replace(/__[23]$/,""))
   .filter(valid));
 const lifecycle=window.BaliEventLifecycle;
 let lastRange="";
 const validHexColor=c=>typeof c==="string"&&/^#[0-9a-fA-F]{6}$/.test(c);
 const calendarEvents=()=>{
   // Live server snapshots include past and future dates; local poster cards
   // are also accepted, allowing multiple dots for multiple event instances
   // if/when publishing on the same date is enabled.
   const items=eventSnapshot.map(event=>({
     date:event.date,color:validHexColor(event.dotColor)?event.dotColor:"#b9ff51",
     id:event.id||event.date,status:lifecycle.state(event),title:event.title||"Мероприятие"
   })).filter(event=>valid(event.date));
   const existing=new Set(items.map(event=>event.id));
   for(const card of eventCards()){
     const date=card.dataset.eventDate,id=card.dataset.eventId||date;
     if(!valid(date)||existing.has(id))continue;
     items.push({date,id,color:validHexColor(card.dataset.dotColor)?card.dataset.dotColor:"#b9ff51",status:card.dataset.eventStatus||"upcoming",title:card.querySelector("h3")?.textContent||"Мероприятие"});
     existing.add(id);
   }
   return items;
 };
 const eventsByDate=()=>{
   const map=new Map();
   for(const event of calendarEvents()){
     if(!map.has(event.date))map.set(event.date,[]);
     map.get(event.date).push(event);
   }
   return map;
 };
 const publishedDates=()=>new Set(calendarEvents().map(event=>event.date));
 const stamp=(s)=>s.split("-").map(Number);
 const setLabel=()=>{
   const live=getNow();
   dateLabel.textContent=describe(live.date,{weekday:"long",day:"numeric",month:"long"});
   clock.textContent=live.time;
   clock.dateTime=live.time;
   if(live.date!==current.date){
     const followToday=!hasInteracted&&selected===current.date;
     current.date=live.date;
     if(followToday){selected=live.date;[year,month]=stamp(selected);}
     // Refresh past-day markers even when the guest is viewing another month.
     render();
   }
 };
 function makeDay(s,compact=false){
   const items=eventsByDate().get(s)||[];
   const published=items.length>0;
   const planned=plannedDates.has(s);
   const liveDate=getNow().date;
   const today=s===liveDate;
   const past=published&&items.every(e=>e.status==="past");
   const live=items.some(e=>e.status==="live");
   const btn=document.createElement("button");
   btn.type="button";btn.className="bali-calendar-day";
   btn.dataset.date=s;
   btn.dataset.selected=String(s===selected);
   btn.dataset.today=String(today);
   btn.dataset.event=String(published);
   btn.dataset.past=String(past);
   btn.dataset.live=String(live);
   if(published){
     // The n independent sectors represent the n published events on this date.
     // One live + one upcoming makes a half-yellow, half-lime day.
     const total=items.length;
     const sectors=items.map((event,i)=>{
       const color=lifecycle.colors[event.status]||lifecycle.colors.upcoming;
       return color+" "+(i*100/total).toFixed(3)+"% "+((i+1)*100/total).toFixed(3)+"%";
     });
     const statuses=new Set(items.map(event=>event.status));
     btn.dataset.lifecycle="true";
     btn.dataset.lifecycleStatus=statuses.size>1?"mixed":items[0].status;
     btn.style.setProperty("--bali-day-segments","linear-gradient(90deg,"+sectors.join(",")+")");
     btn.style.setProperty("--bali-day-accent",live?"#f4c84b":past?"#fa6070":"#b9ff51");
   }
   btn.dataset.planned=String(planned);
   btn.dataset.eventCount=String(items.length);
   btn.setAttribute("aria-pressed",String(s===selected));
   btn.setAttribute("aria-label",describe(s,{weekday:"long",day:"numeric",month:"long",year:"numeric"})+
     (published?". Мероприятий: "+items.length+".":"")+
     (items.length?items.map(e=>e.title+": "+({live:"идёт",past:"прошло",upcoming:"скоро"}[e.status])).join(". ")+".":"")+
     (planned?" В моих планах.":""));
   const number=document.createElement("span");number.className="bali-calendar-day-number";
   number.textContent=String(Number(s.slice(-2)));
   btn.append(number);
   if(compact){
     const dayName=document.createElement("small");
     dayName.textContent=describe(s,{weekday:"short"}).replace(".","").toUpperCase();
     btn.prepend(dayName);
   }
   if(published){
     const dots=document.createElement("span");
     dots.className="bali-calendar-event-dots";
     dots.setAttribute("aria-hidden","true");
     for(const item of items){
       const dot=document.createElement("span");
       dot.className="bali-calendar-event-dot";
       dot.style.setProperty("--bali-event-dot-color",lifecycle.colors[item.status]||item.color);
       dot.dataset.status=item.status;
       dots.append(dot);
     }
     btn.append(dots);
   }
   return btn;
 }
 function render(){
   const range=lifecycle.monthRange(year,month);
   const key=range.start+"/"+range.end;
   if(key!==lastRange){
     lastRange=key;
     window.dispatchEvent(new CustomEvent("bali:calendar:range",{detail:range}));
   }
   const monthStart=iso(year,month,1);
   monthName.textContent=describe(monthStart,{month:"long"})+" "+year;
   days.replaceChildren();weekstrip.replaceChildren();
   const monthFirst=new Date(Date.UTC(year,month-1,1));
   const offset=(monthFirst.getUTCDay()+6)%7;
   const count=new Date(Date.UTC(year,month,0)).getUTCDate();
   const cells=Math.ceil((offset+count)/7)*7;
   for(let i=0;i<cells;i++){
     const date=new Date(Date.UTC(year,month-1,i-offset+1));
     const s=iso(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate());
     const cell=makeDay(s);
     if(date.getUTCMonth()+1!==month)cell.classList.add("is-outside");
     days.append(cell);
   }
   const [sy,sm,sd]=stamp(selected);
   const base=new Date(Date.UTC(sy,sm-1,sd));
   if(sy!==year||sm!==month)base.setUTCDate(1);
   const mon=(base.getUTCDay()+6)%7;
   base.setUTCDate(base.getUTCDate()-mon);
   for(let i=0;i<7;i++){
     const d=new Date(base);d.setUTCDate(d.getUTCDate()+i);
     const s=iso(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
     weekstrip.append(makeDay(s,true));
   }
   const exact=publishedDates().has(selected);
   selection.textContent=exact
     ?"На "+describe(selected,{day:"numeric",month:"long"})+" опубликовано мероприятие."
     :"На "+describe(selected,{day:"numeric",month:"long"})+" афиша не опубликована.";
   panel.dataset.expanded=String(expanded);
   toggle.setAttribute("aria-expanded",String(expanded));
 }
 function goToDate(s){
   if(!valid(s))return;
   selected=s;[year,month]=stamp(s);hasInteracted=false;lockUntil=performance.now()+1100;
   render();
   const cards=eventCards();
   const exact=cards.find(c=>c.dataset.eventDate===s);
   const next=exact||cards.find(c=>c.dataset.eventDate>=s);
   if(next){
     if(window.BaliCalendarShowcase?.mode==="stage"){
       const index=cards.indexOf(next);
       if(index>=0)window.BaliCalendarShowcase.focusIndex(index,true);
     }else{
       const viewport=grid.getBoundingClientRect(),rect=next.getBoundingClientRect();
       const left=grid.scrollLeft+rect.left+rect.width/2-viewport.left-viewport.width/2;
       grid.scrollTo({left:Math.max(0,left),
         behavior:window.matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth"});
     }
   }
   // The calendar stays on the exact day chosen even if only a later poster exists.
   // Scrolling the carousel after the selection synchronizes it to the visible poster.
 }
 function moveMonth(shift){
   const dt=new Date(Date.UTC(year,month-1+shift,1));
   year=dt.getUTCFullYear();month=dt.getUTCMonth()+1;
   render();
 }
 panel.addEventListener("click",e=>{
   const date=e.target.closest("button[data-date]");
   if(date){goToDate(date.dataset.date);if(window.matchMedia("(max-width:767px)").matches){expanded=false;render();}return;}
 });
 $("baliCalendarPrev").addEventListener("click",()=>moveMonth(-1));
 $("baliCalendarNext").addEventListener("click",()=>moveMonth(1));
 $("baliCalendarToday").addEventListener("click",()=>goToDate(getNow().date));
 toggle.addEventListener("click",()=>{
   if(window.matchMedia("(max-width:767px)").matches){
     expanded=!expanded;render();
   }else{
     const currentMonth=selected.slice(0,7);
     if(currentMonth!==iso(year,month,1).slice(0,7)){
       [year,month]=stamp(selected);render();
     }else goToDate(getNow().date);
   }
 });
 function markManual(){hasInteracted=true;}
 grid.addEventListener("pointerdown",markManual,{passive:true});
 grid.addEventListener("touchstart",markManual,{passive:true});
 grid.addEventListener("wheel",markManual,{passive:true});
 grid.addEventListener("keydown",event=>{
   if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key))markManual();
 });
 window.addEventListener("bali:calendar:active-event",event=>{
   const date=event.detail?.date;
   if(!valid(date)||document.body.dataset.baliPage!=="events")return;
   if(performance.now()<lockUntil)return;
   if(!hasInteracted&&!event.detail?.forced)return;
   if(date===lastEventDate&&date===selected)return;
   lastEventDate=date;selected=date;
   const visible=lifecycle.monthRange(year,month);
   if(date<visible.start||date>visible.end)[year,month]=stamp(date);
   render();
 });
 // Repaint immediately after optimistic RSVP (and after the authoritative
 // Firebase snapshot), without resetting selected month or carousels.
 window.addEventListener("bali:calendar:plans-changed",event=>{
   plannedDates=planDates(event.detail?.dates);
   render();
 });
 window.addEventListener("bali:interests",event=>{
   plannedDates=planDates(event.detail?.dates);
   render();
 });
 window.addEventListener("bali:events",event=>{
   eventSnapshot=Array.isArray(event.detail?.events)?event.detail.events:[];
   render();
 });
 const mutation=new MutationObserver(()=>render());
 mutation.observe(grid,{childList:true});
 window.addEventListener("bali:calendar:open",()=>{
   opened++;const now=getNow();
   selected=now.date;[year,month]=stamp(selected);
   lastEventDate=null;hasInteracted=false;lockUntil=performance.now()+900;
   expanded=false;render();setLabel();
 });
 setLabel();render();
 let lastMinute="";
 window.setInterval(()=>{
   setLabel();
   const now=getNow(),minute=now.date+"T"+now.time;
   if(minute===lastMinute)return;
   lastMinute=minute;
   render();
   window.dispatchEvent(new CustomEvent("bali:calendar:tick"));
 },10000);
})();
