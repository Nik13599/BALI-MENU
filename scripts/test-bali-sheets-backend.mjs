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
  ["guestB",{localId:"guestUID_0002",email:"guest-b@example.com",emailVerified:true}]
]);
sheets.get("Администраторы").push(["owner_UID_002","owner@example.com","admin",true,"Администратор"]);
const sandbox={
  SpreadsheetApp,LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:x=>x==="BALI_BRIDGE_KEY"?"test-bridge":null})},
  UrlFetchApp:{fetch:(_url,options)=>({getResponseCode:()=>200,getContentText:()=>{
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
  const body={bridgeKey,token:"test-"+token.padEnd(80,"_"),action,payload};
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
console.log("BALI Sheets: guest isolation, privilege tiers, BALI COIN ledger, bonus ownership, privacy and plans PASS");
