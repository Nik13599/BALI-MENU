/** Standalone consent-first BALI Sheets account diagnostics.
 * Does not enable migration on main site or modify existing Firebase documents. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
const $=id=>document.getElementById(id);
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app);
let user=null,readReport=[],running=false,activeCard=false,profileReady=false,privacyAccepted=false;
const safeError=e=>(e?.message||e?.code||"Ошибка подключения").slice(0,210);
const state=(id,msg)=>{$(id).textContent=msg};
const canWrite=()=>Boolean(user?.emailVerified)&&!running;
function buttons(){
  $("loginButton").disabled=running||Boolean(user);
  $("logoutButton").hidden=!user;
  $("readButton").disabled=!user||running;
  $("profileButton").disabled=!canWrite();
  $("activateButton").disabled=!canWrite()||!profileReady||activeCard||
    !$("acceptCard").checked;
  $("copyButton").disabled=!readReport.length;
  $("consentArea").hidden=privacyAccepted;
}
async function call(action,payload={}){
  if(!user?.emailVerified)throw Error("Нужно войти через Google с подтверждённым email.");
  const idToken=await user.getIdToken();
  const response=await fetch("/api/bali-v3",{method:"POST",credentials:"same-origin",headers:{
    "Content-Type":"application/json"},body:JSON.stringify({action,token:idToken,payload})});
  let body;try{body=await response.json()}catch{throw Error("Сервер вернул ответ не в формате JSON.");}
  if(!response.ok||body?.ok!==true)throw Object.assign(
    new Error(body?.error?.message||"Ошибка сервера BALI."),{code:body?.error?.code||"server"});
  return body.data;
}
function result(title,ok,detail,type="ok"){
  const row=document.createElement("article");
  row.className="result "+(ok?"ok":type);
  const mark=document.createElement("span");mark.className="mark";mark.textContent=ok?"✓":type==="warn"?"!":"×";
  const label=document.createElement("strong");label.textContent=title;
  const description=document.createElement("div");description.className="detail";description.textContent=detail;
  row.append(mark,label,description);$("results").appendChild(row);
  readReport.push({name:title,outcome:ok?"PASS":type==="warn"?"INFO":"FAIL",detail});
}
async function check(){
  if(!user||running)return;
  running=true;readReport=[];$("results").replaceChildren();buttons();
  state("readState","Выполняем проверку серверных прав и данных...");
  try{
    const me=await call("me");
    privacyAccepted=me.privacyAccepted===true;
    const profile=me.profile||{};
    const hasProfile=typeof profile.name==="string"&&profile.name.trim().length>=2&&
      /^\+[1-9][0-9]{7,14}$/.test(profile.phone||"");
    profileReady=hasProfile&&privacyAccepted;
    if(profile.name)$("testGuestName").value=profile.name;
    if(profile.phone)$("testGuestPhone").value=profile.phone;
    result("Google-сессия и индивидуальный UID",true,"Firebase проверил аккаунт, сервер вернул данные только этого пользователя.");
    result("Согласие на обработку данных",privacyAccepted,privacyAccepted?"Сохранено в новой базе.":"Ещё не сохранено; необходимо для регистрации.",privacyAccepted?"ok":"warn");
    result("Персональный профиль",hasProfile,hasProfile?"Имя и телефон присутствуют в новой базе.":"В новой таблице нет заполненного имени или телефона.",hasProfile?"ok":"warn");
    result("Роль доступа",true,me.role==="admin"?"Администратор.":me.role==="staff"?"Сотрудник.":"Гость без административных прав.");
    for(const task of [
      ["Моя Bali Card","card",data=>{
        const card=data.card||{};activeCard=card.activated===true;
        return {ok:true,detail:card.activated?
          "Карта активна, номер указан сервером. Статус "+String(card.tier||"Member")+
          ", баланс BALI COIN "+String(card.coinBalance??"недоступен")+"."
          :"Карта ещё не активирована в новой базе."};
      }],
      ["Мои бонусы","bonusHistory",data=>({ok:true,detail:"История бонусов доступна; операций: "+(data.items?.length||0)+"."})],
      ["Мои BALI COIN","coinHistory",data=>({ok:true,detail:"История баллов доступна; операций: "+(data.items?.length||0)+"."})],
      ["Мои предзаказы","myOrders",data=>({ok:true,detail:"Прочитаны только собственные предзаказы: "+(data.orders?.length||0)+"."})],
      ["Мои планы","plans",data=>({ok:true,detail:"Собственные планы мероприятий: "+(data.plans?.length||0)+"."})]
    ]){
      try{const data=await call(task[1]);const v=task[2](data);result(task[0],v.ok,v.detail);}
      catch(e){result(task[0],false,"Не удалось проверить: "+safeError(e),"error");}
    }
    state("readState","Проверка чтения завершена. Данные и баланс не изменялись.");
  }catch(e){result("Подключение аккаунта",false,"Ошибка: "+safeError(e),"error");
    state("readState","Серверную сессию проверить не удалось.");}
  finally{running=false;buttons();}
}
$("loginButton").addEventListener("click",async()=>{
  if(running)return;running=true;buttons();
  try{await signInWithPopup(auth,new GoogleAuthProvider());}
  catch(e){state("accountState","Не удалось войти: "+safeError(e));}
  finally{running=false;buttons();}
});
$("logoutButton").addEventListener("click",async()=>{await signOut(auth)});
$("readButton").addEventListener("click",check);
$("copyButton").addEventListener("click",async()=>{
  const report=["BALI MENU v3 · проверка аккаунта без персональных данных",
    ...readReport.map(x=>x.outcome+" | "+x.name+" | "+x.detail)].join("\n");
  try{await navigator.clipboard.writeText(report);state("readState","Отчёт без имени, телефона и UID скопирован.");}
  catch{state("readState","Не удалось скопировать отчёт.");}
});
$("acceptCard").addEventListener("change",buttons);
$("profileForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!canWrite())return;
  const name=$("testGuestName").value.trim(),phone=$("testGuestPhone").value.trim().replace(/[\s()\-]/g,"");
  if(name.length<2||!/^\+[1-9][0-9]{7,14}$/.test(phone)){
    state("profileState","Укажи имя и телефон в формате +375291234567.");return;
  }
  if(!privacyAccepted&&(!$("acceptProcessing").checked||!$("acceptInternational").checked)){
    state("profileState","Отметь оба согласия после ознакомления с политикой.");return;
  }
  running=true;buttons();
  try{
    if(!privacyAccepted){
      await call("consentAccept",{type:"privacy",accepted:true});
      privacyAccepted=true;
    }
    await call("profileSave",{name,phone});
    profileReady=true;
    state("profileState","Профиль сохранён в закрытой Google Таблице. Это отдельный тестовый профиль.");
  }catch(e){state("profileState","Не удалось сохранить: "+safeError(e));}
  finally{running=false;buttons();}
});
$("activateButton").addEventListener("click",async()=>{
  if(!canWrite()||!profileReady||activeCard||!$("acceptCard").checked)return;
  running=true;buttons();
  try{
    const data=await call("activateCard",{accepted:true});
    activeCard=data.card?.activated===true;
    state("cardState",activeCard?"Bali Card активирована в новой базе. Баланс BALI COIN: "+
      String(data.card?.coinBalance??"—")+".":"Сервер не подтвердил активацию.");
  }catch(e){state("cardState","Не удалось активировать карту: "+safeError(e));}
  finally{running=false;buttons();}
});
onAuthStateChanged(auth,current=>{
  user=current?.emailVerified?current:null;
  privacyAccepted=false;profileReady=false;activeCard=false;readReport=[];
  $("results").replaceChildren();$("copyButton").disabled=true;
  state("accountState",user?"Google-аккаунт подтверждён. Можно запускать чтение новой базы.":
    "Войди через Google, чтобы проверить только свои данные.");
  state("readState",user?"Нажми «Проверить мой кабинет».":"");
  buttons();
});
