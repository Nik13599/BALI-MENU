/** BALI CRM: only active administrators can read private guest profiles and orders. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,query,orderBy,where,limit,startAfter}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let authorized=false,clients=[],lastClient=null,loadedAll=false,selected=null,lastOrder=null,history=[],token=0;
const PAGE=80;
function status(id,text){$(id).textContent=text;}
function el(tag,text="",className=""){const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;}
function stamp(ts){return ts?.toDate?.()?.toLocaleDateString("ru-RU")||"—";}
function currency(n){return Number(n||0).toFixed(2)+" BYN";}
function renderClients(){
  const list=$("clientList");list.replaceChildren();
  const needle=$("clientSearch").value.trim().toLocaleLowerCase("ru");
  const entries=clients.filter(c=>(c.name+" "+c.email+" "+c.phone).toLocaleLowerCase("ru").includes(needle));
  $("clientCount").textContent=String(clients.length)+(loadedAll?"":" +");
  for(const c of entries) {
    const card=el("article","","client-entry");
    const info=el("div","","client-entry-info");
    info.append(el("strong",c.name),el("small",c.phone+" · "+c.email));
    const view=el("button","История заказов");
    view.type="button";view.addEventListener("click",()=>openHistory(c));
    card.append(info,view);list.append(card);
  }
  if(!entries.length)list.append(el("p",needle?"Совпадений среди загруженных клиентов нет.":"Клиентов пока нет."));
  if(!loadedAll&&authorized) {
    const more=el("button","Загрузить ещё клиентов","client-more");
    more.type="button";more.addEventListener("click",()=>void loadClients());
    list.append(more);
  }
}
async function loadClients(){
  if(!authorized||loadedAll)return;
  status("clientsAdminStatus","Загружаем базу...");
  try {
    const parts=[collection(db,"users"),orderBy("name"),limit(PAGE)];
    const q=lastClient?query(parts[0],parts[1],startAfter(lastClient),parts[2]):query(...parts);
    const snapshot=await getDocs(q);
    const seen=new Set(clients.map(x=>x.uid));
    for(const row of snapshot.docs){
      const item={uid:row.id,...row.data()};
      if(!seen.has(item.uid))clients.push(item);
    }
    lastClient=snapshot.docs.at(-1)||null;
    loadedAll=snapshot.size<PAGE;
    clients.sort((a,b)=>String(a.name).localeCompare(String(b.name),"ru"));
    renderClients();
    status("clientsAdminStatus","Загружено клиентов: "+clients.length+(loadedAll?".":" (есть другие страницы)."));
  } catch(e) {
    status("clientsAdminStatus",e.code==="permission-denied"
      ?"Для чтения клиентской базы опубликуйте обновлённые Firestore Rules в Firebase."
      :"Ошибка базы клиентов: "+(e.code||e.message||"unknown"));
  }
}
function orderCard(o){
  const card=el("article","","client-history-order");
  card.append(el("h4","№ "+(Number.isInteger(o.orderNumber)?String(o.orderNumber).padStart(2,"0"):o.id)+" · "+(o.status==="cancelled"?"Отменён":o.status==="pending"?"Ожидает":o.status==="confirmed"?"Подтверждён":"Выполнен")));
  card.append(el("p",o.eventDate+" · "+(o.tableNumber?"Столик "+o.tableNumber:"Бронь "+o.bookingId)));
  card.append(el("p","Состав: "+o.items.map(x=>x.name+" × "+x.quantity).join(", ")));
  card.append(el("strong",currency(o.total)));
  if(o.archived)card.append(el("small","Архивный заказ"));
  const edit=el("button","Открыть заказ");
  edit.type="button";
  edit.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("bali:admin:open-order",{detail:{id:o.id}})));
  card.append(edit);
  return card;
}
async function loadHistory(){
  if(!selected||!authorized)return;
  const sequence=++token;
  status("clientHistoryStatus","Загружаем историю...");
  try {
    const q=lastOrder
      ?query(collection(db,"orders"),where("ownerUid","==",selected.uid),startAfter(lastOrder),limit(50))
      :query(collection(db,"orders"),where("ownerUid","==",selected.uid),limit(50));
    const snaps=await getDocs(q);
    const mapped=await Promise.all(snaps.docs.map(async o=>{
      const lines=await getDocs(collection(o.ref,"items"));
      const items=lines.docs.map(i=>i.data());
      return {id:o.id,...o.data(),items,total:items.reduce((sum,x)=>sum+x.unitPrice*x.quantity,0)};
    }));
    if(sequence!==token)return;
    history.push(...mapped);
    lastOrder=snaps.docs.at(-1)||null;
    history.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    const panel=$("clientHistoryList");panel.replaceChildren();
    for(const o of history)panel.append(orderCard(o));
    if(!history.length)panel.append(el("p","У этого гостя ещё нет предзаказов."));
    const hasMore=snaps.size===50;
    if(hasMore){
      const load=el("button","Загрузить ещё заказы","client-more");
      load.type="button";load.addEventListener("click",()=>void loadHistory());panel.append(load);
    }
    status("clientHistoryStatus","Загружено заказов: "+history.length+(hasMore?" (доступны следующие страницы).":"."));
  }catch(e){
    if(sequence===token)status("clientHistoryStatus","Не удалось получить историю: "+(e.code||e.message||"unknown"));
  }
}
function openHistory(client){
  if(!authorized)return;
  selected=client;lastOrder=null;history=[];token++;
  $("clientHistoryCard").hidden=false;
  $("clientHistoryHeading").textContent="История: "+client.name;
  $("clientHistorySummary").textContent=client.phone+" · "+client.email+" · с нами с "+stamp(client.createdAt);
  $("clientHistoryList").replaceChildren();
  $("clientHistoryCard").scrollIntoView({behavior:"smooth",block:"start"});
  void loadHistory();
}
$("clientSearch").addEventListener("input",renderClients);
$("closeClientHistory").addEventListener("click",()=>{$("clientHistoryCard").hidden=true;selected=null;token++;});
onAuthStateChanged(auth,async user=>{
  ++token;
  authorized=false;clients=[];lastClient=null;loadedAll=false;
  selected=null;$("clientHistoryCard").hidden=true;
  $("clientList").textContent="Проверяем права...";
  if(!user||!user.emailVerified)return;
  try {
    const role=await getDoc(doc(db,"admins",user.uid));
    if(auth.currentUser?.uid!==user.uid||!role.exists()||role.data().active!==true){
      status("clientsAdminStatus","Требуются права администратора.");return;
    }
    authorized=true;
    void loadClients();
  }catch(e){status("clientsAdminStatus","Ошибка проверки прав: "+(e.code||"unknown"));}
});
