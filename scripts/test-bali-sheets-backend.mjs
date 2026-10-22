import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";
const columns={
  "Заказы":18,"Позиции заказов":8,"Меню":8,"Мероприятия":6,
  "Баннеры":6,"Администраторы":5,"История изменений":6,"Настройки":3,
  "Гости":8,"BALI ID":6,"Привилегии":6,"Бонусы":12,"История бонусов":10,
  "BALI COIN":4,"История BALI COIN":9,"Согласия":6,"Планы гостя":6,"Посещения":6
};
const sheets=new Map(Object.entries(columns).map(([name,cols])=>[name,[Array(cols).fill("header")]]));
function range(name,row,col,height=1,width=1){
  return {
    getValues(){return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>
      sheets.get(name)[row-1+i]?.[col-1+j]??""))},
    setValues(rows){rows.forEach((cells,i)=>cells.forEach((value,j)=>{
      const arr=sheets.get(name);
      while(arr.length<row+i)arr.push([]);
      arr[row+i-1][col+j-1]=value;
    }));return this;},
    setValue(value){this.setValues([[value]]);return this},
    clearContent(){this.setValues([Array.from({length:width},()=> "")]);return this}
  };
}
const SpreadsheetApp={openById:()=>({getSheetByName(name){
  assert(sheets.has(name),"Sheet "+name+" must exist");
  return {getLastRow:()=>sheets.get(name).length,
    getLastColumn:()=>columns[name],appendRow:row=>sheets.get(name).push([...row]),
    getRange:(r,c,h=1,w=1)=>range(name,r,c,h,w)};
}})};
const accounts=new Map([
  ["owner",{localId:"owner_UID_002",email:"owner@example.com",emailVerified:true}],
  ["guestA",{localId:"guestUID_0001",email:"guest-a@example.com",emailVerified:true}],
  ["staff",{localId:"staff_UID_001",email:"staff+staff01@staff.baliminsk.by",emailVerified:true}],
  ["unverifiedStaff",{localId:"staff_UID_001",email:"staff+staff01@staff.baliminsk.by",emailVerified:false}],
  ["impostorStaff",{localId:"other_UID_001",email:"staff+staff01@staff.baliminsk.by",emailVerified:true}],
  ["guestB",{localId:"guestUID_0002",email:"guest-b@example.com",emailVerified:true}]
]);
sheets.get("Администраторы").push(["owner_UID_002","owner@example.com","admin",true,"Администратор"]);
sheets.get("Администраторы").push(["staff_UID_001","staff+staff01@staff.baliminsk.by","staff",true,"Сотрудник BALI"]);
const publishedOnlyEvents=[];
const sandbox={
  SpreadsheetApp,LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:x=>x==="BALI_BRIDGE_KEY"?"test-bridge":null})},
  UrlFetchApp:{fetch:(url,options)=>({getResponseCode:()=>200,getContentText:()=>{
    if(url.includes("/api/public-data?path=events")){
      const all=[
        ...sheets.get("Мероприятия").slice(1).map(row=>({
          id:String(row[0]),date:String(row[1]),title:String(row[2]),
          closesAt:String(row[4]),preorderEnabled:row[3]===true
        })),
        ...publishedOnlyEvents
      ];
      return JSON.stringify({documents:all.map(event=>({
        name:"projects/test/databases/(default)/documents/events/"+event.id,
        fields:{
          date:{stringValue:event.date},
          title:{stringValue:event.title},
          closesAt:{stringValue:event.closesAt},
          preorderEnabled:{booleanValue:event.preorderEnabled===true}
        }
      }))});
    }
    const token=JSON.parse(options.payload).idToken;
    const user=accounts.get(String(token).replace(/^test-/,"").replace(/_+$/,""));
    return JSON.stringify({users:user?[user]:[]});
  }})},
  ContentService:{MimeType:{JSON:"application/json"},createTextOutput(value){
    return {value,setMimeType(){return this}};
  }},
  Utilities:{getUuid:()=>String(++sandbox.serial).padStart(36,"0"),
    base64EncodeWebSafe:x=>Buffer.from(x).toString("base64url"),
    computeDigest:(algo,x)=>Array.from(Buffer.from(x)).slice(0,32),
    DigestAlgorithm:{SHA_256:"SHA_256"}},
  serial:0,Date,Math,Number,String,Boolean,Array,Map,Set,JSON,RegExp,Error,console
};
vm.createContext(sandbox);
vm.runInContext(readFileSync("google-apps-script/BaliBackend.gs","utf8"),sandbox,{filename:"BaliBackend.gs"});
let bridgeKey="test-bridge";
const request=(token,action,payload={})=>{
  const body={bridgeKey,token:token?"test-"+token.padEnd(80,"_"):"",action,payload};
  const res=sandbox.doPost({postData:{contents:JSON.stringify(body)}}).value;
  return JSON.parse(res);
};
function ok(token,action,payload){
  const res=request(token,action,payload);
  assert.equal(res.ok,true,action+" failed "+JSON.stringify(res.error));
  return res.data;
}
function fail(token,action,payload,code){
  const res=request(token,action,payload);
  assert.equal(res.ok,false,action+" unexpectedly permitted");
  assert.equal(res.error?.code,code,action);
}
assert.equal(request("guestA","me",{}).ok,true);
assert.equal(request("guestA","coinChange",{uid:"guestUID_0002",amount:50,operation:"credit",reason:"Visitor bonus",requestId:"transfer_1234567890"}).error.code,"permission-denied");
assert.equal(request("guestA","adminCard",{uid:"guestUID_0002"}).error.code,"permission-denied");
for(const [token,name,number] of [["guestA","Анна","000001"],["guestB","Мария","000002"]]){
  ok(token,"consentAccept",{type:"privacy",accepted:true});
  ok(token,"profileSave",{name,phone:"+375291234567"});
  const result=ok(token,"activateCard",{accepted:true});
  assert.equal(result.card.number,number);
  assert.equal(result.card.coinBalance,0);
  assert.equal(result.card.tier,"Member");
  assert.equal(ok(token,"activateCard",{accepted:true}).card.number,number);
}
assert.equal(ok("guestA","card").card.number,"000001");
assert.equal(ok("guestB","card").card.number,"000002");
const first=ok("owner","coinChange",{uid:"guestUID_0001",operation:"credit",
 amount:150,reason:"За участие в вечеринке",requestId:"test_credit_123456"});
assert.equal(first.result.balance,150);
assert.equal(ok("guestA","card").card.coinBalance,150);
assert.equal(ok("guestB","card").card.coinBalance,0);
const repeat=ok("owner","coinChange",{uid:"guestUID_0001",operation:"credit",
 amount:150,reason:"За участие в вечеринке",requestId:"test_credit_123456"});
assert.equal(repeat.result.alreadyProcessed,true);
assert.equal(repeat.result.balance,150);
assert.equal(ok("owner","coinChange",{uid:"guestUID_0001",operation:"debit",
 amount:30,reason:"Покупка бонуса",requestId:"test_debit_1234567"}).result.balance,120);
assert.equal(ok("guestA","coinHistory").items.length,2);
assert.equal(ok("guestB","coinHistory").items.length,0);
assert.equal(ok("guestA","coinHistory",{uid:"guestUID_0002"}).items.length,2); // UID ignored

assert.equal(ok("owner","privilegeAssign",{uid:"guestUID_0001",tier:"Gold",
  benefits:["Вход без очереди"]}).result.tier,"Gold");
assert.equal(ok("guestA","card").card.tier,"Gold");
assert.equal(ok("guestB","card").card.tier,"Member");
assert.equal(ok("owner","bonusGrant",{uid:"guestUID_0001",kind:"shot",
  quantity:3,transferable:true,reason:"Подарок гостю"}).result.ok,true);
assert.equal(ok("guestA","card").card.bonuses[0].remaining,3);
assert.equal(ok("guestB","card").card.bonuses.length,0);
assert.equal(ok("guestA","bonusHistory").items[0].type,"grant");
fail("guestA","privilegeAssign",{uid:"guestUID_0001",tier:"Private",benefits:[]},"permission-denied");
assert.equal(ok("owner","adminGuests",{}).clients.length,2);
assert.equal(ok("guestA","plans",{operation:"add",eventId:"2026-11-01",date:"2026-11-01"}).plans.length,1);
assert.equal(ok("guestB","plans",{}).plans.length,0);
ok("guestB","consentAccept",{type:"privacy-withdrawal",accepted:true});
fail("guestB","card",{},"permission-denied");
assert.equal(ok("guestB","me").privacyWithdrawn,true);
const bootstrapKey="a".repeat(64);
sheets.get("Настройки").push(["BALI_BRIDGE_KEY",bootstrapKey,"temporary bootstrap"]);
const props=new Map();
sandbox.PropertiesService={getScriptProperties:()=>({
  getProperty:key=>props.get(key)||null,
  setProperty:(key,value)=>props.set(key,value)
})};
assert.match(sandbox.baliCheckSetup(),/configured/);
assert.equal(props.get("BALI_BRIDGE_KEY"),bootstrapKey);
assert.equal(sheets.get("Настройки")[1][1],""); // never retain the bridge secret in guest-data spreadsheet
assert.equal(sheets.get("Настройки")[1][0],"BALI_BRIDGE_KEY_MIGRATED");
assert.equal(request("guestA","me").ok,false); // previous bridge secret rejected
bridgeKey=bootstrapKey;
assert.equal(request("guestA","me").ok,true); // migrated secret authorizes the new bridge
const eventDate=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
const closesAt=new Date(Date.now()+5*86400000).toISOString();
sheets.get("Меню").push([101,"Кухня","Тестовое блюдо","Проверка блюда",15,"",true,1]);
sheets.get("Мероприятия").push([eventDate,eventDate,"BALI Test Event",true,closesAt,""]);
const guestOrder={guestVerified:true,privacyConsent:true,internationalConsent:true,
  eventDate,eventId:eventDate,customerName:"Тестовый посетитель",
  customerPhone:"+375291234567",tableNumber:"12",bookingId:"",
  notes:"",requestId:"guest_request_1234567890",
  items:[{id:101,quantity:2}]};
const firstGuest=ok("","guestCreateOrder",guestOrder).order;
assert.equal(firstGuest.total,30);
assert.equal(firstGuest.orderNumber,1);
assert.equal(firstGuest.status,"pending");
assert.equal(ok("","guestCreateOrder",guestOrder).order.id,firstGuest.id);
assert.equal(sheets.get("Заказы").length,2); // one row despite duplicate submission
assert.equal(sheets.get("Заказы")[1][6],""); // no fabricated personal account
assert.equal(ok("owner","staffOrders",{date:eventDate,eventId:eventDate}).orders.length,1);
assert.equal(ok("guestA","myOrders").orders.length,0); // unrelated logged-in guest
fail("guestB","myOrders",{},"permission-denied"); // consent was withdrawn earlier in this fixture
fail("","guestCreateOrder",{...guestOrder,guestVerified:false},"permission-denied");
fail("","guestCreateOrder",{...guestOrder,privacyConsent:false},"permission-denied");
fail("","guestCreateOrder",{...guestOrder,customerPhone:"5555",requestId:"guest_request_new000000"},"invalid-argument");
fail("","guestCreateOrder",{...guestOrder,tableNumber:"",requestId:"guest_request_new111111"},"invalid-argument");
fail("","guestCreateOrder",{...guestOrder,eventId:"unlisted",requestId:"guest_request_new222222"},"failed-precondition");
fail("","card",{},"unauthenticated"); // BALI ID remains account-only
fail("","staffOrders",{date:eventDate},"unauthenticated");

assert.equal(ok("staff","me").role,"staff");
assert.equal(ok("staff","staffOrders",{date:eventDate,eventId:eventDate}).orders.length,1);
assert.equal(ok("staff","staffRecentOrders").orders.length,1);
assert.equal(ok("staff","staffRecentOrders").canEditOrders,true);
ok("staff","staffReport",{date:eventDate,eventId:eventDate,kind:"orders"});

 // Both guest checkout and logged-in checkout share one event-wide serial.
const signedOrder=ok("guestA","createOrder",{...guestOrder,
  customerName:"Анна",requestId:"auth_request_1234567890"}).order;
assert.equal(signedOrder.orderNumber,2);
const statusRequestId="abcdef0123456789abcdef0123456789";
const auditBefore=sheets.get("История изменений").length;
const applied=ok("staff","staffStatus",{
  id:signedOrder.id,status:"cancelled",requestId:statusRequestId
}).result;
assert.equal(applied.status,"cancelled");
assert.equal(ok("staff","staffStatus",{
  id:signedOrder.id,status:"cancelled",requestId:statusRequestId
}).result.alreadyApplied,true);
assert.equal(sheets.get("История изменений").length,auditBefore+1); // reload replay did not write twice
const anonymousNext=ok("","guestCreateOrder",{...guestOrder,
  customerPhone:"+375291234568",requestId:"guest_request_9876543210"}).order;
assert.equal(anonymousNext.orderNumber,3); // cancellation does not reuse a serial
assert.equal(ok("","guestCreateOrder",{...guestOrder,
  customerPhone:"+375291234568",requestId:"guest_request_9876543210"}).order.orderNumber,3);
const secondEventId=eventDate+"__2";
sheets.get("Мероприятия").push([secondEventId,eventDate,"BALI Second Event",true,closesAt,""]);
const firstAtSecondEvent=ok("","guestCreateOrder",{...guestOrder,
  eventId:secondEventId,requestId:"second_event_guest_123456"}).order;
assert.equal(firstAtSecondEvent.orderNumber,1); // same date, another event resets to 1
assert.equal(ok("guestA","createOrder",{...guestOrder,customerName:"Анна",
  eventId:secondEventId,requestId:"second_event_auth_123456"}).order.orderNumber,2);
// Staff edit retains guest identity and the event number, with prices validated
// against the server catalog rather than trusting the browser.
const original=ok("staff","staffOrders",{date:eventDate,eventId:eventDate}).orders
  .find(o=>o.id===firstGuest.id);
assert.equal(original.orderNumber,1);
const updated=ok("staff","staffEditOrder",{
  id:original.id,expectedUpdatedAt:original.updatedAt,
  eventDate,eventId:eventDate,customerName:"Исправленное имя",
  customerPhone:"+375291234570",tableNumber:"42",bookingId:"",
  notes:"Без специй",status:"confirmed",items:[{id:101,quantity:3}]
}).order;
assert.equal(updated.orderNumber,1);
assert.equal(updated.total,45);
assert.equal(updated.items[0].quantity,3);
assert.equal(updated.ownerUid,original.ownerUid);
assert.equal(updated.email,original.email);
assert.equal(updated.createdAt,original.createdAt);
assert.equal(ok("staff","staffReport",{date:eventDate,eventId:eventDate,kind:"dishes"}).portions,5); // 3 edited + 2 active; cancelled excluded
fail("staff","staffEditOrder",{
  id:original.id,expectedUpdatedAt:"2000-01-01T00:00:00.000Z",
  eventDate,eventId:eventDate,customerName:"Старое",customerPhone:"+375291234570",
  tableNumber:"42",bookingId:"",notes:"",status:"pending",
  items:[{id:101,quantity:1}]
},"failed-precondition");
fail("guestA","staffEditOrder",{
  id:original.id,expectedUpdatedAt:updated.updatedAt,eventDate,eventId:eventDate,
  customerName:"Злоумышленник",customerPhone:"+375291234570",
  tableNumber:"42",bookingId:"",notes:"",status:"pending",
  items:[{id:101,quantity:1}]
},"permission-denied");
const moved=ok("staff","staffEditOrder",{
  id:original.id,expectedUpdatedAt:updated.updatedAt,
  eventDate,eventId:secondEventId,customerName:updated.customerName,
  customerPhone:updated.customerPhone,tableNumber:"42",bookingId:"",
  notes:"",status:"confirmed",items:[{id:101,quantity:1}]
}).order;
assert.equal(moved.orderNumber,3); // existing serials 1 and 2 at second event
assert.equal(moved.eventTitle,"BALI Second Event");
assert.equal(ok("staff","staffOrders",{date:eventDate,eventId:eventDate}).orders.some(o=>o.id===moved.id),false);
assert.equal(ok("staff","staffOrders",{date:eventDate,eventId:secondEventId}).orders.some(o=>o.id===moved.id),true);
assert.equal(sheets.get("Позиции заказов").filter(r=>r[0]===moved.id).length,1);
assert.equal(sheets.get("История изменений").some(r=>r[1]===moved.id&&r[3]==="staff-edit"),true);

// Newly published events are selectable without a separate catalogSync call.
const liveDate=new Date(Date.now()+8*86400000).toISOString().slice(0,10);
const liveClose=new Date(Date.now()+9*86400000).toISOString();
publishedOnlyEvents.push({id:liveDate,date:liveDate,title:"BALI Live Website Event",
  closesAt:liveClose});
assert.equal(sheets.get("Мероприятия").some(r=>r[0]===liveDate),false);
const movedToWebsite=ok("staff","staffEditOrder",{
  id:moved.id,expectedUpdatedAt:moved.updatedAt,eventDate:liveDate,eventId:liveDate,
  customerName:moved.customerName,customerPhone:moved.customerPhone,tableNumber:"42",
  bookingId:"",notes:"",status:"confirmed",items:[{id:101,quantity:1}]
}).order;
assert.equal(movedToWebsite.eventTitle,"BALI Live Website Event");
assert.equal(movedToWebsite.eventDate,liveDate);
assert.equal(movedToWebsite.orderNumber,1);
assert.equal(ok("staff","staffReport",{date:liveDate,eventId:liveDate,kind:"orders"}).count,1);
// An event cannot be invented by editing the request payload.
fail("staff","staffEditOrder",{
  id:movedToWebsite.id,expectedUpdatedAt:movedToWebsite.updatedAt,
  eventDate:liveDate,eventId:"nonexistent",customerName:movedToWebsite.customerName,
  customerPhone:movedToWebsite.customerPhone,tableNumber:"42",bookingId:"",
  notes:"",status:"confirmed",items:[{id:101,quantity:1}]
},"failed-precondition");

const followingDate=new Date(Date.now()+6*86400000).toISOString().slice(0,10);
const followingClose=new Date(Date.now()+7*86400000).toISOString();
sheets.get("Мероприятия").push([followingDate,followingDate,"Next BALI Night",true,followingClose,""]);
assert.equal(ok("","guestCreateOrder",{...guestOrder,eventDate:followingDate,
  eventId:followingDate,customerPhone:"+375291234569",requestId:"next_date_guest_123456"}).order.orderNumber,1);

for(const action of ["adminGuests","adminGuestOrders","adminCard","staffList","staffManage",
  "coinChange","privilegeAssign","privilegeRulesSave","bonusGrant","catalogSync"])
  fail("staff",action,{uid:"guestUID_0001"},"permission-denied");
fail("unverifiedStaff","staffRecentOrders",{},"unauthenticated");
assert.equal(ok("impostorStaff","me").role,"guest");
fail("impostorStaff","staffRecentOrders",{},"permission-denied");
const limitedRole=sheets.get("Администраторы").find(r=>r[0]==="staff_UID_001");
limitedRole[3]=false;
fail("staff","staffRecentOrders",{},"permission-denied");
console.log("Staff scope PASS: orders/reports allowed; admin, BALI ID, coins, role management, unverified/revoked/impostor identities denied.");

console.log("BALI Sheets: anonymous preorder validation, idempotency, staff visibility, guest isolation, BALI ID and coins PASS");
