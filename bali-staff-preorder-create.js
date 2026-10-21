/* Shared BALI staff order creation: browser Firebase SDK passed explicitly so
 * the exact production transaction can be covered by the Firestore emulator. */
export async function createBaliStaffPreorder({db,uid,api,eventDate,eventId,eventTitle,
  customerName,customerPhone,tableNumber,bookingId,notes,status,items,
  ownerUid="",ownerEmail=""}){
  const {doc,collection,runTransaction,serverTimestamp}=api;
  if(!uid)throw new Error("Необходимо войти в аккаунт сотрудника.");
  if(!eventId||!eventDate||!eventTitle)throw new Error("Выберите дату и мероприятие.");
  if(!Array.isArray(items)||!items.length||items.length>12)throw new Error("Добавьте от 1 до 12 блюд.");
  if(!["pending","confirmed","cancelled"].includes(status))
    throw new Error("Выбран недопустимый статус заказа.");
  const ref=doc(collection(db,"orders"));
  const counterRef=doc(db,"orderCounters",eventId);
  const eventRef=doc(db,"events",eventId);
  const accountRef=ownerUid?doc(db,"users",ownerUid):null;
  const menuRefs=items.map(item=>doc(db,"menu",String(item.id)));
  const number=await runTransaction(db,async tx=>{
    // All reads must occur before any writes in the same transaction.
    const snapshots=await Promise.all([tx.get(eventRef),tx.get(counterRef),
      ...menuRefs.map(menu=>tx.get(menu)),...(accountRef?[tx.get(accountRef)]:[])]);
    const latestEvent=snapshots[0],counter=snapshots[1];
    if(!latestEvent.exists()||latestEvent.data().date!==eventDate||
      latestEvent.data().title!==eventTitle)
      throw new Error("Мероприятие изменилось. Обновите страницу и повторите создание.");
    const menuRows=snapshots.slice(2,2+menuRefs.length);
    const rows=items.map((item,i)=>{
      const row=menuRows[i];
      if(!row.exists()||row.data().available!==true||
        !Number.isFinite(row.data().price)||row.data().price<0)
        throw new Error("Блюдо недоступно: "+item.name+". Обновите меню заказа.");
      if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>50)
        throw new Error("Недопустимое количество блюда: "+item.name+".");
      return {id:item.id,name:row.data().name,unitPrice:row.data().price,quantity:item.quantity};
    });
    if(accountRef){
      const account=snapshots.at(-1);
      if(!account.exists()||account.data().email!==ownerEmail)
        throw new Error("Аккаунт гостя изменился. Уберите email или обновите данные.");
    }
    const next=(counter.exists()?counter.data().count:0)+1;
    if(!Number.isSafeInteger(next)||next>999999)throw new Error("Достигнут предел номеров заказов.");
    tx.set(counterRef,{date:eventDate,count:next,lastOrderId:ref.id,updatedAt:serverTimestamp()});
    tx.set(ref,{ownerUid,email:ownerEmail,source:"staff",createdByUid:uid,
      customerName,customerPhone,eventDate,eventId,eventTitle,
      orderNumber:next,tableNumber,bookingId,notes,status,
      archived:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    for(const row of rows)tx.set(doc(ref,"items",String(row.id)),row);
    return next;
  });
  return {id:ref.id,orderNumber:number};
}
