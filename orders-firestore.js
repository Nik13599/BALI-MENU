/**
 * BALI — безопасное оформление предзаказа на бесплатном Firestore Spark.
 * Сумма заказа НЕ принимается от клиента как достоверная:
 * каждая позиция проверяется Rules по цене и наличию в /menu/{id}.
 * Лимит: 12 разных позиций в одном заказе (из-за лимитов Rules для batch).
 */
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, writeBatch,
  updateDoc, onSnapshot, query, where, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = getApps().length ? getApp() : initializeApp(window.BALI_FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
let orderListener = null;
let generation = 0;
const MAX_DIFFERENT_ITEMS = 12;
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
    return "Firestore запретил запись. Проверьте опубликованные правила, дату мероприятия и актуальные цены.";
  }
  if (error?.code === "unavailable") return "Firestore сейчас недоступен. Повторите попытку.";
  return error?.message || "Неизвестная ошибка";
}
async function save(payload, editId = null) {
  const user = signedUser();
  const profile = window.BaliAuth?.getProfile?.();
  if (!profile || profile.uid !== user.uid) throw new Error("Заполните личный профиль перед заказом.");
  const eventDate = String(payload.event_date || "");
  const tableNumber = String(payload.table_number || "").trim();
  const bookingId = String(payload.booking_id || "").trim();
  const notes = String(payload.notes || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
      tableNumber.length > 20 || bookingId.length > 60 ||
      (!tableNumber && !bookingId) || notes.length > 500) {
    throw new Error("Выберите мероприятие и укажите столик или ID бронирования.");
  }
  const lines = normalizeItems(payload.items);
  // Проверка на клиенте улучшает UX; Firestore Rules повторяет обязательные проверки.
  const eventRef = doc(db, "events", eventDate);
  const eventSnap = await getDoc(eventRef);
  if (!eventSnap.exists() || !dateOpen(eventSnap.data())) {
    throw new Error("Приём предзаказов на эту дату закрыт. Выберите другое мероприятие.");
  }
  const priced = await menuSnapshot(lines);
  const batch = writeBatch(db);
  let orderRef;
  if (editId) {
    orderRef = doc(db, "orders", editId);
    const old = await getDoc(orderRef);
    if (!old.exists() || old.data().ownerUid !== user.uid || old.data().status !== "pending") {
      throw new Error("Этот заказ уже подтверждён либо недоступен для редактирования.");
    }
    const oldItems = await getDocs(collection(orderRef,"items"));
    const retained = new Set(priced.map(line=>String(line.id)));
    oldItems.docs.forEach(snapshot => {
      if (!retained.has(snapshot.id)) batch.delete(snapshot.ref);
    });
    batch.update(orderRef, {
      eventDate, tableNumber, bookingId, notes, updatedAt: serverTimestamp()
    });
  } else {
    orderRef = doc(collection(db,"orders"));
    batch.set(orderRef, {
      ownerUid: user.uid,
      email: user.email,
      customerName: profile.name,
      customerPhone: profile.phone,
      eventDate, tableNumber, bookingId, notes,
      status: "pending",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  }
  priced.forEach(line=>batch.set(doc(orderRef,"items",String(line.id)),line));
  // Либо всё сохраняется одним атомарным пакетом, либо ни один документ.
  await batch.commit();
  return {success: true, order_id:orderRef.id, total: priced.reduce((s,x)=>s+x.unitPrice*x.quantity,0)};
}
async function getOrderWithItems(id) {
  const user = signedUser();
  const ref=doc(db,"orders",id);
  const snapshot=await getDoc(ref);
  if(!snapshot.exists() || snapshot.data().ownerUid !== user.uid) throw new Error("Заказ не найден.");
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
  if(!user) {emit("bali:orders",{orders:[]}); return;}
  orderListener=onSnapshot(
    query(collection(db,"orders"),where("ownerUid","==",user.uid),limit(40)),
    async snapshots=>{
      try{
        const orders=await Promise.all(snapshots.docs.map(async snap=>{
          const lines=await getDocs(collection(snap.ref,"items"));
          const items=lines.docs.map(doc=>doc.data());
          return {id:snap.id,...snap.data(),items,
            total:items.reduce((a,b)=>a+b.unitPrice*b.quantity,0)};
        }));
        if(current!==generation) return;
        orders.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        emit("bali:orders",{orders});
      }catch(error){if(current===generation)emit("bali:orders-error",{message:errorText(error)});}
    },
    error=>{if(current===generation)emit("bali:orders-error",{message:errorText(error)});}
  );
}
onAuthStateChanged(auth,watchUserOrders);
window.BaliOrders={save,getOrderWithItems,cancel,errorText,maxItems:MAX_DIFFERENT_ITEMS};
emit("bali:orders-ready",{});
