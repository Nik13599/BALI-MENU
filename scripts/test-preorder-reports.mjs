import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const bytes=await readFile("bali-preorder-reports.js");
const source="data:text/javascript;base64,"+bytes.toString("base64");
const {composeBaliPreorderReport,preorderTelegramText,splitTelegramReport}=await import(source);
const base={date:"2026-10-24",eventTitle:"BALI TEST",includeCancelled:false};
const orders=[
 {id:"z",orderNumber:3,customerName:"Мария",customerPhone:"+375291000001",tableNumber:"15",status:"confirmed",items:[
  {id:1,name:"Пицца",quantity:2,unitPrice:25},{id:2,name:"Салат",quantity:1,unitPrice:18.5}],notes:"Без лука"},
 {id:"a",orderNumber:1,customerName:"Артём",customerPhone:"+375291000002",bookingId:"BALI-31",status:"pending",items:[
  {id:1,name:"Пицца",quantity:3,unitPrice:25}]},
 {id:"b",orderNumber:2,customerName:"Ольга",customerPhone:"+375291000003",tableNumber:"5",status:"cancelled",items:[
  {id:1,name:"Пицца",quantity:4,unitPrice:25}]}
];
const detailed=composeBaliPreorderReport({...base,kind:"orders",orders});
assert.deepEqual(detailed.orders.map(o=>o.orderNumber),[1,2,3],"report sorts by event order number");
assert.equal(detailed.count,3,"detailed event report includes cancelled orders with status");
assert.equal(detailed.portions,10);
const text=preorderTelegramText(detailed);
assert(text.includes("№ 1")&&text.includes("№ 2")&&text.includes("№ 3"));
assert(text.includes("Без лука")&&text.includes("Ожидает подтверждения")&&text.includes("Отменён"));
assert(text.includes("+375291000003")&&text.includes("Пицца × 4"));
const dishes=composeBaliPreorderReport({...base,kind:"dishes",orders});
assert.equal(dishes.count,2,"kitchen report excludes cancelled");
assert.equal(dishes.dishes.find(x=>x.id===1).quantity,5);
assert.equal(dishes.amount,143.5);
assert.equal(dishes.portions,6);
assert(!preorderTelegramText(dishes).includes("+37529"),"kitchen report has no personal data");
const withCancelled=composeBaliPreorderReport({...base,kind:"dishes",orders,includeCancelled:true});
assert.equal(withCancelled.dishes.find(x=>x.id===1).quantity,9);
assert.equal(withCancelled.portions,10);
const daily=composeBaliPreorderReport({...base,kind:"orders",allEvents:true,orders:[
  {...orders[0],eventTitle:"BALI LATE"},
  {...orders[1],eventTitle:"BALI EARLY"},
  {...orders[2],eventTitle:"BALI EARLY"}
]});
assert.deepEqual(daily.orders.map(x=>x.eventTitle),["BALI EARLY","BALI EARLY","BALI LATE"],
  "whole-day detailed report groups individual orders by event");
assert(preorderTelegramText(daily).includes("BALI EARLY · № 1"),
  "whole-day report shows event on each order, not just its number");
const wholeDayDishes=composeBaliPreorderReport({...base,kind:"dishes",allEvents:true,orders:[
  {...orders[0],eventTitle:"BALI LATE"},{...orders[1],eventTitle:"BALI EARLY"}
]});
assert.equal(wholeDayDishes.dishes.find(x=>x.name==="Пицца").quantity,5,
  "daily kitchen totals combine dishes across events");
const textChunks=splitTelegramReport(Array.from({length:500},(_,i)=>"Блюдо "+i+" × 2").join("\n"),400);
assert(textChunks.length>1);
assert(textChunks.every(x=>x.length<=400));
assert.equal(textChunks.join("\n").replaceAll("\n\n","\n"),Array.from({length:500},(_,i)=>"Блюдо "+i+" × 2").join("\n"));
const empty=composeBaliPreorderReport({...base,kind:"dishes",orders:[]});
assert.equal(empty.count,0);
console.log("BALI event reports: numbered all-orders report, kitchen aggregation, cancelled flags, Telegram chunks PASS.");
