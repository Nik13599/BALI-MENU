/** BALI — заказы для персонала. Доступ контролирует Firestore Rules. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, onSnapshot,
  updateDoc, serverTimestamp, query, limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app), db=getFirestore(app);
const $=id=>document.getElementById(id);
let unsubscribe=null, generation=0, orders=[];
const statuses={pending:"Ожидает подтверждения",confirmed:"Подтверждён",completed:"Завершён",cancelled:"Отменён"};
const fmt=n=>Number(n||0).toFixed(2)+" BYN";
const setStatus=text=>{$("ordersAdminStatus").textContent=text;};

function appendText(el,tag,text,className="") {
  const child=document.createElement(tag);
  child.textContent=text;
  if(className)child.className=className;
  el.append(child);
  return child;
}
function makeButton(label,action) {
  const button=document.createElement("button");
  button.type="button"; button.textContent=label;
  button.addEventListener("click",action);
  return button;
}
function showPrint(order) {
  const print=$("orderPrintSheet");
  print.replaceChildren();
  appendText(print,"h1","BALI — ПРЕДЗАКАЗ");
  appendText(print,"h2","Заказ № "+order.id);
  appendText(print,"p","Статус: "+(statuses[order.status]||order.status));
  appendText(print,"p","Мероприятие: "+order.eventDate);
  appendText(print,"p","Столик: "+(order.tableNumber||"—")+"; ID брони: "+(order.bookingId||"—"));
  appendText(print,"p","Гость: "+order.customerName);
  appendText(print,"p","Телефон: "+order.customerPhone);
  appendText(print,"p","Email: "+order.email);
  const table=document.createElement("table"),header=document.createElement("tr");
  ["Позиция","Кол-во","Цена","Сумма"].forEach(h=>appendText(header,"th",h));
  table.append(header);
  for(const item of order.items) {
    const row=document.createElement("tr");
    [item.name,String(item.quantity),fmt(item.unitPrice),fmt(item.unitPrice*item.quantity)].forEach(x=>appendText(row,"td",x));
    table.append(row);
  }
  print.append(table);
  appendText(print,"h2","ИТОГО: "+fmt(order.total));
  if(order.notes)appendText(print,"p","Пожелания: "+order.notes);
  appendText(print,"p","Распечатано: "+new Date().toLocaleString("ru-RU"));
  print.hidden=false;
  window.print();
}
window.addEventListener("afterprint",()=>{
  const print=$("orderPrintSheet");
  print.hidden=true;
  print.replaceChildren();
});

async function changeStatus(order, status) {
  const name=statuses[status]||status;
  if (!confirm("Изменить статус заказа "+order.id+" на «"+name+"»?"))return;
  setStatus("Сохраняем статус...");
  try {
    await updateDoc(doc(db,"orders",order.id),{status,updatedAt:serverTimestamp()});
    setStatus("Статус сохранён: "+name+".");
  } catch(error) {
    setStatus("Ошибка изменения статуса: "+(error.code||"unknown"));
  }
}
function renderOrders() {
  const container=$("ordersAdminList"), filter=$("ordersDateFilter").value;
  container.replaceChildren();
  const listed=orders.filter(o=>!filter || o.eventDate===filter);
  if(!listed.length){appendText(container,"p","По выбранной дате предзаказов нет.");return;}
  for(const order of listed){
    const el=document.createElement("article");el.className="admin-order-card";
    appendText(el,"h3","№ "+order.id+" · "+(statuses[order.status]||order.status));
    appendText(el,"p",order.eventDate+" · "+(order.tableNumber?"Столик "+order.tableNumber:"ID брони "+order.bookingId));
    appendText(el,"p",order.customerName+" · "+order.customerPhone+" · "+order.email);
    for(const item of order.items) {
      appendText(el,"p",item.name+" × "+item.quantity+" = "+fmt(item.unitPrice*item.quantity),"admin-line-item");
    }
    appendText(el,"strong","Итого: "+fmt(order.total));
    if(order.notes)appendText(el,"p","Пожелания: "+order.notes);
    const controls=document.createElement("div");controls.className="row-actions";
    if(order.status==="pending"){
      controls.append(makeButton("Подтвердить",()=>changeStatus(order,"confirmed")));
      controls.append(makeButton("Отменить",()=>changeStatus(order,"cancelled")));
    }else if(order.status==="confirmed"){
      controls.append(makeButton("Завершить",()=>changeStatus(order,"completed")));
      controls.append(makeButton("Отменить",()=>changeStatus(order,"cancelled")));
    }
    controls.append(makeButton("Печать",()=>showPrint(order)));
    el.append(controls);
    container.append(el);
  }
}
$("ordersDateFilter").addEventListener("change",renderOrders);
function renderDates(){
  const el=$("ordersDateFilter"), old=el.value;
  el.replaceChildren(new Option("Все даты",""));
  for(const date of [...new Set(orders.map(x=>x.eventDate))].sort()){
    el.add(new Option(date,date));
  }
  if([...el.options].some(x=>x.value===old))el.value=old;
}
async function subscribe(user){
  if(unsubscribe){unsubscribe();unsubscribe=null;}
  const gen=++generation;
  orders=[];
  $("ordersAdminList").textContent="Проверяем доступ...";
  if(!user||!user.emailVerified)return;
  try{
    const role=await getDoc(doc(db,"admins",user.uid));
    if(gen!==generation||!role.exists()||role.data().active!==true){
      $("ordersAdminList").textContent="Нет прав администратора.";
      return;
    }
    unsubscribe=onSnapshot(query(collection(db,"orders"),limit(100)),async snapshots=>{
      try{
        const mapped=await Promise.all(snapshots.docs.map(async order=>{
          const snapshot=await getDocs(collection(order.ref,"items"));
          const items=snapshot.docs.map(x=>x.data());
          return {id:order.id,...order.data(),items,
            total:items.reduce((sum,x)=>sum+x.unitPrice*x.quantity,0)};
        }));
        if(gen!==generation)return;
        orders=mapped.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        renderDates();renderOrders();
        window.dispatchEvent(new CustomEvent("bali:admin:orders",{detail:{
          count:orders.length, pending:orders.filter(x=>x.status==="pending").length
        }}));
        setStatus("Загружено предзаказов: "+orders.length+
          " (последние 100; более старые пока не отображаются).");
      }catch(error){if(gen===generation)setStatus("Не удалось загрузить состав заказов: "+(error.code||"unknown"));}
    },error=>{if(gen===generation)setStatus("Ошибка списка заказов: "+(error.code||"unknown"))});
  }catch(error){if(gen===generation)setStatus("Ошибка проверки прав: "+(error.code||"unknown"));}
}
onAuthStateChanged(auth,user=>{void subscribe(user);});
