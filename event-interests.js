/**
 * BALI MENU — private "Хочу пойти" lists and public event counts.
 * Firestore transaction updates TWO documents atomically:
 *   events/{date OR date__2 OR date__3}.interestCount
 *   users/{uid}/eventInterests/{eventId}
 * A validated interest change is the only way for guests to change the count.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,collection,doc,onSnapshot,runTransaction,serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app);
const auth=getAuth(app);
let uid="";
let unsubscribe=null;
let selected=new Set();
const working=new Set();
let loaded=false;
const publish=()=>window.dispatchEvent(new CustomEvent("bali:interests",{
  detail:{ids:[...selected],dates:[...new Set([...selected].map(id=>id.slice(0,10)))],ready:loaded}
}));
function todayInMinsk(){
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
    timeZone:"Europe/Minsk",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return p.year+"-"+p.month+"-"+p.day;
}
function errorMessage(error){
  if(error?.code==="permission-denied")
    return "Не удалось сохранить мероприятие в планах. Повторите попытку позже.";
  if(error?.code==="unavailable")return "Нет соединения. Попробуйте позже.";
  return error?.message||"Не удалось сохранить выбранное событие.";
}
// Only subscribe while the guest is looking at screens showing personal plans.
// Browsing the kitchen, cart, informational pages or checkout never starts
// an event-interest Firestore subscription.
const interestPages=new Set(["home","events","profile"]);
const isRelevantPage=()=>interestPages.has(document.body.dataset.baliPage);
function stopInterestReader(){
  if(unsubscribe){unsubscribe();unsubscribe=null;}
}
function startInterestReader(){
  if(!uid||unsubscribe||!isRelevantPage())return;
  const watcherUid=uid;
  unsubscribe=onSnapshot(
    collection(db,"users",watcherUid,"eventInterests"),
    snapshot=>{
      if(uid!==watcherUid)return;
      selected=new Set(snapshot.docs.map(x=>x.id));
      loaded=true;
      publish();
    },
    error=>{
      if(uid!==watcherUid)return;
      loaded=false;
      window.dispatchEvent(new CustomEvent("bali:interests-error",{
        detail:{message:errorMessage(error)}
      }));
      publish();
    }
  );
}
onAuthStateChanged(auth,user=>{
  stopInterestReader();
  selected=new Set();loaded=false;
  uid=user?.emailVerified?user.uid:"";
  publish();
  if(!uid){loaded=true;publish();return;}
  startInterestReader();
});
window.addEventListener("bali:guest-page",event=>{
  if(interestPages.has(event.detail?.page))startInterestReader();
  else stopInterestReader();
});

async function toggle(eventId){
  if(!/^\d{4}-\d{2}-\d{2}(?:__(?:2|3))?$/.test(eventId))throw new Error("Некорректный номер мероприятия.");
  const date=eventId.slice(0,10);
  // Validate against actual event ending time below; overnight events may remain active after midnight.
  if(!window.BaliAuth || !(await window.BaliAuth.requireProfile()))return {loginRequired:true};
  const user=auth.currentUser;
  if(!user?.emailVerified||!user.email)throw new Error("Войдите через Google.");
  if(working.has(eventId))return {busy:true};
  working.add(eventId);
  try {
    const eventRef=doc(db,"events",eventId);
    const selectedRef=doc(db,"users",user.uid,"eventInterests",eventId);
    const result=await runTransaction(db,async transaction=>{
      const eventSnap=await transaction.get(eventRef);
      const wishSnap=await transaction.get(selectedRef);
      if(!eventSnap.exists())throw new Error("Мероприятие больше не найдено.");
      if(!wishSnap.exists()&&window.BaliEventLifecycle?.state(eventSnap.data())==="past")throw new Error("Мероприятие уже закончилось.");
      const current=eventSnap.data()?.interestCount??0;
      if(!Number.isSafeInteger(current)||current<0)throw new Error("Некорректный счётчик мероприятия.");
      const removing=wishSnap.exists();
      if(removing && current===0)throw new Error("Счётчик не совпадает с отметками. Обратитесь к администратору.");
      transaction.update(eventRef,{interestCount:current+(removing?-1:1)});
      if(removing){
        transaction.delete(selectedRef);
      }else{
        transaction.set(selectedRef,{
          uid:user.uid,eventDate:date,createdAt:serverTimestamp()
        });
      }
      return {selected:!removing};
    });
    return result;
  }catch(error){
    throw new Error(errorMessage(error));
  }finally{working.delete(eventId);}
}
window.BaliInterests={
  toggle,
  getSelected:()=>new Set(selected),
  isReady:()=>loaded,
  todayInMinsk
};
publish();
