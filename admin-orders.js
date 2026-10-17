/** BALI admin order queue, staff item amendments and soft deletion.
 * All edits use atomic Firestore batches. Security enforced by firestore.rules.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,onSnapshot,updateDoc,writeBatch,
  serverTimestamp,query,limit,orderBy} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let unsubOrders=null,unsubMenu=null,generation=0,authorized=false,orders=[],catalog=[];
let editOrder=null,editLines=[],originalIds=new Set();
const statuses={pending:"Ожидает подтверждения",confirmed:"Подтверждён",completed:"Выполнен",cancelled:"Отменён"};
const fmt=n=>Number(n||0).toFixed(2)+" BYN";
const setStatus=text=>{$("ordersAdminStatus").textContent=text;};
function node(tag,text="",cls=""){
  const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;
}
function button(title,onClick,cls=""){
  const b=node("button",title,cls);b.type="button";b.addEventListener("click",onClick);return b;
}
function ensureAdmin(){if(!authorized||!auth.currentUser)throw new Error("Доступ только для администратора.");}
function total(items){return items.reduce((sum,x)=>sum+Number(x.unitPrice||0)*Number(x.quantity||0),0);}
async function fetchComplete(id) {
  ensureAdmin();
  const ref=doc(db,"orders",id),snapshot=await getDoc(ref);
  if(!snapshot.exists())throw new Error("Заказ не найден.");
  const lines=await getDocs(collection(ref,"items"));
  return {id:snapshot.id,...snapshot.data(),items:lines.docs.map(d=>d.data())};
}
function printOrder(o){
  const area=$("orderPrintSheet");
  area.replaceChildren();
  for(const [tag,line] of [
    ["h1","BALI — ПРЕДЗАКАЗ"],["h2","№ "+o.id],
    ["p","Дата: "+o.eventDate+" · Статус: "+(statuses[o.status]||o.status)],
    ["p","Столик: "+(o.tableNumber||"—")+" · Бронь: "+(o.bookingId||"—")],
    ["p","Гость: "+o.customerName+" · "+o.customerPhone],["p",o.email]
  ])area.append(node(tag,line));
  const table=node("table"),head=node("tr");
  ["Позиция","Кол-во","Цена","Сумма"].forEach(x=>head.append(node("th",x)));
  table.append(head);
  for(const line of o.items){
    const row=node("tr");
    [line.name,String(line.quantity),fmt(line.unitPrice),fmt(line.unitPrice*line.quantity)]
      .forEach(x=>row.append(node("td",x)));
    table.append(row);
  }
  area.append(table,node("h2","Итого: "+fmt(total(o.items))));
  if(o.notes)area.append(node("p","Пожелания: "+o.notes));
  if(o.archived)area.append(node("p","АРХИВ"));
  area.hidden=false;
  window.print();
}
window.addEventListener("afterprint",()=>{$("orderPrintSheet").hidden=true;});
async function setOrderStatus(o,status) {
  ensureAdmin();
  if(!confirm("Изменить статус заказа № "+o.id+" на «"+statuses[status]+"»?"))return;
  setStatus("Сохраняем статус...");
  try {
    await updateDoc(doc(db,"orders",o.id),{status,updatedAt:serverTimestamp()});
    setStatus("Статус изменён.");
  }catch(e){setStatus("Не удалось изменить статус: "+(e.code||e.message));}
}
async function archiveOrder(o,archive=true) {
  ensureAdmin();
  if(!confirm(archive
    ?"Убрать заказ № "+o.id+" в архив? Заказ отменится, но история гостя сохранится."
    :"Вернуть заказ № "+o.id+" из архива? Его статус останется «Отменён»."))return;
  try {
    await updateDoc(doc(db,"orders",o.id),
      archive?{archived:true,status:"cancelled",updatedAt:serverTimestamp()}
        :{archived:false,updatedAt:serverTimestamp()});
    setStatus(archive?"Заказ отправлен в архив.":"Заказ восстановлен из архива.");
  }catch(e){setStatus("Ошибка архива: "+(e.code||e.message));}
}
function renderOrders(){
  const container=$("ordersAdminList"),date=$("ordersDateFilter").value;
  const showArchive=$("showArchivedOrders")?.checked===true;
  container.replaceChildren();
  const shown=orders.filter(o=>(!date||o.eventDate===date)&&(showArchive||!o.archived));
  if(!shown.length){
    container.append(node("p","По этим условиям заказов пока нет."));return;
  }
  for(const o of shown){
    const card=node("article","","admin-order-card");
    card.append(node("h3","№ "+o.id+" · "+statuses[o.status]+(o.archived?" · Архив":"")));
    card.append(node("p",o.eventDate+" · "+(o.tableNumber?"Столик "+o.tableNumber:"Бронь "+o.bookingId)));
    card.append(node("p",o.customerName+" · "+o.customerPhone+" · "+o.email));
    for(const line of o.items)card.append(node("p",line.name+" × "+line.quantity+" — "+fmt(line.unitPrice*line.quantity),"admin-line-item"));
    card.append(node("strong","Итого: "+fmt(o.total)));
    if(o.notes)card.append(node("p","Пожелания: "+o.notes));
    const actions=node("div","","row-actions");
    if(!o.archived) {
      actions.append(button("Редактировать",()=>void openEditor(o.id)));
      if(o.status==="pending"){
        actions.append(button("Подтвердить",()=>void setOrderStatus(o,"confirmed")));
        actions.append(button("Отменить",()=>void setOrderStatus(o,"cancelled")));
      }else if(o.status==="confirmed") {
        actions.append(button("Завершить",()=>void setOrderStatus(o,"completed")));
        actions.append(button("Отменить",()=>void setOrderStatus(o,"cancelled")));
      }
      actions.append(button("Удалить",()=>void archiveOrder(o,true),"danger-action"));
    }else{
      actions.append(button("Восстановить",()=>void archiveOrder(o,false)));
    }
    actions.append(button("Печать",()=>printOrder(o)));
    card.append(actions);
    container.append(card);
  }
}
function renderDates(){
  const el=$("ordersDateFilter"),old=el.value;
  el.replaceChildren(new Option("Все даты",""));
  for(const date of [...new Set(orders.map(x=>x.eventDate))].sort())el.add(new Option(date,date));
  if([...el.options].some(x=>x.value===old))el.value=old;
}
$("ordersDateFilter").addEventListener("change",renderOrders);
$("showArchivedOrders")?.addEventListener("change",renderOrders);
function menuSelect() {
  const select=$("editOrderAddProduct"),value=select.value;
  select.replaceChildren(new Option("Выберите блюдо",""));
  for(const item of catalog.filter(x=>x.available).sort((a,b)=>a.name.localeCompare(b.name,"ru")))
    select.add(new Option(item.name+" · "+fmt(item.price),String(item.id)));
  select.value=value;
}
function editTotal(){ $("editOrderTotal").textContent=fmt(total(editLines)); }
function renderEditLines(){
  const root=$("editOrderLines");root.replaceChildren();
  for(const item of editLines){
    const row=node("div","","order-edit-line");
    const details=node("div","","order-edit-product");
    details.append(node("strong",item.name),node("small",fmt(item.unitPrice)+" / шт."));
    const step=node("input");
    step.type="number";step.min="1";step.max="50";step.step="1";
    step.value=String(item.quantity);step.setAttribute("aria-label","Количество "+item.name);
    step.addEventListener("change",()=>{
      const qty=Number(step.value);
      if(!Number.isInteger(qty)||qty<1||qty>50) {
        step.value=String(item.quantity);return;
      }
      item.quantity=qty;
      editTotal();
    });
    row.append(details,step,button("Убрать",()=>{
      editLines=editLines.filter(x=>x.id!==item.id);
      renderEditLines();
    },"danger-action"));
    root.append(row);
  }
  if(!editLines.length)root.append(node("p","Нет блюд. Добавьте хотя бы одну позицию."));
  editTotal();
}
function addLine(){
  const id=Number($("editOrderAddProduct").value);
  const item=catalog.find(x=>x.id===id&&x.available);
  if(!item)return;
  const existing=editLines.find(x=>x.id===id);
  if(existing) {
    if(existing.quantity>=50)return;
    existing.quantity++;
    existing.name=item.name;existing.unitPrice=item.price;
  }else{
    if(editLines.length>=12){$("orderEditStatus").textContent="Не более 12 разных блюд в заказе.";return;}
    editLines.push({id,name:item.name,unitPrice:item.price,quantity:1});
  }
  renderEditLines();
}
$("editOrderAddBtn").addEventListener("click",addLine);
$("closeOrderEdit").addEventListener("click",()=>$("orderEditDialog").close());
$("cancelOrderEdit").addEventListener("click",()=>$("orderEditDialog").close());
async function openEditor(id){
  ensureAdmin();
  $("orderEditStatus").textContent="Загружаем заказ...";
  try{
    const o=await fetchComplete(id);
    if(o.archived)throw new Error("Сначала восстановите заказ из архива.");
    editOrder=o;
    editLines=o.items.map(x=>({...x}));
    originalIds=new Set(o.items.map(x=>String(x.id)));
    $("orderEditTitle").textContent="Заказ № "+o.id;
    $("editOrderDate").value=o.eventDate;
    $("editOrderStatus").value=o.status;
    $("editOrderTable").value=o.tableNumber;
    $("editOrderBooking").value=o.bookingId;
    $("editOrderNotes").value=o.notes;
    $("orderEditStatus").textContent="";
    menuSelect();renderEditLines();
    $("orderEditDialog").showModal();
  }catch(e){setStatus("Не удалось открыть заказ: "+(e.code||e.message||"unknown"));}
}
window.addEventListener("bali:admin:open-order",({detail})=>{
  window.dispatchEvent(new CustomEvent("bali:admin:navigate",{detail:{section:"orders"}}));
  void openEditor(detail.id);
});
$("orderEditForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!editOrder||!authorized)return;
  const status=$("editOrderStatus").value;
  const eventDate=$("editOrderDate").value;
  const tableNumber=$("editOrderTable").value.trim();
  const bookingId=$("editOrderBooking").value.trim();
  const notes=$("editOrderNotes").value.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
      ||(!tableNumber&&!bookingId)||tableNumber.length>20||bookingId.length>60
      ||notes.length>500||!Object.keys(statuses).includes(status)
      ||!editLines.length||editLines.length>12) {
    $("orderEditStatus").textContent="Заполните дату, столик или бронь, оставьте от 1 до 12 разных блюд.";return;
  }
  const submit=event.currentTarget.querySelector('[type="submit"]');
  submit.disabled=true;
  $("orderEditStatus").textContent="Сохраняем изменения...";
  try{
    // Ensure the order hasn't changed in another admin session.
    const ref=doc(db,"orders",editOrder.id);
    const fresh=await getDoc(ref);
    if(!fresh.exists()||fresh.data().archived)throw new Error("Заказ удалён либо перемещён в архив.");
    const oldTimestamp=editOrder.updatedAt?.toMillis?.();
    if(oldTimestamp&&fresh.data().updatedAt?.toMillis?.()!==oldTimestamp)
      throw new Error("Заказ был изменён в другой вкладке. Закройте окно и откройте его заново.");
    const original=new Map(editOrder.items.map(x=>[String(x.id),x]));
    const touched=editLines.filter(x=>{
      const old=original.get(String(x.id));
      return !old||x.quantity!==old.quantity||x.unitPrice!==old.unitPrice||x.name!==old.name;
    });
    // Revalidate edited and new lines against the current catalog.
    for(const line of touched){
      const record=await getDoc(doc(db,"menu",String(line.id)));
      const data=record.data();
      if(!record.exists()||!data.available)throw new Error("Блюдо больше недоступно: "+line.name);
      line.name=data.name;
      line.unitPrice=data.price;
    }
    const batch=writeBatch(db);
    batch.update(ref,{eventDate,tableNumber,bookingId,notes,status,updatedAt:serverTimestamp()});
    const present=new Set(editLines.map(x=>String(x.id)));
    for(const id of originalIds)if(!present.has(id))batch.delete(doc(ref,"items",id));
    for(const line of touched)batch.set(doc(ref,"items",String(line.id)),{
      id:line.id,name:line.name,unitPrice:line.unitPrice,quantity:line.quantity
    });
    await batch.commit();
    $("orderEditDialog").close();
    setStatus("Изменения заказа № "+editOrder.id+" сохранены. Итого: "+fmt(total(editLines)));
  }catch(e){
    $("orderEditStatus").textContent=e.code==="permission-denied"
      ?"Firebase запретил изменение. Опубликуйте последние правила Firestore."
      :"Не удалось сохранить заказ: "+(e.message||e.code||"unknown");
  }finally{submit.disabled=false;}
});
async function subscribe(user) {
  if(unsubOrders){unsubOrders();unsubOrders=null;}
  if(unsubMenu){unsubMenu();unsubMenu=null;}
  const current=++generation;
  orders=[];catalog=[];authorized=false;
  $("ordersAdminList").textContent="Проверяем права...";
  if(!user||!user.emailVerified)return;
  try{
    const role=await getDoc(doc(db,"admins",user.uid));
    if(current!==generation||!role.exists()||role.data().active!==true) {
      $("ordersAdminList").textContent="Нет прав администратора.";return;
    }
    authorized=true;
    unsubMenu=onSnapshot(collection(db,"menu"),snap=>{
      catalog=snap.docs.map(x=>x.data()).filter(x=>Number.isSafeInteger(x.id)&&Number.isFinite(x.price));
      menuSelect();
    },e=>setStatus("Ошибка каталога для редактирования: "+(e.code||"unknown")));
    unsubOrders=onSnapshot(query(collection(db,"orders"),orderBy("createdAt","desc"),limit(100)),async snap=>{
      try{
        const prepared=await Promise.all(snap.docs.map(async row=>{
          const lines=await getDocs(collection(row.ref,"items"));
          const items=lines.docs.map(x=>x.data());
          return {id:row.id,...row.data(),items,total:total(items)};
        }));
        if(current!==generation)return;
        orders=prepared;
        renderDates();renderOrders();
        window.dispatchEvent(new CustomEvent("bali:admin:orders",{detail:{
          count:orders.length,pending:orders.filter(x=>x.status==="pending"&&!x.archived).length
        }}));
        setStatus("Последние "+orders.length+" заказов. Для полной истории по гостю откройте «Клиенты».");
      }catch(e){if(current===generation)setStatus("Ошибка состава заказов: "+(e.code||e.message));}
    },e=>{if(current===generation)setStatus("Не удалось загрузить заказы: "+(e.code||"unknown"));});
  }catch(e){if(current===generation)setStatus("Ошибка проверки роли: "+(e.code||"unknown"));}
}
onAuthStateChanged(auth,user=>{void subscribe(user);});
