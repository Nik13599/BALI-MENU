/* BALI Privilege / admin-only CRM. No automated tier upgrades. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {sheetsEnabled,sheetsRequest} from "./bali-sheets-api.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const TIERS=["Member","Silver","Gold","Platinum","Black","Private","ResidentDJ"];
const defaults={
  Member:{description:"Ваш первый уровень BALI PRIVILEGE.",criteria:"Автоматически после регистрации.",benefits:["Персональная цифровая карта гостя"]},
  Silver:{description:"Ваш уровень с первыми дополнительными привилегиями.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Дополнительные клубные преимущества"]},
  Gold:{description:"Ваш уровень с расширенными преимуществами.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Расширенные клубные привилегии"]},
  Platinum:{description:"Ваш премиальный уровень BALI PRIVILEGE.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Премиальные преимущества"]},
  Black:{description:"Ваш уровень с особыми клубными привилегиями.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Особые клубные привилегии"]},
  Private:{description:"Закрытый статус по приглашению.",criteria:"Назначают директор или администратор.",benefits:["Персональная цифровая карта гостя","Индивидуальные привилегии по решению администрации"]},
  ResidentDJ:{description:"",criteria:"Только по назначению директора или администратора для DJ-резидентов BALI.",benefits:["Безлимит замесов","Возможность ночевки в клубе","Работать за бесплатно"]}
};
let authorized=false,selected=null;
const line=()=>document.createElement("div");
const normalize=raw=>String(raw||"").split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
const setStatus=(id,message)=>{$(id).textContent=message};
function renderRules(values=defaults){
  const root=$("baliPrivilegeRulesFields");root.replaceChildren();
  for(const tier of TIERS){
    const d=values[tier]||defaults[tier];
    const fieldset=document.createElement("fieldset");
    const legend=document.createElement("legend");legend.textContent=tier==="ResidentDJ"?"Resident Bali - DJ":tier;fieldset.append(legend);
    for(const [key,label,multi,max] of [
      ["description","Описание статуса",false,180],
      ["criteria","Условия ручного назначения",false,250],
      ["benefits","Преимущества, по одному на строку",true,700]
    ]){
      const row=document.createElement("label");row.textContent=label;
      const input=document.createElement(multi?"textarea":"input");
      input.dataset.tier=tier;input.dataset.field=key;
      input.maxLength=max;if(multi)input.rows=3;
      input.value=Array.isArray(d[key])?d[key].join("\n"):String(d[key]||"");
      row.append(input);fieldset.append(row);
    }
    root.append(fieldset);
  }
}
renderRules();
window.addEventListener("bali:admin:select-privilege",async({detail})=>{
  if(!authorized||!detail?.uid)return;
  selected=detail.uid;
  const tools=$("baliGuestPrivilegeTools");if(tools)tools.open=true;
  $("baliPrivilegeGuestUid").value=detail.uid;
  $("baliPrivilegeGuest").value=detail.name+" · "+detail.email;
  $("baliPrivilegePersonal").value="";
  $("baliPrivilegeTier").value="Member";
  setStatus("baliPrivilegeAssignStatus","Загружаем текущий уровень гостя...");
  try{
    if(sheetsEnabled()){
      const {card}=await sheetsRequest("adminCard",{uid:detail.uid});
      if(selected!==detail.uid)return;
      const tier=TIERS.includes(card.tier)?card.tier:"Member";
      $("baliPrivilegeTier").value=tier;
      $("baliPrivilegePersonal").value=(card.benefits||[]).join("\n");
      setStatus("baliPrivilegeAssignStatus",
        "Bali Card: "+(card.activated?card.number:"ещё не активирован")+
        " · статус: "+tier);
      $("baliPrivilegeAdmin").scrollIntoView({behavior:"smooth",block:"nearest"});
      return;
    }
    const [id,assignment]=await Promise.all([
      getDoc(doc(db,"baliIds",detail.uid)),
      getDoc(doc(db,"guestPrivileges",detail.uid))
    ]);
    if(selected!==detail.uid)return;
    const tier=assignment.data()?.tier||"Member";
    $("baliPrivilegeTier").value=TIERS.includes(tier)?tier:"Member";
    $("baliPrivilegePersonal").value=(assignment.data()?.benefits||[]).join("\n");
    setStatus("baliPrivilegeAssignStatus",
      "Bali Card: "+(id.exists()?String(id.data().number).padStart(6,"0"):"ещё не активирован")+
      " · статус: "+tier);
    $("baliPrivilegeAdmin").scrollIntoView({behavior:"smooth",block:"nearest"});
  }catch(e){setStatus("baliPrivilegeAssignStatus","Ошибка загрузки статуса: "+(e.code||"unknown"));}
});
$("baliPrivilegeAssignForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!authorized||!selected)return setStatus("baliPrivilegeAssignStatus","Выберите гостя из списка.");
  const tier=$("baliPrivilegeTier").value;
  const benefits=normalize($("baliPrivilegePersonal").value);
  if(!TIERS.includes(tier)||benefits.length>5||benefits.some(x=>x.length>180))
    return setStatus("baliPrivilegeAssignStatus","Максимум 5 персональных привилегий длиной до 180 символов.");
  const submit=e.currentTarget.querySelector('button[type="submit"]');
  submit.disabled=true;
  try{
    if(sheetsEnabled())await sheetsRequest("privilegeAssign",{uid:selected,tier,benefits});
    else await setDoc(doc(db,"guestPrivileges",selected),{
      uid:selected,tier,benefits,updatedBy:auth.currentUser.uid,updatedAt:serverTimestamp()
    });
    setStatus("baliPrivilegeAssignStatus","Статус "+(tier==="ResidentDJ"?"Resident Bali - DJ":tier)+
      " сохранён в "+(sheetsEnabled()?"Google Таблицах.":"Firebase."));
  }catch(error){
    setStatus("baliPrivilegeAssignStatus","Не удалось сохранить: "+(error.code||"unknown")+
      ". Проверьте опубликованные firestore.rules.");
  }finally{submit.disabled=false;}
});
$("baliPrivilegeRulesForm")?.addEventListener("submit",async e=>{
  e.preventDefault();if(!authorized)return;
  const levels={};
  for(const tier of TIERS){
    const root=$("baliPrivilegeRulesFields");
    const get=key=>root.querySelector('[data-tier="'+tier+'"][data-field="'+key+'"]').value.trim();
    levels[tier]={description:get("description"),criteria:get("criteria"),benefits:normalize(get("benefits"))};
    if(levels[tier].benefits.length>5||levels[tier].benefits.some(x=>x.length>180))
      return setStatus("baliPrivilegeRulesStatus","У "+tier+" максимум 5 преимуществ по 180 символов.");
  }
  const submit=e.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;
  try{
    if(sheetsEnabled())await sheetsRequest("privilegeRulesSave",{levels});
    else await setDoc(doc(db,"privilegeRules","main"),{levels,updatedAt:serverTimestamp()});
    setStatus("baliPrivilegeRulesStatus","Условия и преимущества всех категорий сохранены.");
  }catch(err){
    setStatus("baliPrivilegeRulesStatus","Не удалось сохранить правила: "+(err.code||"unknown"));
  }finally{submit.disabled=false;}
});
onAuthStateChanged(auth,async user=>{
  authorized=false;selected=null;
  if(!user||!user.emailVerified)return;
  try{
    if(sheetsEnabled()){
      const [{role},rules]=await Promise.all([sheetsRequest("me"),sheetsRequest("privilegeRules")]);
      if(auth.currentUser?.uid!==user.uid||role!=="admin")return;
      authorized=true;
      renderRules({...defaults,...rules.levels});
    }else{
      const role=await getDoc(doc(db,"admins",user.uid));
      if(auth.currentUser?.uid!==user.uid||role.data()?.active!==true)return;
      authorized=true;
      const rules=await getDoc(doc(db,"privilegeRules","main"));
      if(rules.exists())renderRules({...defaults,...rules.data().levels});
    }
    setStatus("baliPrivilegeRulesStatus","Сохранение: "+(sheetsEnabled()?"Google Таблицы.":"Firebase.")+
      " Статус назначается директором или администратором вручную.");
  }catch(err){setStatus("baliPrivilegeRulesStatus","Ошибка проверки прав: "+(err.code||"unknown"));}
});
