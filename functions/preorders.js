"use strict";
/* Authoritative, idempotent kitchen preorders for the optional server-only phase.
 * Existing orders stay in orders/{id}/items/{menuId} for the staff dashboard.
 * Requires switching settings/preorderSecurity.backendRequired only AFTER deploy.
 */
const {createHash}=require("node:crypto");
const hash=value=>createHash("sha256").update(value).digest("hex");
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const requestPattern=/^[a-f0-9]{32}$/;
const normalize=(data,fail)=>{
  if(!data||typeof data!=="object"||Array.isArray(data))fail("invalid-argument","Некорректный запрос.");
  const requestId=data.requestId, eventDate=data.event_date,eventId=data.event_id||eventDate;
  const tableNumber=data.table_number,bookingId=data.booking_id,notes=data.notes;
  const editId=data.edit_id||null, raw=data.items;
  if(typeof requestId!=="string"||!requestPattern.test(requestId))fail("invalid-argument","Некорректный идентификатор запроса.");
  if(typeof eventDate!=="string"||!datePattern.test(eventDate)||
     ![eventDate,eventDate+"__2",eventDate+"__3"].includes(eventId))
    fail("invalid-argument","Выберите дату и мероприятие.");
  if(typeof tableNumber!=="string"||tableNumber.length>20||typeof bookingId!=="string"||
     bookingId.length>60||typeof notes!=="string"||notes.length>500||
     (!tableNumber.trim()&&!bookingId.trim()))
    fail("invalid-argument","Укажите столик или ID бронирования.");
  if(editId!==null&&(typeof editId!=="string"||!/^[a-zA-Z0-9_-]{8,120}$/.test(editId)))
    fail("invalid-argument","Некорректный номер редактируемого заказа.");
  if(!Array.isArray(raw)||raw.length<1||raw.length>12)
    fail("invalid-argument","Укажите от 1 до 12 разных блюд.");
  const seen=new Set(),items=[];
  for(const row of raw){
    if(!row||typeof row!=="object"||!Number.isSafeInteger(row.id)||row.id<=0||
      !Number.isInteger(row.quantity)||row.quantity<1||row.quantity>50||seen.has(row.id))
      fail("invalid-argument","Проверьте уникальные блюда и количество от 1 до 50.");
    seen.add(row.id);items.push({id:row.id,quantity:row.quantity});
  }
  items.sort((a,b)=>a.id-b.id);
  return {requestId,eventDate,eventId,tableNumber:tableNumber.trim(),bookingId:bookingId.trim(),
    notes:notes.trim(),editId,items};
};
module.exports=({db,admin,verified,fail})=>async req=>{
  const uid=verified(req),data=normalize(req.data,fail);
  const email=req.auth?.token?.email;
  if(typeof email!=="string"||!email.includes("@"))fail("unauthenticated","Нужен подтверждённый аккаунт.");
  const {requestId,eventDate,eventId,tableNumber,bookingId,notes,editId,items}=data;
  const fingerprint=hash(JSON.stringify({eventDate,eventId,tableNumber,bookingId,notes,editId,items}));
  const receiptRef=db.doc("preorderRequests/"+uid+"/requests/"+requestId);
  const throttleRef=db.doc("preorderRateLimits/"+uid);
  const profileRef=db.doc("users/"+uid),eventRef=db.doc("events/"+eventId);
  const consentRef=db.doc("users/"+uid+"/privacyConsents/2026-10-21");
  const withdrawalRef=db.doc("users/"+uid+"/privacyWithdrawals/2026-10-21");
  const orderRef=editId?db.doc("orders/"+editId):db.collection("orders").doc();
  const counterRef=db.doc("orderCounters/"+eventId);
  const menuRefs=items.map(item=>db.doc("menu/"+item.id));
  return db.runTransaction(async tx=>{
    // All reads are before writes, including existing order lines and catalog.
    const [receipt,throttle,profile,consent,withdrawal,event,existing,...menu]=await Promise.all([
      tx.get(receiptRef),tx.get(throttleRef),tx.get(profileRef),tx.get(consentRef),tx.get(withdrawalRef),
      tx.get(eventRef),editId?tx.get(orderRef):Promise.resolve(null),
      ...menuRefs.map(ref=>tx.get(ref))
    ]);
    if(!profile.exists||profile.data().uid!==uid||profile.data().email!==email||
       typeof profile.data().name!=="string"||profile.data().name.trim().length<2||
       typeof profile.data().phone!=="string"||!(/^\+[1-9]\d{7,14}$/.test(profile.data().phone)))
      fail("failed-precondition","Сначала заполните профиль.");
    if(!consent.exists||consent.data().processing!==true||
       consent.data().international!==true||withdrawal.exists)
      fail("permission-denied","Для предзаказа необходимо действующее согласие на обработку данных.");
    if(receipt.exists){
      const previous=receipt.data();
      if(previous.fingerprint!==fingerprint)fail("already-exists","Идентификатор отправки использован для другого заказа.");
      return {...previous.result,alreadyProcessed:true};
    }
    // Prevent authenticated request flooding. Retries using the same receipt
    // are free; both fresh creation and editing count as mutations.
    const nowMillis=Date.now();
    const previousLimit=throttle.exists?throttle.data():{};
    const startedAt=Number.isFinite(previousLimit.startedAtMillis)?previousLimit.startedAtMillis:0;
    const freshWindow=nowMillis-startedAt>=60000||nowMillis<startedAt;
    const usage=freshWindow?1:(Number(previousLimit.count)||0)+1;
    if(usage>12)fail("resource-exhausted","Слишком много запросов. Повторите через минуту.");
    const eventInfo=event.exists?event.data():null;
    if(!eventInfo||eventInfo.date!==eventDate||eventInfo.preorderEnabled!==true||
       typeof eventInfo.closesAt?.toMillis!=="function"||
       eventInfo.closesAt.toMillis()<=Date.now()||
       typeof eventInfo.title!=="string"||eventInfo.title.length<2||eventInfo.title.length>150)
      fail("failed-precondition","Приём предзаказов на мероприятие закрыт.");
    if(editId&&(!existing.exists||existing.data().ownerUid!==uid||
      existing.data().status!=="pending"||existing.data().archived===true))
      fail("permission-denied","Заказ недоступен для редактирования.");
    const priced=items.map((item,i)=>{
      const doc=menu[i],product=doc.exists?doc.data():null;
      if(!product||product.available!==true||typeof product.name!=="string"||
        !Number.isFinite(product.price)||product.price<0||product.price>20000)
        fail("failed-precondition","Блюдо "+item.id+" недоступно. Обновите корзину.");
      return {id:item.id,name:product.name,unitPrice:product.price,quantity:item.quantity};
    });
    const newTotal=priced.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0);
    if(!Number.isFinite(newTotal))fail("invalid-argument","Некорректная сумма.");
    const oldData=editId?existing.data():null;
    const moved=editId&&(oldData.eventId||oldData.eventDate)!==eventId;
    const counter=!editId||moved?await tx.get(counterRef):null;
    const previousItems=editId?await tx.get(orderRef.collection("items")):null;
    const nextNumber=counter?(counter.exists?counter.data().count:0)+1:
      Number.isInteger(oldData.orderNumber)?oldData.orderNumber:null;
    if(counter&&(!Number.isSafeInteger(nextNumber)||nextNumber<1||nextNumber>999999))
      fail("resource-exhausted","Лимит номеров предзаказов для мероприятия исчерпан.");
    const at=admin.firestore.Timestamp.now();
    tx.set(throttleRef,{startedAtMillis:freshWindow?nowMillis:startedAt,count:usage,updatedAt:at});
    const orderData={eventDate,eventId,eventTitle:eventInfo.title,tableNumber,bookingId,notes,updatedAt:at};
    if(counter)tx.set(counterRef,{date:eventDate,count:nextNumber,lastOrderId:orderRef.id,updatedAt:at});
    if(editId){
      tx.update(orderRef,{...orderData,...(counter?{orderNumber:nextNumber}:{})});
      const retained=new Set(priced.map(item=>String(item.id)));
      for(const old of previousItems.docs)if(!retained.has(old.id))tx.delete(old.ref);
    }else{
      tx.create(orderRef,{...orderData,ownerUid:uid,email,customerName:profile.data().name,
        customerPhone:profile.data().phone,status:"pending",orderNumber:nextNumber,
        createdAt:at});
    }
    for(const item of priced)tx.set(orderRef.collection("items").doc(String(item.id)),item);
    const result={success:true,order_id:orderRef.id,order_number:nextNumber,
      event_title:eventInfo.title,table_number:tableNumber,booking_id:bookingId,total:newTotal};
    tx.create(receiptRef,{fingerprint,result,createdAt:at});
    return result;
  },{maxAttempts:5});
};
