/* Guest self-check-in during an active BALI event; stored separately from "My Plans". */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,onSnapshot,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app),auth=getAuth(app);
let uid="",stop=null,selected=new Set();
const working=new Set();
const publish=()=>window.dispatchEvent(new CustomEvent("bali:checkins",{detail:{ids:[...selected]}}));
// Live-event actions appear on the home posters and calendar.
// A signed-in guest looking at menu/checkout or contacts should not incur
// a permanent Firestore check-in subscription.
const checkinPages=new Set(["home","events"]);
const checkinsVisible=()=>checkinPages.has(document.body.dataset.baliPage);
function stopCheckinReader(){if(stop){stop();stop=null;}}
function startCheckinReader(){
 if(!uid||stop||!checkinsVisible())return;
 const currentUid=uid;
 stop=onSnapshot(collection(db,"users",currentUid,"eventCheckins"),snapshot=>{
  if(uid!==currentUid)return;
  selected=new Set(snapshot.docs.map(d=>d.id));publish();
 },error=>{if(uid===currentUid)console.warn("BALI event check-in:",error.code)});
}
onAuthStateChanged(auth,user=>{
 stopCheckinReader();
 uid=user?.emailVerified?user.uid:"";
 selected=new Set();publish();
 startCheckinReader();
});
window.addEventListener("bali:guest-page",event=>{
 if(checkinPages.has(event.detail?.page))startCheckinReader();
 else stopCheckinReader();
});

async function mark(eventId){
 if(!/^\d{4}-\d{2}-\d{2}(?:__(?:2|3))?$/.test(eventId))throw Error("Недопустимое мероприятие.");
 if(selected.has(eventId))return {alreadyMarked:true};
 if(!window.BaliAuth||!(await window.BaliAuth.requireProfile()))return {loginRequired:true};
 const user=auth.currentUser;
 if(!user?.emailVerified||!user.email)throw Error("Войдите в личный кабинет.");
 if(working.has(eventId))return {busy:true};
 working.add(eventId);
 try{
  const source=await getDoc(doc(db,"events",eventId));
  if(!source.exists()||window.BaliEventLifecycle.state(source.data())!=="live")
   throw Error("Отметка доступна только во время проведения мероприятия.");
  await setDoc(doc(db,"users",user.uid,"eventCheckins",eventId),{
   uid:user.uid,eventDate:source.data().date,createdAt:serverTimestamp()
  });
  selected.add(eventId);publish();
  return {selected:true};
 }catch(error){
  if(error?.code==="permission-denied")throw Error("Не удалось сохранить отметку. Повторите попытку позже.");
  throw error;
 }finally{working.delete(eventId);}
}
window.BaliEventCheckins=Object.freeze({mark,has:id=>selected.has(id),isBusy:id=>working.has(id)});
publish();
