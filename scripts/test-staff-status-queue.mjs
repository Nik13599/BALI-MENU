import assert from "node:assert/strict";
import {createDurableStaffStatusQueue} from "../bali-staff-status-queue.js";
const storage=new Map();
const store={
  getItem:key=>storage.get(key)||null,
  setItem:(key,value)=>storage.set(key,value)
};
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
const uid="staff01";
const row={id:"o_order_123",updatedAt:"2026-10-23T02:00:00.000Z"};
let calls=[],resolveTransport;
let send=op=>{calls.push(op);return new Promise(resolve=>{resolveTransport=resolve;});};
let views=[];
const queue=createDurableStaffStatusQueue({
  storage:store,send,onChange:()=>views.push("updated")
});
queue.activate(uid);
const op=queue.enqueue(row,"confirmed");
assert.equal(queue.get(row.id).status,"confirmed");
assert.equal(JSON.parse(store.getItem("bali-staff-status-queue-v1:"+uid)).length,1);
assert.equal(calls.length,1);
assert.equal(queue.enqueue(row,"confirmed").requestId,op.requestId);
assert.equal(calls.length,1);
assert.ok(views.length>=2);
// A hard reload destroys the first JS runtime, but its durable entry survives.
let secondCalls=[],finish;
const restored=createDurableStaffStatusQueue({
  storage:store,send:op=>{secondCalls.push(op);return new Promise(resolve=>{finish=resolve;});}
});
restored.activate(uid);
assert.equal(secondCalls.length,1);
assert.equal(secondCalls[0].requestId,op.requestId);
finish({id:row.id,status:"confirmed"});
await settle();
assert.equal(restored.get(row.id),null);
assert.deepEqual(JSON.parse(store.getItem("bali-staff-status-queue-v1:"+uid)),[]);
assert.ok(op.requestId.length===32);
// Account isolation: one staff member must never read another's pending actions.
const other=createDurableStaffStatusQueue({storage:store,send});
other.activate("staff02");
assert.equal(other.all().length,0);
// Storage failure must never falsely update the UI or send a network request.
let writes=0,attempts=0;
const denied=createDurableStaffStatusQueue({
  storage:{getItem:()=>null,setItem:()=>{writes++;throw Error("quota");}},
  send:()=>{attempts++;}
});
denied.activate("staff03");
assert.throws(()=>denied.enqueue(row,"confirmed"),/не сохранил действие/);
assert.equal(denied.all().length,0);
assert.equal(attempts,0);
assert.ok(writes>=1);
// Finalize the first runtime's old promise to avoid dangling async operations.
resolveTransport({id:row.id,status:"confirmed"});
await settle();
console.log("BALI STAFF durable status outbox and reload replay PASS");
