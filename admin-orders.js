/** BALI admin order queue, staff item amendments and soft deletion.
 * All edits use atomic Firestore batches. Security enforced by firestore.rules.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,onSnapshot,updateDoc,writeBatch,
  serverTimestamp,runTransaction,query,limit,orderBy,where,Timestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {createOrderSnapshotReader} from "./bali-order-snapshots.js?v=20261021-1";
import {withinOrderRetention,ORDER_RETENTION_MS} from "./bali-order-retention.js";
import {composeBaliPreorderReport,downloadBaliPreorderReport,showBaliPreorderTelegram} from "./bali-preorder-reports.js?v=20261021-1";
const readOrderLines=async row=>{
  const lines=await getDocs(collection(row.ref,"items"));
  return lines.docs.map(line=>line.data());
};
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let unsubOrders=null,unsubMenu=null,unsubEvents=null,generation=0,authorized=false,orders=[],catalog=[];
let events=new Map(),dateOrders=[],loadedDate="",unsubDateOrders=null,dateRevision=0;
let preorderOnlyStaff=false;
let editOrder=null,editLines=[],originalIds=new Set(),creatingOrder=false;
const statuses={pending:"Ожидает подтверждения",confirmed:"Подтверждён",cancelled:"Отменён"};
const normalizedOrderStatus=status=>status==="completed"?"confirmed":status;
const compactWorkspace=document.body.classList.contains("bali-preorders-workspace");
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
    ["p","Статус: "+(statuses[normalizedOrderStatus(o.status)]||o.status)],
    ["p","Столик: "+(o.tableNumber||"—")+" · Бронь: "+(o.bookingId||"—")],
    ["p","Гость: "+o.customerName+" · "+o.customerPhone],["p",o.email||"Создан сотрудником · без аккаунта"]
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
  if(!["pending","confirmed","cancelled"].includes(status))throw new Error("Недопустимый статус заказа.");
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

async function deleteOrder(o) {
  ensureAdmin();
  const answer=prompt("Удалить предзаказ «"+orderLabel(o)+"» без восстановления? Он исчезнет у гостя и в отчётах. Введите УДАЛИТЬ:");
  if(answer!=="УДАЛИТЬ")return;
  setStatus("Удаляем заказ и все его блюда...");
  try{
    const ref=doc(db,"orders",o.id),lines=await getDocs(collection(ref,"items"));
    if(lines.size>400)throw new Error("Слишком много позиций для безопасного удаления.");
    const batch=writeBatch(db);
    lines.forEach(x=>batch.delete(x.ref));
    batch.delete(ref);
    await batch.commit();
    window.dispatchEvent(new CustomEvent("bali:admin:order-deleted",{detail:{id:o.id}}));
    setStatus("Заказ и позиции полностью удалены из базы.");
  }catch(e){setStatus("Ошибка удаления: "+(e.code||e.message));}
}
async function clearExpiredOrderHistory() {
  ensureAdmin();
  if(prompt("Удалить всю историю старше 30 дней без восстановления? Введите 30 ДНЕЙ:")!=="30 ДНЕЙ")return;
  const control=$("clearExpiredOrders");
  if(control)control.disabled=true;
  let removed=0;
  try{
    for(let page=0;page<100;page++){
      const cutoff=Timestamp.fromMillis(Date.now()-ORDER_RETENTION_MS);
      const expired=await getDocs(query(collection(db,"orders"),where("createdAt","<",cutoff),limit(25)));
      if(expired.empty)break;
      const batch=writeBatch(db);
      for(const row of expired.docs){
        const items=await getDocs(collection(row.ref,"items"));
        if(items.size>15)throw new Error("Непривычное количество блюд: "+row.id);
        items.forEach(item=>batch.delete(item.ref));
        batch.delete(row.ref);
      }
      await batch.commit();removed+=expired.size;
      setStatus("Удалено устаревших предзаказов: "+removed+".");
      if(expired.size<25)break;
    }
    setStatus("Очистка завершена. Удалено заказов: "+removed+".");
  }catch(e){setStatus("Очистка остановлена после "+removed+" заказов: "+(e.code||e.message));}
  finally{if(control)control.disabled=false;}
}
$("clearExpiredOrders")?.addEventListener("click",()=>void clearExpiredOrderHistory());
function orderDetailsField(label,value){
  const field=node("div","","preorder-detail-field");
  field.append(node("small",label),node("strong",String(value||"—")));
  return field;
}
async function openOrderDetails(id){
  ensureAdmin();
  const dialog=$("orderDetailsDialog");
  if(!dialog)return;
  $("orderDetailsTitle").textContent="Загрузка предзаказа…";
  $("orderDetailsContent").replaceChildren(node("p","Загружаем состав заказа…"));
  $("orderDetailsEdit").hidden=true;
  $("orderDetailsPrint").disabled=true;
  if(!dialog.open)dialog.showModal();
  try{
    const o=await fetchComplete(id);
    // Check the current session again after the asynchronous fetch.
    ensureAdmin();
    if(!dialog.open)return;
    const state=normalizedOrderStatus(o.status);
    $("orderDetailsTitle").textContent=eventTitle(o)+" №"+
      (Number.isInteger(o.orderNumber)?o.orderNumber:o.id);
    const content=$("orderDetailsContent");content.replaceChildren();
    const header=node("div","","preorder-detail-meta");
    header.append(orderDetailsField("Дата",o.eventDate),
      orderDetailsField("Статус",(statuses[state]||"Подтверждён")+(o.archived?" · Архив":"")));
    const guest=node("div","","preorder-detail-meta");
    guest.append(orderDetailsField("Гость",o.customerName),
      orderDetailsField("Телефон",o.customerPhone));
    const references=node("div","","preorder-detail-meta");
    references.append(orderDetailsField("Столик",o.tableNumber),
      orderDetailsField("ID бронирования",o.bookingId));
    content.append(header,guest,references);
    if(o.email)content.append(orderDetailsField("Email",o.email));
    content.append(node("h3","Состав предзаказа","preorder-detail-section-title"));
    const list=node("div","","preorder-detail-items");
    for(const item of o.items){
      const line=node("div","","preorder-detail-item");
      const info=node("div","","preorder-detail-item-name");
      info.append(node("strong",item.name),node("small",fmt(item.unitPrice)+" / шт."));
      const amount=node("div","","preorder-detail-item-amount");
      amount.append(node("strong","× "+item.quantity),node("span",fmt(Number(item.unitPrice)*Number(item.quantity))));
      line.append(info,amount);list.append(line);
    }
    if(!o.items.length)list.append(node("p","Позиции отсутствуют."));
    content.append(list);
    const totalRow=node("div","","preorder-detail-total");
    totalRow.append(node("span","Итого"),node("strong",fmt(total(o.items))));
    content.append(totalRow);
    if(o.notes)content.append(orderDetailsField("Пожелания к заказу",o.notes));
    $("orderDetailsEdit").hidden=Boolean(o.archived);
    $("orderDetailsEdit").onclick=()=>{dialog.close();void openEditor(id);};
    $("orderDetailsPrint").disabled=false;
    $("orderDetailsPrint").onclick=()=>printOrder(o);
  }catch(e){
    if(dialog.open)$("orderDetailsContent").replaceChildren(
      node("p","Не удалось открыть заказ: "+(e.message||e.code||"unknown"),"preorder-detail-error"));
  }
}
$("closeOrderDetails")?.addEventListener("click",()=>$("orderDetailsDialog").close());
$("orderDetailsClose")?.addEventListener("click",()=>$("orderDetailsDialog").close());
function compactOrderRow(o){
  const row=node("article","","preorder-compact-row");
  const ref=node("div","","preorder-cell reference");
  ref.append(node("strong",eventTitle(o)+" №"+(Number.isInteger(o.orderNumber)?o.orderNumber:o.id)));
  const reference=[o.bookingId&&"ID бронирования "+o.bookingId,o.tableNumber&&"Номер столика "+o.tableNumber].filter(Boolean).join(" · ");
  ref.append(node("small",o.eventDate+(reference?" · "+reference:"")));
  const guest=node("div","","preorder-cell guest");
  guest.append(node("strong",o.customerName||"Гость BALI"));
  const phone=node("small",o.customerPhone||"Без телефона");
  guest.append(phone);
  const dishes=node("div","","preorder-cell dishes");
  const count=o.items.reduce((sum,x)=>sum+Number(x.quantity||0),0);
  dishes.append(node("strong",o.items.length+" поз. · "+count+" порц."));
  const preview=o.items.map(x=>x.name+" × "+x.quantity).join(", ");
  const previewEl=node("small",preview||"Блюда отсутствуют");previewEl.title=preview;
  dishes.append(previewEl);
  const amount=node("div","","preorder-cell amount");
  amount.append(node("strong",fmt(o.total)));
  const statusBox=node("div","","preorder-status-cell");
  const state=normalizedOrderStatus(o.status);
  statusBox.append(node("span",statuses[state]||"Подтверждён","preorder-state preorder-state-"+state));
  if(o.archived)statusBox.append(node("small","Архив"));
  const actions=node("div","","preorder-actions");
  const view=button("Посмотреть заказ",()=>void openOrderDetails(o.id),"preorder-view-button");
  view.setAttribute("data-preorder-view",o.id);
  actions.append(view);
  if(!o.archived){
    actions.append(button("Изменить",()=>void openEditor(o.id)));
    if(state==="pending")actions.append(button("Подтвердить",()=>void setOrderStatus(o,"confirmed"),"confirm"));
  }
  const dropdown=node("details","","preorder-action-menu");
  const trigger=node("summary","⋯");trigger.setAttribute("aria-label","Дополнительные действия с заказом");
  const menu=node("div","","preorder-dropdown");
  const menuButton=(label,fn,cls="")=>button(label,()=>{dropdown.open=false;fn();},cls);
  if(!o.archived&&state!=="cancelled")menu.append(menuButton("Отменить заказ",()=>void setOrderStatus(o,"cancelled")));
  menu.append(menuButton("Печать",()=>printOrder(o)));
  menu.append(o.archived
    ?menuButton("Вернуть из архива",()=>void archiveOrder(o,false))
    :menuButton("В архив",()=>void archiveOrder(o,true)));
  menu.append(menuButton("Удалить навсегда",()=>void deleteOrder(o),"danger-action"));
  dropdown.append(trigger,menu);actions.append(dropdown);
  row.append(ref,guest,dishes,amount,statusBox,actions);
  return row;
}
function renderOrders(){
  const container=$("ordersAdminList"),date=$("ordersDateFilter").value;
  const selectedEvent=$("ordersEventFilter").value;
  const showArchive=$("showArchivedOrders")?.getAttribute("aria-pressed")==="true";
  container.replaceChildren();
  const summary=$("ordersDishSummary");
  summary.replaceChildren();
  summary.hidden=compactWorkspace||!(date&&selectedEvent);
  if(date&&loadedDate!==date){
    $("ordersStats")?.replaceChildren();
    container.append(node("p","Загружаем предзаказы выбранной даты..."));return;
  }
  const source=date?dateOrders:orders;
  const shown=source.filter(o=>withinOrderRetention(o)&&(!date||o.eventDate===date)&&
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
  if(compactWorkspace){
    const stats=$("ordersStats");
    if(stats){
      stats.replaceChildren();
      const counters=[
        ["Всего заказов",shown.length,"all"],
        ["Ожидают",shown.filter(o=>normalizedOrderStatus(o.status)==="pending"&&!o.archived).length,"awaiting"],
        ["Подтверждены",shown.filter(o=>normalizedOrderStatus(o.status)==="confirmed"&&!o.archived).length,"accepted"]
      ];
      for(const [title,count,type] of counters){
        const card=node("div","","preorder-stat "+type);
        card.append(node("span",title,"preorder-stat-label"),node("strong",String(count),"preorder-stat-number"));
        stats.append(card);
      }
    }
  }
  if(!shown.length){
    container.append(node("p","По этим условиям заказов пока нет."));return;
  }
  if(compactWorkspace){
    const header=node("div","","preorder-table-header");
    ["Предзаказ","Гость","Состав","Сумма","Статус","Действия"].forEach(name=>header.append(node("span",name)));
    container.append(header);
    for(const o of shown)container.append(compactOrderRow(o));
    return;
  }
  for(const o of shown){
    const card=node("article","","admin-order-card");
    card.append(node("h3",orderLabel(o)+" · "+(statuses[normalizedOrderStatus(o.status)]||o.status)+(o.archived?" · Архив":"")));
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
      }else if(normalizedOrderStatus(o.status)==="confirmed") {
        actions.append(button("Отменить",()=>void setOrderStatus(o,"cancelled")));
      }
      actions.append(button("В архив",()=>void archiveOrder(o,true)));
      actions.append(button("Удалить навсегда",()=>void deleteOrder(o),"danger-action"));
    }else{
      actions.append(button("Восстановить",()=>void archiveOrder(o,false)));
      actions.append(button("Удалить навсегда",()=>void deleteOrder(o),"danger-action"));
    }
    actions.append(button("Печать",()=>printOrder(o)));
    card.append(actions);
    container.append(card);
  }
}
function renderDates(){
  const el=$("ordersDateFilter"),old=el.value;
  el.replaceChildren(new Option("Все даты",""));
  const dates=[...new Set([...orders.filter(withinOrderRetention).map(x=>x.eventDate),
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
  for(const o of [...orders,...dateOrders].filter(withinOrderRetention))
    if(!date||o.eventDate===date)found.set(o.eventId||o.eventDate,eventTitle(o));
  for(const [id,title] of [...found].sort((a,b)=>a[1].localeCompare(b[1],"ru")))
    select.add(new Option(title,id));
  if([...select.options].some(x=>x.value===old))select.value=old;
  select.disabled=!date;
  const canExport=Boolean(date&&select.value);
  for(const id of ["exportEventOrders","exportEventDishes","exportEventOrdersPng",
    "exportEventDishesPng","exportEventOrdersTg","exportEventDishesTg"]){
    const control=$(id);if(control)control.disabled=!canExport;
  }
}
function watchDateOrders(){
  unsubDateOrders?.();unsubDateOrders=null;
  const date=$("ordersDateFilter").value,revision=++dateRevision;
  dateOrders=[];loadedDate="";
  if(!date){renderEventFilter();renderOrders();return;}
  if(!authorized)return;
  const readOrders=createOrderSnapshotReader(readOrderLines);
  let snapshotRevision=0;
  renderOrders();
  unsubDateOrders=onSnapshot(query(collection(db,"orders"),where("eventDate","==",date)),async snap=>{
    const run=++snapshotRevision;
    try{
      const prepared=await readOrders(snap);
      if(revision!==dateRevision||run!==snapshotRevision)return;
      dateOrders=prepared;loadedDate=date;
      renderEventFilter();renderOrders();
      setStatus("За "+date+" загружены "+prepared.filter(withinOrderRetention).length+" предзаказов за последние 30 дней.");
    }catch(e){if(revision===dateRevision&&run===snapshotRevision)setStatus("Ошибка загрузки даты: "+(e.code||e.message));}
  },e=>{if(revision===dateRevision){snapshotRevision++;setStatus("Ошибка списка даты: "+(e.code||e.message));}});
}
$("ordersDateFilter").addEventListener("change",watchDateOrders);
$("ordersEventFilter").addEventListener("change",()=>{renderEventFilter();renderOrders();});
$("showArchivedOrders")?.addEventListener("click",()=>{
  const toggle=$("showArchivedOrders");
  const next=toggle.getAttribute("aria-pressed")!=="true";
  toggle.setAttribute("aria-pressed",String(next));
  toggle.textContent=next?"Скрыть архив":"Показать архив";
  renderOrders();
});
function fillOrderEventOptions(preferredId=""){
  const select=$("editOrderEvent"),date=$("editOrderDate").value;
  const previous=preferredId||select.value;
  select.replaceChildren(new Option("Выберите мероприятие",""));
  for(const [id,event] of [...events].filter(([,event])=>event.date===date)
    .sort((a,b)=>(a[1].startTime||"").localeCompare(b[1].startTime||"")||a[0].localeCompare(b[0]))){
    select.add(new Option(event.title+(event.startTime?" · "+event.startTime:""),id));
  }
  // Existing orders remain editable even when an older event was removed.
  if(!creatingOrder&&editOrder?.eventDate===date){
    const originalId=editOrder.eventId||date;
    if(![...select.options].some(o=>o.value===originalId))
      select.add(new Option(eventTitle(editOrder)+" · архивное мероприятие",originalId));
  }
  if([...select.options].some(o=>o.value===previous))select.value=previous;
}
$("editOrderDate").addEventListener("change",()=>fillOrderEventOptions());
function openCreateOrder(){
  ensureAdmin();
  creatingOrder=true;editOrder=null;editLines=[];originalIds=new Set();
  $("orderEditTitle").textContent="Новый предзаказ · по телефону";
  $("manualOrderGuestLink").hidden=preorderOnlyStaff;
  $("editOrderGuestEmail").value="";
  $("editOrderDate").value=$("ordersDateFilter").value||[...events.values()].find(x=>x.date)?.date||"";
  fillOrderEventOptions();
  $("editOrderStatus").value="pending";
  for(const id of ["editOrderName","editOrderPhone","editOrderTable","editOrderBooking","editOrderNotes"])$(id).value="";
  $("orderEditStatus").textContent="Ручной заказ: учётная запись гостя не обязательна.";
  menuSelect();renderEditLines();
  $("orderEditDialog").showModal();
}
$("createManualOrder")?.addEventListener("click",openCreateOrder);
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
    editOrder=o;creatingOrder=false;
    $("manualOrderGuestLink").hidden=true;
    $("editOrderGuestEmail").value="";
    editLines=o.items.map(x=>({...x}));
    originalIds=new Set(o.items.map(x=>String(x.id)));
    $("orderEditTitle").textContent="Заказ "+orderLabel(o);
    $("editOrderDate").value=o.eventDate;
    fillOrderEventOptions(o.eventId||o.eventDate);
    $("editOrderStatus").value=normalizedOrderStatus(o.status);
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
  if(!authorized||(!creatingOrder&&!editOrder))return;
  const status=$("editOrderStatus").value;
  const eventDate=$("editOrderDate").value;
  const eventId=$("editOrderEvent").value;
  const selectedEvent=events.get(eventId);
  const samePreviousEvent=!creatingOrder&&eventDate===editOrder.eventDate &&
    eventId===(editOrder.eventId||editOrder.eventDate);
  const chosenTitle=selectedEvent?.title||(samePreviousEvent?editOrder.eventTitle:"");
  const eventFields={eventId,...(chosenTitle?{eventTitle:chosenTitle}:{})};
  const customerName=$("editOrderName").value.trim();
  const customerPhone=$("editOrderPhone").value.trim();
  const tableNumber=$("editOrderTable").value.trim();
  const bookingId=$("editOrderBooking").value.trim();
  const notes=$("editOrderNotes").value.trim();
  const linkedEmail=creatingOrder?$("editOrderGuestEmail").value.trim().toLowerCase():"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
      ||!eventId || (!selectedEvent&&!samePreviousEvent) ||
      (selectedEvent&&selectedEvent.date!==eventDate)
      ||customerName.length<2||customerName.length>100
      ||!/^\+[1-9][0-9]{7,14}$/.test(customerPhone)
      ||(!tableNumber&&!bookingId)||tableNumber.length>20||bookingId.length>60
      ||notes.length>500||(linkedEmail&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(linkedEmail))
      ||!Object.keys(statuses).includes(status)
      ||!editLines.length||editLines.length>12) {
    $("orderEditStatus").textContent="Выберите дату и мероприятие, столик или бронь и от 1 до 12 блюд.";return;
  }
  const submit=event.currentTarget.querySelector('[type="submit"]');
  submit.disabled=true;
  $("orderEditStatus").textContent="Сохраняем изменения...";
  try{
    if(creatingOrder){
      let ownerUid="";
      let ownerEmail="";
      if(linkedEmail){
        const linked=await getDocs(query(collection(db,"users"),where("email","==",linkedEmail),limit(2)));
        if(linked.size!==1)throw new Error("Не найден единственный аккаунт с этим email. Уберите email или уточните его.");
        ownerUid=linked.docs[0].id;ownerEmail=linked.docs[0].data().email;
      }
      const ref=doc(collection(db,"orders"));
      const accountRef=ownerUid?doc(db,"users",ownerUid):null;
      const counterRef=doc(db,"orderCounters",eventId);
      const eventRef=doc(db,"events",eventId);
      const menuRefs=editLines.map(line=>doc(db,"menu",String(line.id)));
      const assignedNumber=await runTransaction(db,async tx=>{
        const [latestEvent,counter,...reads]=await Promise.all([
          tx.get(eventRef),tx.get(counterRef),...menuRefs.map(r=>tx.get(r)),
          ...(accountRef?[tx.get(accountRef)]:[])
        ]);
        if(!latestEvent.exists()||latestEvent.data().date!==eventDate
          ||latestEvent.data().title!==chosenTitle)
          throw new Error("Мероприятие изменилось. Обновите форму.");
        const account=accountRef?reads.at(-1):null;
        if(accountRef&&(!account?.exists()||account.data().email!==ownerEmail))
          throw new Error("Аккаунт гостя изменился. Повторите операцию.");
        const menuRows=reads.slice(0,editLines.length);
        const rows=editLines.map((line,i)=>{
          const row=menuRows[i];
          if(!row.exists()||!row.data().available||
            !Number.isFinite(row.data().price)||row.data().price<0)
            throw new Error("Блюдо недоступно: "+line.name);
          return {id:line.id,name:row.data().name,unitPrice:row.data().price,quantity:line.quantity};
        });
        const next=(counter.exists()?counter.data().count:0)+1;
        if(!Number.isSafeInteger(next)||next>999999)throw new Error("Счётчик заказов переполнен.");
        tx.set(counterRef,{date:eventDate,count:next,lastOrderId:ref.id,updatedAt:serverTimestamp()});
        tx.set(ref,{
          ownerUid,email:ownerEmail,source:"staff",createdByUid:auth.currentUser.uid,
          customerName,customerPhone,eventDate,eventId,eventTitle:chosenTitle,
          orderNumber:next,tableNumber,bookingId,notes,status,
          archived:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
        });
        for(const line of rows)tx.set(doc(ref,"items",String(line.id)),line);
        return next;
      });
      creatingOrder=false;
      $("orderEditDialog").close();
      setStatus("Ручной предзаказ «"+chosenTitle+" №"+assignedNumber+"» создан. Сумма: "+fmt(total(editLines)));
      return;
    }
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
  orders=[];catalog=[];events=new Map();authorized=false;preorderOnlyStaff=false;
  window.dispatchEvent(new CustomEvent("bali:admin:session",{detail:{uid:null}}));
  $("ordersAdminList").textContent="Проверяем права...";
  if(!user||!user.emailVerified)return;
  try{
    const adminRole=await getDoc(doc(db,"admins",user.uid));
    if(current!==generation)return;
    const isOwner=adminRole.exists()&&adminRole.data().active===true;
    const staffRole=compactWorkspace&&!isOwner
      ?await getDoc(doc(db,"preorderStaff",user.uid)):null;
    if(current!==generation)return;
    preorderOnlyStaff=!isOwner&&Boolean(staffRole?.exists()&&
      staffRole.data().active===true&&staffRole.data().role==="preorders");
    if(!isOwner&&!preorderOnlyStaff){
      $("ordersAdminList").textContent="Нет доступа к предзаказам.";return;
    }
    authorized=true;
    const readOrders=createOrderSnapshotReader(readOrderLines);
    let revision=0;
    unsubEvents=onSnapshot(collection(db,"events"),snap=>{
      if(current!==generation)return;
      events=new Map(snap.docs.map(row=>[row.id,row.data()]));
      renderDates();renderOrders();
      if($("orderEditDialog").open)fillOrderEventOptions($("editOrderEvent").value);
    },e=>{if(current===generation)setStatus("Ошибка списка мероприятий: "+(e.code||"unknown"));});
    unsubMenu=onSnapshot(collection(db,"menu"),snap=>{
      if(current!==generation)return;
      catalog=snap.docs.map(x=>x.data()).filter(x=>Number.isSafeInteger(x.id)&&Number.isFinite(x.price));
      menuSelect();
    },e=>{if(current===generation)setStatus("Ошибка каталога для редактирования: "+(e.code||"unknown"));});
    unsubOrders=onSnapshot(query(collection(db,"orders"),orderBy("createdAt","desc"),limit(100)),async snap=>{
      const run=++revision;
      try{
        const prepared=await readOrders(snap);
        if(current!==generation||run!==revision)return;
        orders=prepared.filter(withinOrderRetention);
        renderDates();renderOrders();
        window.dispatchEvent(new CustomEvent("bali:admin:orders",{detail:{
          ownerUid:user.uid,orders:orders.map(({id,status,orderNumber})=>({id,status,orderNumber})),
          count:orders.length,pending:orders.filter(x=>x.status==="pending"&&!x.archived).length
        }}));
        setStatus("Последние "+orders.length+" заказов. Выберите дату, чтобы загрузить всю очередь за день, затем мероприятие для отчёта.");
      }catch(e){if(current===generation&&run===revision)setStatus("Ошибка состава заказов: "+(e.code||e.message));}
    },e=>{if(current===generation){revision++;setStatus("Не удалось загрузить заказы: "+(e.code||"unknown"));}});
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
async function exportEventReport(kind,format="csv"){
  ensureAdmin();
  const date=$("ordersDateFilter").value;
  const eventId=$("ordersEventFilter").value;
  if(!date||!eventId){setStatus("Для выгрузки выберите дату и конкретное мероприятие.");return;}
  const suffix=format==="png"?"Png":format==="telegram"?"Tg":"";
  const buttonEl=$(kind==="orders"?"exportEventOrders"+suffix:"exportEventDishes"+suffix);
  if(buttonEl)buttonEl.disabled=true;
  setStatus("Загружаем ВСЕ заказы выбранного мероприятия для выгрузки...");
  try{
    const snapshot=await getDocs(query(collection(db,"orders"),where("eventDate","==",date)));
    const matching=snapshot.docs.filter(row=>withinOrderRetention(row.data())&&
      (row.data().eventId||row.data().eventDate)===eventId);
    const includeInactive=$("exportIncludeCancelled").checked;
    // Detailed report is an audit of ALL orders for the event, including
    // cancellations marked by status. Kitchen totals exclude them by default.
    const eligible=matching.filter(row=>kind==="orders"||includeInactive||
      (!row.data().archived&&row.data().status!=="cancelled"));
    const completed=await Promise.all(eligible.map(async row=>{
      const lines=await getDocs(collection(row.ref,"items"));
      return {id:row.id,...row.data(),items:lines.docs.map(x=>x.data())};
    }));
    completed.sort((a,b)=>(a.orderNumber||0)-(b.orderNumber||0)||
      (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
    const title=events.get(eventId)?.title||completed[0]?.eventTitle||
      matching[0]?.data()?.eventTitle||eventId;
    if(format!=="csv"){
      const report=composeBaliPreorderReport({kind,date,eventTitle:title,
        orders:completed,includeCancelled:includeInactive});
      if(format==="telegram"){
        showBaliPreorderTelegram(report);
        setStatus("Текст отчёта по мероприятию «"+title+"» готов для отправки в Telegram.");
      }else{
        const pages=await downloadBaliPreorderReport(report,format);
        setStatus("Отчёт «"+title+"» создан: "+report.count+" заказов, "+
          report.portions+" порций, "+pages+" стр. · "+format.toUpperCase()+".");
      }
      return;
    }
    if(kind==="orders"){
      const header=["Дата","Мероприятие","Номер предзаказа","Статус","Столик","ID бронирования",
        "Гость","Телефон","Email","Блюдо","Количество","Цена за шт., BYN",
        "Сумма позиции, BYN","Сумма заказа, BYN","Пожелания","Firestore ID"];
      const rows=completed.flatMap(o=>{
        const items=o.items.length?o.items:[{name:"",quantity:"",unitPrice:""}];
        return items.map(line=>[
          o.eventDate,eventTitle(o),orderLabel(o),statuses[normalizedOrderStatus(o.status)]||o.status,
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
$("exportEventOrders").addEventListener("click",()=>void exportEventReport("orders",compactWorkspace?"pdf":"csv"));
$("exportEventDishes").addEventListener("click",()=>void exportEventReport("dishes",compactWorkspace?"pdf":"csv"));
for(const [id,kind,format] of [
  ["exportEventOrdersPng","orders","png"],
  ["exportEventOrdersTg","orders","telegram"],
  ["exportEventDishesPng","dishes","png"],
  ["exportEventDishesTg","dishes","telegram"]
])$(id)?.addEventListener("click",()=>void exportEventReport(kind,format));

onAuthStateChanged(auth,user=>{void subscribe(user);});
