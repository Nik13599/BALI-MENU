/* BALI catalog sections v66.
   Kitchen and bar retain existing editors. Hookah and tea use isolated
   Firestore collections with the same 1-2-portion pricing schema.
   Never move these items into the preorder collection "menu". */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,onSnapshot,setDoc,deleteDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app);
const byId=id=>document.getElementById(id);
const cards=[
  {key:"hookah",title:"Кальянная карта",collection:"hookah_menu",host:"baliAdminHookahEditor",
    description:"Кальяны, категории, варианты и цены. Отдельно от кухни и барной карты.",
    portionExample:"Например, 1 кальян"},
  {key:"tea",title:"Чайная карта",collection:"tea_menu",host:"baliAdminTeaEditor",
    description:"Чай, категории, объём заварника или порции и цены. Отдельный каталог.",
    portionExample:"Например, чайник 500 мл"}
];
const tabs=[...document.querySelectorAll("[data-bali-catalog-tab]")];
const panes={
  kitchen:byId("baliAdminKitchenPane"),
  bar:byId("baliAdminBarPane"),
  hookah:byId("baliAdminHookahPane"),
  tea:byId("baliAdminTeaPane")
};
function switchTab(key){
  if(!panes[key])return;
  for(const tab of tabs){
    const selected=tab.dataset.baliCatalogTab===key;
    tab.classList.toggle("is-active",selected);
    tab.setAttribute("aria-selected",String(selected));
    tab.tabIndex=selected?0:-1;
  }
  for(const [name,pane] of Object.entries(panes))pane.hidden=name!==key;
  const addKitchen=byId("addMenuBtn");
  if(addKitchen)addKitchen.hidden=key!=="kitchen";
  const detail=byId("baliAdminBarSection");
  if(key==="bar"&&detail)detail.open=true;
  const heading=byId("menuHeading");
  if(heading)heading.textContent=key==="kitchen"?"Меню и цены":cards.find(x=>x.key===key)?.title||"Барная карта";
}
tabs.forEach(tab=>{
  tab.addEventListener("click",()=>switchTab(tab.dataset.baliCatalogTab));
  tab.addEventListener("keydown",event=>{
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
    event.preventDefault();
    const i=tabs.indexOf(tab);
    const next=event.key==="Home"?0:event.key==="End"?tabs.length-1:
      (i+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
    tabs[next].focus();switchTab(tabs[next].dataset.baliCatalogTab);
  });
});
switchTab("kitchen");

const make=(tag,cls,value)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(value!==undefined)el.textContent=value;
  return el;
};
const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
const format=x=>Number(x).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2})+" BYN";
let editable=false,session=0;
function buildEditor(config){
  const host=byId(config.host);
  if(!host)return;
  host.replaceChildren();
  const head=make("div","bali-admin-extra-head");
  head.append(make("h3","",config.title),make("p","",config.description));
  const form=make("form","bali-admin-bar-form");
  const hidden=make("input");hidden.type="hidden";hidden.name="recordId";form.append(hidden);
  const fields={};
  const field=(id,title,type,required,placeholder)=>{
    const label=make("label","",title);
    const input=make("input");
    input.type=type;input.name=id;input.required=required;
    input.placeholder=placeholder||"";
    if(type==="number"){input.step=id==="sort"?"1":"0.01";input.min="0";input.max=id==="sort"?"100000":"20000";}
    if(type==="text")input.maxLength=id==="name"?120:id==="category"?60:30;
    label.append(input);form.append(label);fields[id]=input;
  };
  field("name","Название *","text",true,"Название по вашему прайсу");
  field("category","Категория *","text",true,"Например, "+(config.key==="hookah"?"Классические":"Зелёный чай"));
  field("volume1","Вариант / объём №1 *","text",true,config.portionExample);
  field("price1","Цена №1, BYN *","number",true,"0.00");
  field("volume2","Вариант / объём №2","text",false,"Необязательно");
  field("price2","Цена №2, BYN","number",false,"0.00");
  field("sort","Порядок сортировки","number",true,"100");
  fields.sort.value="100";
  const actions=make("div","bali-admin-bar-buttons");
  const save=make("button","primary","Добавить позицию");save.type="submit";
  const clear=make("button","","Очистить форму");clear.type="button";
  actions.append(save,clear);form.append(actions);
  const status=make("p","status","Ожидаем проверку прав администратора.");
  status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  const itemsHost=make("div","bali-admin-bar-items");
  const info=make("p","hint","Цены сохраняются отдельно от предзаказов. Для доступа к новым коллекциям требуется публикация актуальных Firestore Rules.");
  host.append(head,form,status,itemsHost,info);
  const entries=new Map();
  let unsubscribe=null;
  const tell=value=>{status.textContent=value;};
  const reset=()=>{
    form.reset();hidden.value="";fields.sort.value="100";save.textContent="Добавить позицию";
  };
  clear.addEventListener("click",()=>{reset();tell("Можно добавить новую позицию.");});
  const valid=r=>r&&typeof r.name==="string"&&typeof r.category==="string"&&
    typeof r.volume1==="string"&&typeof r.volume2==="string"&&
    Number.isFinite(r.price1)&&Number.isFinite(r.price2);
  function render(){
    itemsHost.replaceChildren();
    const list=[...entries.values()].sort((a,b)=>(a.sort??100)-(b.sort??100)
      ||collator.compare(a.category,b.category)||collator.compare(a.name,b.name));
    if(!list.length){
      itemsHost.append(make("p","hint","В этой карте пока нет позиций. Добавьте первую, указав реальные цены."));
      return;
    }
    const groups=new Map();
    for(const item of list){
      if(!groups.has(item.category))groups.set(item.category,[]);
      groups.get(item.category).push(item);
    }
    for(const [category,groupItems] of groups){
      const group=make("section","bali-admin-bar-group");
      group.append(make("h4","",category+" · "+groupItems.length+" поз."));
      for(const item of groupItems){
        const row=make("div","bali-admin-bar-row");
        const description=make("div","bali-admin-bar-info");
        const parts=item.volume1+" — "+format(item.price1)
          +(item.volume2?" · "+item.volume2+" — "+format(item.price2):"");
        description.append(make("strong","",item.name),make("small","",parts));
        const controls=make("div","bali-admin-bar-row-actions");
        const edit=make("button","","Изменить");edit.type="button";
        edit.addEventListener("click",()=>{
          hidden.value=item.id;
          for(const id of ["name","category","volume1","volume2","sort"])
            fields[id].value=String(item[id]??"");
          fields.price1.value=String(item.price1);
          fields.price2.value=item.volume2?String(item.price2):"";
          save.textContent="Сохранить изменения";
          form.scrollIntoView({behavior:"smooth",block:"start"});
          tell("Редактирование: "+item.name);
        });
        const remove=make("button","","Удалить");remove.type="button";
        remove.addEventListener("click",async()=>{
          if(!editable){tell("Нет прав на удаление.");return;}
          if(!confirm("Удалить «"+item.name+"» из раздела «"+config.title+"»?"))return;
          remove.disabled=true;
          try{
            await deleteDoc(doc(db,config.collection,item.id));
            if(hidden.value===item.id)reset();
            tell("Позиция удалена.");
          }catch(error){tell("Ошибка удаления: "+(error?.code||"неизвестная ошибка"));}
          finally{remove.disabled=false;}
        });
        controls.append(edit,remove);row.append(description,controls);group.append(row);
      }
      itemsHost.append(group);
    }
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!editable){tell("Нужны подтверждённые права администратора.");return;}
    const val=id=>fields[id].value.trim();
    const name=val("name"),category=val("category"),volume1=val("volume1"),volume2=val("volume2");
    const price1=Number(val("price1")),second=val("price2");
    const price2=second?Number(second):0,sort=Number(val("sort"));
    if(name.length<2||name.length>120||category.length<2||category.length>60||
       volume1.length<1||volume1.length>30||volume2.length>30||
       (Boolean(volume2)!==Boolean(second))||
       !Number.isFinite(price1)||price1<0||price1>20000||
       !Number.isFinite(price2)||price2<0||price2>20000||
       !Number.isInteger(sort)||sort<0||sort>100000){
      tell("Проверьте поля. Второй объём заполняется только вместе со второй ценой.");
      return;
    }
    const id=hidden.value;
    const ref=id?doc(db,config.collection,id):doc(collection(db,config.collection));
    save.disabled=true;tell("Сохраняем...");
    try{
      await setDoc(ref,{name,category,volume1,price1,volume2,price2,sort,updatedAt:serverTimestamp()});
      reset();tell("Сохранено: «"+name+"». Данные обновлены в отдельной коллекции.");
    }catch(error){
      tell(error?.code==="permission-denied"
        ?"Нет прав Firestore. Опубликуйте актуальные firestore.rules для "+config.collection+"."
        :"Не удалось сохранить: "+(error?.code||"неизвестная ошибка"));
    }finally{save.disabled=false;}
  });
  return{
    resetAuth(){
      if(unsubscribe){unsubscribe();unsubscribe=null;}
      entries.clear();render();
    },
    start(){
      unsubscribe=onSnapshot(collection(db,config.collection),snapshot=>{
        entries.clear();
        for(const d of snapshot.docs){
          const item={id:d.id,...d.data()};
          if(valid(item))entries.set(d.id,item);
        }
        render();tell(config.title+": "+entries.size+" позиций.");
      },error=>tell(error?.code==="permission-denied"
        ?"Нет доступа к "+config.collection+". Опубликуйте новые Firestore Rules."
        :"Не удалось загрузить данные: "+(error?.code||"ошибка")));
    },
    tell
  };
}
const editors=cards.map(buildEditor).filter(Boolean);
onAuthStateChanged(auth,async user=>{
  const id=++session;
  editable=false;
  for(const editor of editors){editor.resetAuth();editor.tell("Проверяем доступ администратора...");}
  if(!user?.emailVerified){
    for(const editor of editors)editor.tell("Войдите в подтверждённый аккаунт администратора.");
    return;
  }
  try{
    const role=await getDoc(doc(db,"admins",user.uid));
    if(id!==session||auth.currentUser?.uid!==user.uid)return;
    if(role.data()?.active!==true){
      for(const editor of editors)editor.tell("Для этой операции нужна активная роль администратора.");
      return;
    }
    editable=true;
    editors.forEach(editor=>editor.start());
  }catch(error){
    if(id===session)for(const editor of editors)
      editor.tell("Не удалось проверить доступ: "+(error?.code||"ошибка"));
  }
});
