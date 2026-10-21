/**
 * BALI — безопасное оформление предзаказа на бесплатном Firestore Spark.
 * Сумма заказа НЕ принимается от клиента как достоверная:
 * каждая позиция проверяется Rules по цене и наличию в /menu/{id}.
 * Лимит: 12 разных позиций. При включённом backend-only режиме
 * весь заказ проверяется атомарно сервером; до миграции работает старый поток.
 */
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, writeBatch, runTransaction,
  updateDoc, onSnapshot, query, where, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {createOrderSnapshotReader} from "./bali-order-snapshots.js?v=20261021-1";
import {withinOrderRetention} from "./bali-order-retention.js";

const app = getApps().length ? getApp() : initializeApp(window.BALI_FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
let orderListener = null;
let generation = 0;
const MAX_DIFFERENT_ITEMS = 12;
// Safe staged migration: the published admin flag is OFF until the server
// callable is deployed and its production permissions are verified.
let pendingPreorder=null;
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
const requestHash=async payload=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(payload))));
const sessionKey=uid=>"bali-preorder-request-"+uid;
async function submitViaServer(user,{eventDate,eventId,tableNumber,bookingId,notes,lines,editId}){
  const signature=await requestHash({uid:user.uid,eventDate,eventId,tableNumber,bookingId,notes,lines,editId});
  let previous=pendingPreorder?.signature===signature?pendingPreorder:null;
  if(!previous){
    try{
      const stored=JSON.parse(sessionStorage.getItem(sessionKey(user.uid))||"null");
      if(stored?.signature===signature&&/^[a-f0-9]{32}$/.test(stored.requestId))previous=stored;
    }catch(_error){}
  }
  if(!previous)previous={signature,requestId:hex(crypto.getRandomValues(new Uint8Array(16)))};
  pendingPreorder=previous;
  try{sessionStorage.setItem(sessionKey(user.uid),JSON.stringify(previous));}catch(_error){}
  // Loading Functions only at actual checkout keeps the public menu fast.
  const {getFunctions,httpsCallable}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js");
  const send=httpsCallable(getFunctions(app,"europe-west1"),"submitBaliPreorder");
  const reply=await send({
    requestId:previous.requestId,event_date:eventDate,event_id:eventId,
    table_number:tableNumber,booking_id:bookingId,notes,items:lines,
    ...(editId?{edit_id:editId}:{})
  });
  if(pendingPreorder?.requestId===previous.requestId)pendingPreorder=null;
  try{
    const stored=JSON.parse(sessionStorage.getItem(sessionKey(user.uid))||"null");
    if(stored?.requestId===previous.requestId)sessionStorage.removeItem(sessionKey(user.uid));
  }catch(_error){}
  return reply.data;
}
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, {detail}));

function signedUser() {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !user.email) throw new Error("Войдите через Google, чтобы оформить предзаказ.");
  return user;
}
function dateOpen(event) {
  const closesAt = event?.closesAt?.toDate?.();
  return event?.preorderEnabled === true && closesAt instanceof Date && closesAt > new Date();
}
function normalizeItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_DIFFERENT_ITEMS) {
    throw new Error("В одном заказе должно быть от 1 до 12 разных позиций.");
  }
  const seen = new Set();
  return items.map(item => {
    const id = Number(item.id);
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id) ||
        !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new Error("Проверьте количество блюд: от 1 до 50 каждого вида.");
    }
    seen.add(id);
    return {id, quantity};
  });
}
async function menuSnapshot(lines) {
  const products = await Promise.all(lines.map(line => getDoc(doc(db,"menu",String(line.id)))));
  return products.map((snapshot,i)=>{
    const data = snapshot.data();
    if (!snapshot.exists() || data.available !== true || typeof data.name !== "string" ||
        !Number.isFinite(data.price) || data.price < 0) {
      throw new Error("Позиция недоступна: " + lines[i].id + ". Обновите корзину.");
    }
    return { id: lines[i].id, quantity: lines[i].quantity,
      name: data.name, unitPrice: data.price };
  });
}
function errorText(error) {
  if (error?.code === "permission-denied") {
    return "Не удалось отправить предзаказ. Проверьте дату мероприятия и обновите корзину.";
  }
  if (error?.code === "unavailable") return "Не удалось связаться с клубом. Повторите попытку.";
  return error?.code ? "Не удалось выполнить действие с предзаказом. Повторите попытку позже." : error?.message || "Не удалось выполнить действие с предзаказом.";
}
async function save(payload, editId = null) {
  const user = signedUser();
  const profile = window.BaliAuth?.getProfile?.();
  if (!profile || profile.uid !== user.uid) throw new Error("Заполните личный профиль перед заказом.");
  const eventDate = String(payload.event_date || "");
  const eventId = String(payload.event_id || eventDate);
  const tableNumber = String(payload.table_number || "").trim();
  const bookingId = String(payload.booking_id || "").trim();
  const notes = String(payload.notes || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
      ![eventDate,eventDate+"__2",eventDate+"__3"].includes(eventId) ||
      tableNumber.length > 20 || bookingId.length > 60 ||
      (!tableNumber && !bookingId) || notes.length > 500) {
    throw new Error("Выберите мероприятие и укажите столик или ID бронирования.");
  }
  const lines = normalizeItems(payload.items);
  // Old production rules may not yet expose this new settings document.
  // A denied read in that old configuration must not break legacy checkout;
  // once the new rules are live, backendRequired is always readable.
  let switchSnapshot=null;
  try{switchSnapshot=await getDoc(doc(db,"settings","preorderSecurity"));}
  catch(error){if(error?.code!=="permission-denied")throw error;}
  if(switchSnapshot?.exists()&&switchSnapshot.data()?.backendRequired===true){
    // No legacy fallback when the backend is required: bypassing the callable
    // would silently remove the global basket limit and request-id safety.
    return submitViaServer(user,{
      eventDate,eventId,tableNumber,bookingId,notes,lines,editId
    });
  }
  // Legacy direct Firestore checkout remains until the admin enables the
  // verified server-only switch. Existing live orders continue to work.
  const eventRef = doc(db, "events", eventId);
  const eventSnap = await getDoc(eventRef);
  if (!eventSnap.exists() || !dateOpen(eventSnap.data()) ||
      eventSnap.data().date !== eventDate) {
    throw new Error("Приём предзаказов на это мероприятие закрыт. Выберите другое.");
  }
  // The title comes from Firestore, never from a browser-controlled field.
  const eventTitle = eventSnap.data().title;
  if(typeof eventTitle !== "string" || eventTitle.length < 2 || eventTitle.length > 150)
    throw new Error("У выбранного мероприятия не указано корректное название.");
  const priced = await menuSnapshot(lines);
  let orderRef;
  let orderNumber;
  if (editId) {
    orderRef=doc(db,"orders",editId);
    const old = await getDoc(orderRef);
    if (!old.exists() || old.data().ownerUid !== user.uid || old.data().status !== "pending") {
      throw new Error("Этот заказ уже подтверждён либо недоступен для редактирования.");
    }
    const oldItems=await getDocs(collection(orderRef,"items"));
    const retained=new Set(priced.map(line=>String(line.id)));
    const eventChanged=(old.data().eventId||old.data().eventDate)!==eventId;
    if (eventChanged) {
      // Любой переход к другому мероприятию, даже в ту же дату, получает
      // новый порядковый номер внутри конкретного мероприятия.
      const counterRef=doc(db,"orderCounters",eventId);
      orderNumber=await runTransaction(db,async tx=>{
        const latest=await tx.get(orderRef);
        const counter=await tx.get(counterRef);
        if(!latest.exists() || latest.data().ownerUid!==user.uid ||
           latest.data().status!=="pending" ||
           (latest.data().eventId||latest.data().eventDate)===eventId)
          throw new Error("Данные заказа изменились. Откройте его повторно.");
        const next=(counter.exists()?counter.data().count:0)+1;
        if(!Number.isSafeInteger(next)||next>999999)throw new Error("Счётчик заказов переполнен.");
        tx.set(counterRef,{date:eventDate,count:next,lastOrderId:orderRef.id,updatedAt:serverTimestamp()});
        tx.update(orderRef,{eventDate,eventId,eventTitle,orderNumber:next,tableNumber,bookingId,notes,updatedAt:serverTimestamp()});
        oldItems.docs.forEach(row=>{if(!retained.has(row.id))tx.delete(row.ref);});
        priced.forEach(line=>tx.set(doc(orderRef,"items",String(line.id)),line));
        return next;
      });
    } else {
      orderNumber=old.data().orderNumber||null;
      const batch=writeBatch(db);
      oldItems.docs.forEach(row=>{if(!retained.has(row.id))batch.delete(row.ref);});
      batch.update(orderRef,{eventId,eventTitle,tableNumber,bookingId,notes,updatedAt:serverTimestamp()});
      priced.forEach(line=>batch.set(doc(orderRef,"items",String(line.id)),line));
      await batch.commit();
    }
  } else {
    orderRef=doc(collection(db,"orders"));
    const counterRef=doc(db,"orderCounters",eventId);
    // Атомарно выдаём номер в пределах мероприятия, а не всей даты.
    orderNumber=await runTransaction(db,async tx=>{
      const previous=await tx.get(counterRef);
      const next=(previous.exists()?previous.data().count:0)+1;
      if(!Number.isSafeInteger(next)||next>999999)throw new Error("Счётчик заказов переполнен.");
      tx.set(counterRef,{date:eventDate,count:next,lastOrderId:orderRef.id,updatedAt:serverTimestamp()});
      tx.set(orderRef,{
        ownerUid:user.uid,email:user.email,
        customerName:profile.name,customerPhone:profile.phone,
        eventDate,eventId,eventTitle,orderNumber:next,tableNumber,bookingId,notes,
        status:"pending",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      priced.forEach(line=>tx.set(doc(orderRef,"items",String(line.id)),line));
      return next;
    });
  }
  return {success:true,order_id:orderRef.id,order_number:orderNumber,
    event_title:eventTitle,table_number:tableNumber,booking_id:bookingId,
    total:priced.reduce((sum,x)=>sum+x.unitPrice*x.quantity,0)};
}
async function getOrderWithItems(id) {
  const user = signedUser();
  const ref=doc(db,"orders",id);
  const snapshot=await getDoc(ref);
  if(!snapshot.exists() || snapshot.data().ownerUid !== user.uid || !withinOrderRetention(snapshot.data())) throw new Error("Заказ не найден.");
  const lineDocs=await getDocs(collection(ref,"items"));
  return {id:snapshot.id,...snapshot.data(),items:lineDocs.docs.map(x=>x.data())};
}
async function cancel(id) {
  signedUser();
  await updateDoc(doc(db,"orders",id),{status:"cancelled",updatedAt:serverTimestamp()});
}
function watchUserOrders(user) {
  if(orderListener){orderListener();orderListener=null;}
  const current=++generation;
  let revision=0;
  const readOrders=createOrderSnapshotReader(async row=>{
    const lines=await getDocs(collection(row.ref,"items"));
    return lines.docs.map(line=>line.data());
  });
  emit("bali:orders",{orders:[],ownerUid:user?.uid||null,loading:!!user});
  if(!user) return;
  orderListener=onSnapshot(
    query(collection(db,"orders"),where("ownerUid","==",user.uid),limit(40)),
    async snapshots=>{
      const run=++revision;
      try{
        const orders=(await readOrders(snapshots)).filter(withinOrderRetention);
        if(current!==generation||run!==revision) return;
        orders.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        emit("bali:orders",{orders,ownerUid:user.uid});
      }catch(error){if(current===generation&&run===revision)emit("bali:orders-error",{message:errorText(error)});}
    },
    error=>{if(current===generation){revision++;emit("bali:orders-error",{message:errorText(error)});}}
  );
}
onAuthStateChanged(auth,watchUserOrders);
window.BaliOrders={save,getOrderWithItems,cancel,errorText,maxItems:MAX_DIFFERENT_ITEMS};
emit("bali:orders-ready",{});
