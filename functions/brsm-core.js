"use strict";
const {randomInt}=require("node:crypto");

// Ten distinct cryptographically-random numbers per guest.
function ticket(ballCount=90,ticketSize=10){
  if(!Number.isInteger(ballCount)||ballCount<10||ballCount>120||
    !Number.isInteger(ticketSize)||ticketSize<1||ticketSize>Math.min(30,ballCount))
    throw new RangeError("Неверные параметры билета.");
  const pool=Array.from({length:ballCount},(_,i)=>i+1);
  for(let i=0;i<ticketSize;i++){
    const j=i+randomInt(pool.length-i);
    [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  return pool.slice(0,ticketSize).sort((a,b)=>a-b);
}

// Compute the result incrementally. A drawn ball is processed only once;
// this avoids repeatedly walking the entire draw history for every guest.
// After the first 5-match cohort exists, only that cohort may win.
function replay(entries,drawn,winMatches=5,ballCount=90){
  if(!Number.isInteger(winMatches)||winMatches<1||!Number.isInteger(ballCount)||ballCount<1)throw new RangeError("Неверная конфигурация тиража.");
  const indexed=new Map();
  const counts=new Array(entries.length).fill(0);
  entries.forEach((entry,i)=>{
    for(const n of entry.numbers){
      if(!indexed.has(n))indexed.set(n,[]);
      indexed.get(n).push(i);
    }
  });
  const seen=new Set();
  let contenders=null,target=winMatches,winner=null;
  for(const ball of drawn){
    if(seen.has(ball))continue; // Defensive: the API rejects duplicates.
    seen.add(ball);
    for(const i of indexed.get(ball)||[])counts[i]++;
    if(contenders){
      let high=target;
      for(const i of contenders)high=Math.max(high,counts[i]);
      if(high>target){
        contenders=contenders.filter(i=>counts[i]===high);
        target=high;
      }
    }else{
      const ready=[];
      for(let i=0;i<entries.length;i++)if(counts[i]>=winMatches)ready.push(i);
      if(ready.length)contenders=ready;
    }
    if(contenders?.length===1){
      winner=entries[contenders[0]];
      break;
    }
  }
  return {
    target,
    contenders:(contenders||[]).map(i=>entries[i].uid),
    winner,
    fallbackNeeded:seen.size===ballCount&&Boolean(contenders?.length>1)
  };
}
module.exports={ticket,replay};
