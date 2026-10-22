/* BALI · "Хочу пойти": локальные планы без запросов Firebase.
 * Выбор хранится только в этом браузере и на этом устройстве.
 * Это не регистрация на мероприятие, не предзаказ и не отметка входа.
 */
(()=>{
 "use strict";
 const KEY="bali:my-plans:local:v1";
 const VALID=/^\d{4}-\d{2}-\d{2}(?:__(?:2|3))?$/;
 const parse=raw=>{
   try{
     const rows=JSON.parse(raw||"[]");
     return new Set((Array.isArray(rows)?rows:[]).filter(id=>
       typeof id==="string"&&VALID.test(id)).slice(0,200));
   }catch{return new Set();}
 };
 let selected;
 try{selected=parse(localStorage.getItem(KEY));}
 catch{selected=new Set();}
 let synced=false;
 const connected=()=>window.BaliSheets?.enabled?.()&&window.BaliAuth?.isRegistered?.();
 const publish=()=>window.dispatchEvent(new CustomEvent("bali:interests",{
   detail:{ids:[...selected],dates:[...new Set([...selected].map(id=>id.slice(0,10)))],ready:true,localOnly:!synced}
 }));
 const todayInMinsk=()=>{
   const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
     timeZone:"Europe/Minsk",year:"numeric",month:"2-digit",day:"2-digit"
   }).formatToParts(new Date()).map(item=>[item.type,item.value]));
   return parts.year+"-"+parts.month+"-"+parts.day;
 };
 async function toggle(eventId){
   if(typeof eventId!=="string"||!VALID.test(eventId))
     throw Error("Некорректный номер мероприятия.");
   const next=new Set(selected),had=next.has(eventId);
   if(connected()){
     const {plans}=await window.BaliSheets.request("plans",{
       operation:had?"remove":"add",eventId,date:eventId.slice(0,10)});
     selected=new Set((plans||[]).map(x=>x.eventId).filter(x=>VALID.test(x)));
     synced=true;publish();
     return {selected:!had};
   }
   if(had)next.delete(eventId);else next.add(eventId);
   // A blocked storage write must not falsely display a saved choice.
   try{
     localStorage.setItem(KEY,JSON.stringify([...next]));
   }catch{
     throw Error("Браузер не разрешил сохранить «Мои планы». Проверьте настройки хранения сайта.");
   }
   selected=next;
   publish();
   return {selected:!had};
 }
 window.addEventListener("storage",event=>{
   if(event.key!==KEY&&event.key!==null)return;
   try{selected=parse(localStorage.getItem(KEY));}
   catch{selected=new Set();}
   publish();
 });
 async function syncPlans(){
   if(!connected())return;
   try{
     const {plans}=await window.BaliSheets.request("plans");
     if(!connected())return;
     selected=new Set((plans||[]).map(x=>x.eventId).filter(x=>VALID.test(x)));
     synced=true;publish();
   }catch{synced=false;/* Offline local plans remain visible; do not overwrite. */}
 }
 window.addEventListener("bali:auth-state",event=>{
   if(event.detail?.registered)void syncPlans();
   else synced=false;
 });
 window.addEventListener("bali:guest-page",event=>{
   if(event.detail?.page==="profile"||event.detail?.page==="events")void syncPlans();
 });
  window.BaliInterests=Object.freeze({
   toggle,getSelected:()=>new Set(selected),isReady:()=>true,todayInMinsk
 });
 publish();
})();
