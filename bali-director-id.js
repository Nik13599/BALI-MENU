/* BALI ID Director Control — authenticated staff only.
   Firestore security rules (not this UI) enforce role authorization. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,collection,query,where,limit,getDocs,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const TIERS=["Member","Silver","Gold","Platinum","Black","Private"];
let authorized=false,selectedUid=null,selectedGuestName="",selectedId="",isBusy=false,authRound=0;
function status(id,text){$(id).textContent=text;}
function resetGuest(){
  selectedUid=null;selectedGuestName="";selectedId="";
  $("directorAssignPanel").hidden=true;
  $("directorGuestProfile").hidden=true;
  $("directorBenefits").value="";
  $("directorTier").value="Member";
}
async function checkRole(user){
  const adminDoc=await getDoc(doc(db,"admins",user.uid)).catch(()=>null);
  if(adminDoc?.data()?.active===true)return "administrator";
  const staffDoc=await getDoc(doc(db,"staffRoles",user.uid)).catch(()=>null);
  if(staffDoc?.data()?.role==="director"&&staffDoc.data().active===true)return "director";
  return null;
}
onAuthStateChanged(auth,async user=>{
  const round=++authRound;
  authorized=false;resetGuest();
  $("directorWorkspace").hidden=true;
  $("directorLogin").hidden=false;
  if(!user){status("directorAuthStatus","Войдите, чтобы продолжить.");return;}
  if(!user.emailVerified){status("directorAuthStatus","Подтвердите электронную почту аккаунта.");return;}
  status("directorAuthStatus","Проверяем полномочия...");
  try{
    const role=await checkRole(user);
    if(authRound!==round||auth.currentUser?.uid!==user.uid)return;
    if(!role){
      status("directorAuthStatus","Для этого аккаунта нет полномочий директора или администратора. UID: "+user.uid);
      return;
    }
    authorized=true;$("directorLogin").hidden=true;$("directorWorkspace").hidden=false;
    status("directorAuthStatus","");
  }catch(error){if(authRound===round)status("directorAuthStatus","Не удалось проверить доступ: "+(error.code||"unknown"));}
});
$("directorSignIn").addEventListener("click",async()=>{
  try{await signInWithPopup(auth,new GoogleAuthProvider());}
  catch(error){status("directorAuthStatus","Ошибка входа: "+(error.code||"unknown"));}
});
$("directorSignOut").addEventListener("click",async()=>{await signOut(auth);});
async function findGuest(){
  if(!authorized||isBusy)return;
  resetGuest();
  const raw=$("directorGuestNumber").value.trim();
  const number=Number(raw);
  if(!/^\d{1,9}$/.test(raw)||!Number.isSafeInteger(number)||number<1){
    status("directorSearchStatus","Укажите действительный персональный номер BALI ID.");
    return;
  }
  isBusy=true;$("directorFind").disabled=true;
  status("directorSearchStatus","Ищем карту гостя...");
  try{
    const ids=await getDocs(query(collection(db,"baliIds"),where("number","==",number),limit(1)));
    if(!authorized)return;
    if(ids.empty){status("directorSearchStatus","Гость с таким номером не найден.");return;}
    const uid=ids.docs[0].id;
    const [user,privilege]=await Promise.all([
      getDoc(doc(db,"users",uid)),getDoc(doc(db,"guestPrivileges",uid))
    ]);
    if(!authorized)return;
    if(!user.exists())throw new Error("Профиль пользователя не найден.");
    selectedUid=uid;selectedGuestName=String(user.data().name||"Гость BALI");
    selectedId=String(number).padStart(6,"0");
    const tier=privilege.data()?.tier||"Member";
    const personal=privilege.data()?.benefits;
    $("directorGuestName").textContent=selectedGuestName;
    $("directorGuestId").textContent="BALI ID № "+selectedId;
    $("directorGuestCurrent").textContent="Текущая категория: "+tier.toUpperCase();
    $("directorTier").value=TIERS.includes(tier)?tier:"Member";
    $("directorBenefits").value=Array.isArray(personal)?personal.join("\n"):"";
    $("directorGuestProfile").hidden=false;
    $("directorAssignPanel").hidden=false;
    status("directorSaveStatus","");
    status("directorSearchStatus","Карта найдена.");
  }catch(error){status("directorSearchStatus","Ошибка поиска: "+(error.code||error.message||"unknown"));}
  finally{isBusy=false;$("directorFind").disabled=false;}
}
$("directorFind").addEventListener("click",findGuest);
$("directorGuestNumber").addEventListener("keydown",event=>{
  if(event.key==="Enter"){event.preventDefault();void findGuest();}
});
$("directorAssignForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!authorized||!selectedUid||isBusy)return;
  const tier=$("directorTier").value;
  const benefits=$("directorBenefits").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!TIERS.includes(tier)||benefits.length>10||benefits.some(x=>x.length>180)){
    status("directorSaveStatus","Допустимо до 10 привилегий по 180 символов.");
    return;
  }
  if(!confirm("Назначить "+tier.toUpperCase()+" гостю "+selectedGuestName+" (№ "+selectedId+")?"))return;
  isBusy=true;
  const submit=$("directorAssignForm").querySelector('button[type="submit"]');
  submit.disabled=true;status("directorSaveStatus","Сохраняем категорию...");
  try{
    await setDoc(doc(db,"guestPrivileges",selectedUid),{
      uid:selectedUid,tier,benefits,updatedBy:auth.currentUser.uid,updatedAt:serverTimestamp()
    });
    if(authorized){
      $("directorGuestCurrent").textContent="Текущая категория: "+tier.toUpperCase();
      status("directorSaveStatus","Гостю назначена категория "+tier.toUpperCase()+". Карта обновится автоматически.");
    }
  }catch(error){
    status("directorSaveStatus","Не удалось назначить категорию: "+(error.code||"unknown")+". Проверьте опубликованные правила Firestore и роль директора.");
  }finally{isBusy=false;submit.disabled=false;}
});