// BALI MENU: администратор через Google Auth + вручную назначенный admins/{uid}.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebase = initializeApp(window.BALI_FIREBASE_CONFIG);
const auth = getAuth(firebase);
const db = getFirestore(firebase);
const $ = (id) => document.getElementById(id);
const menu = new Map(), events = new Map();
const renderStatus = (id, text) => { $(id).textContent = text; };
let unsubMenu = null, unsubEvents = null, authorized = false;

function createEntry(title, subtitle, onEdit, onDelete) {
  const row = document.createElement("div");
  row.className = "entry";
  const info = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = title;
  const caption = document.createElement("small");
  caption.textContent = subtitle;
  info.append(name, caption);
  const controls = document.createElement("div");
  controls.className = "row-actions";
  for (const [label, fn] of [["Изменить", onEdit], ["Удалить", onDelete]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", fn);
    controls.append(button);
  }
  row.append(info, controls);
  return row;
}

function menuRender() {
  const list = $("menuList");
  list.replaceChildren();
  for (const item of [...menu.values()].sort((a,b) => a.sort-b.sort || a.name.localeCompare(b.name,"ru"))) {
    list.append(createEntry(
      item.name + " — " + item.price.toFixed(2) + " BYN",
      "ID "+item.id+" · "+item.category+" · "+(item.available ? "В наличии" : "Недоступно"),
      () => {
        $("menuId").value = item.id;
        $("menuId").readOnly = true;
        $("menuName").value = item.name;
        $("menuCategory").value = item.category;
        $("menuDescription").value = item.description;
        $("menuPrice").value = item.price;
        $("menuSort").value = item.sort;
        $("menuImage").value = item.image_url;
        $("menuAvailable").checked = item.available;
        $("menuForm").scrollIntoView({behavior:"smooth",block:"center"});
      },
      async () => {
        if (!confirm("Удалить «"+item.name+"»? Это действие нельзя отменить.")) return;
        try {
          await deleteDoc(doc(db,"menu",String(item.id)));
          renderStatus("menuStatus","Товар удалён.");
        } catch (error) {
          renderStatus("menuStatus","Ошибка удаления: "+(error.code || "unknown"));
        }
      }
    ));
  }
  if (!menu.size) list.textContent = "Каталог пока пуст. Добавьте первый товар.";
}

function eventRender() {
  const list = $("eventList");list.replaceChildren();
  for (const event of [...events.values()].sort((a,b)=>a.date.localeCompare(b.date))) {
    list.append(createEntry(
      event.date + " — " + event.title,
      (event.preorderEnabled ? "Приём включён" : "Приём выключен") +
        (event.cutoff ? " · До " + event.cutoff + " по Минску" : ""),
      () => {
        $("eventDateAdmin").value=event.date;
        $("eventDateAdmin").readOnly=true;
        $("eventTitle").value=event.title;
        $("eventCutoff").value=event.cutoff;
        $("eventOpen").checked=event.preorderEnabled;
        $("eventForm").scrollIntoView({behavior:"smooth",block:"center"});
      },
      async () => {
        if(!confirm("Удалить мероприятие "+event.date+"?"))return;
        try { await deleteDoc(doc(db,"events",event.date));renderStatus("eventStatus","Мероприятие удалено."); }
        catch(e){renderStatus("eventStatus","Ошибка: "+(e.code || "unknown"));}
      }
    ));
  }
  if (!events.size) list.textContent="Мероприятия пока не добавлены.";
}

function clearMenu() {
  $("menuForm").reset();
  $("menuId").readOnly=false;
  $("menuSort").value=100;
  $("menuAvailable").checked=true;
}
function clearEvent() {
  $("eventForm").reset();
  $("eventDateAdmin").readOnly=false;
  $("eventOpen").checked=true;
}
$("clearMenu").addEventListener("click", clearMenu);
$("clearEvent").addEventListener("click", clearEvent);

$("menuForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authorized) return;
  const id=Number($("menuId").value),price=Number($("menuPrice").value),sort=Number($("menuSort").value);
  if(!Number.isSafeInteger(id) || id<1 || !Number.isFinite(price) || price<0 ||
     !Number.isInteger(sort) || sort<0) {
    renderStatus("menuStatus","Проверьте ID, цену и сортировку.");return;
  }
  const url=$("menuImage").value.trim();
  if (url && !/^https:\/\/[^ ]+$/.test(url)) {
    renderStatus("menuStatus","Фотография должна иметь HTTPS-ссылку.");return;
  }
  const data={
    id,name:$("menuName").value.trim(),category:$("menuCategory").value.trim(),
    description:$("menuDescription").value.trim(),price,image_url:url,
    available:$("menuAvailable").checked,sort,updatedAt:serverTimestamp()
  };
  const button=event.currentTarget.querySelector('[type="submit"]');
  button.disabled=true;
  renderStatus("menuStatus","Сохраняем товар...");
  try {
    await setDoc(doc(db,"menu",String(id)),data);
    clearMenu();renderStatus("menuStatus","Товар сохранён в Firestore.");
  } catch(e){renderStatus("menuStatus","Не удалось сохранить товар: "+(e.code || "unknown"));}
  finally{button.disabled=false;}
});

$("eventForm").addEventListener("submit",async (event)=>{
  event.preventDefault();
  if(!authorized)return;
  const date=$("eventDateAdmin").value,title=$("eventTitle").value.trim(),
    cutoff=$("eventCutoff").value||"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || title.length<2) {
    renderStatus("eventStatus","Укажите дату и название мероприятия.");return;
  }
  const btn=event.currentTarget.querySelector('[type="submit"]');
  btn.disabled=true;
  renderStatus("eventStatus","Сохраняем мероприятие...");
  try{
    await setDoc(doc(db,"events",date),{
      date,title,cutoff,preorderEnabled:$("eventOpen").checked,updatedAt:serverTimestamp()
    });
    clearEvent();renderStatus("eventStatus","Мероприятие сохранено.");
  }catch(e){renderStatus("eventStatus","Ошибка: "+(e.code||"unknown"));}
  finally{btn.disabled=false;}
});

// Диагностика входа: показываем только email и UID текущего вошедшего пользователя.
function signInStatus(text) {
  renderStatus("loginStatus",text);
}
function showLoginIdentity(user) {
  $("adminSwitchAccount").hidden = !user;
  $("loginIdentity").textContent = user ? "Google-аккаунт: " + (user.email || "email недоступен") : "";
  $("adminUid").textContent = user ? "Ваш Firebase UID: " + user.uid : "";
}
async function checkAdminAccess(user) {
  if(unsubMenu){unsubMenu();unsubMenu=null;}
  if(unsubEvents){unsubEvents();unsubEvents=null;}
  authorized=false;
  $("adminView").hidden=true;
  $("loginView").hidden=false;
  showLoginIdentity(user);
  if(!user) {
    signInStatus("Войдите через Google, чтобы проверить права.");
    return;
  }
  if(!user.emailVerified) {
    signInStatus("Email Google-аккаунта не подтверждён.");
    return;
  }
  signInStatus("Проверяем роль администратора в Firestore...");
  try {
    const role=await getDoc(doc(db,"admins",user.uid));
    if(auth.currentUser?.uid!==user.uid) return;
    if(!role.exists()) {
      signInStatus("Google-вход выполнен, но документ admins/ВАШ_UID не найден. Сравните UID выше с Document ID в Firestore.");
      return;
    }
    if(role.data().active!==true) {
      signInStatus("Роль найдена, но поле active должно иметь тип boolean и значение true.");
      return;
    }
    authorized=true;
    $("adminEmail").textContent=user.email||"";
    $("adminView").hidden=false;
    $("loginView").hidden=true;
    unsubMenu=onSnapshot(collection(db,"menu"),snap=>{
      menu.clear();
      for(const d of snap.docs){const x=d.data();if(typeof x.name==="string"&&Number.isFinite(x.price))menu.set(d.id,x);}
      menuRender();
    },error=>renderStatus("menuStatus","Не удалось прочитать каталог: "+(error.code||"unknown")));
    unsubEvents=onSnapshot(collection(db,"events"),snap=>{
      events.clear();
      for(const d of snap.docs)events.set(d.id,d.data());
      eventRender();
    },error=>renderStatus("eventStatus","Не удалось прочитать мероприятия: "+(error.code||"unknown")));
  } catch(error) {
    if(auth.currentUser?.uid!==user.uid) return;
    const code=String(error.code||"unknown");
    const explanation=code==="permission-denied"
      ? "Нет права читать свою роль admins/{UID}. Откройте Firestore → Rules и опубликуйте последнюю версию firestore.rules из GitHub."
      : "Ошибка проверки роли Firebase: "+code+".";
    signInStatus(explanation+" [код: "+code+"]");
  }
}

$("adminSignIn").addEventListener("click",async ()=>{
  $("adminSignIn").disabled=true;
  signInStatus("Открывается окно Google...");
  try {
    const result=await signInWithPopup(auth,new GoogleAuthProvider());
    await checkAdminAccess(result.user);
  } catch(error) {
    signInStatus("Не удалось войти через Google [код: "+(error.code||"unknown")+"]");
  } finally {
    $("adminSignIn").disabled=false;
  }
});
$("adminSwitchAccount").addEventListener("click",async()=>{
  try {
    await signOut(auth);
    signInStatus("Вы вышли. Нажмите «Войти через Google», чтобы выбрать нужный аккаунт.");
  } catch(error) {
    signInStatus("Ошибка выхода [код: "+(error.code||"unknown")+"]");
  }
});
$("adminSignOut").addEventListener("click",()=>signOut(auth));
onAuthStateChanged(auth,(user)=>{
  void checkAdminAccess(user);
},(error)=>{
  signInStatus("Ошибка Firebase Authentication [код: "+(error.code||"unknown")+"]");
});
