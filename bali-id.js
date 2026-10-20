/* BALI ID / Privilege — user-specific, Firestore-backed, no shared local IDs. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,onSnapshot,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id);
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app);
const TIERS=["Member","Silver","Gold","Platinum","Black","Private","ResidentDJ"];
// Default copy mirrors the six approved BALI ID category references.
// These descriptions do not issue free products or discounts.
const DEFAULTS={
  Member:{description:"Ваш первый уровень BALI PRIVILEGE.",criteria:"Автоматически после регистрации.",benefits:["Персональная цифровая карта гостя"]},
  Silver:{description:"Ваш уровень с первыми дополнительными привилегиями.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Дополнительные клубные преимущества"]},
  Gold:{description:"Ваш уровень с расширенными преимуществами.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Расширенные клубные привилегии"]},
  Platinum:{description:"Ваш премиальный уровень BALI PRIVILEGE.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Премиальные преимущества"]},
  Black:{description:"Ваш уровень с особыми клубными привилегиями.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Особые клубные привилегии"]},
  Private:{description:"Закрытый статус по приглашению.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Индивидуальные привилегии по решению администрации"]},
  ResidentDJ:{description:"",criteria:"Только по назначению директора или администратора для DJ-резидентов BALI.",benefits:["Безлимит замесов","Возможность ночевки в клубе","Работать за бесплатно"]}
};
let privilegedUnsub=null,rulesUnsub=null,session=0,profile=null,rules=DEFAULTS,privilege=null,activeUid=null;
const displayNumber=n=>Number.isSafeInteger(n)&&n>0?String(n).padStart(6,"0"):"— — — — — —";
const cleanText=x=>typeof x==="string"?x.trim():"";
const displayTier=tier=>tier==="ResidentDJ"?"RESIDENT BALI - DJ":tier.toUpperCase();
const setText=(id,value)=>{if($(id))$(id).textContent=value;};
function render(){
  const tier=TIERS.includes(privilege?.tier)?privilege.tier:"Member";
  const cardScene=$("baliIdFlipScene");
  if(cardScene)cardScene.dataset.baliTier=tier.toLowerCase();
  const config=rules[tier]||DEFAULTS[tier];
  setText("baliCardName",cleanText(profile?.name)||"ГОСТЬ BALI");
  setText("baliCardTier",displayTier(tier));
  setText("baliBenefitsTier",displayTier(tier));
  setText("baliCardHeaderTier",displayTier(tier));
  const description=cleanText(config?.description)||DEFAULTS[tier].description;
  setText("baliBenefitsDescription",description);
  if($("baliBenefitsDescription"))$("baliBenefitsDescription").hidden=!description;
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
async function ensureMemberAssignment(uid){
  const ref=doc(db,"guestPrivileges",uid);
  try{
    const previous=await getDoc(ref);
    if(previous.exists())return previous.data();
    // A user may CREATE their own initial Member record exactly once; Firestore
    // rules block any user updates or direct upgrades. Concurrent assignment by
    // staff wins; a conflicting create is ignored and reread.
    try{
      await setDoc(ref,{uid,tier:"Member",benefits:[],updatedBy:uid,updatedAt:serverTimestamp()});
    }catch(error){
      const current=await getDoc(ref).catch(()=>null);
      if(current?.exists())return current.data();
      throw error;
    }
    return {uid,tier:"Member",benefits:[]};
  }catch(error){
    // During Firestore rules rollout the default Member artwork still works.
    // Never let a missing assignment override an existing privilege locally.
    return null;
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
      getDoc(doc(db,"privilegeRules","main")).catch(()=>null),
      ensureMemberAssignment(user.uid)
    ]);
    if(run!==session)return;
    if(tierRules?.exists()){
      const values=tierRules.data()?.levels||{};
      rules=Object.fromEntries(Object.keys(DEFAULTS).map(tier=>[tier,{
        description:cleanText(values[tier]?.description)||DEFAULTS[tier].description,
        criteria:cleanText(values[tier]?.criteria)||DEFAULTS[tier].criteria,
        benefits:Array.isArray(values[tier]?.benefits)?values[tier].benefits.filter(v=>typeof v==="string").slice(0,10):DEFAULTS[tier].benefits
      }]));
    }
    if(assigned)privilege=assigned;
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
