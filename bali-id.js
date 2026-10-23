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
  Member:{description:"Ваш первый уровень BALI PRIVILEGE.",criteria:"После ознакомления с условиями BALI ID.",benefits:["Персональная цифровая карта гостя"]},
  Silver:{description:"Ваш уровень с первыми дополнительными привилегиями.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Дополнительные клубные преимущества"]},
  Gold:{description:"Ваш уровень с расширенными преимуществами.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Расширенные клубные привилегии"]},
  Platinum:{description:"Ваш премиальный уровень BALI PRIVILEGE.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Премиальные преимущества"]},
  Black:{description:"Ваш уровень с особыми клубными привилегиями.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Особые клубные привилегии"]},
  Private:{description:"Закрытый статус по приглашению.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Индивидуальные привилегии по решению администрации"]},
  ResidentDJ:{description:"",criteria:"Только по назначению директора или администратора для DJ-резидентов BALI.",benefits:["Безлимит замесов","Возможность ночевки в клубе","Работать за бесплатно"]}
};
let privilegedUnsub=null,rulesUnsub=null,coinUnsub=null,session=0,profile=null,rules=DEFAULTS,privilege=null,activeUid=null;
const setLoading=value=>{
  const scene=$("baliIdFlipScene");
  if(scene){scene.dataset.baliLoading=String(value);scene.setAttribute("aria-busy",String(value===true));}
};
const displayNumber=n=>Number.isSafeInteger(n)&&n>0?String(n).padStart(6,"0"):"— — — — — —";
const cleanText=x=>typeof x==="string"?x.trim():"";
const displayTier=tier=>tier==="ResidentDJ"?"RESIDENT BALI - DJ":tier.toUpperCase();
const setText=(id,value)=>{if($(id))$(id).textContent=value;};
function offerRetry(){
  const status=$("baliIdStatus");
  if(!status)return;
  const retry=document.createElement("button");
  retry.type="button";retry.textContent="Повторить загрузку";retry.id="baliIdRetry";
  retry.addEventListener("click",()=>void initializeForUser(auth.currentUser,{force:true}));
  status.append(retry);
}
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
    for(const text of [...new Set(values)].slice(0,5)){
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
    // An unavailable assignment is not evidence that the guest is a Member.
    throw error;
  }
}
async function allocate(uid,run){
  const idRef=doc(db,"baliIds",uid),counterRef=doc(db,"baliCounters","guests");
  try{
    // Returning guests read their immutable number without touching the counter.
    const saved=await getDoc(idRef);
    const value=saved.exists()?saved.data().number:await runTransaction(db,async tx=>{
      const [existing,counter]=await Promise.all([tx.get(idRef),tx.get(counterRef)]);
      if(existing.exists())return existing.data().number;
      const number=(counter.exists()?Number(counter.data()?.count)||0:0)+1;
      if(number>999999999)throw Error("Лимит нумерации BALI ID исчерпан");
      tx.set(idRef,{uid,number,createdAt:serverTimestamp()});
      tx.set(counterRef,{count:number,lastUid:uid,updatedAt:serverTimestamp()});
      return number;
    });
    if(!Number.isSafeInteger(value)||value<1||value>999999999)throw Error("invalid-card-number");
    if(session===run)setText("baliCardNumber",displayNumber(value));
    return true;
  }catch(e){
    if(session!==run)return;
    setText("baliIdStatus",e.code==="permission-denied"
      ?"Не удалось активировать номер BALI ID. Повторите попытку позже."
      :"Не удалось получить BALI ID. Повторите попытку позже.");
    offerRetry();
    return false;
  }
}
window.addEventListener("bali:auth-state",({detail})=>{
  profile=detail?.registered?{name:detail.name}:null;
  render();
  // Profile registration alone never creates a card; onboarding is mandatory.
  const user=auth.currentUser;
  // Profile changes may occur on home, menu or while filling a preorder.
  // Only the open BALI ID page may initiate protected card reads.
  if(document.body.dataset.baliPage==="id" &&
     detail?.registered&&user?.emailVerified&&activeUid!==user.uid)
    void initializeForUser(user);
});
async function initializeForUser(user,{force=false}={}){
  if(!force&&user?.uid===activeUid)return;
  const run=++session;
  privilegedUnsub?.();privilegedUnsub=null;
  rulesUnsub?.();rulesUnsub=null;
  coinUnsub?.();coinUnsub=null;
  profile=null;privilege=null;rules=DEFAULTS;activeUid=null;
  setText("baliIdStatus","");setText("baliCardNumber","— — — — — —");
  setText("baliIdCoinAmount","—");
  setLoading(true);
  if(!user||!user.emailVerified){render();setLoading(false);return;}
  try{
    await window.BaliAuth?.ready;
    if(run!==session||auth.currentUser?.uid!==user.uid)return;
    const profileData=window.BaliAuth?.getProfile?.();
    if(!profileData){render();setLoading(false);return;}
    // Check persisted acknowledgement before ANY writes (Member or ID counter).
    const consent=await getDoc(doc(db,"users",user.uid,"baliIdAgreements","privilege"));
    if(run!==session||auth.currentUser?.uid!==user.uid)return;
    if(!consent.exists()||consent.data()?.version!==1){render();setLoading(false);return;}
    activeUid=user.uid;profile=profileData;
    setText("baliIdStatus","");
    // Register once: the counter and guest number form one atomic transaction.
    const [allocated,tierRules,assigned]=await Promise.all([
      allocate(user.uid,run),
      getDoc(doc(db,"privilegeRules","main")).catch(()=>null),
      ensureMemberAssignment(user.uid)
    ]);
    if(run!==session)return;
    if(allocated)setText("baliIdStatus","");
    if(allocated){
      // Watch the single Firebase COIN balance only while the BALI ID page is open.
      coinUnsub=onSnapshot(doc(db,"baliCoinAccounts",user.uid),snapshot=>{
        if(run!==session)return;
        const value=snapshot.exists()?snapshot.data().balance:0;
        setText("baliIdCoinAmount",Number.isSafeInteger(value)&&value>=0?
          new Intl.NumberFormat("ru-RU").format(value):"—");
      },()=>{if(run===session)setText("baliIdCoinAmount","—");});
    }
    if(tierRules?.exists()){
      const values=tierRules.data()?.levels||{};
      rules=Object.fromEntries(Object.keys(DEFAULTS).map(tier=>[tier,{
        description:cleanText(values[tier]?.description)||DEFAULTS[tier].description,
        criteria:cleanText(values[tier]?.criteria)||DEFAULTS[tier].criteria,
        benefits:Array.isArray(values[tier]?.benefits)?values[tier].benefits.filter(v=>typeof v==="string").slice(0,5):DEFAULTS[tier].benefits
      }]));
    }
    if(assigned)privilege=assigned;
    render();setLoading(allocated?false:"error");
    rulesUnsub=onSnapshot(doc(db,"privilegeRules","main"),snapshot=>{
      if(run!==session||!snapshot.exists())return;
      const values=snapshot.data()?.levels||{};
      rules=Object.fromEntries(Object.keys(DEFAULTS).map(tier=>[tier,{
        description:cleanText(values[tier]?.description)||DEFAULTS[tier].description,
        criteria:cleanText(values[tier]?.criteria)||DEFAULTS[tier].criteria,
        benefits:Array.isArray(values[tier]?.benefits)?values[tier].benefits.filter(v=>typeof v==="string").slice(0,5):DEFAULTS[tier].benefits
      }]));
      render();
    });
    privilegedUnsub=onSnapshot(doc(db,"guestPrivileges",user.uid),snapshot=>{
      if(run!==session||snapshot.metadata?.fromCache)return;
      privilege=snapshot.exists()?snapshot.data():null;render();
    },()=>{if(run===session)setText("baliIdStatus","Не удалось обновить привилегии. Перезагрузите страницу.");});
  }catch(e){
    if(run===session){
      setText("baliIdStatus","Не удалось загрузить привилегии: "+(e.code||"ошибка сети"));
      setLoading("error");offerRetry();
    }
  }
}
const cardIsOpen=()=>document.body.dataset.baliPage==="id";
const resumeCard=user=>void initializeForUser(cardIsOpen()?user:null);
window.addEventListener("bali:id-accepted",event=>{
  if(cardIsOpen()&&event.detail?.uid===auth.currentUser?.uid)
    void initializeForUser(auth.currentUser);
});
window.addEventListener("bali:guest-page",event=>{
  if(event.detail?.page==="id")resumeCard(auth.currentUser);
  else void initializeForUser(null); // Also invalidate any asynchronous card setup in flight.
});
onAuthStateChanged(auth,resumeCard);
// Firestore coin account listener updates the displayed balance automatically.
