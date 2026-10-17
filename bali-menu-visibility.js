/* BALI v72 — shared, real-time public menu-section visibility.
   Only verified Firestore admins may change it; hidden sections keep their data. */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,onSnapshot,setDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app),auth=getAuth(app);
const keys=["kitchen","bar","hookah","tea"];
const allVisible=()=>({kitchen:true,bar:true,hookah:true,tea:true});
const configRef=doc(db,"settings","menuVisibility");
const controls=[...document.querySelectorAll("[data-bali-visibility-toggle]")];
const admin=controls.length>0;
const status=document.getElementById("baliVisibilityStatus");
const states=Object.fromEntries(keys.map(k=>[k,document.querySelector('[data-bali-visibility-state="'+k+'"]')]));
let current=allVisible(),authorized=false,busy=false,session=0,unsubscribe=null,loaded=false;
const report=text=>{if(status)status.textContent=text;};
function fromDoc(data){
  if(!data)return allVisible();
  const source=data.sections;
  if(!source||typeof source!=="object"||!keys.every(k=>typeof source[k]==="boolean"))
    return allVisible();
  return Object.fromEntries(keys.map(k=>[k,source[k]]));
}
function renderEditor(){
  for(const control of controls){
    const key=control.dataset.baliVisibilityToggle;
    control.checked=current[key]===true;
    control.disabled=!authorized||busy||!loaded;
    if(states[key])states[key].textContent=current[key]?"Показывается гостям":"Скрыто от гостей";
    control.closest(".bali-visibility-option")?.classList.toggle("is-off",!current[key]);
  }
}
function publishGuestState(){
  const data={...current};
  window.BaliMenuVisibility={...data};
  window.dispatchEvent(new CustomEvent("bali:menu-visibility",{detail:data}));
}
function connect(){
  if(unsubscribe)unsubscribe();
  unsubscribe=onSnapshot(configRef,snapshot=>{
    current=fromDoc(snapshot.exists()?snapshot.data():null);
    loaded=true;
    if(admin){
      renderEditor();
      if(!busy)report("Настройки сохранены. Переключатели сразу меняют отображение меню на сайте.");
    }else publishGuestState();
  },error=>{
    loaded=false;
    if(admin){
      renderEditor();
      report(error.code==="permission-denied"
        ?"Нет доступа к настройкам. Опубликуйте новые firestore.rules в Firebase Console."
        :"Не удалось загрузить настройки видимости: "+(error.code||"ошибка"));
    }else{
      // Older Firestore rules have no public menuVisibility read.
      // Preserve the existing four-menu UI until publishing the new rules.
      current=allVisible();
      publishGuestState();
      console.warn("BALI menu visibility unavailable:",error.code);
    }
  });
}
if(admin){
  renderEditor();
  for(const control of controls){
    control.addEventListener("change",async()=>{
      if(!authorized||!loaded||busy){renderEditor();return;}
      const key=control.dataset.baliVisibilityToggle;
      const previous={...current};
      const next={...current,[key]:control.checked};
      busy=true;current=next;renderEditor();
      report("Сохраняем видимость раздела…");
      try{
        await setDoc(configRef,{sections:next,updatedAt:serverTimestamp()});
        report(next[key]
          ?"Раздел включён. Кнопка отображается у гостей."
          :"Раздел скрыт. Все позиции и цены сохранены.");
      }catch(error){
        current=previous;
        report(error.code==="permission-denied"
          ?"Отказано в доступе. Опубликуйте новые firestore.rules в Firebase Console."
          :"Не удалось сохранить настройку: "+(error.code||"ошибка"));
      }finally{
        busy=false;renderEditor();
      }
    });
  }
  onAuthStateChanged(auth,async user=>{
    const serial=++session;
    authorized=false;loaded=false;
    if(unsubscribe){unsubscribe();unsubscribe=null;}
    renderEditor();
    if(!user?.emailVerified){report("Войдите в подтверждённый аккаунт администратора.");return;}
    try{
      const role=await getDoc(doc(db,"admins",user.uid));
      if(serial!==session||auth.currentUser?.uid!==user.uid)return;
      if(role.data()?.active!==true){report("Нужна активная роль администратора.");return;}
      authorized=true;
      report("Загружаем настройки видимости…");
      connect();
    }catch(error){
      if(serial===session)report("Не удалось проверить роль администратора: "+(error.code||"ошибка"));
    }
  });
}else{
  connect();
}
