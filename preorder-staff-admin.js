import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,"europe-west1");
const manage=httpsCallable(functions,"manageBaliPreorderStaff");
const $=id=>document.getElementById(id);
let generation=0,allowed=false,busy=false,serviceReady=false;
const status=(s)=>{$("preorderStaffAdminStatus").textContent=s;};
const setupHelp=$("preorderStaffSetupHelp");
function setServiceReady(value){
  serviceReady=value===true;
  const create=$("preorderStaffCreate");
  if(create)create.disabled=!serviceReady||!allowed||busy;
  if(setupHelp){
    setupHelp.hidden=serviceReady;
    if(!serviceReady)setupHelp.open=true;
    else setupHelp.open=false;
  }
}
const staffError=(error)=>{
  const code=String(error?.code||"").replace(/^functions\//,"");
  switch(code){
    case "not-found":return "Серверная функция регистрации сотрудников не опубликована в Firebase. Проверьте развёртывание manageBaliPreorderStaff.";
    case "internal":return "Ошибка сервера Firebase (internal). Последнее развёртывание функции сотрудников завершилось ошибкой прав. Проверьте Cloud Functions, Cloud Build, Artifact Registry и IAM.";
    case "unavailable":return "Сервис Firebase временно недоступен. Повторите после восстановления соединения.";
    case "permission-denied":return "Недостаточно прав для создания сотрудника. Проверьте права администратора и серверного аккаунта.";
    case "unauthenticated":return "Сессия администратора недействительна. Войдите в админку заново.";
    case "already-exists":return "Такой логин уже занят. Выберите другой.";
    case "failed-precondition":return error?.message||"Не выполнены условия настройки Firebase Authentication.";
    case "invalid-argument":return error?.message||"Проверьте введённые данные.";
    default:return (error?.message&&error.message!=="internal"?error.message:"Неизвестная ошибка Firebase.")+
      (code?" ("+code+")":"");
  }
};
const item=(tag,txt,cls)=>{const n=document.createElement(tag);n.textContent=txt;if(cls)n.className=cls;return n;};
const entry=(placeholder,type="text")=>{
  const input=document.createElement("input");input.placeholder=placeholder;input.type=type;
  if(type==="password"){input.autocomplete="new-password";input.minLength=12;input.maxLength=72;}
  return input;
};
async function refresh(){
  if(!allowed)return;
  setServiceReady(false);
  const output=$("preorderStaffList");output.replaceChildren(item("p","Проверяем подключение к серверу сотрудников..."));
  try{
    const {data}=await manage({action:"list"});
    if(!Array.isArray(data?.staff))throw new Error("Некорректный ответ сервера сотрудников.");
    setServiceReady(true);
    output.replaceChildren();
    if(!data.staff.length)output.append(item("p","Сотрудников пока нет.","hint"));
    for(const row of data.staff){
      const section=item("div","","preorder-staff-entry");
      const details=item("div","","preorder-staff-person");
      details.append(item("strong",row.name+" · "+row.login),item("small",row.active?"Доступ активен":"Доступ отключён"));
      const actions=item("div","","preorder-staff-actions");
      const reset=item("button","Сменить пароль");
      const toggle=item("button",row.active?"Отключить":"Включить");
      reset.type=toggle.type="button";
      reset.addEventListener("click",()=>{
        const form=item("form","","preorder-staff-reset");
        const password=entry("Новый пароль, от 12 символов","password");password.required=true;
        const submit=item("button","Сохранить пароль");submit.type="submit";submit.className="primary";
        const cancel=item("button","Отмена");cancel.type="button";
        form.append(password,submit,cancel);
        cancel.onclick=()=>form.remove();
        form.onsubmit=async event=>{
          event.preventDefault();if(busy)return;
          busy=true;submit.disabled=true;
          try{await manage({action:"resetPassword",uid:row.uid,password:password.value});
            password.value="";status("Пароль сотрудника «"+row.login+"» изменён.");form.remove();}
          catch(e){status("Не удалось сменить пароль: "+staffError(e));}
          finally{busy=false;submit.disabled=false;}
        };
        section.querySelector(".preorder-staff-reset")?.remove();
        section.append(form);password.focus();
      });
      toggle.addEventListener("click",async()=>{
        if(busy||!confirm((row.active?"Отключить":"Включить")+" доступ «"+row.login+"»?"))return;
        busy=true;toggle.disabled=true;
        try{await manage({action:"setActive",uid:row.uid,active:!row.active});
          status("Доступ сотрудника «"+row.login+"» изменён.");await refresh();}
        catch(e){status("Не удалось обновить доступ: "+staffError(e));}
        finally{busy=false;toggle.disabled=false;}
      });
      actions.append(reset,toggle);section.append(details,actions);output.append(section);
    }
  }catch(e){
    setServiceReady(false);
    output.replaceChildren(item("p","Регистрация недоступна: проверьте настройку серверной части Firebase.","hint"));
    status("Список сотрудников недоступен: "+staffError(e));
  }
}
$("preorderStaffCreateForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!allowed||busy||!serviceReady){
    status("Сначала проверьте серверную часть через кнопку «Обновить».");return;
  }
  const login=$("preorderStaffLogin").value.trim().toLowerCase();
  const name=$("preorderStaffName").value.trim(),password=$("preorderStaffPassword").value;
  if(!/^[a-z][a-z0-9_-]{2,31}$/.test(login)||name.length<2||password.length<12||password.length>72){
    status("Укажите имя, логин латиницей (3–32 символа) и пароль от 12 символов.");return;
  }
  busy=true;const btn=$("preorderStaffCreate");btn.disabled=true;
  try{
    await manage({action:"create",login,name,password});
    $("preorderStaffPassword").value="";$("preorderStaffCreateForm").reset();
    status("Аккаунт сотрудника «"+login+"» создан. Передайте логин и пароль лично.");
    await refresh();
  }catch(e){
    status("Аккаунт не создан: "+staffError(e));
    if(["functions/internal","functions/not-found","functions/unavailable"].includes(e?.code))setServiceReady(false);
  }
  finally{busy=false;btn.disabled=false;}
});
$("preorderStaffRefresh").addEventListener("click",refresh);
onAuthStateChanged(auth,async user=>{
  const seq=++generation;allowed=false;
  setServiceReady(false);
  $("preorderStaffManagement").hidden=true;
  if(!user?.emailVerified)return;
  try{
    const role=await getDoc(doc(db,"admins",user.uid));
    if(seq!==generation)return;
    allowed=role.exists()&&role.data().active===true;
    if(allowed){$("preorderStaffManagement").hidden=false;await refresh();}
  }catch(e){if(seq===generation)status("Недоступна проверка прав.");}
});
