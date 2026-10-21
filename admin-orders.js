/** BALI admin order queue, staff item amendments and soft deletion.
 * All edits use atomic Firestore batches. Security enforced by firestore.rules.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,onSnapshot,updateDoc,writeBatch,
  serverTimestamp,runTransaction,query,limit,orderBy,where} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let unsubOrders=null,unsubMenu=null,unsubEvents=null,generation=0,authorized=false,orders=[],catalog=[];
let events=new Map(),dateOrders=[],loadedDate="",unsubDateOrders=null,dateRevision=0;
let editOrder=null,editLines=[],originalIds=new Set();
const statuses={pending:"Ожидает подтверждения",confirmed:"Подтверждён",completed:"Выполнен",cancelled:"Отменён"};
const fmt=n=>Number(n||0).toFixed(2)+" BYN";
const orderLabel = o => {
  const number = Number.isInteger(o.orderNumber) ? String(o.orderNumber) : o.id;
  const reference=[o.bookingId&&"ID бронирования "+o.bookingId,
    o.tableNumber&&"Столик "+o.tableNumber].filter(Boolean).join(" · ");
  return eventTitle(o)+" №"+number+(reference?" · "+reference:"");
};
const setStatus=text=>{$("ordersAdminStatus").textContent=text;};
const eventTitle=o=>o.eventTitle||events.get(o.eventId||o.eventDate)?.title||"Название мероприятия не сохранено";
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
    ["h1","BALI — ПРЕДЗАКАЗ"],["h2",orderLabel(o)],
    ["p","Дата: "+o.eventDate+" · Мероприятие: "+eventTitle(o)],
    ["p","Статус: "+(statuses[o.status]||o.status)],
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
  if(!confirm("Изменить статус заказа "+orderLabel(o)+" на «"+statuses[status]+"»?"))return;
  setStatus("Сохраняем статус...");
  try {
    await updateDoc(doc(db,"orders",o.id),{status,updatedAt:serverTimestamp()});
    setStatus("Статус изменён.");
  }catch(e){setStatus("Не удалось изменить статус: "+(e.code||e.message));}
}
async function archiveOrder(o,archive=true) {
  ensureAdmin();
  if(!confirm(archive
    ?"Убрать заказ "+orderLabel(o)+" в архив? Заказ отменится, но история гостя сохранится."
    :"Вернуть заказ "+orderLabel(o)+" из архива? Его статус останется «Отменён»."))return;
  try {
    await updateDoc(doc(db,"orders",o.id),
      archive?{archived:true,status:"cancelled",updatedAt:serverTimestamp()}
        :{archived:false,updatedAt:serverTimestamp()});
    setStatus(archive?"Заказ отправлен в архив.":"Заказ восстановлен из архива.");
  }catch(e){setStatus("Ошибка архива: "+(e.code||e.message));}
}
function renderOrders(){
  const container=$("ordersAdminList"),date=$("ordersDateFilter").value;
  const selectedEvent=$("ordersEventFilter").value;
  const showArchive=$("showArchivedOrders")?.checked===true;
  container.replaceChildren();
  const summary=$("ordersDishSummary");
  summary.replaceChildren();
  summary.hidden=!(date&&selectedEvent);
  if(date&&loadedDate!==date){
    container.append(node("p","Загружаем все предзаказы выбранной даты..."));return;
  }
  const source=date?dateOrders:orders;
  const shown=source.filter(o=>(!date||o.eventDate===date)&&
    (!selectedEvent||(o.eventId||o.eventDate)===selectedEvent)&&
    (showArchive||!o.archived)).sort((a,b)=>
      b.eventDate.localeCompare(a.eventDate)||
      eventTitle(a).localeCompare(eventTitle(b),"ru")||
      (Number(a.orderNumber)||0)-(Number(b.orderNumber)||0));
  if(date&&selectedEvent){
    const live=shown.filter(o=>!o.archived&&o.status!=="cancelled");
    const tally=new Map();
    for(const o of live)for(const item of o.items){
      const key=String(item.id)+"|"+item.name;
      const record=tally.get(key)||{name:item.name,quantity:0};
      record.quantity+=Number(item.quantity)||0;
      tally.set(key,record);
    }
    const count=[...tally.values()].reduce((sum,item)=>sum+item.quantity,0);
    summary.append(node("h3","Для кухни · "+live.length+" активных заказов · "+count+" порций"));
    for(const item of [...tally.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru")))
      summary.append(node("p",item.name+" × "+item.quantity,"admin-line-item"));
    if(!tally.size)summary.append(node("p","Активных блюд пока нет."));
  }
  if(!shown.length){
    container.append(node("p","По этим условиям заказов пока нет."));return;
  }
  for(const o of shown){
    const card=node("article","","admin-order-card");
    card.append(node("h3",orderLabel(o)+" · "+(statuses[o.status]||o.status)+(o.archived?" · Архив":"")));
    card.append(node("p",o.eventDate+" · "+eventTitle(o)));
    card.append(node("p",o.tableNumber?"Столик "+o.tableNumber:"Бронь "+o.bookingId));
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
  const dates=[...new Set([...orders.map(x=>x.eventDate),
    ...[...events.values()].map(x=>x.date)])].filter(Boolean).sort().reverse();
  for(const date of dates)el.add(new Option(date,date));
  if([...el.options].some(x=>x.value===old))el.value=old;
  renderEventFilter();
}
function renderEventFilter(){
  const select=$("ordersEventFilter"),date=$("ordersDateFilter").value,old=select.value;
  select.replaceChildren(new Option("Все мероприятия",""));
  const found=new Map();
  for(const [id,event] of events)if(!date||event.date===date)found.set(id,event.title);
  for(const o of [...orders,...dateOrders])
    if(!date||o.eventDate===date)found.set(o.eventId||o.eventDate,eventTitle(o));
  for(const [id,title] of [...found].sort((a,b)=>a[1].localeCompare(b[1],"ru")))
    select.add(new Option(title,id));
  if([...select.options].some(x=>x.value===old))select.value=old;
  select.disabled=!date;
  const canExport=Boolean(date&&select.value);
  $("exportEventOrders").disabled=!canExport;
  $("exportEventDishes").disabled=!canExport;
}
function watchDateOrders(){
  unsubDateOrders?.();unsubDateOrders=null;
  const date=$("ordersDateFilter").value,revision=++dateRevision;
  dateOrders=[];loadedDate="";
  if(!date){renderEventFilter();renderOrders();return;}
  renderOrders();
  unsubDateOrders=onSnapshot(query(collection(db,"orders"),where("eventDate","==",date)),async snap=>{
    try{
      const prepared=await Promise.all(snap.docs.map(async row=>{
        const lines=await getDocs(collection(row.ref,"items"));
        const items=lines.docs.map(x=>x.data());
        return {id:row.id,...row.data(),items,total:total(items)};
      }));
      if(revision!==dateRevision)return;
      dateOrders=prepared;loadedDate=date;
      renderEventFilter();renderOrders();
      setStatus("За "+date+" загружены все "+prepared.length+" предзаказов.");
    }catch(e){if(revision===dateRevision)setStatus("Ошибка загрузки даты: "+(e.code||e.message));}
  },e=>setStatus("Ошибка списка даты: "+(e.code||e.message)));
}
$("ordersDateFilter").addEventListener("change",watchDateOrders);
$("ordersEventFilter").addEventListener("change",()=>{renderEventFilter();renderOrders();});
$("showArchivedOrders")?.addEventListener("change",renderOrders);
function fillOrderEventOptions(preferredId=""){
  const select=$("editOrderEvent"),date=$("editOrderDate").value;
  const previous=preferredId||select.value;
  select.replaceChildren(new Option("Выберите мероприятие",""));
  for(const [id,event] of [...events].filter(([,event])=>event.date===date)
    .sort((a,b)=>(a[1].startTime||"").localeCompare(b[1].startTime||"")||a[0].localeCompare(b[0]))){
    select.add(new Option(event.title+(event.startTime?" · "+event.startTime:""),id));
  }
  // Existing orders remain editable even when an older event was removed.
  if(editOrder?.eventDate===date){
    const originalId=editOrder.eventId||date;
    if(![...select.options].some(o=>o.value===originalId))
      select.add(new Option(eventTitle(editOrder)+" · архивное мероприятие",originalId));
  }
  if([...select.options].some(o=>o.value===previous))select.value=previous;
}
$("editOrderDate").addEventListener("change",()=>fillOrderEventOptions());
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
    $("orderEditTitle").textContent="Заказ "+orderLabel(o);
    $("editOrderDate").value=o.eventDate;
    fillOrderEventOptions(o.eventId||o.eventDate);
    $("editOrderStatus").value=o.status;
    $("editOrderName").value=o.customerName;
    $("editOrderPhone").value=o.customerPhone;
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
  const eventId=$("editOrderEvent").value;
  const selectedEvent=events.get(eventId);
  const samePreviousEvent=eventDate===editOrder.eventDate &&
    eventId===(editOrder.eventId||editOrder.eventDate);
  const chosenTitle=selectedEvent?.title||(samePreviousEvent?editOrder.eventTitle:"");
  const eventFields={eventId,...(chosenTitle?{eventTitle:chosenTitle}:{})};
  const customerName=$("editOrderName").value.trim();
  const customerPhone=$("editOrderPhone").value.trim();
  const tableNumber=$("editOrderTable").value.trim();
  const bookingId=$("editOrderBooking").value.trim();
  const notes=$("editOrderNotes").value.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
      ||!eventId || (!selectedEvent&&!samePreviousEvent) ||
      (selectedEvent&&selectedEvent.date!==eventDate)
      ||customerName.length<2||customerName.length>100
      ||!/^[+]?[1-9][0-9]{7,14}$/.test(customerPhone)
      ||(!tableNumber&&!bookingId)||tableNumber.length>20||bookingId.length>60
      ||notes.length>500||!Object.keys(statuses).includes(status)
      ||!editLines.length||editLines.length>12) {
    $("orderEditStatus").textContent="Выберите дату и мероприятие, столик или бронь и от 1 до 12 блюд.";return;
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
    const present=new Set(editLines.map(x=>String(x.id)));
    const eventChanged=eventId!==(fresh.data().eventId||fresh.data().eventDate);
    let assignedNumber=null;
    if(eventChanged) {
      const counterRef=doc(db,"orderCounters",eventId);
      // Новый номер выдаётся при смене мероприятия даже внутри той же даты.
      assignedNumber=await runTransaction(db,async tx=>{
        const latest=await tx.get(ref);
        const counter=await tx.get(counterRef);
        if(!latest.exists() || latest.data().archived
            || (latest.data().eventId||latest.data().eventDate)===eventId
            || (oldTimestamp && latest.data().updatedAt?.toMillis?.()!==oldTimestamp))
          throw new Error("Заказ изменился. Откройте его заново.");
        const next=(counter.exists()?counter.data().count:0)+1;
        if(!Number.isSafeInteger(next)||next>999999)throw new Error("Счётчик заказов переполнен.");
        tx.set(counterRef,{date:eventDate,count:next,lastOrderId:editOrder.id,updatedAt:serverTimestamp()});
        tx.update(ref,{eventDate,...eventFields,orderNumber:next,customerName,customerPhone,
          tableNumber,bookingId,notes,status,updatedAt:serverTimestamp()});
        for(const id of originalIds)if(!present.has(id))tx.delete(doc(ref,"items",id));
        for(const line of touched)tx.set(doc(ref,"items",String(line.id)),{
          id:line.id,name:line.name,unitPrice:line.unitPrice,quantity:line.quantity
        });
        return next;
      });
      editOrder.orderNumber=assignedNumber;
    } else {
      const batch=writeBatch(db);
      batch.update(ref,{...eventFields,customerName,customerPhone,tableNumber,bookingId,notes,status,updatedAt:serverTimestamp()});
      for(const id of originalIds)if(!present.has(id))batch.delete(doc(ref,"items",id));
      for(const line of touched)batch.set(doc(ref,"items",String(line.id)),{
        id:line.id,name:line.name,unitPrice:line.unitPrice,quantity:line.quantity
      });
      await batch.commit();
    }
    $("orderEditDialog").close();
    setStatus("Изменения заказа "+orderLabel(editOrder)+" сохранены. Итого: "+fmt(total(editLines)));
  }catch(e){
    $("orderEditStatus").textContent=e.code==="permission-denied"
      ?"Firebase запретил изменение. Опубликуйте последние правила Firestore."
      :"Не удалось сохранить заказ: "+(e.message||e.code||"unknown");
  }finally{submit.disabled=false;}
});
async function subscribe(user) {
  if(unsubOrders){unsubOrders();unsubOrders=null;}
  if(unsubMenu){unsubMenu();unsubMenu=null;}
  if(unsubEvents){unsubEvents();unsubEvents=null;}
  if(unsubDateOrders){unsubDateOrders();unsubDateOrders=null;}
  dateRevision++;dateOrders=[];loadedDate="";
  const current=++generation;
  orders=[];catalog=[];events=new Map();authorized=false;
  window.dispatchEvent(new CustomEvent("bali:admin:session",{detail:{uid:null}}));
  $("ordersAdminList").textContent="Проверяем права...";
  if(!user||!user.emailVerified)return;
  try{
    const role=await getDoc(doc(db,"admins",user.uid));
    if(current!==generation||!role.exists()||role.data().active!==true) {
      $("ordersAdminList").textContent="Нет прав администратора.";return;
    }
    authorized=true;
    unsubEvents=onSnapshot(collection(db,"events"),snap=>{
      events=new Map(snap.docs.map(row=>[row.id,row.data()]));
      renderDates();renderOrders();
      if($("orderEditDialog").open)fillOrderEventOptions($("editOrderEvent").value);
    },e=>setStatus("Ошибка списка мероприятий: "+(e.code||"unknown")));
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
          ownerUid:user.uid,orders:orders.map(({id,status,orderNumber})=>({id,status,orderNumber})),
          count:orders.length,pending:orders.filter(x=>x.status==="pending"&&!x.archived).length
        }}));
        setStatus("Последние "+orders.length+" заказов. Выберите дату, чтобы загрузить всю очередь за день, затем мероприятие для отчёта.");
      }catch(e){if(current===generation)setStatus("Ошибка состава заказов: "+(e.code||e.message));}
    },e=>{if(current===generation)setStatus("Не удалось загрузить заказы: "+(e.code||"unknown"));});
  }catch(e){if(current===generation)setStatus("Ошибка проверки роли: "+(e.code||"unknown"));}
}
// Полная выгрузка делается непосредственно из Firestore, а не из очереди
// последних 100 заявок. Один день/мероприятие — отдельный отчёт.
function csvCell(value){
  let text=String(value??"");
  // Prevent spreadsheet formula execution on imported guest-controlled fields.
  if(/^[=+@\-\t\r]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
function saveCsv(filename,header,rows){
  const csv="\uFEFF"+[header,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function exportName(date,title,type){
  const safe=title.normalize("NFKC").replace(/[^\p{L}\p{N}_-]+/gu,"_").slice(0,50);
  return "BALI_"+date+"_"+safe+"_"+type+".csv";
}
async function exportEventReport(kind){
  ensureAdmin();
  const date=$("ordersDateFilter").value;
  const eventId=$("ordersEventFilter").value;
  if(!date||!eventId){setStatus("Для выгрузки выберите дату и конкретное мероприятие.");return;}
  const buttonEl=$(kind==="orders"?"exportEventOrders":"exportEventDishes");
  buttonEl.disabled=true;
  setStatus("Загружаем ВСЕ заказы выбранного мероприятия для выгрузки...");
  try{
    const snapshot=await getDocs(query(collection(db,"orders"),where("eventDate","==",date)));
    const matching=snapshot.docs.filter(row=>(row.data().eventId||row.data().eventDate)===eventId);
    const includeInactive=$("exportIncludeCancelled").checked;
    const eligible=matching.filter(row=>includeInactive||
      (!row.data().archived&&row.data().status!=="cancelled"));
    const completed=await Promise.all(eligible.map(async row=>{
      const lines=await getDocs(collection(row.ref,"items"));
      return {id:row.id,...row.data(),items:lines.docs.map(x=>x.data())};
    }));
    completed.sort((a,b)=>(a.orderNumber||0)-(b.orderNumber||0)||
      (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
    const title=events.get(eventId)?.title||completed[0]?.eventTitle||eventId;
    if(kind==="orders"){
      const header=["Дата","Мероприятие","Номер предзаказа","Статус","Столик","ID бронирования",
        "Гость","Телефон","Email","Блюдо","Количество","Цена за шт., BYN",
        "Сумма позиции, BYN","Сумма заказа, BYN","Пожелания","Firestore ID"];
      const rows=completed.flatMap(o=>{
        const items=o.items.length?o.items:[{name:"",quantity:"",unitPrice:""}];
        return items.map(line=>[
          o.eventDate,eventTitle(o),orderLabel(o),statuses[o.status]||o.status,
          o.tableNumber,o.bookingId,o.customerName,o.customerPhone,o.email,
          line.name,line.quantity,line.unitPrice===""?"":Number(line.unitPrice).toFixed(2),
          line.unitPrice===""?"":(Number(line.unitPrice)*Number(line.quantity)).toFixed(2),
          total(o.items).toFixed(2),o.notes,o.id
        ]);
      });
      saveCsv(exportName(date,title,"orders"),header,rows);
    }else{
      const aggregate=new Map();
      for(const o of completed)for(const line of o.items){
        const key=String(line.id)+"|"+line.name;
        const item=aggregate.get(key)||{id:line.id,name:line.name,quantity:0,amount:0};
        item.quantity+=Number(line.quantity)||0;
        item.amount+=(Number(line.unitPrice)||0)*(Number(line.quantity)||0);
        aggregate.set(key,item);
      }
      const dishes=[...aggregate.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru"));
      saveCsv(exportName(date,title,"dishes"),
        ["Дата","Мероприятие","Код блюда","Наименование блюда","Всего порций","Сумма, BYN"],
        dishes.map(x=>[date,title,x.id,x.name,x.quantity,x.amount.toFixed(2)]));
    }
    setStatus("Выгрузка: "+completed.length+" заказов из "+matching.length+
      " по мероприятию «"+title+"». "+(includeInactive?"Отменённые включены.":"Отменённые и архив исключены."));
  }catch(e){setStatus("Не удалось выгрузить отчёт: "+(e.code||e.message));}
  finally{renderEventFilter();}
}
$("exportEventOrders").addEventListener("click",()=>void exportEventReport("orders"));
$("exportEventDishes").addEventListener("click",()=>void exportEventReport("dishes"));

onAuthStateChanged(auth,user=>{void subscribe(user);});
