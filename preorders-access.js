import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let seq=0;
const status=text=>{$("loginStatus").textContent=text;};
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
    await signInWithEmailAndPassword(auth,"staff+"+login+"@staff.baliminsk.by",password);
    $("staffLoginPassword").value="";
  }catch(error){
    status(error.code==="auth/operation-not-allowed"
      ?"В Firebase ещё не включена авторизация по паролю. Обратитесь к администратору."
      :"Неверный логин/пароль или доступ сотрудника отключён.");
  }finally{button.disabled=false;}
});
$("adminSignIn").addEventListener("click",async()=>{
  $("adminSignIn").disabled=true;status("Вход администратора...");
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
  if(!user){status("Введите логин и пароль сотрудника.");return;}
  if(!user.emailVerified){status("Нет подтверждённого доступа к предзаказам.");return;}
  status("Проверка прав...");
  try{
    const adminRole=await getDoc(doc(db,"admins",user.uid));
    if(current!==seq)return;
    const owner=adminRole.exists()&&adminRole.data().active===true;
    const staffRole=owner?null:await getDoc(doc(db,"preorderStaff",user.uid));
    if(current!==seq)return;
    const staff=staffRole?.exists()&&staffRole.data().active===true&&staffRole.data().role==="preorders";
    if(!owner&&!staff){status("Учётная запись не имеет доступа к предзаказам.");return;}
    $("adminEmail").textContent=staff?staffRole.data().name:("Администратор");
    $("adminView").hidden=false;$("loginView").hidden=true;status("");
  }catch(error){if(current===seq)status("Ошибка проверки прав: "+(error.code||error.message));}
});
