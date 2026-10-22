/**
 * BALI MENU v3 · Google Apps Script backend
 * PRIVATE spreadsheet + Firebase Google sign-in, no paid Firebase Functions.
 * Deploy as Web App: execute as owner, access "Anyone".
 * Calls must go through the Cloudflare Worker bridge with a private shared key.
 * Never publish the spreadsheet or share it with site visitors.
 */
const BALI_BOOK = "1QxY-WgMwTT_5F3tdHxZICVbdUo4XOvgqI_7endBhOe0";
const BALI_FB_KEY = "AIzaSyAiGyt5O6x2V0pBNIJ2pOlXxXBgaYqzzUA"; // Firebase web key (public)
const BALI_TABS={orders:"Заказы",items:"Позиции заказов",menu:"Меню",events:"Мероприятия",
  roles:"Администраторы",audit:"История изменений",guests:"Гости",
  cards:"BALI ID",privileges:"Привилегии",bonuses:"Бонусы",bonusHistory:"История бонусов",
  coins:"BALI COIN",coinHistory:"История BALI COIN",consents:"Согласия",plans:"Планы гостя"};
const BALI_NOW=()=>new Date().toISOString();
const BALI_TEXT=(v,n=120)=>String(v==null?"":v).trim().slice(0,n);
const BALI_FAIL=(code,message)=>{throw {code,message};};
const BALI_JSON=value=>ContentService.createTextOutput(JSON.stringify(value))
  .setMimeType(ContentService.MimeType.JSON);
const BALI_SHEET=name=>SpreadsheetApp.openById(BALI_BOOK).getSheetByName(BALI_TABS[name]);
const BALI_ROWS=name=>{const sh=BALI_SHEET(name),last=sh.getLastRow();
  return last<2?[]:sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();};
const BALI_TRUE=v=>v===true||v===1||String(v).toLowerCase()==="true"||String(v).toLowerCase()==="да";
const BALI_ISO=v=>v instanceof Date?v.toISOString():String(v||"");
const BALI_DATE=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""));
function baliLock(fn){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))BALI_FAIL("busy","Система занята. Повторите запрос.");
  try{return fn();}finally{lock.releaseLock();}
}
function baliVerifyFirebase(token){
  if(typeof token!=="string"||token.length<50||token.length>8000)BALI_FAIL("unauthenticated","Необходимо войти через Google.");
  const url="https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(BALI_FB_KEY);
  const response=UrlFetchApp.fetch(url,{method:"post",contentType:"application/json",
    payload:JSON.stringify({idToken:token}),muteHttpExceptions:true});
  if(response.getResponseCode()!==200)BALI_FAIL("unauthenticated","Сессия истекла. Войдите повторно.");
  let data;
  try{data=JSON.parse(response.getContentText());}catch(e){BALI_FAIL("auth-error","Проверка входа недоступна.");}
  const u=data.users&&data.users[0];
  if(!u||!u.localId||u.emailVerified!==true||u.disabled===true)
    BALI_FAIL("unauthenticated","Необходим подтверждённый аккаунт.");
  return {uid:String(u.localId),email:String(u.email||"").toLowerCase(),name:BALI_TEXT(u.displayName,80)};
}
function baliRole(user){
  // A nonempty UID is always checked. Email-only entries permit approved Google sign-in.
  const rows=BALI_ROWS("roles");
  const found=rows.find(r=>
    (String(r[0]||"")===user.uid||(r[0]===""&&String(r[1]||"").toLowerCase()===user.email))&&
    BALI_TRUE(r[3]));
  return found&&["admin","staff"].includes(String(found[2]))?String(found[2]):"guest";
}
function baliStaff(user,adminOnly){
  const role=baliRole(user);
  if(role!=="admin"&&(adminOnly||role!=="staff"))BALI_FAIL("permission-denied","Недостаточно прав.");
  return role;
}
function baliGuestProfile(user){
  const r=BALI_ROWS("guests").find(x=>String(x[0])===user.uid);
  return r?{name:String(r[2]||""),phone:String(r[3]||""),email:user.email,uid:user.uid}
    :{name:user.name,phone:"",email:user.email,uid:user.uid};
}
function baliSaveProfile(user,input){
  const name=BALI_TEXT(input.name,80),phone=BALI_TEXT(input.phone,22);
  if(name.length<2||!/^\+[1-9][0-9]{7,14}$/.test(phone))
    BALI_FAIL("invalid-argument","Введите имя и телефон в международном формате.");
  return baliLock(()=>{
    const sh=BALI_SHEET("guests"),rows=BALI_ROWS("guests"),idx=rows.findIndex(r=>String(r[0])===user.uid);
    const now=BALI_NOW(),created=idx<0?now:rows[idx][4],consent=idx<0?"":rows[idx][6];
    const row=[user.uid,user.email,name,phone,created,now,consent,idx<0?"":rows[idx][7]];
    if(idx<0)sh.appendRow(row);else sh.getRange(idx+2,1,1,row.length).setValues([row]);
    return {name,phone,email:user.email,uid:user.uid};
  });
}
function baliMenu(){return BALI_ROWS("menu").filter(r=>BALI_TRUE(r[6])).map(r=>
  ({id:String(r[0]),category:String(r[1]),name:String(r[2]),price:Number(r[4])||0,
    imageUrl:String(r[5]||"")}));}
function baliEvents(){return BALI_ROWS("events").map(r=>
  ({id:String(r[0]||""),date:BALI_ISO(r[1]).slice(0,10),title:String(r[2]||""),
    preorderEnabled:BALI_TRUE(r[3]),closesAt:BALI_ISO(r[4]),bannerUrl:String(r[5]||"")}));}
function baliOrder(row){
  return {id:String(row[0]),eventDate:String(row[1]),eventId:String(row[2]),
    eventTitle:String(row[3]),createdAt:BALI_ISO(row[4]),updatedAt:BALI_ISO(row[5]),
    ownerUid:String(row[6]),customerName:String(row[7]),email:String(row[8]),
    customerPhone:String(row[9]),tableNumber:String(row[10]),bookingId:String(row[11]),
    notes:String(row[12]),status:String(row[13]),total:Number(row[14])||0,
    orderNumber:Number(row[15])||0,archived:BALI_TRUE(row[16]),expiresAt:BALI_ISO(row[17])};
}
function baliItems(){return BALI_ROWS("items").map(r=>({orderId:String(r[0]),id:String(r[1]),name:String(r[2]),
  quantity:Number(r[3]),unitPrice:Number(r[4]),total:Number(r[5])}));}
function baliOrdersFor(user,all,date,eventId){
  const orders=BALI_ROWS("orders").map(baliOrder).filter(o=>
    (all||o.ownerUid===user.uid)&&(!date||o.eventDate===date)&&(!eventId||o.eventId===eventId)
    &&(!o.expiresAt||new Date(o.expiresAt).getTime()>Date.now()));
  const ownIds=new Set(orders.map(x=>x.id)),items=baliItems().filter(x=>ownIds.has(x.orderId));
  return orders.map(o=>({...o,items:items.filter(item=>item.orderId===o.id)}));
}
function baliOrderCreate(user,data){
  const date=BALI_TEXT(data.eventDate,10),eventId=BALI_TEXT(data.eventId,80);
  const table=BALI_TEXT(data.tableNumber,20),booking=BALI_TEXT(data.bookingId,60);
  const name=BALI_TEXT(data.customerName,100),phone=BALI_TEXT(data.customerPhone,22);
  const notes=BALI_TEXT(data.notes,500),reqId=BALI_TEXT(data.requestId,80);
  if(!BALI_DATE(date)||!eventId||(!table&&!booking)||name.length<2||
    !/^\+[1-9][0-9]{7,14}$/.test(phone)||!/^[-_a-zA-Z0-9]{12,80}$/.test(reqId))
    BALI_FAIL("invalid-argument","Заполните дату, имя, телефон, столик или ID брони.");
  if(!Array.isArray(data.items)||data.items.length<1||data.items.length>35)
    BALI_FAIL("invalid-argument","Корзина пуста или содержит слишком много позиций.");
  return baliLock(()=>{
    const id="o_"+Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,user.uid+":"+reqId)).replace(/=+$/,"").slice(0,36);
    const existing=BALI_ROWS("orders").find(r=>String(r[0])===id);
    if(existing)return {...baliOrder(existing),alreadyCreated:true};
    const event=baliEvents().find(e=>e.id===eventId&&e.date===date&&e.preorderEnabled);
    if(!event||!event.closesAt||!Number.isFinite(Date.parse(event.closesAt))||
      Date.parse(event.closesAt)<=Date.now())
      BALI_FAIL("failed-precondition","Приём предзаказов на это мероприятие закрыт.");
    const menu=new Map(baliMenu().map(x=>[x.id,x])),dedup=new Set();
    const lines=data.items.map(it=>{
      const item=menu.get(String(it.id)),qty=Number(it.quantity);
      if(!item||!Number.isInteger(qty)||qty<1||qty>50||dedup.has(item.id)||item.price<0)
        BALI_FAIL("invalid-argument","Недоступное блюдо или неверное количество.");
      dedup.add(item.id);return {...item,quantity:qty,total:Math.round(item.price*qty*100)/100};
    });
    const orders=BALI_ROWS("orders");
    const orderNumber=Math.max(0,...orders.filter(r=>String(r[2])===eventId)
      .map(r=>Number(r[15])||0))+1;
    const total=Math.round(lines.reduce((acc,x)=>acc+x.total,0)*100)/100;
    const now=BALI_NOW(),expires=new Date(Date.parse(event.closesAt)+30*86400000).toISOString();
    // Write lines first; orphan lines are not exposed if the final order append fails.
    const sheetItems=BALI_SHEET("items");
    const rows=lines.map(x=>[id,x.id,x.name,x.quantity,x.price,x.total,now,eventId]);
    sheetItems.getRange(sheetItems.getLastRow()+1,1,rows.length,8).setValues(rows);
    BALI_SHEET("orders").appendRow([id,date,eventId,event.title,now,now,user.uid,name,user.email,
      phone,table,booking,notes,"pending",total,orderNumber,false,expires]);
    BALI_SHEET("audit").appendRow([now,id,user.uid,"create",1,"new-order"]);
    return {id,orderNumber,eventId,eventDate:date,status:"pending",total};
  });
}
function baliGuestCancelOrder(user,data){
  const id=BALI_TEXT(data.id,80);
  return baliLock(()=>{
    const sh=BALI_SHEET("orders"),rows=BALI_ROWS("orders");
    const idx=rows.findIndex(r=>String(r[0])===id&&String(r[6])===user.uid);
    if(idx<0)BALI_FAIL("not-found","Предзаказ не найден.");
    if(String(rows[idx][13])!=="pending")BALI_FAIL("failed-precondition","Этот предзаказ уже обработан.");
    sh.getRange(idx+2,14).setValue("cancelled");
    sh.getRange(idx+2,6).setValue(BALI_NOW());
    BALI_SHEET("audit").appendRow([BALI_NOW(),id,user.uid,"guest-cancel",2,"cancelled"]);
    return {id,status:"cancelled"};
  });
}
function baliGuestEditOrder(user,data){
  const id=BALI_TEXT(data.id,80),table=BALI_TEXT(data.tableNumber,20),
    booking=BALI_TEXT(data.bookingId,60),notes=BALI_TEXT(data.notes,500);
  if(!id||(!table&&!booking)||!Array.isArray(data.items)||!data.items.length||data.items.length>12)
    BALI_FAIL("invalid-argument","Неверные данные предзаказа.");
  return baliLock(()=>{
    const sh=BALI_SHEET("orders"),rows=BALI_ROWS("orders");
    const idx=rows.findIndex(r=>String(r[0])===id&&String(r[6])===user.uid);
    if(idx<0)BALI_FAIL("not-found","Предзаказ не найден.");
    const original=baliOrder(rows[idx]);
    if(original.status!=="pending")BALI_FAIL("failed-precondition","Можно менять только ожидающий предзаказ.");
    const event=baliEvents().find(e=>e.id===original.eventId&&e.preorderEnabled&&
      Date.parse(e.closesAt)>Date.now());
    if(!event)BALI_FAIL("failed-precondition","Приём предзаказов на это мероприятие закрыт.");
    const menu=new Map(baliMenu().map(x=>[x.id,x])),seen=new Set();
    const lines=data.items.map(it=>{
      const item=menu.get(String(it.id)),qty=Number(it.quantity);
      if(!item||!Number.isInteger(qty)||qty<1||qty>50||seen.has(item.id))
        BALI_FAIL("invalid-argument","Проверьте состав заказа.");
      seen.add(item.id);return {...item,quantity:qty,total:Math.round(item.price*qty*100)/100};
    });
    const total=Math.round(lines.reduce((sum,x)=>sum+x.total,0)*100)/100,now=BALI_NOW();
    const oldItems=BALI_ROWS("items").map((r,i)=>({r,i})).filter(x=>String(x.r[0])===id);
    const itemSheet=BALI_SHEET("items");
    const newRows=lines.map(x=>[id,x.id,x.name,x.quantity,x.price,x.total,now,original.eventId]);
    itemSheet.getRange(itemSheet.getLastRow()+1,1,newRows.length,8).setValues(newRows);
    for(const x of oldItems)itemSheet.getRange(x.i+2,1,1,8).setValues([Array(8).fill("")]);
    sh.getRange(idx+2,6).setValue(now);
    sh.getRange(idx+2,11,1,5).setValues([[table,booking,notes,"pending",total]]);
    BALI_SHEET("audit").appendRow([now,id,user.uid,"guest-edit",2,"updated"]);
    return {id,orderNumber:original.orderNumber,total,status:"pending"};
  });
}
function baliStatus(user,data){
  const id=BALI_TEXT(data.id,80),status=BALI_TEXT(data.status,20);
  if(!["pending","confirmed","cancelled"].includes(status))BALI_FAIL("invalid-argument","Неверный статус.");
  return baliLock(()=>{
    const sheet=BALI_SHEET("orders"),orders=BALI_ROWS("orders"),index=orders.findIndex(x=>String(x[0])===id);
    if(index<0)BALI_FAIL("not-found","Заказ не найден.");
    sheet.getRange(index+2,14).setValue(status);
    sheet.getRange(index+2,6).setValue(BALI_NOW());
    BALI_SHEET("audit").appendRow([BALI_NOW(),id,user.uid,"status",2,status]);
    return {id,status};
  });
}
function baliReport(orders,kind,includeCancelled){
  const filtered=kind==="dishes"&&!includeCancelled
    ?orders.filter(o=>o.status!=="cancelled"&&!o.archived):orders;
  if(kind!=="dishes")return {orders:filtered,count:filtered.length};
  const agg=new Map();
  filtered.forEach(o=>o.items.forEach(i=>{
    const prev=agg.get(i.id)||{id:i.id,name:i.name,quantity:0,total:0};
    prev.quantity+=i.quantity;prev.total+=i.total;agg.set(i.id,prev);
  }));
  return {dishes:[...agg.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru")),
    count:filtered.length,portions:[...agg.values()].reduce((x,y)=>x+y.quantity,0),
    amount:Math.round([...agg.values()].reduce((x,y)=>x+y.total,0)*100)/100};
}
function baliManageStaff(user,input){
  const action=input.operation,email=BALI_TEXT(input.email,160).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))BALI_FAIL("invalid-argument","Укажите почту Google сотрудника.");
  return baliLock(()=>{
    const sh=BALI_SHEET("roles"),rows=BALI_ROWS("roles");
    const idx=rows.findIndex(r=>String(r[1]||"").toLowerCase()===email);
    if(action==="disable"){
      if(idx<0)BALI_FAIL("not-found","Сотрудник не найден.");
      if(String(rows[idx][2])==="admin")BALI_FAIL("permission-denied","Главного администратора нельзя отключить здесь.");
      sh.getRange(idx+2,4).setValue(false);
    }else if(action==="grant"){
      if(idx>=0&&String(rows[idx][2])==="admin")BALI_FAIL("permission-denied","Роль администратора нельзя перезаписать.");
      const row=[idx<0?"":rows[idx][0],email,"staff",true,BALI_TEXT(input.name,80)];
      if(idx<0)sh.appendRow(row);else sh.getRange(idx+2,1,1,5).setValues([row]);
    }else BALI_FAIL("invalid-argument","Неизвестное действие.");
    BALI_SHEET("audit").appendRow([BALI_NOW(),"",user.uid,"staff-"+action,1,email]);
    return {ok:true,email};
  });
}

/* ── BALI ID, individual privileges, bonus balances and BALI COIN ledger ── */
const BALI_TIERS=["Member","Silver","Gold","Platinum","Black","Private","ResidentDJ"];
const BALI_BONUS_KINDS=["entry","shot","cocktail","hookah"];
const BALI_CONSENT_VERSION="2026-10-21";
function baliConsentState(user,kind){
  return BALI_ROWS("consents").some(r=>String(r[0])===user.uid&&String(r[1])===kind&&
    BALI_TRUE(r[3])&&String(r[2])===(kind==="privacy"?BALI_CONSENT_VERSION:"1"));
}
function baliWithdrawn(user){
  return BALI_ROWS("consents").some(r=>String(r[0])===user.uid&&String(r[1])==="privacy-withdrawal"&&BALI_TRUE(r[3]));
}
function baliConsent(user,data){
  const type=String(data.type||"");
  if(!["privacy","bali-id:privilege","privacy-withdrawal"].includes(type))
    BALI_FAIL("invalid-argument","Неизвестный тип согласия.");
  if(data.accepted!==true)BALI_FAIL("invalid-argument","Необходимо явное подтверждение.");
  return baliLock(()=>{
    const rows=BALI_ROWS("consents");
    if(rows.some(r=>String(r[0])===user.uid&&String(r[1])===type&&BALI_TRUE(r[3])))
      return {accepted:true,type,alreadyAccepted:true};
    if(type!=="privacy-withdrawal"&&baliWithdrawn(user))
      BALI_FAIL("permission-denied","Согласие отозвано. Обратитесь в клуб.");
    BALI_SHEET("consents").appendRow([user.uid,type,type==="privacy"?BALI_CONSENT_VERSION:"1",true,BALI_NOW(),"bali-online"]);
    return {accepted:true,type};
  });
}
function baliCardData(user){
  const card=BALI_ROWS("cards").find(r=>String(r[0])===user.uid);
  const record=BALI_ROWS("privileges").find(r=>String(r[0])===user.uid);
  const tier=BALI_TIERS.includes(String(record?.[1]))?String(record[1]):"Member";
  let benefits=[];
  try{const value=JSON.parse(String(record?.[2]||"[]"));if(Array.isArray(value))benefits=value.filter(x=>typeof x==="string").slice(0,5);}
  catch(_){}
  const coins=BALI_ROWS("coins").find(r=>String(r[0])===user.uid);
  const journal=BALI_ROWS("coinHistory").filter(r=>String(r[2])===user.uid);
  // Last confirmed journal entry is authoritative if a cached balance write was interrupted.
  const last=journal.length?journal[journal.length-1]:null;
  const balance=last?Number(last[5]):coins===undefined?null:Number(coins[1]);
  const bonuses=BALI_ROWS("bonuses").filter(r=>String(r[1])===user.uid)
    .map(r=>({id:String(r[0]),kind:String(r[2]),originalCount:Number(r[3])||0,
      remaining:Number(r[4])||0,unlimited:BALI_TRUE(r[5]),transferable:BALI_TRUE(r[6]),
      expiresAt:BALI_ISO(r[7]),source:String(r[8]||""),createdAt:BALI_ISO(r[9]),
      note:String(r[11]||"")}))
    .filter(x=>(x.unlimited||x.remaining>0)&&(!x.expiresAt||Date.parse(x.expiresAt)>Date.now()));
  return {activated:!!card&&String(card[2])==="active",
    number:card?String(card[1]).padStart(6,"0"):"",tier,benefits,
    coinBalance:Number.isSafeInteger(balance)&&balance>=0?balance:null,
    bonuses,agreed:baliConsentState(user,"bali-id:privilege"),
    profile:baliGuestProfile(user),tierRules:baliGetTierRules().levels};
}
function baliCardActivate(user,data){
  if(data.accepted!==true||!baliConsentState(user,"privacy"))
    BALI_FAIL("failed-precondition","Подтвердите условия BALI ID и согласие на обработку данных.");
  const guest=BALI_ROWS("guests").find(r=>String(r[0])===user.uid);
  if(!guest||String(guest[2]||"").trim().length<2||
    !/^\+[1-9][0-9]{7,14}$/.test(String(guest[3]||"")))
    BALI_FAIL("failed-precondition","Сначала завершите регистрацию гостя.");
  return baliLock(()=>{
    if(!baliConsentState(user,"bali-id:privilege"))
      BALI_SHEET("consents").appendRow([user.uid,"bali-id:privilege","1",true,BALI_NOW(),"card-onboarding"]);
    const existing=BALI_ROWS("cards").find(r=>String(r[0])===user.uid);
    if(!existing){
      const used=BALI_ROWS("cards").map(r=>Number(r[1])||0);
      const number=Math.max(0,...used)+1;
      if(number>999999)BALI_FAIL("resource-exhausted","Достигнут предел шестизначных карт.");
      BALI_SHEET("cards").appendRow([user.uid,number,"active",BALI_NOW(),BALI_NOW(),1]);
    }
    if(!BALI_ROWS("privileges").some(r=>String(r[0])===user.uid))
      BALI_SHEET("privileges").appendRow([user.uid,"Member","[]",BALI_NOW(),user.uid,"active"]);
    if(!BALI_ROWS("coins").some(r=>String(r[0])===user.uid))
      BALI_SHEET("coins").appendRow([user.uid,0,BALI_NOW(),1]);
    return baliCardData(user);
  });
}
function baliCoinHistory(user,targetUid){
  const uid=targetUid||user.uid;
  if(uid!==user.uid)baliStaff(user,true);
  return {items:BALI_ROWS("coinHistory").filter(r=>String(r[2])===uid)
    .map(r=>({id:String(r[0]),createdAt:BALI_ISO(r[1]),type:String(r[3]),
      count:Number(r[4]),balanceAfter:Number(r[5]),reason:String(r[7]||"")}))
    .slice(-60).reverse()};
}
function baliCoinChange(user,data){
  baliStaff(user,true);
  const uid=BALI_TEXT(data.uid,128),op=BALI_TEXT(data.operation,12),
    amount=Number(data.amount),reason=BALI_TEXT(data.reason,160),
    requestId=BALI_TEXT(data.requestId,80);
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(uid)||!["credit","debit"].includes(op)||
    !Number.isSafeInteger(amount)||amount<=0||amount>1000000||reason.length<5||
    !/^[-_a-zA-Z0-9]{12,80}$/.test(requestId))
    BALI_FAIL("invalid-argument","Укажите карту, количество BALI COIN и основание операции.");
  return baliLock(()=>{
    const ledger=BALI_ROWS("coinHistory");
    const prior=ledger.find(r=>String(r[8])===requestId);
    if(prior){
      if(String(prior[2])!==uid||String(prior[3])!==op||Number(prior[4])!==amount)
        BALI_FAIL("already-exists","Идентификатор запроса уже использован.");
      return {ok:true,alreadyProcessed:true,balance:Number(prior[5])};
    }
    if(!BALI_ROWS("cards").some(r=>String(r[0])===uid&&String(r[2])==="active"))
      BALI_FAIL("not-found","Активная BALI ID не найдена.");
    const sh=BALI_SHEET("coins"),rows=BALI_ROWS("coins"),idx=rows.findIndex(r=>String(r[0])===uid);
    const last=ledger.filter(r=>String(r[2])===uid).at(-1);
    const old=last?Number(last[5]):idx<0?0:Number(rows[idx][1]);
    if(!Number.isSafeInteger(old)||old<0)BALI_FAIL("failed-precondition","Некорректный остаток.");
    const next=old+(op==="credit"?amount:-amount);
    if(next<0||next>999999999)BALI_FAIL("failed-precondition","Недостаточно BALI COIN или превышен лимит.");
    const id="coin_"+Utilities.getUuid(),now=BALI_NOW();
    // Journal first, then balance. Reconciliation can replay the journal if write fails.
    BALI_SHEET("coinHistory").appendRow([id,now,uid,op,amount,next,user.uid,reason,requestId]);
    const version=idx<0?1:(Number(rows[idx][3])||0)+1;
    if(idx<0)sh.appendRow([uid,next,now,version]);
    else sh.getRange(idx+2,1,1,4).setValues([[uid,next,now,version]]);
    return {ok:true,balance:next,operationId:id};
  });
}
function baliGetTierRules(){
  const row=(SpreadsheetApp.openById(BALI_BOOK).getSheetByName("Настройки").getLastRow()<2?[]:
    SpreadsheetApp.openById(BALI_BOOK).getSheetByName("Настройки").getRange(2,1,
      SpreadsheetApp.openById(BALI_BOOK).getSheetByName("Настройки").getLastRow()-1,2).getValues()).find(r=>String(r[0])==="privilegeRules");
  if(!row)return {levels:{}};
  try{return {levels:JSON.parse(String(row[1]))};}
  catch(_){return {levels:{}};}
}
function baliSaveTierRules(user,data){
  baliStaff(user,true);
  const levels=data.levels;
  if(!levels||typeof levels!=="object"||Array.isArray(levels))
    BALI_FAIL("invalid-argument","Некорректные уровни.");
  const safe={};
  for(const name of BALI_TIERS){
    const item=levels[name];
    if(!item)continue;
    const benefits=Array.isArray(item.benefits)?item.benefits.map(v=>BALI_TEXT(v,180)):[];
    if(benefits.length>5||benefits.some(v=>!v))
      BALI_FAIL("invalid-argument","Не более пяти привилегий в каждом уровне.");
    safe[name]={description:BALI_TEXT(item.description,450),criteria:BALI_TEXT(item.criteria,350),benefits};
  }
  return baliLock(()=>{
    const sh=SpreadsheetApp.openById(BALI_BOOK).getSheetByName("Настройки");
    const rows=sh.getLastRow()<2?[]:sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
    const index=rows.findIndex(r=>String(r[0])==="privilegeRules");
    const entry=["privilegeRules",JSON.stringify(safe),"Настройки шести уровней BALI ID"];
    if(index<0)sh.appendRow(entry);else sh.getRange(index+2,1,1,3).setValues([entry]);
    BALI_SHEET("audit").appendRow([BALI_NOW(),"",user.uid,"privilege-rules",1,"updated"]);
    return {ok:true};
  });
}
function baliAssignPrivilege(user,data){
  baliStaff(user,true);
  const uid=BALI_TEXT(data.uid,128),tier=BALI_TEXT(data.tier,30);
  const benefits=Array.isArray(data.benefits)?data.benefits.map(x=>BALI_TEXT(x,180)):[];
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(uid)||!BALI_TIERS.includes(tier)||
    benefits.length>5||benefits.some(x=>x.length<1))
    BALI_FAIL("invalid-argument","Укажите карту, допустимый уровень и не более пяти привилегий.");
  return baliLock(()=>{
    if(!BALI_ROWS("cards").some(r=>String(r[0])===uid&&String(r[2])==="active"))
      BALI_FAIL("not-found","Активная карта гостя не найдена.");
    const sh=BALI_SHEET("privileges"),rows=BALI_ROWS("privileges");
    const idx=rows.findIndex(r=>String(r[0])===uid);
    const entry=[uid,tier,JSON.stringify(benefits),BALI_NOW(),user.uid,"active"];
    if(idx<0)sh.appendRow(entry);else sh.getRange(idx+2,1,1,entry.length).setValues([entry]);
    BALI_SHEET("audit").appendRow([BALI_NOW(),"",user.uid,"privilege-assign",1,uid+":"+tier]);
    return {ok:true,tier,benefits};
  });
}
function baliBonusGrant(user,data){
  baliStaff(user,true);
  const uid=BALI_TEXT(data.uid,128),kind=BALI_TEXT(data.kind,30),
    count=Number(data.quantity),reason=BALI_TEXT(data.reason,160);
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(uid)||!BALI_BONUS_KINDS.includes(kind)||
    !Number.isInteger(count)||count<1||count>999||reason.length<5)
    BALI_FAIL("invalid-argument","Некорректные данные начисления бонусов.");
  return baliLock(()=>{
    if(!BALI_ROWS("cards").some(r=>String(r[0])===uid&&String(r[2])==="active"))
      BALI_FAIL("not-found","Активная карта гостя не найдена.");
    const now=BALI_NOW(),id="bonus_"+Utilities.getUuid();
    BALI_SHEET("bonuses").appendRow([id,uid,kind,count,count,false,data.transferable===true,
      BALI_TEXT(data.expiresAt,32),"admin",now,user.uid,reason]);
    BALI_SHEET("bonusHistory").appendRow(["bh_"+Utilities.getUuid(),now,uid,"grant",kind,count,id,"",count,reason]);
    return {ok:true,id,quantity:count};
  });
}
function baliBonusHistory(user){
  return {items:BALI_ROWS("bonusHistory").filter(r=>String(r[2])===user.uid)
    .map(r=>({id:String(r[0]),createdAt:BALI_ISO(r[1]),type:String(r[3]),kind:String(r[4]),
      count:Number(r[5]),balanceAfter:Number(r[8]),note:String(r[9]||"")}))
    .slice(-60).reverse()};
}
function baliBonusRecipient(user,data){
  const number=BALI_TEXT(data.number,6);
  if(!/^\d{6}$/.test(number))BALI_FAIL("invalid-argument","Введите 6 цифр BALI ID.");
  const card=BALI_ROWS("cards").find(r=>String(r[1]).padStart(6,"0")===number&&String(r[2])==="active");
  if(!card||String(card[0])===user.uid)BALI_FAIL("not-found","Получатель BALI ID не найден.");
  const guest=BALI_ROWS("guests").find(r=>String(r[0])===String(card[0]));
  return {number,name:guest?BALI_TEXT(guest[2],80):"Гость BALI"};
}
function baliBonusTransfer(user,data){
  const number=BALI_TEXT(data.number,6),requestId=BALI_TEXT(data.requestId,80),note=BALI_TEXT(data.comment,160);
  if(!/^\d{6}$/.test(number)||!/^[-_a-zA-Z0-9]{12,80}$/.test(requestId)||
    !Array.isArray(data.items)||!data.items.length||data.items.length>12)
    BALI_FAIL("invalid-argument","Проверьте номер карты и количество бонусов.");
  return baliLock(()=>{
    const receiver=BALI_ROWS("cards").find(r=>String(r[1]).padStart(6,"0")===number&&String(r[2])==="active");
    if(!receiver||String(receiver[0])===user.uid)BALI_FAIL("not-found","Получатель недоступен.");
    const receiverUid=String(receiver[0]),all=BALI_ROWS("bonuses");
    const requested=new Set(),changes=[];
    for(const part of data.items){
      const id=BALI_TEXT(part.grantId,80),qty=Number(part.quantity);
      const idx=all.findIndex(r=>String(r[0])===id&&String(r[1])===user.uid);
      if(idx<0||requested.has(id)||!Number.isInteger(qty)||qty<1||qty>100)
        BALI_FAIL("invalid-argument","Недопустимая бонусная позиция.");
      requested.add(id);
      const row=all[idx],kind=String(row[2]),expires=BALI_ISO(row[7]);
      if(!BALI_BONUS_KINDS.includes(kind)||!BALI_TRUE(row[6])||BALI_TRUE(row[5])||
        Number(row[4])<qty||(expires&&Date.parse(expires)<=Date.now()))
        BALI_FAIL("failed-precondition","Бонус недоступен для перевода.");
      changes.push({idx,row,qty,kind});
    }
    const previous=BALI_ROWS("bonusHistory").find(r=>
      String(r[0]).startsWith("transfer_"+requestId+"_out_"));
    if(previous)return {ok:true,alreadyProcessed:true};
    const sh=BALI_SHEET("bonuses"),now=BALI_NOW();
    for(const c of changes){
      sh.getRange(c.idx+2,5).setValue(Number(c.row[4])-c.qty);
      const newId="bonus_"+Utilities.getUuid();
      sh.appendRow([newId,receiverUid,c.kind,c.qty,c.qty,false,true,
        BALI_ISO(c.row[7]),"transfer",now,user.uid,note]);
      BALI_SHEET("bonusHistory").appendRow(["transfer_"+requestId+"_in_"+newId,now,receiverUid,"transfer-in",
        c.kind,c.qty,newId,user.uid,c.qty,note]);
      BALI_SHEET("bonusHistory").appendRow(["transfer_"+requestId+"_out_"+newId,now,user.uid,"transfer-out",
        c.kind,c.qty,String(c.row[0]),receiverUid,Number(c.row[4])-c.qty,note]);
    }
    return {ok:true};
  });
}
function baliGuestPlans(user,data){
  if(data&&data.operation){
    const eventId=BALI_TEXT(data.eventId,80),operation=BALI_TEXT(data.operation,20);
    if(!eventId||!["add","remove"].includes(operation))
      BALI_FAIL("invalid-argument","Некорректный запрос планов.");
    baliLock(()=>{
      const rows=BALI_ROWS("plans"),index=rows.findIndex(r=>String(r[0])===user.uid&&String(r[1])===eventId);
      if(index>=0)BALI_SHEET("plans").getRange(index+2,4,1,3).setValues([[
        operation==="add"?"going":"removed",String(rows[index][4]),BALI_NOW()]]);
      else if(operation==="add")BALI_SHEET("plans").appendRow([user.uid,eventId,
        BALI_TEXT(data.date,10),"going",BALI_NOW(),BALI_NOW()]);
    });
  }
  return {plans:BALI_ROWS("plans").filter(r=>String(r[0])===user.uid&&String(r[3])==="going")
    .map(r=>({eventId:String(r[1]),date:String(r[2]),status:String(r[3])}))};
}

function baliAdminGuests(user,data){
  baliStaff(user,true);
  const q=BALI_TEXT(data.search,100).toLowerCase(),max=80;
  const offset=Math.max(0,Math.min(100000,Number(data.offset)||0));
  const all=BALI_ROWS("guests").filter(r=>(String(r[2])+" "+String(r[1])+" "+String(r[3]))
    .toLowerCase().includes(q)).sort((a,b)=>String(a[2]).localeCompare(String(b[2]),"ru"));
  const rows=all.slice(offset,offset+max);
  return {clients:rows.map(r=>({uid:String(r[0]),email:String(r[1]),name:String(r[2]),
    phone:String(r[3]),createdAt:BALI_ISO(r[4])})),limit:max,nextOffset:offset+rows.length,
    hasMore:offset+rows.length<all.length};
}
function baliAdminGuestOrders(user,data){
  baliStaff(user,true);
  const uid=BALI_TEXT(data.uid,128);
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(uid))BALI_FAIL("invalid-argument","Неизвестный ID гостя.");
  const existing=BALI_ROWS("guests").some(r=>String(r[0])===uid);
  if(!existing)BALI_FAIL("not-found","Гость не найден.");
  return {orders:baliOrdersFor({uid},false,"","").slice(-50)};
}
function baliDispatch(user,action,data){
  if(baliWithdrawn(user)&&action!=="me")
    BALI_FAIL("permission-denied","Согласие отозвано. Обратитесь к администрации BALI.");
  if(action==="adminGuests")return baliAdminGuests(user,data);
  if(action==="adminGuestOrders")return baliAdminGuestOrders(user,data);
  if(action==="me")return {profile:baliGuestProfile(user),role:baliRole(user),
    privacyAccepted:baliConsentState(user,"privacy"),privacyWithdrawn:baliWithdrawn(user)};
  if(action==="consentAccept")return {consent:baliConsent(user,data)};
  if(action==="card")return {card:baliCardData(user)};
  if(action==="adminCard"){
    baliStaff(user,true);
    const uid=BALI_TEXT(data.uid,128);
    if(!/^[a-zA-Z0-9_-]{8,128}$/.test(uid))BALI_FAIL("invalid-argument","Неизвестный ID гостя.");
    const guest=BALI_ROWS("guests").find(r=>String(r[0])===uid);
    return {card:baliCardData({uid,email:String(guest?.[1]||""),name:String(guest?.[2]||"")})};
  }
  if(action==="activateCard")return {card:baliCardActivate(user,data)};
  if(action==="coinHistory")return baliCoinHistory(user);
  if(action==="coinChange")return {result:baliCoinChange(user,data)};
  if(action==="privilegeAssign")return {result:baliAssignPrivilege(user,data)};
  if(action==="privilegeRules")return baliGetTierRules();
  if(action==="privilegeRulesSave")return {result:baliSaveTierRules(user,data)};
  if(action==="bonusGrant")return {result:baliBonusGrant(user,data)};
  if(action==="bonusHistory")return baliBonusHistory(user);
  if(action==="bonusRecipient")return {recipient:baliBonusRecipient(user,data)};
  if(action==="bonusTransfer")return {result:baliBonusTransfer(user,data)};
  if(action==="plans")return baliGuestPlans(user,data);
  if(action==="profileSave"){
    if(!baliConsentState(user,"privacy")||baliWithdrawn(user))
      BALI_FAIL("permission-denied","Подтвердите согласие на обработку данных.");
    return {profile:baliSaveProfile(user,data)};
  }
  if(action==="menu")return {menu:baliMenu(),events:baliEvents()};
  if(action==="myOrders")return {orders:baliOrdersFor(user,false,"","")};
  if(action==="createOrder")return {order:baliOrderCreate(user,data)};
  if(action==="editOrder")return {order:baliGuestEditOrder(user,data)};
  if(action==="cancelOrder")return {result:baliGuestCancelOrder(user,data)};
  if(action==="staffOrders"){
    baliStaff(user,false);
    const date=BALI_TEXT(data.date,10),eventId=BALI_TEXT(data.eventId,80);
    if(!BALI_DATE(date))BALI_FAIL("invalid-argument","Выберите дату мероприятия.");
    return {orders:baliOrdersFor(user,true,date,eventId)};
  }
  if(action==="staffStatus"){baliStaff(user,false);return {result:baliStatus(user,data)};}
  if(action==="staffReport"){
    baliStaff(user,false);
    const date=BALI_TEXT(data.date,10),eventId=BALI_TEXT(data.eventId,80);
    if(!BALI_DATE(date))BALI_FAIL("invalid-argument","Выберите дату отчёта.");
    return baliReport(baliOrdersFor(user,true,date,eventId),
      data.kind==="dishes"?"dishes":"orders",data.includeCancelled===true);
  }
  if(action==="staffList"){baliStaff(user,true);return {staff:BALI_ROWS("roles")
    .filter(r=>String(r[2])==="staff").map(r=>({email:String(r[1]),active:BALI_TRUE(r[3]),name:String(r[4])}))};}
  if(action==="staffManage"){baliStaff(user,true);return {result:baliManageStaff(user,data)};}
  BALI_FAIL("invalid-argument","Неизвестная операция.");
}
function doPost(e){
  try{
    const body=e&&e.postData&&e.postData.contents||"";
    if(body.length>28000)BALI_FAIL("invalid-argument","Слишком большой запрос.");
    const input=JSON.parse(body);
    const expected=PropertiesService.getScriptProperties().getProperty("BALI_BRIDGE_KEY");
    if(!expected||String(input.bridgeKey||"")!==expected)
      BALI_FAIL("permission-denied","Запрос должен проходить через BALI API.");
    if(input.action==="health")return BALI_JSON({ok:true,data:{status:"ready",version:3}});
    const user=baliVerifyFirebase(input.token);
    return BALI_JSON({ok:true,data:baliDispatch(user,input.action,input.payload||{})});
  }catch(error){
    // Never log raw request bodies, ID tokens or personal data.
    const code=typeof error.code==="string"?error.code:"internal";
    const message=code==="internal"?"Ошибка сервера. Повторите позже.":String(error.message||"Ошибка.");
    console.error("bali.appscript "+code);
    return BALI_JSON({ok:false,error:{code,message}});
  }
}
/** Run manually ONCE after setting a private BALI_BRIDGE_KEY in Script Properties. */
function baliCheckSetup(){
  if(!PropertiesService.getScriptProperties().getProperty("BALI_BRIDGE_KEY"))
    throw Error("Set BALI_BRIDGE_KEY in Project Settings → Script Properties.");
  Object.keys(BALI_TABS).forEach(k=>{
    if(!BALI_SHEET(k))throw Error("Missing sheet "+k);
  });
  return "BALI v3 server configured. Deploy a new Web App version.";
}
