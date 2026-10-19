/* BALI ID / Privilege — user-specific, Firestore-backed, no shared local IDs. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import {getFirestore,doc,getDoc,onSnapshot,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id);
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),fn=getFunctions(app,"europe-west1");
const issueQr=httpsCallable(fn,"issueGuestQr");
const DEFAULTS={
  Member:{description:"Ваш первый уровень BALI PRIVILEGE.",criteria:"Регистрация в BALI.",benefits:["Персональная цифровая карта гостя"]},
  Silver:{description:"Больше возможностей для постоянных гостей.",criteria:"Назначает администратор.",benefits:[]},
  Black:{description:"Специальные привилегии клуба.",criteria:"Назначает администратор.",benefits:[]},
  Private:{description:"Индивидуальные условия BALI.",criteria:"Назначает администратор.",benefits:[]}
};
let privilegedUnsub=null,rulesUnsub=null,walletUnsub=null,session=0,profile=null,rules=DEFAULTS,privilege=null,activeUid=null;
let walletGrants=[],qrTimer=null,qrExpiresAt=0;
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

const bonusLabels={cocktail:"Коктейли",shot:"Шоты",hookah:"Кальяны",entry:"Свободный вход",discount:"Скидка"};
function renderWallet(){
  const tiny=$("baliIdCardWallet"),big=$("baliIdWalletBalances");
  if(!tiny||!big)return;
  tiny.replaceChildren();big.replaceChildren();
  const active=walletGrants.filter(g=>{
    const expires=g.expiresAt?.toMillis?.()||0;
    return (!expires||expires>Date.now())&&(g.unlimited||g.kind==="discount"||g.remaining>0);
  });
  // Entries with different expiration dates stay distinct: avoid combining expiry incorrectly.
  for(const g of active.slice(0,12)){
    const name=bonusLabels[g.kind]||g.kind;
    const count=g.kind==="discount"?g.percent+"%":g.unlimited?"∞":String(g.remaining);
    const chip=document.createElement("span");chip.textContent=name+" "+count;tiny.append(chip);
    const card=document.createElement("div");card.className="bali-id-balance";
    const value=document.createElement("strong");value.textContent=count;
    const label=document.createElement("span");label.textContent=name;
    const detail=document.createElement("small");
    const until=g.expiresAt?.toDate?.();
    detail.textContent=(until?"До "+until.toLocaleDateString("ru-RU"):"Без срока")+(g.eventRef?" · выбранное мероприятие":"")+(g.kind==="discount"?" · "+({bar:"бар",kitchen:"кухня",all:"разрешённые позиции"}[g.appliesTo]||""):"");
    card.append(value,label,detail);big.append(card);
  }
  tiny.hidden=active.length===0;
  if(!active.length)big.textContent=activeUid?"Начисленных бонусов пока нет.":"Войдите в аккаунт, чтобы посмотреть баланс.";
}
function clearQR(){
  if(qrTimer)clearInterval(qrTimer);
  qrTimer=null;qrExpiresAt=0;
  const image=$("baliQrImage");if(image){image.removeAttribute("src");image.hidden=true}
  const text=$("baliQrText");if(text)text.textContent="";
  const panel=$("baliQrPanel");if(panel)panel.hidden=true;
}
function countdown(){
  const seconds=Math.max(0,Math.ceil((qrExpiresAt-Date.now())/1000));
  if(seconds===0){
    const img=$("baliQrImage");if(img)img.hidden=true;
    setText("baliQrExpiry","Срок QR истёк. Нажмите кнопку ещё раз.");
    if(qrTimer)clearInterval(qrTimer);qrTimer=null;
    setText("baliQrText","");
  }else setText("baliQrExpiry","Действует ещё "+seconds+" сек. Одноразовый код.");
}
$("baliShowQr")?.addEventListener("click",async()=>{
  if(!activeUid||!auth.currentUser?.emailVerified){
    setText("baliIdStatus","Войдите в профиль и активируйте BALI ID.");return;
  }
  const button=$("baliShowQr");
  button.disabled=true;clearQR();setText("baliIdStatus","Генерируем защищённый QR...");
  try{
    const result=(await issueQr({})).data;
    if(!auth.currentUser||activeUid!==auth.currentUser.uid)return;
    const image=$("baliQrImage");
    image.src=result.qrDataUrl;image.hidden=false;
    $("baliQrText").textContent="BALI:"+result.token;
    $("baliQrPanel").hidden=false;
    qrExpiresAt=result.expiresAt;countdown();
    qrTimer=setInterval(countdown,1000);setText("baliIdStatus","");
  }catch(e){setText("baliIdStatus","Не удалось создать QR: "+(e.message||e.code||"ошибка"))}
  finally{button.disabled=false}
});

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
  walletUnsub?.();walletUnsub=null;walletGrants=[];clearQR();renderWallet();
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
    walletUnsub=onSnapshot(doc(db,"guestWallets",user.uid),snapshot=>{
      if(run!==session)return;
      walletGrants=snapshot.exists()?snapshot.data().grants||[]:[];
      renderWallet();
    },()=>{if(run===session)setText("baliIdStatus","Не удалось обновить бонусы. Проверьте правила Firestore.");});
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
