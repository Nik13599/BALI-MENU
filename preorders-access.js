import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,signOut,setPersistence,browserLocalPersistence} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {sheetsEnabled,sheetsRequest} from "./bali-sheets-api.js";
const app=getApps().find(app=>app.name==="bali-staff")||initializeApp(window.BALI_FIREBASE_CONFIG,"bali-staff");
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
window.BaliSheetsToken=()=>auth.currentUser?.getIdToken()||null;
const sessionReady=setPersistence(auth,browserLocalPersistence);
// Attach a rejection handler immediately; sign-in also awaits this promise.
sessionReady.catch(()=>status("Разрешите сохранение данных сайта в браузере для сохранения входа."));
let seq=0;
const status=text=>{
  $("loginStatus").textContent=text;
  $("staffSessionLoading").hidden=true;
  if(text)$("loginView").hidden=false;
};
if(sheetsEnabled()){
  $("loginIdentity").textContent="Доступ к предзаказам проверяется по назначенной сотруднику роли на сервере.";
}
$("preorderStaffLogin").addEventListener("submit",async e=>{
  e.preventDefault();
  const login=$("staffLoginName").value.trim().toLowerCase();
  const password=$("staffLoginPassword").value;
  if(!/^[a-z][a-z0-9_-]{2,31}$/.test(login)||password.length<12){
    status("Проверьте логин и пароль.");return;
  }
  const button=$("staffPasswordSignIn");button.disabled=true;status("Проверяем данные...");
  try{
    // Firebase Auth manages salted password hashes; no email inbox is involved.
    await sessionReady;
    await signInWithEmailAndPassword(auth,"staff+"+login+"@staff.baliminsk.by",password);
    $("staffLoginPassword").value="";
  }catch(error){
    status(error.code==="auth/operation-not-allowed"
      ?"В Firebase ещё не включена авторизация по паролю. Обратитесь к администратору."
      :"Неверный логин/пароль или доступ сотрудника отключён.");
  }finally{button.disabled=false;}
});
$("adminSignIn").addEventListener("click",async()=>{
  $("adminSignIn").disabled=true;status("Вход через Google...");
  try{await sessionReady;await signInWithPopup(auth,new GoogleAuthProvider());}
  catch(error){status("Вход не завершён: "+(error.code||error.message));}
  finally{$("adminSignIn").disabled=false;}
});
$("adminSignOut").addEventListener("click",()=>void signOut(auth));
$("adminSwitchAccount").addEventListener("click",()=>void signOut(auth));
onAuthStateChanged(auth,async user=>{
  const current=++seq;
  $("adminView").hidden=true;$("loginView").hidden=true;
  $("staffSessionLoading").hidden=false;
  $("staffHeaderAccount").hidden=true;
  $("adminSwitchAccount").hidden=!user;
  if(!user){status("Введите логин и пароль сотрудника или используйте вход через Google.");return;}
  if(!user.emailVerified){status("Нет подтверждённого доступа к предзаказам.");return;}
  // Keep the login form hidden while the restored session is authorized.
  $("staffSessionLoading").textContent="Загружаем рабочую панель…";
  try{
    if(sheetsEnabled()){
      const {role}=await sheetsRequest("me");
      if(current!==seq)return;
      if(role!=="admin"&&role!=="staff"){status("У этой учётной записи нет доступа к предзаказам.");return;}
      $("adminEmail").textContent=user.displayName||user.email||"Сотрудник BALI";
      $("adminView").hidden=false;$("loginView").hidden=true;
      $("staffHeaderAccount").hidden=false;status("");
      return;
    }
    const adminRole=await getDoc(doc(db,"admins",user.uid));
    if(current!==seq)return;
    const owner=adminRole.exists()&&adminRole.data().active===true;
    const staffRole=owner?null:await getDoc(doc(db,"preorderStaff",user.uid));
    if(current!==seq)return;
    const staff=staffRole?.exists()&&staffRole.data().active===true&&staffRole.data().role==="preorders";
    if(!owner&&!staff){status("Учётная запись не имеет доступа к предзаказам.");return;}
    $("adminEmail").textContent=staff?staffRole.data().name:(user.displayName||user.email||"Администратор");
    $("adminView").hidden=false;$("loginView").hidden=true;
    $("staffHeaderAccount").hidden=false;status("");
  }catch(error){if(current===seq)status("Ошибка проверки прав: "+(error.code||error.message));}
});
