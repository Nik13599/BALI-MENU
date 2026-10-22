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
  roles:"Администраторы",audit:"История изменений",guests:"Гости"};
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
function baliDispatch(user,action,data){
  if(action==="me")return {profile:baliGuestProfile(user),role:baliRole(user)};
  if(action==="profileSave")return {profile:baliSaveProfile(user,data)};
  if(action==="menu")return {menu:baliMenu(),events:baliEvents()};
  if(action==="myOrders")return {orders:baliOrdersFor(user,false,"","")};
  if(action==="createOrder")return {order:baliOrderCreate(user,data)};
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
  ["orders","items","menu","events","roles","audit","guests"].forEach(k=>{
    if(!BALI_SHEET(k))throw Error("Missing sheet "+k);
  });
  return "BALI v3 server configured. Deploy a new Web App version.";
}
