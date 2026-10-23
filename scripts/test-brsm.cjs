"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {ticket,replay}=require("../functions/brsm-core");
test("every BRSM ticket has 10 distinct integers within 1..90",()=>{
  const seen=new Set();
  for(let i=0;i<500;i++){
    const row=ticket();
    assert.equal(row.length,10);
    assert.equal(new Set(row).size,10);
    assert.ok(row.every(n=>Number.isInteger(n)&&n>=1&&n<=90));
    assert.deepEqual(row,[...row].sort((a,b)=>a-b));
    seen.add(row.join(","));
  }
  assert.ok(seen.size>1,"issued tickets must be randomized");
});
const entries=[
 {uid:"a",number:"000001",numbers:[1,2,3,4,5,6,7,8,9,10]},
 {uid:"b",number:"000002",numbers:[1,2,3,4,5,11,12,13,14,15]}
];
test("tie at five continues until one contender reaches six",()=>{
  const first=replay(entries,[1,2,3,4,5]);
  assert.equal(first.winner,null);
  assert.equal(first.contenders.length,2);
  assert.equal(first.target,5);
  const next=replay(entries,[1,2,3,4,5,6]);
  assert.equal(next.winner.uid,"a");
  assert.equal(next.target,6);
});
test("single first five wins without waiting for all 90 balls",()=>{
  const state=replay(entries,[1,2,3,4,6,7]);
  assert.equal(state.winner.uid,"a");
  assert.equal(state.target,5);
});
test("identical tickets remain tied after 90 and trigger secondary draw",()=>{
  const copy=[entries[0],{...entries[0],uid:"c",number:"000003"}];
  const drawn=Array.from({length:90},(_,i)=>i+1);
  const state=replay(copy,drawn);
  assert.equal(state.winner,null);
  assert.equal(state.contenders.length,2);
  assert.equal(state.fallbackNeeded,true);
});
test("unstarted lottery has no winner",()=>{
  const state=replay(entries,[]);
  assert.equal(state.winner,null);assert.deepEqual(state.contenders,[]);
});

test("1500 entries and 90 balls are processed without an expensive history rescan",()=>{
  const list=Array.from({length:1500},(_,i)=>({
    uid:"member-"+i,number:String(i+1).padStart(6,"0"),
    numbers:[1,2,3,4,5,6,7,8,9,10]
  }));
  const drawn=Array.from({length:90},(_,i)=>i+1);
  const start=Date.now();
  const result=replay(list,drawn);
  assert.equal(result.contenders.length,1500);
  assert.equal(result.fallbackNeeded,true);
  assert.ok(Date.now()-start<5000,"large draw must finish under five seconds");
});

test("custom campaign tickets obey selected ball pool and ticket size",()=>{
  for(const [ballCount,size] of [[30,5],[70,12],[120,30]]){
    const row=ticket(ballCount,size);
    assert.equal(row.length,size);
    assert.equal(new Set(row).size,size);
    assert.ok(row.every(n=>Number.isInteger(n)&&n>=1&&n<=ballCount));
  }
  assert.throws(()=>ticket(20,25),RangeError);
  assert.throws(()=>ticket(125,8),RangeError);
});
test("custom 3-match threshold and 30 numbered balls",()=>{
  const guests=[
    {uid:"u1",number:"000001",numbers:[1,2,3,4,5]},
    {uid:"u2",number:"000002",numbers:[1,2,7,8,9]}
  ];
  const winner=replay(guests,[1,2,3],3,30);
  assert.equal(winner.winner.uid,"u1");
  assert.equal(winner.target,3);
});
