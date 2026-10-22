/* BALI ID banking-style quantity wallet and guest transfers.
 * Only Firebase Cloud Functions can create, transfer and debit benefits.
 * The browser never writes guestWallets, bonusTransfers or walletOperations.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import {sheetsEnabled,sheetsRequest} from "./bali-sheets-api.js";
const $=id=>document.getElementById(id);
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,"europe-west1");
const firebaseLookupFn=httpsCallable(functions,"previewBaliRecipient");
const firebaseTransferFn=httpsCallable(functions,"transferBaliBenefits");
const firebaseHistoryFn=httpsCallable(functions,"listMyBaliHistory");
const firebaseKindsFn=httpsCallable(functions,"listBaliBonusKinds");
const lookupFn=async request=>sheetsEnabled()
  ?{data:(await sheetsRequest("bonusRecipient",request)).recipient}:firebaseLookupFn(request);
const transferFn=async request=>sheetsEnabled()
  ?{data:(await sheetsRequest("bonusTransfer",request)).result}:firebaseTransferFn(request);
const historyFn=async request=>sheetsEnabled()
  ?{data:{...await sheetsRequest("bonusHistory"),nextCursor:null}}:firebaseHistoryFn(request);
const kindsFn=async request=>sheetsEnabled()
  ?{data:{kinds:[]}}:firebaseKindsFn(request);
const builtinNames={shot:"Шоты",cocktail:"Коктейли",hookah:"Кальяны",entry:"Бесплатные проходы",discount:"Скидка"};
const builtinKinds=["shot","cocktail","hookah","entry"];
let names=Object.assign(Object.create(null),builtinNames),activeKinds=new Set(builtinKinds),kindsRound=0;
const dt=new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Minsk",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
const node=(tag,cls,content)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.textContent=content;return n};
const say=(id,value)=>{const n=$(id);if(n)n.textContent=value};
const validateNumber=value=>/^\d{6}$/.test(value)&&Number(value)>0;
const milliseconds=t=>typeof t?.toMillis==="function"?t.toMillis():typeof t==="number"?t:typeof t==="string"?Date.parse(t)||null:null;
const current=g=>{const ms=milliseconds(g.expiresAt);return !g.expiresAt||Boolean(ms&&ms>Date.now())};
const sendable=g=>g&&activeKinds.has(g.kind)&&
  g.transferable===true&&!g.unlimited&&!g.eventRef&&
  Number.isInteger(g.remaining)&&g.remaining>0&&current(g)&&typeof g.id==="string"&&g.id.length>0;
const logged=()=>Boolean(uid&&auth.currentUser?.uid===uid&&auth.currentUser.emailVerified&&window.BaliAuth?.isRegistered?.());
function readable(error){
  const code=String(error?.code||"");
  if(code.includes("not-found")||code.includes("unimplemented")||code.includes("unavailable"))
    return "Сервис BALI ID временно недоступен. Перевод не выполнен.";
  if(code.includes("unauthenticated"))return "Войдите в подтверждённый аккаунт BALI.";
  if(code.includes("permission-denied"))return "Нет доступа к операции. Проверьте аккаунт.";
  if(code.includes("resource-exhausted"))return "Слишком много запросов. Повторите позднее.";
  if(code.includes("failed-precondition"))return "Получатель или остатки изменились. Начните заново.";
  if(code.includes("already-exists"))return "Этот запрос уже использован.";
  if(code.includes("invalid-argument"))return "Проверьте данные перевода.";
  return "Не удалось связаться с сервером BALI ID. Перевод не подтверждён.";
}
const transferDlg=$("baliTransferDialog"),historyDlg=$("baliHistoryDialog");
let uid=null,walletStop=null,walletReady=false,grants=[],recipient=null,selected=new Map();
let choicePage=0,stage="lookup",busy=false,historyBusy=false,history=[],cursor=null;
let requestId=null,run=0;
const transferList=()=>grants.filter(sendable);
const createRequestId=()=>{
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
};
function renderBalance(){
  const strip=$("baliIdBonusStrip");if(strip)strip.hidden=true;
  const host=$("baliIdWalletList");if(!host)return;
  host.replaceChildren();
  const wallet=host.closest(".bali-bank-wallet");
  if(wallet)wallet.hidden=true;
  if(!logged()||!walletReady)return;
  const aggregates=new Map();
  for(const grant of grants){
    if(!current(grant))continue;
    if(["shot","cocktail","hookah","entry"].includes(grant.kind)&&grant.remaining>0)
      aggregates.set(grant.kind,(aggregates.get(grant.kind)||0)+grant.remaining);
  }
  for(const kind of ["entry","shot","cocktail","hookah"]){
    const output=document.querySelector(`[data-bali-bonus-count="${kind}"]`);
    if(output){const amount=aggregates.get(kind)||0;output.textContent=amount>999?"999+":String(amount);
      output.closest(".bali-id-bonus")?.setAttribute("aria-label",(names[kind]||kind)+": "+amount);}
  }
  if(strip)strip.hidden=false;
  for(const [kind,qty] of aggregates){
    const card=node("div","bali-bank-balance");
    card.append(node("span","",names[kind]||kind),node("strong","",String(qty)));
    host.append(card);
  }
  // An empty wallet does not occupy space on the fixed ID screen.
  if(wallet)wallet.hidden=true; // Balances displayed on back of the card.
}
function resetTransfer(){
  ++run;
  recipient=null;selected.clear();choicePage=0;stage="lookup";requestId=null;busy=false;
  if($("baliTransferWish"))$("baliTransferWish").value="";
  const input=$("baliTransferRecipient");if(input)input.value="";
  $("baliTransferRecipientPreview").hidden=true;
  $("baliTransferCompleted").hidden=true;
  $("baliTransferConfirm").hidden=false;
  $("baliTransferConfirm").disabled=false;
  say("baliTransferLookupStatus","");say("baliTransferReviewStatus","");
  showStage("lookup");
}
function showStage(name){
  stage=name;
  for(const key of ["lookup","choices","review"]){
    const elem=$("baliTransfer"+key[0].toUpperCase()+key.slice(1)+"Step");
    if(elem)elem.hidden=key!==name;
  }
}
function openModal(dialog){
  if(!logged()){window.BaliAuth?.open?.();return false;}
  if(!dialog)return false;
  if(!dialog.open)dialog.showModal();
  return true;
}
window.addEventListener("bali:transfer-qr",e=>{
  const data=e.detail;
  if(!data||!validateNumber(data.number)||!data.name||!transferDlg?.open)return;
  ++run;recipient={number:data.number,name:data.name.trim()};
  $("baliTransferRecipient").value=recipient.number;
  say("baliTransferRecipientName",recipient.name);
  say("baliTransferRecipientCode","BALI ID · "+recipient.number);
  $("baliTransferRecipientPreview").hidden=false;
  say("baliTransferLookupStatus","Получатель найден по QR-коду. Проверьте имя.");
});
$("baliTransferScanQr")?.addEventListener("click",()=>window.BaliQrScanner?.open({mode:"recipient"}));
$("baliIdTransferOpen")?.addEventListener("click",()=>{
  if(openModal(transferDlg)){resetTransfer();$("baliTransferRecipient")?.focus({preventScroll:true});}
});
$("baliTransferClose")?.addEventListener("click",()=>transferDlg?.close());
$("baliHistoryClose")?.addEventListener("click",()=>historyDlg?.close());
for(const dialog of [transferDlg,historyDlg]){
  dialog?.addEventListener("click",e=>{if(e.target===dialog)dialog.close()});
}
transferDlg?.addEventListener("close",()=>{resetTransfer()});
$("baliTransferRecipient")?.addEventListener("input",e=>{
  const field=e.currentTarget;field.value=field.value.replace(/\D/g,"").slice(0,6);
  recipient=null;$("baliTransferRecipientPreview").hidden=true;
  say("baliTransferLookupStatus","");
});
$("baliTransferLookupForm")?.addEventListener("submit",async event=>{
  event.preventDefault();
  if(busy)return;
  const number=$("baliTransferRecipient").value.trim();
  if(!validateNumber(number)){say("baliTransferLookupStatus","Введите ровно 6 цифр, например 000002.");return;}
  if(!logged()){say("baliTransferLookupStatus","Нужна авторизация BALI.");return;}
  busy=true;
  const button=event.currentTarget.querySelector('button[type="submit"]');
  button.disabled=true;
  const token=++run,myUid=uid;
  say("baliTransferLookupStatus","Проверяем BALI ID…");
  $("baliTransferRecipientPreview").hidden=true;
  try{
    const info=(await lookupFn({number})).data;
    if(token!==run||uid!==myUid||!transferDlg.open)return;
    if(info?.number!==number||typeof info?.name!=="string"||!info.name.trim())
      throw Error("Invalid preview");
    recipient={number,name:info.name.trim()};
    say("baliTransferRecipientName",recipient.name);
    say("baliTransferRecipientCode","BALI ID · "+recipient.number);
    $("baliTransferRecipientPreview").hidden=false;
    say("baliTransferLookupStatus","Убедитесь, что имя правильное.");
  }catch(error){
    if(token===run)say("baliTransferLookupStatus",readable(error));
  }finally{busy=false;button.disabled=false}
});
$("baliTransferNext")?.addEventListener("click",()=>{
  if(!recipient)return;
  selected.clear();choicePage=0;requestId=null;
  say("baliTransferToCaption","Получатель: "+recipient.name+" · "+recipient.number);
  showStage("choices");renderChoices();
});
$("baliTransferChangeRecipient")?.addEventListener("click",()=>{
  ++run;recipient=null;$("baliTransferRecipientPreview").hidden=true;
  say("baliTransferLookupStatus","Введите другой BALI ID.");showStage("lookup");
});
function transferItems(){
  return transferList().filter(g=>(selected.get(g.id)||0)>0)
    .map(g=>({grantId:g.id,quantity:selected.get(g.id),kind:g.kind}));
}
function choiceSummary(){
  const rows=transferItems(),total=rows.reduce((s,x)=>s+x.quantity,0);
  say("baliTransferSelectedCount",rows.length+" поз. · "+total+" шт.");
  $("baliTransferReviewOpen").disabled=!(rows.length&&rows.length<=12&&total<=100);
  say("baliTransferChoiceStatus",total>100?"Не более 100 единиц за один перевод.":"");
}
function renderChoices(){
  const host=$("baliTransferChoices");if(!host)return;
  const list=transferList();host.replaceChildren();
  // Paginate rather than scroll: the BALI ID card page and transfer dialog
  // remain fixed, even on short phones and narrow laptop screens.
  const pageSize=window.innerHeight<610?2:window.innerWidth<768?3:4;
  const pages=Math.max(1,Math.ceil(list.length/pageSize));
  choicePage=Math.min(choicePage,pages-1);
  $("baliTransferPage").textContent=(choicePage+1)+" / "+pages;
  $("baliTransferPrevPage").disabled=choicePage===0;
  $("baliTransferNextPage").disabled=choicePage>=pages-1;
  if(!list.length){
    host.append(node("p","bali-bank-empty","Пока нет начисленных бонусов с разрешением на перевод. Обратитесь к администрации клуба."));
  }
  for(const g of list.slice(choicePage*pageSize,(choicePage+1)*pageSize)){
    const row=node("div","bali-bank-grant"),meta=node("div","bali-bank-grant-meta");
    meta.append(node("strong","",names[g.kind]||g.kind));
    const end=milliseconds(g.expiresAt);
    meta.append(node("small","","Доступно: "+g.remaining+" шт."+(end?" · до "+new Date(end).toLocaleDateString("ru-RU"):"")));
    const q=node("div","bali-bank-quantity"),minus=node("button","","−"),plus=node("button","","+");
    const output=node("output","",String(selected.get(g.id)||0));
    for(const b of [minus,plus])b.type="button";
    minus.setAttribute("aria-label","Уменьшить: "+(names[g.kind]||g.kind));
    plus.setAttribute("aria-label","Увеличить: "+(names[g.kind]||g.kind));
    function change(d){
      if(busy)return;
      const value=Math.max(0,Math.min(g.remaining,(selected.get(g.id)||0)+d));
      if(value)selected.set(g.id,value);else selected.delete(g.id);
      requestId=null;
      output.textContent=String(value);choiceSummary();
    }
    minus.addEventListener("click",()=>change(-1));
    plus.addEventListener("click",()=>change(1));
    q.append(minus,output,plus);row.append(meta,q);host.append(row);
  }
  choiceSummary();
}
$("baliTransferPrevPage")?.addEventListener("click",()=>{choicePage--;renderChoices()});
$("baliTransferNextPage")?.addEventListener("click",()=>{choicePage++;renderChoices()});
$("baliTransferChoiceBack")?.addEventListener("click",()=>showStage("lookup"));
$("baliTransferReviewOpen")?.addEventListener("click",()=>{
  const items=transferItems(),total=items.reduce((s,x)=>s+x.quantity,0);
  if(!recipient||!items.length||items.length>12||total>100)return;
  const combined=new Map();
  for(const line of items)combined.set(line.kind,(combined.get(line.kind)||0)+line.quantity);
  const host=$("baliTransferReviewList");host.replaceChildren();
  say("baliTransferReviewRecipient","Получатель: "+recipient.name+" · BALI ID "+recipient.number);
  for(const [kind,count] of combined){
    const row=node("div","bali-bank-review-row");
    row.append(node("span","",names[kind]||kind),node("strong","",count+" шт."));
    host.append(row);
  }
  say("baliTransferReviewStatus","Проверьте имя и количество. Бонусы спишутся у вас и начислятся получателю.");
  showStage("review");
});
$("baliTransferWish")?.addEventListener("input",()=>{requestId=null});
$("baliTransferReviewBack")?.addEventListener("click",()=>{showStage("choices");renderChoices()});
$("baliTransferConfirm")?.addEventListener("click",async()=>{
  if(busy||!logged()||!recipient)return;
  const items=transferItems();
  if(!items.length||items.length>12||items.reduce((s,x)=>s+x.quantity,0)>100)return;
  busy=true;const button=$("baliTransferConfirm");button.disabled=true;
  if(!requestId)requestId=createRequestId();
  const payload={number:recipient.number,items:items.map(x=>({grantId:x.grantId,quantity:x.quantity})),
    comment:($("baliTransferWish")?.value||"").trim().slice(0,160),requestId};
  const token=++run,myUid=uid;
  say("baliTransferReviewStatus","Подтверждаем и выполняем перевод на защищённом сервере…");
  try{
    const result=(await transferFn(payload)).data;
    if(token!==run||uid!==myUid||!transferDlg.open)return;
    if(!result?.ok)throw Error("Server transfer missing confirmation");
    if(sheetsEnabled()){
      const {card}=await sheetsRequest("card");
      if(uid===myUid){
        grants=Array.isArray(card?.bonuses)?card.bonuses:[];
        walletReady=true;renderBalance();
      }
    }
    say("baliTransferReviewStatus","Перевод подтверждён. Бонусы начислены получателю.");
    say("baliTransferSuccess","Отправлено: "+recipient.name+" · "+recipient.number);
    button.hidden=true;$("baliTransferCompleted").hidden=false;requestId=null;
  }catch(error){
    if(token===run)say("baliTransferReviewStatus",readable(error)+" Если состояние неизвестно — повторите подтверждение с тем же запросом.");
  }finally{busy=false;button.disabled=false}
});
$("baliTransferAgain")?.addEventListener("click",()=>resetTransfer());
const actionName={grant:"Начисление",redeem:"Использовано","manual-debit":"Списание",entry:"Проход",discount:"Скидка","transfer-in":"Поступление","transfer-out":"Перевод"};
function operationRow(x){
  const title=actionName[x.type]||"Операция";
  const incoming=x.type==="transfer-in"||x.type==="grant";
  const count=Number.isInteger(x.count)?(incoming?"+":"−")+x.count+" шт.":"";
  const dateText=x.createdAt?dt.format(new Date(x.createdAt)):"Время не указано";
  const item=node("article","bali-bank-history-item");
  const line=node("div","bali-bank-history-line");
  const left=node("div","");left.append(node("strong","",title),node("small","",dateText));
  line.append(left,node("strong","bali-bank-history-amount",count));
  let from=x.type==="transfer-in"?"От "+(x.fromName||"гостя")+" · ID "+(x.fromNumber||"—"):
    x.type==="transfer-out"?"Кому "+(x.toName||"гостю")+" · ID "+(x.toNumber||"—"):"";
  const note=Array.isArray(x.items)&&x.items.length?x.items.map(v=>(names[v.kind]||v.kind)+" × "+v.quantity).join(", "):
    x.kind&&x.kind!=="mixed"?(names[x.kind]||x.kind)+(x.count?" × "+x.count:""):"";
  item.append(line,node("p","",[from,note,x.reason].filter(Boolean).join(" · ")));
  if(x.comment)item.append(node("blockquote","bali-bank-history-wish","«"+x.comment+"»"));
  const until=x.receiptExpiresAt||x.createdAt+30*86400000;
  if(x.source==="bonus-qr"&&x.createdAt>0&&Date.now()<=until&&["grant","redeem"].includes(x.type)){
    const receiptBtn=node("button","bali-bank-receipt-btn","Чек операции ↗");
    receiptBtn.type="button";
    receiptBtn.addEventListener("click",()=>window.BaliQrScanner?.showReceipt({
      id:x.id,type:x.type,name:x.name||names[x.kind]||x.kind,count:x.count,
      createdAt:x.createdAt,balanceAfter:x.balanceAfter,expiresAt:until
    }));
    item.append(receiptBtn);
  }
  return item;
}
function historyRender(){
  const list=$("baliIdHistoryList");list.replaceChildren();
  if(!history.length)list.append(node("p","bali-bank-empty","Операций пока нет."));
  else for(const row of history)list.append(operationRow(row));
  $("baliIdHistoryMore").hidden=!cursor;
}
async function historyLoad(){
  if(historyBusy||!logged()||!historyDlg.open)return;
  historyBusy=true;const token=++run,myUid=uid;
  const more=$("baliIdHistoryMore");more.disabled=true;
  say("baliIdHistoryStatus","");
  try{
    const result=(await historyFn({after:cursor||""})).data;
    if(token!==run||myUid!==uid||!historyDlg.open)return;
    history.push(...(Array.isArray(result?.items)?result.items:[]));
    cursor=result?.nextCursor||null;
    historyRender();say("baliIdHistoryStatus","");
  }catch(error){if(token===run)say("baliIdHistoryStatus",readable(error))}
  finally{historyBusy=false;more.disabled=false}
}
$("baliIdHistoryOpen")?.addEventListener("click",()=>{
  if(!openModal(historyDlg))return;
  history=[];cursor=null;historyRender();
  void historyLoad();
});
$("baliIdHistoryMore")?.addEventListener("click",()=>void historyLoad());
function authReset(){
  walletStop?.();walletStop=null;walletReady=false;uid=null;grants=[];recipient=null;selected.clear();
  ++kindsRound;activeKinds=new Set(builtinKinds);names=Object.assign(Object.create(null),builtinNames);
  ++run;requestId=null;busy=false;historyBusy=false;history=[];cursor=null;
  transferDlg?.close();historyDlg?.close();renderBalance();
}
async function loadKinds(user){
  const round=kindsRound;
  try{
    const result=(await kindsFn({})).data;
    if(round!==kindsRound||uid!==user.uid||auth.currentUser?.uid!==user.uid)return;
    if(!Array.isArray(result?.kinds))return;
    for(const kind of result.kinds){
      if(typeof kind?.id!=="string"||!/^[a-z][a-z0-9_-]{1,24}$/.test(kind.id)||!kind.name)continue;
      activeKinds.add(kind.id);names[kind.id]=String(kind.name);
    }
    renderBalance();
    if(transferDlg?.open&&stage==="choices")renderChoices();
    if(historyDlg?.open)historyRender();
  }catch(_){/* Standard kinds stay available if the registry cannot be loaded. */}
}
function startWallet(user){
  // Wallet reads and callable lookups must never run while the guest browses
  // the home page, calendar, menu or simply fills out a preorder.
  if(document.body.dataset.baliPage!=="id"){
    if(walletStop||uid)authReset();
    return;
  }
  if(!user?.emailVerified||!window.BaliAuth?.isRegistered?.()||window.BaliAuth?.getProfile?.()?.uid!==user.uid){authReset();return;}
  if(uid===user.uid&&walletStop){renderBalance();return;}
  authReset();
  uid=user.uid;
  const round=kindsRound;
  void loadKinds(user);
  if(sheetsEnabled()){
    walletStop=()=>{};
    void sheetsRequest("card").then(({card})=>{
      if(uid!==user.uid||round!==kindsRound||auth.currentUser?.uid!==user.uid)return;
      if(!card?.activated){walletReady=false;grants=[];renderBalance();return;}
      grants=Array.isArray(card.bonuses)?card.bonuses:[];
      walletReady=true;renderBalance();
      if(transferDlg?.open&&stage==="choices")renderChoices();
    }).catch(()=>{
      if(uid!==user.uid||round!==kindsRound)return;
      walletReady=false;grants=[];renderBalance();
      say("baliIdStatus","Не удалось загрузить бонусы BALI ID.");
    });
    return;
  }
  walletStop=onSnapshot(doc(db,"guestWallets",user.uid),snapshot=>{
    if(uid!==user.uid||round!==kindsRound)return;
    grants=Array.isArray(snapshot.data()?.grants)?snapshot.data().grants:[];
    walletReady=true;
    renderBalance();
    if(transferDlg?.open&&stage==="choices")renderChoices();
  },()=>{
    if(uid===user.uid&&round===kindsRound){
      walletReady=false;grants=[];renderBalance();
      say("baliIdStatus","Не удалось получить остатки привилегий. Повторите попытку позже.");
    }
  });
}
onAuthStateChanged(auth,startWallet);
window.addEventListener("bali:guest-page",()=>startWallet(auth.currentUser));
window.addEventListener("bali:sheets-card",event=>{
  if(!sheetsEnabled()||!event.detail?.card||event.detail.uid!==uid)return;
  grants=Array.isArray(event.detail.card.bonuses)?event.detail.card.bonuses:[];
  walletReady=true;renderBalance();
  if(transferDlg?.open&&stage==="choices")renderChoices();
});
window.addEventListener("bali:auth-state",event=>{
  if(!event.detail?.registered)authReset();
  else startWallet(auth.currentUser);
});
renderBalance();
