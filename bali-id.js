/* BALI ID / Privilege — user-specific, Firestore-backed, no shared local IDs. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,onSnapshot,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id);
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app);
const DEFAULTS={
  Member:{description:"Ваш первый уровень BALI PRIVILEGE.",criteria:"Регистрация в BALI.",benefits:["Персональная цифровая карта гостя"]},
  Silver:{description:"Больше возможностей для постоянных гостей.",criteria:"Назначает администратор.",benefits:[]},
  Black:{description:"Специальные привилегии клуба.",criteria:"Назначает администратор.",benefits:[]},
  Private:{description:"Индивидуальные условия BALI.",criteria:"Назначает администратор.",benefits:[]}
};
let privilegedUnsub=null,rulesUnsub=null,session=0,profile=null,rules=DEFAULTS,privilege=null,activeUid=null;
const displayNumber=n=>Number.isSafeInteger(n)&&n>0?String(n).padStart(6,"0"):"— — — — — —";
const cleanText=x=>typeof x==="string"?x.trim():"";
const setText=(id,value)=>{if($(id))$(id).textContent=value;};
function render(){
  const tier=["Member","Silver","Black","Private"].includes(privilege?.tier)?privilege.tier:"Member";
  const config=rules[tier]||DEFAULTS[tier];
  setText("baliCardName",cleanText(profile?.name)||"ГОСТЬ BALI");
  setText("baliCardTier",tier.toUpperCase());
  setText("baliBenefitsTier",tier.toUpperCase());
  setText("baliBenefitsDescription",cleanText(config?.description)||DEFAULTS[tier].description);
  const values=[...(Array.isArray(config?.benefits)?config.benefits:[]),
    ...(Array.isArray(privilege?.benefits)?privilege.benefits:[])].filter(x=>cleanText(x));
  const list=$("baliBenefitsList");if(list){
    list.replaceChildren();
    for(const text of new Set(values)){
      const line=document.createElement("li");line.textContent=text;list.append(line);
    }
    if(!values.length){const li=document.createElement("li");li.textContent="Индивидуальные предложения появятся здесь после назначения администратором.";list.append(li);}
  }
}
async function allocate(uid,run){
  const idRef=doc(db,"baliIds",uid),counterRef=doc(db,"baliCounters","guests");
  try{
    const value=await runTransaction(db,async tx=>{
      const [existing,counter]=await Promise.all([tx.get(idRef),tx.get(counterRef)]);
      if(existing.exists())return existing.data().number;
      const number=(counter.exists()?Number(counter.data()?.count)||0:0)+1;
      if(number>999999999)throw Error("Лимит нумерации BALI ID исчерпан");
      tx.set(idRef,{uid,number,createdAt:serverTimestamp()});
      tx.set(counterRef,{count:number,lastUid:uid,updatedAt:serverTimestamp()});
      return number;
    });
    if(session===run)setText("baliCardNumber",displayNumber(value));
  }catch(e){
    if(session!==run)return;
    setText("baliIdStatus",e.code==="permission-denied"
      ?"Номер BALI ID ожидает активации новых правил Firebase администратором."
      :"Не удалось получить BALI ID: "+(e.code||"ошибка сети")+". Повторите открытие профиля.");
  }
}
const gear=$("baliProfileSettings"),panel=$("baliProfileSettingsPanel");
gear?.addEventListener("click",()=>{panel.hidden=!panel.hidden;gear.setAttribute("aria-expanded",String(!panel.hidden));});
$("baliIdEditData")?.addEventListener("click",()=>window.BaliAuth?.open());
$("baliIdSignOut")?.addEventListener("click",()=>$("profileLogoutBtn")?.click());
window.addEventListener("bali:auth-state",({detail})=>{
  profile=detail?.registered?{name:detail.name}:null;
  render();
  // A guest may complete the profile after the first Google sign-in event.
  // Allocate immediately after successful registration, without a reload.
  const user=auth.currentUser;
  if(detail?.registered&&user?.emailVerified&&activeUid!==user.uid)
    void initializeForUser(user);
});
async function initializeForUser(user){
  if(user?.uid===activeUid)return;
  const run=++session;
  privilegedUnsub?.();privilegedUnsub=null;
  rulesUnsub?.();rulesUnsub=null;
  profile=null;privilege=null;rules=DEFAULTS;activeUid=null;
  setText("baliIdStatus","");setText("baliCardNumber","— — — — — —");
  if(!user||!user.emailVerified){render();return;}
  try{
    await window.BaliAuth?.ready;
    if(run!==session||auth.currentUser?.uid!==user.uid)return;
    const profileData=window.BaliAuth?.getProfile?.();
    if(!profileData){render();return;}
    activeUid=user.uid;profile=profileData;render();
    setText("baliIdStatus","Загружаем вашу карту...");
    // Register once: the counter and guest number form one atomic transaction.
    await allocate(user.uid,run);
    if(run!==session)return;
    setText("baliIdStatus","");
    const [tierRules,assigned]=await Promise.all([
      getDoc(doc(db,"privilegeRules","main")),getDoc(doc(db,"guestPrivileges",user.uid))
    ]);
    if(run!==session)return;
    if(tierRules.exists()){
      const values=tierRules.data()?.levels||{};
      rules=Object.fromEntries(Object.keys(DEFAULTS).map(tier=>[tier,{
        description:cleanText(values[tier]?.description)||DEFAULTS[tier].description,
        criteria:cleanText(values[tier]?.criteria)||DEFAULTS[tier].criteria,
        benefits:Array.isArray(values[tier]?.benefits)?values[tier].benefits.filter(v=>typeof v==="string").slice(0,10):DEFAULTS[tier].benefits
      }]));
    }
    if(assigned.exists())privilege=assigned.data();
    render();
    rulesUnsub=onSnapshot(doc(db,"privilegeRules","main"),snapshot=>{
      if(run!==session||!snapshot.exists())return;
      const values=snapshot.data()?.levels||{};
      rules=Object.fromEntries(Object.keys(DEFAULTS).map(tier=>[tier,{
        description:cleanText(values[tier]?.description)||DEFAULTS[tier].description,
        criteria:cleanText(values[tier]?.criteria)||DEFAULTS[tier].criteria,
        benefits:Array.isArray(values[tier]?.benefits)?values[tier].benefits.filter(v=>typeof v==="string").slice(0,10):DEFAULTS[tier].benefits
      }]));
      render();
    });
    privilegedUnsub=onSnapshot(doc(db,"guestPrivileges",user.uid),snapshot=>{
      if(run!==session)return;
      privilege=snapshot.exists()?snapshot.data():null;render();
    },()=>{if(run===session)setText("baliIdStatus","Не удалось обновить привилегии. Перезагрузите страницу.");});
  }catch(e){
    if(run===session)setText("baliIdStatus","Не удалось загрузить привилегии: "+(e.code||"ошибка сети"));
  }
}
onAuthStateChanged(auth,initializeForUser);
