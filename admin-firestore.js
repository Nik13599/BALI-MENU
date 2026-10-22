// BALI MENU: администратор через Google Auth + вручную назначенный admins/{uid}.
import { BALI_MENU_SEED } from "./menu-seed.js?v=20261017-9";
import { prepareImage as compressImage } from "./image-compressor.js?v=20261021-square1";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, onSnapshot, runTransaction, serverTimestamp, Timestamp, limit, query
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebase = initializeApp(window.BALI_FIREBASE_CONFIG);
const auth = getAuth(firebase);
const db = getFirestore(firebase);
const $ = (id) => document.getElementById(id);
const menu = new Map(), events = new Map(), categories = new Map();
const renderStatus = (id, text) => { $(id).textContent = text; };
let unsubMenu = null, unsubEvents = null, unsubCategories = null, authorized = false;
let pendingProductImage = "", pendingEventPoster = "", pendingDetailImage = "", processingDetailImage = false, detailImageCleared = false;
function imagePreview(id,src){
  const img=$(id);
  if(!img)return;
  img.hidden=!src;
  if(src)img.src=src;
  else img.removeAttribute("src");
}
function isImageDataUri(str){
  return /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(String(str||""));
}
$("menuImageFile").addEventListener("change",async event=>{
  const file=event.target.files?.[0];
  if(!file)return;
  renderStatus("menuStatus","Подготавливаем квадратное фото...");
  try{
    pendingProductImage=await compressImage(file,"product");
    imagePreview("menuImagePreview",pendingProductImage);
    renderStatus("menuStatus","Фото обработано: 1:1, WebP. Нажмите «Сохранить товар».");
  }catch(error){pendingProductImage="";imagePreview("menuImagePreview","");renderStatus("menuStatus",error.message);}
});
// A non-empty detailed description makes the guest details button visible.
function updateDetailsFields() {
  const hasText=Boolean($("menuDetailsText").value.trim());
  $("menuDetailsEnabled").checked=hasText;
  $("menuDetailsFields").hidden=false;
  $("menuDetailsText").required=false;
  const hint=$("menuDetailsAvailability");
  if(hint)hint.textContent=hasText
    ?"Кнопка «Подробнее о блюде» появится после сохранения товара."
    :"Кнопка «Подробнее о блюде» скрыта: подробное описание не заполнено.";
}
$("menuDetailsText").addEventListener("input",updateDetailsFields);
$("menuDetailsImageFile").addEventListener("change",async event=>{
  const file=event.target.files?.[0];
  if(!file)return;
  processingDetailImage=true;
  renderStatus("menuStatus","Подготавливаем дополнительное фото (4:3)...");
  try{
    const result=await compressImage(file,"menu-detail");
    pendingDetailImage=result;
    detailImageCleared=false;
    $("menuDetailsImage").value="";
    imagePreview("menuDetailsImagePreview",result);
    renderStatus("menuStatus","Дополнительное фото подготовлено. Нажмите «Сохранить товар».");
  }catch(error){
    pendingDetailImage="";
    renderStatus("menuStatus",error.message||"Не удалось загрузить фотографию.");
  }finally{processingDetailImage=false;}
});
$("menuDetailsImage").addEventListener("input",()=>{
  pendingDetailImage="";
  detailImageCleared=!$("menuDetailsImage").value.trim();
  imagePreview("menuDetailsImagePreview",$("menuDetailsImage").value.trim());
});
$("menuDetailsClearImage").addEventListener("click",()=>{
  pendingDetailImage="";
  detailImageCleared=true;
  $("menuDetailsImage").value="";
  $("menuDetailsImageFile").value="";
  imagePreview("menuDetailsImagePreview","");
});

$("eventPosterFile").addEventListener("change",async event=>{
  const file=event.target.files?.[0];
  if(!file)return;
  renderStatus("eventStatus","Подготавливаем афишу...");
  try{
    pendingEventPoster=await compressImage(file,"poster");
    imagePreview("eventPosterPreview",pendingEventPoster);
    renderStatus("eventStatus","Афиша готова. Нажмите «Сохранить мероприятие».");
  }catch(error){pendingEventPoster="";imagePreview("eventPosterPreview","");renderStatus("eventStatus",error.message);}
});


function showSeedPreview() {
  const preview = $("seedPreview");
  if (!preview) return;
  preview.replaceChildren();
  for (const group of [...new Set(BALI_MENU_SEED.map(item => item.category))]) {
    const heading = document.createElement("h3");
    heading.textContent = group;
    preview.append(heading);
    for (const item of BALI_MENU_SEED.filter(x => x.category === group)) {
      const row = document.createElement("div");
      row.className = "seed-row";
      const product = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = item.name;
      const description = document.createElement("small");
      description.textContent = item.description + " · ID " + item.id;
      product.append(title, description);
      const price = document.createElement("span");
      price.textContent = item.price.toFixed(2) + " BYN";
      row.append(product, price);
      preview.append(row);
    }
  }
  const caution = document.createElement("p");
  caution.className = "hint";
  caution.textContent = "Проверьте написание состава мясного ассорти и слово «джугасом» в позиции с гренками: они перенесены с фотографии без самостоятельных исправлений.";
  preview.append(caution);
}
showSeedPreview();

$("seedImportBtn").addEventListener("click", async () => {
  if (!authorized || !auth.currentUser) {
    renderStatus("seedImportStatus", "Сначала войдите как администратор.");
    return;
  }
  if (!confirm("Добавить в Firestore отсутствующие позиции меню BALI (" + BALI_MENU_SEED.length + " шт.)? Уже существующие ID будут пропущены.")) return;
  const button = $("seedImportBtn");
  button.disabled = true;
  renderStatus("seedImportStatus", "Проверяем товары и добавляем отсутствующие...");
  try {
    const result = await runTransaction(db, async transaction => {
      const refs = BALI_MENU_SEED.map(item => doc(db, "menu", String(item.id)));
      // Firestore требует сначала все чтения, затем все записи.
      const current = await Promise.all(refs.map(ref => transaction.get(ref)));
      let added = 0;
      for (let i = 0; i < refs.length; i++) {
        if (current[i].exists()) continue;
        transaction.set(refs[i], { ...BALI_MENU_SEED[i], updatedAt: serverTimestamp() });
        added++;
      }
      return { added, skipped: refs.length - added };
    });
    renderStatus("seedImportStatus", "Импорт завершён. Добавлено: " + result.added + "; уже существовали: " + result.skipped + ". Посмотрите каталог справа и откройте гостевое меню.");
  } catch (error) {
    const code = error?.code || "unknown";
    renderStatus("seedImportStatus", code === "permission-denied"
      ? "Недостаточно прав для импорта. Проверьте опубликованные правила Firestore и поле admins/{UID}.active=true. [permission-denied]"
      : "Импорт не выполнен. Ошибка Firestore: " + code);
  } finally {
    button.disabled = false;
  }
});


/* Категории хранятся в categories/{детерминированный ID}.
   Для старого меню названия категорий также выводятся из товаров. */
const categoryCollator = new Intl.Collator("ru");
const canonicalCategory = name => String(name||"").normalize("NFKC").trim().replace(/\s+/g," ");
const categoryKey = name => canonicalCategory(name).toLocaleLowerCase("ru");
const categoryDocId = name => "c-"+Array.from(categoryKey(name),c=>c.codePointAt(0).toString(16)).join("-");
let activeMenuEdit = null;
function allCategories() {
  const byName = new Map();
  for(const cat of categories.values()){
    if(typeof cat.name!=="string")continue;
    const name=canonicalCategory(cat.name);
    if(name)byName.set(categoryKey(name),{name,sort:Number(cat.sort)||100,id:cat.id||""});
  }
  for(const item of menu.values()){
    const name=canonicalCategory(item.category);
    const key=categoryKey(name);
    if(name && !byName.has(key))byName.set(key,{name,sort:100,id:""});
  }
  return [...byName.values()].sort((a,b)=>a.sort-b.sort||categoryCollator.compare(a.name,b.name));
}
function selectedCategory() { return $("menuCategory").value; }
function renderCategorySelector(preferred=selectedCategory()) {
  const select=$("menuCategory");
  select.replaceChildren(new Option("Выберите категорию",""));
  for(const category of allCategories())select.add(new Option(category.name,category.name));
  if(preferred && ![...select.options].some(o=>o.value===preferred))select.add(new Option(preferred,preferred));
  select.value=preferred || "";
}
function renderCategoryManager() {
  const parent=$("categoryList");
  parent.replaceChildren();
  const names=allCategories();
  $("categoryCount").textContent=String(names.length);
  for(const cat of names){
    const count=[...menu.values()].filter(item=>categoryKey(item.category)===categoryKey(cat.name)).length;
    const pill=document.createElement("div");
    pill.className="category-pill";
    const label=document.createElement("span");
    label.textContent=cat.name;
    const number=document.createElement("span");
    number.className="category-pill-count";
    number.textContent=count+" поз.";
    pill.append(label,number);
    // Категорию можно удалить только если нет товаров, использующих её.
    if(cat.id && count===0) {
      const remove=document.createElement("button");
      remove.type="button";
      remove.className="category-delete-btn";
      remove.textContent="Удалить";
      remove.addEventListener("click",async()=>{
        if(!authorized||!confirm("Удалить пустую категорию «"+cat.name+"»?"))return;
        try {
          await deleteDoc(doc(db,"categories",cat.id));
          renderStatus("categoryStatus","Категория удалена.");
        }catch(e){renderStatus("categoryStatus","Не удалось удалить категорию: "+(e.code||"unknown"));}
      });
      pill.append(remove);
    }
    parent.append(pill);
  }
  if(!names.length)parent.textContent="Категорий пока нет. Создайте первую категорию.";
  renderCategorySelector();
}
function openProductDialog(item=null){
  if(!authorized)return;
  $("menuForm").reset();
  renderStatus("menuStatus","");
  activeMenuEdit=item ? Number(item.id) : null;
  $("menuDialogHeading").textContent=item?"Изменить блюдо":"Добавить блюдо";
  $("menuId").value=item?item.id:Math.max(100,...[...menu.values()].map(x=>Number(x.id)||0))+1;
  $("menuName").value=item?.name||"";
  $("menuPrice").value=item?.price??"";
  $("menuDescription").value=item?.description||"";
  $("menuWeight").value=item?.weight||"";
  $("menuDetailsEnabled").checked=item?.detailEnabled===true;
  $("menuDetailsText").value=item?.detailText||"";
  pendingDetailImage="";
  detailImageCleared=false;
  processingDetailImage=false;
  $("menuDetailsImageFile").value="";
  const oldDetailImage=item?.detailImageUrl||"";
  $("menuDetailsImage").value=isImageDataUri(oldDetailImage)?"":oldDetailImage;
  imagePreview("menuDetailsImagePreview",oldDetailImage);
  updateDetailsFields();
  $("menuSort").value=item?.sort??100;
  pendingProductImage="";
  $("menuImageFile").value="";
  const existingImage=item?.image_url||"";
  $("menuImage").value=isImageDataUri(existingImage)?"":existingImage;
  imagePreview("menuImagePreview",existingImage);
  $("menuAvailable").checked=item?.available??true;
  renderCategorySelector(item?.category||"");
  $("menuDialog").showModal();
  $("menuName").focus();
}
function closeProductDialog(){
  if($("categoryDialog").open)$("categoryDialog").close();
  if($("menuDialog").open)$("menuDialog").close();
}
function openCategoryDialog(){
  if(!authorized)return;
  $("categoryForm").reset();
  $("categorySort").value=100;
  renderStatus("categoryDialogStatus","");
  $("categoryDialog").showModal();
  $("categoryName").focus();
}
$("addMenuBtn").addEventListener("click",()=>openProductDialog());
$("addCategoryBtn").addEventListener("click",openCategoryDialog);
$("newCategoryFromProduct").addEventListener("click",openCategoryDialog);
$("closeMenuDialog").addEventListener("click",closeProductDialog);
$("closeCategoryDialog").addEventListener("click",()=> $("categoryDialog").close());
$("cancelCategoryDialog").addEventListener("click",()=> $("categoryDialog").close());
$("clearMenu").addEventListener("click",closeProductDialog);
for (const id of ["menuDialog","categoryDialog"]) {
  const dialog=$(id);
  dialog.addEventListener("click",event=>{
    if(event.target===dialog)dialog.close();
  });
}
$("categoryForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!authorized)return;
  const name=canonicalCategory($("categoryName").value);
  const sort=Number($("categorySort").value);
  if(name.length<2||name.length>60||!Number.isInteger(sort)||sort<0||sort>100000) {
    renderStatus("categoryDialogStatus","Проверьте название и порядок категории.");return;
  }
  const existing=allCategories().find(x=>categoryKey(x.name)===categoryKey(name));
  if(existing){
    renderStatus("categoryDialogStatus","Такая категория уже существует: "+existing.name);
    return;
  }
  const btn=event.currentTarget.querySelector('[type="submit"]');
  btn.disabled=true;
  renderStatus("categoryDialogStatus","Сохраняем категорию...");
  try{
    const ref=doc(db,"categories",categoryDocId(name));
    await runTransaction(db,async tx=>{
      const current=await tx.get(ref);
      if(current.exists())throw new Error("Категория уже создана другим администратором.");
      tx.set(ref,{name,sort,updatedAt:serverTimestamp()});
    });
    categories.set(ref.id,{id:ref.id,name,sort});
    renderCategoryManager();
    menuRender();
    $("menuCategory").value=name;
    $("categoryDialog").close();
    renderStatus("categoryStatus","Категория «"+name+"» добавлена.");
  }catch(e){
    renderStatus("categoryDialogStatus",e.code==="permission-denied"
      ?"Firestore не разрешает создавать категории. Опубликуйте новые firestore.rules из GitHub в Firebase."
      :"Ошибка: "+(e.message||e.code||"unknown"));
  }finally{btn.disabled=false;}
});

function createEntry(title, subtitle, onEdit, onDelete, imageUrl="") {
  const row = document.createElement("div");
  row.className = "entry";
  const info = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = title;
  const caption = document.createElement("small");
  caption.textContent = subtitle;
  info.append(name, caption);
  if(imageUrl && (/^https:\/\//.test(imageUrl)||isImageDataUri(imageUrl))) {
    const preview=document.createElement("img");
    preview.className="admin-list-thumbnail";
    preview.src=imageUrl;
    preview.alt="";
    row.append(preview);
  }
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
  const list=$("menuList");
  const wasOpen=new Map([...list.querySelectorAll(".menu-category-group")]
    .map(node=>[node.dataset.category,node.open]));
  list.replaceChildren();
  const products=[...menu.values()].sort((a,b)=>a.sort-b.sort||categoryCollator.compare(a.name,b.name));
  const buckets=new Map();
  for(const c of allCategories())buckets.set(categoryKey(c.name),{category:c.name,items:[]});
  for(const item of products){
    const key=categoryKey(item.category);
    if(!buckets.has(key))buckets.set(key,{category:item.category,items:[]});
    buckets.get(key).items.push(item);
  }
  for(const [key,bucket] of buckets){
    if(!bucket.items.length)continue;
    const group=document.createElement("details");
    group.className="menu-category-group";
    group.dataset.category=key;
    group.open=wasOpen.has(key)?wasOpen.get(key):true;
    const summary=document.createElement("summary");
    summary.className="menu-category-title";
    const name=document.createElement("strong");name.textContent=bucket.category;
    const count=document.createElement("span");count.className="category-group-count";
    count.textContent=bucket.items.length+" поз.";
    summary.append(name,count);
    const rows=document.createElement("div");
    rows.className="menu-category-rows";
    for(const item of bucket.items){
      rows.append(createEntry(
        item.name+" — "+Number(item.price).toFixed(2)+" BYN",
        "ID "+item.id+" · "+(item.available?"В наличии":"Недоступно")
          +" · ⓘ "+(String(item.detailText||"").trim()?"Информация заполнена":"Без подробного описания"),
        ()=>openProductDialog(item),
        async()=>{
          if(!confirm("Удалить «"+item.name+"»? Это действие нельзя отменить."))return;
          try{await deleteDoc(doc(db,"menu",String(item.id)));window.BaliPublicPublish?.queue("menu");renderStatus("categoryStatus","Товар удалён.");}
          catch(e){renderStatus("categoryStatus","Не удалось удалить товар: "+(e.code||"unknown"));}
        },
        item.image_url
      ));
    }
    group.append(summary,rows);
    list.append(group);
  }
  if(!products.length)list.textContent="Каталог пока пуст. Нажмите «Добавить блюдо».";
  $("menuResultCount").textContent=String(products.length);
  renderCategoryManager();
  window.dispatchEvent(new CustomEvent("bali:admin:catalog-rendered"));
}

function eventRender() {
  const list = $("eventList");list.replaceChildren();
  for (const event of [...events.entries()].map(([id,data])=>({...data,id})).sort((a,b)=>a.date.localeCompare(b.date)||(a.id.localeCompare(b.id)))) {
    const slot=event.id===event.date?1:Number(event.id.slice(event.date.length+2));
    list.append(createEntry(
      event.date + " · №"+slot+" — " + event.title,
      (event.preorderEnabled ? "Приём включён" : "Приём выключен") +
        (event.startTime && event.endTime ? " · "+event.startTime+"–"+event.endTime : "") +
        (event.cutoff ? " · Предзаказ до " + event.cutoff +
          (event.cutoffNextDay ? " следующего дня" : " в день мероприятия") + " по Минску" : "") +
        " · Хочет пойти: " + (Number.isSafeInteger(event.interestCount)?event.interestCount:0),
      () => {
        $("eventDateAdmin").value=event.date;
        $("eventDateAdmin").readOnly=true;
        $("eventSlotAdmin").value=String(slot);
        $("eventSlotAdmin").disabled=true;
        updateEventPreorderControl();
        $("eventTitle").value=event.title;
        $("eventDescription").value=event.description||"";
        $("eventDotColor").value=/^#[0-9a-fA-F]{6}$/.test(event.dotColor||"")?event.dotColor:"#b9ff51";
        $("eventStartTime").value=event.startTime||"";
        $("eventEndTime").value=event.endTime||"";
        $("eventCutoff").value=event.cutoff||"23:59";
        $("eventCutoffNextDay").checked=event.cutoffNextDay===true;
        $("eventOpen").checked=event.preorderEnabled;
        pendingEventPoster="";
        $("eventPosterFile").value="";
        imagePreview("eventPosterPreview",event.poster_url||"");
        window.dispatchEvent(new CustomEvent("bali:admin:edit-event"));
        $("eventForm").scrollIntoView({behavior:"smooth",block:"center"});
      },
      async () => {
        if(!confirm("Удалить мероприятие "+event.title+" ("+event.date+", №"+slot+")?"))return;
        try { await deleteDoc(doc(db,"events",event.id));window.BaliPublicPublish?.queue("events");renderStatus("eventStatus","Мероприятие удалено."); }
        catch(e){renderStatus("eventStatus","Ошибка: "+(e.code || "unknown"));}
      },
      event.poster_url||""
    ));
  }
  if (!events.size) list.textContent="Мероприятия пока не добавлены.";
}

function clearMenu() {
  pendingProductImage="";
  pendingDetailImage="";
  detailImageCleared=false;
  processingDetailImage=false;
  imagePreview("menuImagePreview","");
  imagePreview("menuDetailsImagePreview","");
  $("menuDetailsImageFile").value="";
  $("menuForm").reset();
  updateDetailsFields();
  $("menuId").readOnly=false;
  $("menuSort").value=100;
  $("menuAvailable").checked=true;
}
function clearEvent() {
  pendingEventPoster="";
  imagePreview("eventPosterPreview","");
  $("eventForm").reset();
  $("eventDotColor").value="#b9ff51";
  $("eventSlotAdmin").value="1";
  $("eventSlotAdmin").disabled=false;
  $("eventDateAdmin").readOnly=false;
  $("eventOpen").checked=true;
  $("eventCutoff").value="23:59";
  $("eventCutoffNextDay").checked=false;
  updateEventPreorderControl();
}

// Preorders are currently tied to a DATE (not a unique evening slot). Until
// order schema migration, expose them only on legacy slot №1 rather than
// promising unavailable orders for slots №2/№3.
function updateEventPreorderControl(){
  // All three event slots may accept their OWN orders, chosen explicitly
  // by eventId in the guest form and validated by Firestore Rules.
  $("eventOpen").disabled=false;
  const help=$("eventSlotPreorderHint");
  if(help)help.hidden=true;
}
$("eventSlotAdmin").addEventListener("change",updateEventPreorderControl);
$("clearEvent").addEventListener("click", clearEvent);

$("menuForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!authorized)return;
  const id=Number($("menuId").value),price=Number($("menuPrice").value),sort=Number($("menuSort").value);
  const category=canonicalCategory($("menuCategory").value);
  if(!Number.isSafeInteger(id)||id<1||!Number.isFinite(price)||price<0||
     !Number.isInteger(sort)||sort<0||sort>100000||!allCategories().some(c=>c.name===category)){
    renderStatus("menuStatus","Проверьте цену, сортировку и выберите существующую категорию.");return;
  }
  updateDetailsFields();
  const detailsEnabled=$("menuDetailsEnabled").checked;
  const detailsText=$("menuDetailsText").value.trim();
  if(detailsEnabled&&!detailsText){
    renderStatus("menuStatus","Чтобы включить кнопку «Подробнее», обязательно заполните дополнительное описание.");
    $("menuDetailsText").focus();
    return;
  }
  if(processingDetailImage){
    renderStatus("menuStatus","Дождитесь обработки дополнительной фотографии.");
    return;
  }
  const detailImage=detailsEnabled?(pendingDetailImage ||
    $("menuDetailsImage").value.trim() ||
    (activeMenuEdit!==null && !detailImageCleared && isImageDataUri(menu.get(String(activeMenuEdit))?.detailImageUrl)
      ? menu.get(String(activeMenuEdit)).detailImageUrl : "")):"";
  if(detailImage&&!/^https:\/\/[^ ]+$/.test(detailImage)&&!isImageDataUri(detailImage)){
    renderStatus("menuStatus","Дополнительная фотография должна иметь HTTPS-ссылку.");
    return;
  }
  const url=pendingProductImage ||
    $("menuImage").value.trim() ||
    (activeMenuEdit!==null && isImageDataUri(menu.get(String(activeMenuEdit))?.image_url)
      ? menu.get(String(activeMenuEdit)).image_url : "");
  if(url&&!/^https:\/\/[^ ]+$/.test(url)&&!isImageDataUri(url)){
    renderStatus("menuStatus","Фотография должна иметь HTTPS-ссылку.");return;
  }
  const data={
    id,name:$("menuName").value.trim(),category,
    description:$("menuDescription").value.trim(),
    weight:$("menuWeight").value.trim(),
    detailEnabled:detailsEnabled,detailText:detailsEnabled?detailsText:"",
    detailImageUrl:detailImage,
    price,image_url:url,
    available:$("menuAvailable").checked,sort,updatedAt:serverTimestamp()
  };
  const button=event.currentTarget.querySelector('[type="submit"]');
  button.disabled=true;
  renderStatus("menuStatus","Сохраняем товар...");
  try{
    const ref=doc(db,"menu",String(id));
    if(activeMenuEdit===null){
      // Не перезаписываем другой товар при одновременной работе администраторов.
      await runTransaction(db,async tx=>{
        const old=await tx.get(ref);
        if(old.exists())throw new Error("ID уже занят. Закройте карточку и добавьте товар заново.");
        tx.set(ref,data);
      });
    }else{
      if(activeMenuEdit!==id)throw new Error("ID товара не должен изменяться.");
      await setDoc(ref,data);
    }
    window.BaliPublicPublish?.queue("menu");
    const savedName=data.name;
    closeProductDialog();
    clearMenu();
    renderStatus("categoryStatus","Товар «"+savedName+"» сохранён.");
  }catch(e){
    renderStatus("menuStatus",e.code==="permission-denied"
      ?"Firestore запретил сохранение. Проверьте правила доступа и права администратора."
      :"Не удалось сохранить товар: "+(e.message||e.code||"unknown"));
  }finally{button.disabled=false;}
});

$("eventForm").addEventListener("submit",async (event)=>{
  event.preventDefault();
  if(!authorized)return;
  const date=$("eventDateAdmin").value,title=$("eventTitle").value.trim(),
    slot=Number($("eventSlotAdmin").value),
    cutoff=$("eventCutoff").value||"",
    cutoffNextDay=$("eventCutoffNextDay").checked,
    description=$("eventDescription").value.trim(),
    dotColor=$("eventDotColor").value||"#b9ff51",
    startTime=$("eventStartTime").value||"",
    endTime=$("eventEndTime").value||"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || title.length<2 || ![1,2,3].includes(slot)) {
    renderStatus("eventStatus","Укажите дату и название мероприятия.");return;
  }
  // Start/end describe the party itself. Cutoff controls preorders separately.
  // Overnight events (e.g. 22:00–03:00) are valid.
  const validTime=/^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  if(!/^#[0-9a-fA-F]{6}$/.test(dotColor)){
    renderStatus("eventStatus","Выберите цвет точки в формате #RRGGBB.");return;
  }
  if(description.length>600 || (!!startTime!==!!endTime) ||
     (startTime && (!validTime.test(startTime)||!validTime.test(endTime)))) {
    renderStatus("eventStatus","Заполните оба времени в формате ЧЧ:ММ или оставьте оба пустыми. Описание — до 600 символов.");
    return;
  }
  if(!validTime.test(cutoff)){
    renderStatus("eventStatus","Укажите время закрытия предзаказов вручную.");return;
  }
  const closesAt = new Date(date+"T"+cutoff+":00+03:00");
  if(cutoffNextDay)closesAt.setUTCDate(closesAt.getUTCDate()+1);
  if (!Number.isFinite(closesAt.getTime())) {
    renderStatus("eventStatus","Недопустимая дата или время закрытия предзаказов.");return;
  }
  const eventId=slot===1?date:date+"__"+slot;
  const isEditing=$("eventDateAdmin").readOnly;
  if(!isEditing && events.has(eventId)){
    renderStatus("eventStatus","Мероприятие №"+slot+" на эту дату уже создано. Выберите свободный номер или откройте существующее для редактирования.");
    return;
  }
  if(!isEditing && [...events.values()].filter(item=>item.date===date).length>=3){
    renderStatus("eventStatus","На эту дату уже создано три мероприятия — максимальное количество.");
    return;
  }
  const poster = pendingEventPoster || events.get(eventId)?.poster_url || "";
  if (poster && (poster.length > 150000 ||
      (!/^https:\/\/[^ ]+$/.test(poster) && !isImageDataUri(poster)))) {
    renderStatus("eventStatus","Афиша не прошла проверку формата или размера. Выберите другое изображение.");
    return;
  }
  const btn=event.currentTarget.querySelector('[type="submit"]');
  const help=$("eventRulesHelp");
  if(help)help.hidden=true;
  btn.disabled=true;
  renderStatus("eventStatus","Сохраняем мероприятие...");
  try{
    const payload={
      date, title, cutoff, cutoffNextDay, dotColor, preorderEnabled:$("eventOpen").checked,
      closesAt: Timestamp.fromDate(closesAt),
      updatedAt:serverTimestamp()
    };
    // Leave absent metadata absent on older events to preserve edits under
    // previously deployed Firestore Rules. New metadata requires v46 Rules.
    const saved=events.get(eventId)||{};
    if(description || Object.hasOwn(saved,"description"))payload.description=description;
    if((startTime&&endTime) || Object.hasOwn(saved,"startTime") || Object.hasOwn(saved,"endTime")){
      payload.startTime=startTime;
      payload.endTime=endTime;
    }
    // Старые документы без афиши не должны записывать лишнее пустое поле.
    // Для настоящих афиш необходимы опубликованные Firebase Rules с poster_url.
    if(poster)payload.poster_url=poster;
    // merge сохраняет interestCount при изменении афиши/названия администратором.
    await setDoc(doc(db,"events",eventId),payload,{merge:true});
    window.BaliPublicPublish?.queue("events");
    clearEvent();
    renderStatus("eventStatus","Мероприятие сохранено.");
  }catch(e){
    if(e.code==="permission-denied"){
      renderStatus("eventStatus",poster
        ?"Firebase отклонил сохранение мероприятия (permission-denied). Опубликуйте последние Firestore Rules с полями афиши, описания и времени. Затем повторите."
        :"Firebase отклонил сохранение мероприятия (permission-denied). Проверьте права администратора и опубликуйте актуальные Firestore Rules для полей времени и описания.");
      if(help)help.hidden=false;
    }else{
      renderStatus("eventStatus","Не удалось сохранить мероприятие: "+(e.message||e.code||"unknown"));
    }
  }finally{btn.disabled=false;}
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
  if(unsubCategories){unsubCategories();unsubCategories=null;}
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
    unsubCategories=onSnapshot(collection(db,"categories"),snap=>{
      categories.clear();
      for(const d of snap.docs)categories.set(d.id,{...d.data(),id:d.id});
      renderCategoryManager();
      menuRender();
    },error=>{
      renderStatus("categoryStatus",
        error.code==="permission-denied"
          ?"Чтобы создавать отдельные категории, опубликуйте обновлённые правила Firestore."
          :"Категории не загружены: "+(error.code||"unknown"));
      renderCategoryManager();
    });
    unsubMenu=onSnapshot(collection(db,"menu"),snap=>{
      menu.clear();
      for(const d of snap.docs){const x=d.data();if(typeof x.name==="string"&&Number.isFinite(x.price))menu.set(d.id,x);}
      menuRender();
      window.dispatchEvent(new CustomEvent("bali:admin:menu",{detail:{count:menu.size,items:[...menu.values()]}}));
    },error=>renderStatus("menuStatus","Не удалось прочитать каталог: "+(error.code||"unknown")));
    unsubEvents=onSnapshot(collection(db,"events"),snap=>{
      events.clear();
      for(const d of snap.docs)events.set(d.id,d.data());
      eventRender();
      window.dispatchEvent(new CustomEvent("bali:admin:events",{detail:{count:events.size,items:[...events.values()]}}));
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
