import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,
  signInWithEmailAndPassword,signOut,setPersistence,browserLocalPersistence}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {preorderServiceEnabled} from "./bali-sheets-api.js?v=20261023-d1-live1";
const {getFirestore,doc,getDoc}=preorderServiceEnabled()?{}:
  await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
const app=getApps().find(entry=>entry.name==="bali-staff")||
  initializeApp(window.BALI_FIREBASE_CONFIG,"bali-staff");
const auth=getAuth(app),db=preorderServiceEnabled()?null:getFirestore(app);
const $=id=>document.getElementById(id);
window.BaliSheetsToken=()=>auth.currentUser?.getIdToken()||null;
let generation=0,signingIn=false,checkingRole=false;
const sessionReady=setPersistence(auth,browserLocalPersistence);
const message=text=>{$("loginStatus").textContent=text||"";};
const busy=enabled=>{
  $("staffPasswordSignIn").disabled=enabled;
  $("adminSignIn").disabled=enabled;
};
const display=state=>{
  $("staffSessionLoading").hidden=state!=="loading";
  $("loginView").hidden=state!=="login";
  $("adminView").hidden=state!=="ready";
  $("staffHeaderAccount").hidden=state!=="ready";
};
const showLogin=text=>{
  display("login");message(text);busy(false);
};
const explain=error=>{
  switch(error?.code){
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":return "Неверный логин или пароль.";
    case "auth/too-many-requests":return "Слишком много попыток входа. Попробуйте позже.";
    case "auth/network-request-failed":return "Нет соединения с Firebase. Проверьте интернет.";
    case "auth/popup-closed-by-user":return "Вход через Google отменён.";
    case "auth/popup-blocked":return "Браузер заблокировал вход Google. Разрешите всплывающее окно для BALI.";
    case "auth/cancelled-popup-request":return "Вход через Google уже выполняется.";
    case "auth/operation-not-allowed":return "Данный способ входа отключён в Firebase.";
    default:return "Вход не выполнен. Повторите попытку. ("+(error?.code||"ошибка связи")+")";
  }
};
sessionReady.catch(()=>showLogin("Не удалось сохранить вход на этом устройстве. Разрешите данные сайта."));
$("preorderStaffLogin").addEventListener("submit",async event=>{
  event.preventDefault();
  if(signingIn||checkingRole)return;
  const login=$("staffLoginName").value.trim().toLowerCase();
  const password=$("staffLoginPassword").value;
  if(!/^[a-z][a-z0-9_-]{2,31}$/.test(login)||password.length<12){
    message("Проверьте логин и пароль.");return;
  }
  signingIn=true;busy(true);message("Проверяем логин и пароль…");
  try{
    await sessionReady;
    await signInWithEmailAndPassword(auth,"staff+"+login+"@staff.baliminsk.by",password);
    $("staffLoginPassword").value="";
  }catch(error){showLogin(explain(error));}
  finally{signingIn=false;if(!checkingRole)busy(false);}
});
$("adminSignIn").addEventListener("click",async()=>{
  if(signingIn||checkingRole)return;
  signingIn=true;busy(true);message("Выполняется вход через Google…");
  try{
    await sessionReady;
    await signInWithPopup(auth,new GoogleAuthProvider());
  }catch(error){showLogin(explain(error));}
  finally{signingIn=false;if(!checkingRole)busy(false);}
});
$("adminSignOut").addEventListener("click",async()=>{
  $("adminSignOut").disabled=true;
  try{
    // Remove the device's subscription where possible, then close the session.
    await window.BaliStaffPushDisable?.().catch(()=>{});
    await signOut(auth);
  }catch{showLogin("Не получилось завершить сеанс. Повторите выход.");}
  finally{$("adminSignOut").disabled=false;}
});
async function verifyRole(user){
  if(!user.emailVerified)throw Object.assign(Error("email-unverified"),{code:"email-unverified"});
  if(preorderServiceEnabled()){
    const token=await user.getIdToken();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch("/api/staff-session",{
        method:"GET",credentials:"same-origin",cache:"no-store",
        headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
        signal:controller.signal
      });
      if(!response.ok){
        const code=response.status===403?"permission-denied":
          response.status===401?"unauthenticated":"unavailable";
        throw Object.assign(Error(code),{code});
      }
      const data=await response.json();
      if(!data.ok||!["staff","admin"].includes(data.role))
        throw Object.assign(Error("permission-denied"),{code:"permission-denied"});
      return data.role;
    }finally{clearTimeout(timer);}
  }
  const administrator=await getDoc(doc(db,"admins",user.uid));
  if(administrator.exists()&&administrator.data().active===true)return "admin";
  const employee=await getDoc(doc(db,"preorderStaff",user.uid));
  if(employee.exists()&&employee.data().active===true&&employee.data().role==="preorders")
    return "staff";
  throw Object.assign(Error("permission-denied"),{code:"permission-denied"});
}
function roleError(error){
  if(error?.code==="permission-denied")return "У вашей учётной записи нет прав на предзаказы. Обратитесь к руководителю.";
  if(error?.code==="unauthenticated")return "Сессия недействительна. Войдите заново.";
  if(error?.code==="email-unverified")return "Email не подтверждён. Доступ к предзаказам не предоставлен.";
  if(error?.name==="AbortError")return "Проверка доступа заняла слишком много времени. Повторите вход.";
  return "Не удалось проверить права на сервере. Проверьте соединение и повторите вход.";
}
onAuthStateChanged(auth,async user=>{
  const current=++generation;
  if(!user){
    checkingRole=false;
    window.dispatchEvent(new Event("bali-staff-signed-out"));
    showLogin("");return;
  }
  checkingRole=true;
  busy(true);
  if(signingIn||!$("staffSessionLoading").hidden){
    // Returning employee sees one loading surface; new sign-in stays in the
    // same login panel, never duplicated as an overlay or another dialog.
    if(signingIn){display("login");message("Проверяем права сотрудника…");}
    else display("loading");
  }else{display("login");message("Проверяем права сотрудника…");}
  try{
    await verifyRole(user);
    if(current!==generation)return;
    $("adminEmail").textContent=user.displayName||user.email||"Сотрудник BALI";
    message("");
    display("ready");
    window.dispatchEvent(new Event("bali-staff-authorized"));
  }catch(error){
    if(current!==generation)return;
    showLogin(roleError(error));
  }finally{
    if(current===generation){checkingRole=false;busy(false);}
  }
},error=>showLogin("Ошибка авторизации Firebase. Перезагрузите страницу или войдите заново."));
