/* BALI admin — independent editable bar catalog, never part of preorder.
 * Roles checked before subscription; Firestore rules enforce all writes.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,onSnapshot,setDoc,deleteDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id);
const form=$("baliAdminBarForm"),list=$("baliAdminBarItems"),status=$("baliAdminBarStatus");
const records=new Map();
const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
let canEdit=false,unsubscribe=null,authSerial=0;
function tell(message){if(status)status.textContent=message;}
function create(tag,cls,txt){
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(txt!==undefined)e.textContent=txt;
  return e;
}
function validItem(item){
  return item && typeof item.name==="string" && typeof item.category==="string"
    && typeof item.volume1==="string" && typeof item.volume2==="string"
    && typeof item.price1==="number" && Number.isFinite(item.price1)
    && typeof item.price2==="number" && Number.isFinite(item.price2);
}
const detailFields=[["description","baliAdminBarDescription"],["ingredients","baliAdminBarIngredients"]];
function updateDetailsHint(){
  const filled=detailFields.some(([,id])=>$(id).value.trim());
  $("baliAdminBarDetailsHint").textContent=filled
    ?"После сохранения появится кнопка «Подробнее о напитке»."
    :"Без описания и состава кнопка «Подробнее о напитке» не показывается.";
}
for(const [,id]of detailFields)$(id)?.addEventListener("input",updateDetailsHint);
function resetEditor(){
  form.reset();
  updateDetailsHint();
  $("baliAdminBarId").value="";
  $("baliAdminBarSort").value="100";
  $("baliAdminBarSave").textContent="Сохранить позицию";
}
function edit(item){
  $("baliAdminBarId").value=item.id;
  $("baliAdminBarName").value=item.name;
  for(const [key,id]of detailFields)$(id).value=typeof item[key]==="string"?item[key]:"";
  updateDetailsHint();
  $("baliAdminBarCategory").value=item.category;
  $("baliAdminBarVolume1").value=item.volume1;
  $("baliAdminBarPrice1").value=String(item.price1);
  $("baliAdminBarVolume2").value=item.volume2;
  $("baliAdminBarPrice2").value=item.volume2?String(item.price2):"";
  $("baliAdminBarSort").value=String(item.sort??100);
  $("baliAdminBarSave").textContent="Сохранить изменения";
  $("baliAdminBarForm").scrollIntoView({behavior:"smooth",block:"nearest"});
  tell("Редактируется «"+item.name+"». Измените данные и сохраните.");
}
function draw(){
  if(!list)return;
  list.replaceChildren();
  const items=[...records.values()].sort((a,b)=>(a.sort??100)-(b.sort??100)
    ||collator.compare(a.category,b.category)||collator.compare(a.name,b.name));
  const datalist=$("baliAdminBarCategories");
  if(datalist){
    datalist.replaceChildren();
    for(const cat of [...new Set(items.map(x=>x.category))]){
      const option=create("option");option.value=cat;
      datalist.append(option);
    }
  }
  if(!items.length){
    list.append(create("p","hint","Барная карта пока пуста. Добавьте первую позицию с реальной ценой."));
    return;
  }
  const groups=new Map();
  for(const item of items){
    if(!groups.has(item.category))groups.set(item.category,[]);
    groups.get(item.category).push(item);
  }
  for(const [category,values] of groups){
    const group=create("section","bali-admin-bar-group");
    group.append(create("h4","",category+" · "+values.length+" поз."));
    for(const item of values){
      const row=create("div","bali-admin-bar-row");
      const info=create("div","bali-admin-bar-info");
      const portions=item.volume1+" — "+item.price1.toFixed(2)+" BYN"
        +(item.volume2?" · "+item.volume2+" — "+item.price2.toFixed(2)+" BYN":"");
      info.append(create("strong","",item.name),create("small","",portions));
      info.append(create("small","",detailFields.some(([key])=>typeof item[key]==="string"&&item[key].trim())?"Подробности заполнены":"Без подробного описания"));
      const actions=create("div","bali-admin-bar-row-actions");
      const editBtn=create("button","","Изменить");
      editBtn.type="button";editBtn.addEventListener("click",()=>edit(item));
      const delBtn=create("button","","Удалить");
      delBtn.type="button";
      delBtn.addEventListener("click",async()=>{
        if(!canEdit||!confirm("Удалить из барной карты «"+item.name+"»?"))return;
        delBtn.disabled=true;
        try{
          await deleteDoc(doc(db,"bar_menu",item.id));
          window.BaliPublicPublish?.queue("bar_menu");
          tell("Позиция удалена.");
          if($("baliAdminBarId").value===item.id)resetEditor();
        }catch(e){
          tell(e.code==="permission-denied"
            ?"Нет прав на удаление. Опубликуйте актуальные Firestore Rules."
            :"Не удалось удалить: "+(e.code||e.message||"ошибка"));
        }finally{delBtn.disabled=false;}
      });
      actions.append(editBtn,delBtn);
      row.append(info,actions);
      group.append(row);
    }
    list.append(group);
  }
}
$("baliAdminBarClear")?.addEventListener("click",()=>{
  resetEditor();
  tell("Форма очищена. Для новой позиции укажите название, категорию и объём.");
});
form?.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!canEdit){tell("Войдите в подтверждённый аккаунт администратора.");return;}
  const name=$("baliAdminBarName").value.trim();
  const category=$("baliAdminBarCategory").value.trim();
  const volume1=$("baliAdminBarVolume1").value.trim();
  const volume2=$("baliAdminBarVolume2").value.trim();
  const price1=Number($("baliAdminBarPrice1").value);
  const secondRaw=$("baliAdminBarPrice2").value.trim();
  const price2=secondRaw?Number(secondRaw):0;
  const sort=Number($("baliAdminBarSort").value);
  if(name.length<2||name.length>120||category.length<2||category.length>60
    ||!volume1||volume1.length>30||volume2.length>30
    ||!Number.isFinite(price1)||price1<0||price1>20000
    ||!Number.isFinite(price2)||price2<0||price2>20000
    ||(Boolean(volume2)!==Boolean(secondRaw))
    ||!Number.isInteger(sort)||sort<0||sort>100000){
    tell("Проверьте название, категорию, цену и объём. Для второй порции нужны и объём, и цена.");
    return;
  }
  const details=Object.fromEntries(detailFields.map(([key,id])=>[key,$(id).value.trim()]).filter(([,value])=>value));
  if(Object.values(details).some(value=>value.length>2400)){tell("Описание и состав — не более 2400 символов каждый.");return;}
  const previousId=$("baliAdminBarId").value;
  const ref=previousId?doc(db,"bar_menu",previousId):doc(collection(db,"bar_menu"));
  const save=$("baliAdminBarSave");
  save.disabled=true;
  tell("Сохраняем позицию барной карты...");
  try{
    await setDoc(ref,{
      name,category,volume1,price1,volume2,price2,sort,...details,updatedAt:serverTimestamp()
    });
    window.BaliPublicPublish?.queue("bar_menu");
    resetEditor();
    tell("Сохранено: «"+name+"». Цены обновятся у гостей автоматически.");
  }catch(e){
    tell(e.code==="permission-denied"
      ?"Firestore запретил запись. Опубликуйте новые Firestore Rules для коллекции bar_menu и проверьте роль администратора."
      :"Не удалось сохранить: "+(e.code||e.message||"ошибка"));
  }finally{save.disabled=false;}
});
onAuthStateChanged(auth,async user=>{
  const serial=++authSerial;
  if(unsubscribe){unsubscribe();unsubscribe=null;}
  canEdit=false;
  records.clear();
  if(list)list.replaceChildren();
  if(!user?.emailVerified){
    tell("Войдите в аккаунт администратора для работы с барной картой.");
    return;
  }
  try{
    const role=await getDoc(doc(db,"admins",user.uid));
    if(serial!==authSerial||auth.currentUser?.uid!==user.uid)return;
    if(role.data()?.active!==true){
      tell("Аккаунт не имеет активных прав администратора.");
      return;
    }
    canEdit=true;
    unsubscribe=onSnapshot(collection(db,"bar_menu"),snap=>{
      records.clear();
      for(const d of snap.docs){
        const item={id:d.id,...d.data()};
        if(validItem(item))records.set(d.id,item);
      }
      draw();
      tell("Барная карта: "+records.size+" позиций. Изменения отображаются у гостей автоматически.");
    },e=>{
      tell(e.code==="permission-denied"
        ?"Нет доступа к барной карте. Сначала опубликуйте обновлённые Firestore Rules для bar_menu."
        :"Не удалось загрузить данные: "+(e.code||"ошибка"));
    });
  }catch(e){
    if(serial===authSerial)tell("Ошибка проверки доступа: "+(e.code||"неизвестная ошибка"));
  }
});
