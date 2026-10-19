import{initializeApp,getApps,getApp}from"https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import{getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import{getFunctions,httpsCallable}from"https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),fn=getFunctions(app,"europe-west1"),$=id=>document.getElementById(id);
const api={role:httpsCallable(fn,"myStaffRole"),scan:httpsCallable(fn,"scanGuestQr"),lookup:httpsCallable(fn,"findGuestByNumber"),grant:httpsCallable(fn,"grantGuestBenefit"),use:httpsCallable(fn,"useGuestBenefit"),adjust:httpsCallable(fn,"adjustGuestBenefit"),audit:httpsCallable(fn,"listPrivilegeAudit"),assign:httpsCallable(fn,"setBaliStaffRole")};
const label={cocktail:"Коктейли",shot:"Шоты",hookah:"Кальяны",entry:"Вход",discount:"Скидка"};
let currentRole="guest",selectedGuest=null,token="",cameraStream=null,frameId=0,scanner=null,busy=false;
const visible=(id,v)=>{$(id).hidden=!v};
function message(id,t,error=false){const el=$(id);el.textContent=t;el.classList.toggle("error",error)}
const errText=e=>e?.message?.replace(/^functions\/[a-z-]+:\s*/,"")||"Ошибка запроса";
const cleanToken=t=>String(t||"").trim().replace(/^BALI:/i,"");
const secureId=()=>crypto.randomUUID();
const escapeName=s=>typeof s==="string"?s:"";
function roleLabel(role){return {admin:"АДМИНИСТРАТОР",director:"ДИРЕКТОР",bartender:"БАРМЕН",hostess:"ХОСТЕС"}[role]||"НЕТ ДОСТУПА"}
function navigation(name){
  const mapping={scan:"staffScanPanel",director:"staffDirectorPanel",audit:"staffAuditPanel"};
  Object.entries(mapping).forEach(([n,id])=>visible(id,n===name));
  document.querySelectorAll("[data-staff-tab]").forEach(b=>{if(b.dataset.staffTab===name)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  stopCamera();
  if(name==="audit")void loadAudit();
}
document.querySelectorAll("[data-staff-tab]").forEach(b=>b.addEventListener("click",()=>navigation(b.dataset.staffTab)));
function renderGrants(id,rows){
  const root=$(id);root.replaceChildren();
  const grants=Array.isArray(rows)?rows:[];
  for(const grant of grants){
    const item=document.createElement("div");item.className="wallet-item";
    const header=document.createElement("strong");
    header.textContent=(label[grant.kind]||grant.kind)+(grant.kind==="discount"?" "+grant.percent+"%":" · "+(grant.unlimited?"∞":grant.remaining??0));
    const info=document.createElement("small");
    let status=grant.active?"Действует":"Недоступно / истекло";
    if(grant.eventRef)status+=" · событие "+grant.eventRef;
    if(grant.expiresAt)status+=" · до "+new Date(grant.expiresAt).toLocaleDateString("ru-RU");
    if(grant.kind==="discount")status+=" · "+(grant.appliesTo||"");
    info.textContent=status;
    item.append(header,info);root.append(item);
  }
  if(!grants.length)root.textContent="Начислений пока нет.";
}
function applyGuest(result,viaScan){
  selectedGuest=result.guest;
  const guest=result.guest;
  if(viaScan){
    $("scannedGuestName").textContent=escapeName(guest.name);
    $("scannedGuestMeta").textContent="BALI ID № "+guest.number+" · "+guest.tier;
    renderGrants("scannedGuestGrants",result.wallet.grants);
    visible("staffGuestCard",true);
    const canBar=["bartender","director","admin"].includes(currentRole);
    const canEntry=["hostess","director","admin"].includes(currentRole);
    visible("redeemBox",canBar);visible("discountBox",canBar);visible("entryBox",canEntry);
    const discounts=result.wallet.grants.filter(x=>x.kind==="discount"&&x.active);
    const select=$("discountGrant");select.replaceChildren();
    for(const p of discounts){const option=document.createElement("option");option.value=p.id;option.textContent=p.percent+"% ("+p.appliesTo+")";select.append(option)}
    $("discountButton").disabled=!discounts.length;
  }
  if(["director","admin"].includes(currentRole)){
    $("directorGuestInfo").textContent=guest.name+" · № "+guest.number+" · "+guest.tier;
    renderGrants("directorWalletGrants",result.wallet.grants);
  }
}
async function verifyToken(){
  token=cleanToken($("staffQrInput").value);
  if(!token){message("scanStatus","Введите код с карты гостя.",true);return}
  message("scanStatus","Проверяем QR-код...");
  try{const result=(await api.scan({token})).data;applyGuest(result,true);message("scanStatus","Карта считана. Проверьте привилегии и подтвердите действие.");}
  catch(e){visible("staffGuestCard",false);message("scanStatus",errText(e),true)}
}
$("scanQrButton").addEventListener("click",verifyToken);
$("staffQrInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();void verifyToken()}});
async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){message("scanStatus","Камера недоступна в браузере. Введите код вручную.",true);return}
  if(typeof BarcodeDetector==="undefined"){
    message("scanStatus","Этот браузер не поддерживает распознавание QR камерой. Введите код вручную.",true);return;
  }
  try{
    scanner=new BarcodeDetector({formats:["qr_code"]});
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    $("scanVideo").srcObject=cameraStream;await $("scanVideo").play();
    visible("cameraBox",true);visible("stopCamera",true);visible("startCamera",false);
    message("scanStatus","Наведите камеру на QR гостя.");
    const loop=async()=>{
      if(!cameraStream)return;
      if(!busy){busy=true;try{
        const codes=await scanner.detect($("scanVideo"));
        const found=codes.find(x=>/^BALI:/i.test(x.rawValue||""));
        if(found){$("staffQrInput").value=found.rawValue;stopCamera();void verifyToken();return}
      }catch(e){/* do not expose video-frame decoding failures */}finally{busy=false}}
      if(cameraStream)frameId=requestAnimationFrame(loop);
    };
    frameId=requestAnimationFrame(loop);
  }catch(e){stopCamera();message("scanStatus","Не удалось включить камеру: "+errText(e)+". Используйте ручной ввод.",true)}
}
function stopCamera(){
  if(frameId)cancelAnimationFrame(frameId);frameId=0;
  cameraStream?.getTracks().forEach(track=>track.stop());cameraStream=null;
  $("scanVideo").srcObject=null;visible("cameraBox",false);visible("stopCamera",false);visible("startCamera",true);
}
$("startCamera").addEventListener("click",startCamera);$("stopCamera").addEventListener("click",stopCamera);
window.addEventListener("pagehide",stopCamera);
async function use(action,payload){
  if(!token){message("scanStatus","Сначала отсканируйте QR гостя.",true);return}
  const descriptions={redeem:"Списать выбранные бонусы?",entry:"Подтвердить вход гостя?",discount:"Подтвердить скидку для указанного чека?"};
  if(!confirm(descriptions[action]))return;
  message("scanStatus","Подтверждаем операцию...");
  try{
    const result=(await api.use({action,token,operationId:secureId(),...payload})).data;
    message("scanStatus",result.alreadyProcessed?"Операция уже обработана.":"Операция сохранена. Для следующей операции нужен новый QR.");
    visible("staffGuestCard",false);token="";$("staffQrInput").value="";
  }catch(e){message("scanStatus",errText(e),true)}
}
$("redeemButton").addEventListener("click",()=>void use("redeem",{kind:$("redeemKind").value,count:Number($("redeemCount").value),eventRef:$("redeemEvent").value.trim()}));
$("entryButton").addEventListener("click",()=>void use("entry",{eventRef:$("entryEvent").value.trim()}));
$("discountButton").addEventListener("click",()=>void use("discount",{grantId:$("discountGrant").value,receipt:$("discountReceipt").value.trim()}));
async function findGuest(){
  message("directorStatus","Поиск BALI ID...");
  try{
    const result=(await api.lookup({number:$("guestNumberSearch").value.trim()})).data;
    applyGuest(result,false);message("directorStatus","Гость найден.");
  }catch(e){selectedGuest=null;message("directorStatus",errText(e),true)}
}
$("findGuestButton").addEventListener("click",findGuest);
$("guestNumberSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();void findGuest()}});
const grantUi=()=>{
  const kind=$("grantKind").value;
  visible("grantCountWrap",kind!=="discount");
  visible("grantPercentWrap",kind==="discount");
  visible("grantAreaWrap",kind==="discount");
  visible("grantUnlimitedWrap",kind==="entry");
  if(kind!=="entry")$("grantUnlimited").checked=false;
};
$("grantKind").addEventListener("change",grantUi);grantUi();
function directorId(){if(!selectedGuest)throw Error("Сначала найдите гостя по номеру карты.");return selectedGuest.uid}
$("grantForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const payload={uid:directorId(),kind:$("grantKind").value,count:Number($("grantCount").value),percent:Number($("grantPercent").value),appliesTo:$("grantArea").value,unlimited:$("grantUnlimited").checked,expiresOn:$("grantExpires").value,eventRef:$("grantEvent").value.trim(),note:$("grantNote").value.trim()};
    if(!confirm("Начислить выбранную привилегию гостю "+selectedGuest.name+"?"))return;
    message("directorStatus","Начисляем...");
    await api.grant(payload);message("directorStatus","Начисление сохранено с записью в журнале.");void findGuest();
  }catch(e){message("directorStatus",errText(e),true)}
});
$("manualDebitForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const payload={uid:directorId(),kind:$("debitKind").value,count:Number($("debitCount").value),reason:$("debitReason").value.trim()};
    if(!confirm("Списать "+payload.count+" шт. у "+selectedGuest.name+"? Действие попадёт в журнал."))return;
    message("directorStatus","Списываем...");
    await api.adjust(payload);message("directorStatus","Списание записано.");void findGuest();
  }catch(e){message("directorStatus",errText(e),true)}
});
$("staffAssignForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    if(!confirm("Изменить доступ сотрудника?"))return;
    await api.assign({uid:$("staffUid").value.trim(),role:$("staffAssignRole").value,active:$("staffActive").checked});
    message("directorStatus","Доступ сотрудника обновлён.");
  }catch(e){message("directorStatus",errText(e),true)}
});
async function loadAudit(){
  message("auditStatus","Загружаем операции...");
  try{
    const data=(await api.audit({})).data.items;
    const root=$("auditRows");root.replaceChildren();
    for(const row of data){
      const box=document.createElement("div");box.className="audit-row";
      const title=document.createElement("strong"),details=document.createElement("small");
      title.textContent=(row.type||"")+" · "+(label[row.kind]||row.kind||"")+" "+(row.count||row.percent||"");
      details.textContent=new Date(row.createdAt).toLocaleString("ru-RU")+" · гость "+row.guestUid+" · сотрудник "+row.staffUid+" ("+row.staffRole+")"+(row.reason?" · "+row.reason:"")+(row.receipt?" · чек "+row.receipt:"");
      box.append(title,details);root.append(box);
    }
    message("auditStatus",data.length?"Последние "+data.length+" операций.":"Записей пока нет.");
  }catch(e){message("auditStatus",errText(e),true)}
}
$("refreshAudit").addEventListener("click",loadAudit);
$("staffSignIn").addEventListener("click",async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){message("staffLoginStatus",errText(e),true)}});
$("staffSignOut").addEventListener("click",()=>signOut(auth));
onAuthStateChanged(auth,async user=>{
  stopCamera();currentRole="guest";selectedGuest=null;token="";
  visible("staffWorkspace",false);visible("staffGuestCard",false);
  visible("staffSignOut",!!user);
  visible("staffLogin",true);$("staffRoleTag").textContent="ПРОВЕРКА ДОСТУПА";
  if(!user?.emailVerified){message("staffLoginStatus","Войдите в подтверждённую учётную запись.");return}
  try{
    const result=(await api.role({})).data;
    if(auth.currentUser?.uid!==user.uid)return;
    currentRole=result.role;$("staffRoleTag").textContent=roleLabel(currentRole);
    if(currentRole==="guest"){message("staffLoginStatus","Этому аккаунту не назначена роль сотрудника. Обратитесь к директору.");return}
    visible("staffLogin",false);visible("staffWorkspace",true);
    const manager=["director","admin"].includes(currentRole);
    visible("directorTab",manager);visible("auditTab",manager);
    navigation("scan");
  }catch(e){message("staffLoginStatus",errText(e),true)}
});