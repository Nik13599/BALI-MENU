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
 const publish=()=>window.dispatchEvent(new CustomEvent("bali:interests",{
   detail:{ids:[...selected],dates:[...new Set([...selected].map(id=>id.slice(0,10)))],ready:true,localOnly:true}
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
 window.BaliInterests=Object.freeze({
   toggle,getSelected:()=>new Set(selected),isReady:()=>true,todayInMinsk
 });
 publish();
})();
