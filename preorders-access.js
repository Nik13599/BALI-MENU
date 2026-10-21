import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let seq=0;
const status=text=>{$("loginStatus").textContent=text;};
$("adminSignIn").addEventListener("click",async()=>{
  $("adminSignIn").disabled=true;status("Авторизация...");
  try{await signInWithPopup(auth,new GoogleAuthProvider());}
  catch(error){status("Вход не завершён: "+(error.code||error.message));}
  finally{$("adminSignIn").disabled=false;}
});
$("adminSignOut").addEventListener("click",()=>void signOut(auth));
$("adminSwitchAccount").addEventListener("click",()=>void signOut(auth));
onAuthStateChanged(auth,async user=>{
  const current=++seq;
  $("adminView").hidden=true;$("loginView").hidden=false;
  $("adminSwitchAccount").hidden=!user;
  if(!user){status("Войдите через Google-аккаунт сотрудника.");return;}
  if(!user.emailVerified){status("Для доступа подтвердите адрес электронной почты.");return;}
  status("Проверка прав...");
  try{
    const role=await getDoc(doc(db,"admins",user.uid));
    if(current!==seq)return;
    if(!role.exists()||role.data().active!==true){
      status("У аккаунта нет активной роли администратора. Обратитесь к руководителю.");
      return;
    }
    $("adminEmail").textContent=user.email||"";
    $("adminView").hidden=false;$("loginView").hidden=true;
    status("");
  }catch(error){if(current===seq)status("Ошибка проверки прав: "+(error.code||error.message));}
});
