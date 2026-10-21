import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,"europe-west1");
const manage=httpsCallable(functions,"manageBaliPreorderStaff");
const $=id=>document.getElementById(id);
let generation=0,allowed=false,busy=false;
const status=(s)=>{$("preorderStaffAdminStatus").textContent=s;};
const item=(tag,txt,cls)=>{const n=document.createElement(tag);n.textContent=txt;if(cls)n.className=cls;return n;};
const entry=(placeholder,type="text")=>{
  const input=document.createElement("input");input.placeholder=placeholder;input.type=type;
  if(type==="password"){input.autocomplete="new-password";input.minLength=12;input.maxLength=72;}
  return input;
};
async function refresh(){
  if(!allowed)return;
  const output=$("preorderStaffList");output.replaceChildren(item("p","Загружаем сотрудников..."));
  try{
    const {data}=await manage({action:"list"});
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
          catch(e){status("Не удалось сменить пароль: "+(e.message||e.code));}
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
        catch(e){status("Не удалось обновить доступ: "+(e.message||e.code));}
        finally{busy=false;toggle.disabled=false;}
      });
      actions.append(reset,toggle);section.append(details,actions);output.append(section);
    }
  }catch(e){output.replaceChildren();status("Список сотрудников недоступен: "+
    (e.code==="functions/not-found"?"не опубликована функция Firebase.":e.message||e.code));}
}
$("preorderStaffCreateForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!allowed||busy)return;
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
  }catch(e){status("Аккаунт не создан: "+(e.message||e.code));}
  finally{busy=false;btn.disabled=false;}
});
$("preorderStaffRefresh").addEventListener("click",refresh);
onAuthStateChanged(auth,async user=>{
  const seq=++generation;allowed=false;
  $("preorderStaffManagement").hidden=true;
  if(!user?.emailVerified)return;
  try{
    const role=await getDoc(doc(db,"admins",user.uid));
    if(seq!==generation)return;
    allowed=role.exists()&&role.data().active===true;
    if(allowed){$("preorderStaffManagement").hidden=false;await refresh();}
  }catch(e){if(seq===generation)status("Недоступна проверка прав.");}
});
