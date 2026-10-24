import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithEmailAndPassword,signInWithPopup,signInWithRedirect,getRedirectResult,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {coinEnabled,coinRequest} from "./bali-coin-firebase-api.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG),auth=getAuth(app);
const $=id=>document.getElementById(id);
let staff=false,busy=false;
const notice=text=>{$("barStaffStatus").textContent=text};
$("barStaffPasswordForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=event.currentTarget,values=new FormData(form);
  const login=String(values.get("login")||"").trim().toLowerCase();
  const password=String(values.get("password")||"");
  if(!/^[a-z][a-z0-9_-]{2,31}$/.test(login)||password.length<12){
    $("barStaffLoginStatus").textContent="Проверьте логин и пароль.";return;
  }
  $("barStaffLoginStatus").textContent="Проверяем учётную запись сотрудника…";
  try{
    await signInWithEmailAndPassword(auth,"staff+"+login+"@staff.baliminsk.by",password);
    form.elements.namedItem("password").value="";
  }catch(error){
    form.elements.namedItem("password").value="";
    $("barStaffLoginStatus").textContent="Не удалось войти. Проверьте логин, пароль и назначенную роль.";
  }
});
$("barStaffSignIn").addEventListener("click",async()=>{
  const provider=new GoogleAuthProvider();
  try{await signInWithPopup(auth,provider);}
  catch(error){
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(error.code)){
      try{await signInWithRedirect(auth,provider);}
      catch(err){$("barStaffLoginStatus").textContent=String(err.message);}
    }else $("barStaffLoginStatus").textContent=String(error.message);
  }
});
$("barStaffSignOut").addEventListener("click",()=>signOut(auth));
void getRedirectResult(auth).catch(e=>{$("barStaffLoginStatus").textContent=String(e.message)});
onAuthStateChanged(auth,async user=>{
  staff=false;$("barStaffWorkspace").hidden=true;$("barStaffLogin").hidden=false;$("barStaffSignOut").hidden=true;
  if(!coinEnabled())return $("barStaffLoginStatus").textContent="Firebase API не подключён.";
  if(!user?.emailVerified)return $("barStaffLoginStatus").textContent="Войдите через Google.";
  $("barStaffLoginStatus").textContent="Проверяем полномочия сотрудника…";
  try{
    const {role}=await coinRequest("me");
    if(auth.currentUser?.uid!==user.uid)return;
    staff=["admin","director","staff"].includes(role);
    if(!staff)return $("barStaffLoginStatus").textContent="У аккаунта нет прав сотрудника BALI.";
    $("barStaffWorkspace").hidden=false;$("barStaffLogin").hidden=true;$("barStaffSignOut").hidden=false;
  }catch(e){$("barStaffLoginStatus").textContent="Ошибка проверки: "+String(e.message);}
});
$("barStaffForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!staff||busy)return;
  const form=event.currentTarget,data=new FormData(form),number=String(data.get("number")),
    voucher=String(data.get("voucher")).trim();
  if(!confirm("Выдать позицию за BALI COIN владельцу Bali Card "+number+"?"))return;
  busy=true;notice("Проверяем ваучер и фиксируем выдачу…");
  try{
    const {result}=await coinRequest("coinVoucherFulfill",{number,voucher});
    if(result?.alreadyFulfilled)notice("Этот код УЖЕ ПОГАШЕН. Повторная выдача запрещена.");
    else{notice("ПОДТВЕРЖДЕНО. Выдать гостю: "+result.name+". Код погашен.");form.reset();}
  }catch(e){notice("В выдаче отказано: "+String(e.message||"Ошибка сервера"))}
  finally{busy=false;}
});
