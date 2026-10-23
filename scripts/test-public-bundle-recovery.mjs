/* Regression for temporary Cloudflare public-bundle outages.
 * Runs in Node without network, accounts, browser rendering, or file writes.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const moduleText=readFileSync("bali-public-reader.js","utf8");
assert.match(moduleText,/BUNDLE_FAILURE_RETRY_MS/);
const realNow=Date.now;
let now=realNow();
Date.now=()=>now;
class WindowFixture extends EventTarget {}
globalThis.window=new WindowFixture();
globalThis.window.BALI_FIREBASE_CONFIG=null;
globalThis.document=new EventTarget();
globalThis.document.hidden=false;
globalThis.CustomEvent??=class extends Event{
  constructor(name,options){super(name);this.detail=options?.detail;}
};
let bundles=0,fallbacks=0,online=false;
const doc=(name,title)=>({
  name:"projects/demo/databases/(default)/documents/"+name+"/one",
  fields:{title:{stringValue:title}}
});
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,headers:{"Content-Type":"application/json"}
});
globalThis.fetch=async input=>{
  const url=new URL(String(input),"https://baliminsk.by");
  if(url.pathname==="/api/public-bundle"){
    bundles++;
    return online?json({sources:{
      events:[doc("events","events-live")],
      menu:[doc("menu","menu-live")]
    }}):json({error:"temporarily unavailable"},503);
  }
  if(url.pathname==="/api/public-data"){
    fallbacks++;
    const path=url.searchParams.get("path");
    return json({documents:[doc(path,path+"-fallback")]});
  }
  throw Error("Unexpected request "+url);
};
const {collection,onSnapshot}=await import("data:text/javascript;base64,"+
  Buffer.from(moduleText).toString("base64"));
const states={events:[],menu:[]};
const errors=[];
const stops=["events","menu"].map(path=>onSnapshot(
  collection(null,path),snap=>states[path].push(snap.docs.map(d=>d.data().title)),
  e=>errors.push(e)
));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(ok,description){
  for(let i=0;i<70&&!ok();i++)await tick();
  assert(ok(),description);
}
try{
  await until(()=>states.events.length===1&&states.menu.length===1,"Fallback delivers both collections");
  assert.equal(bundles,1,"Concurrent readers share the failed bundle request");
  assert.equal(fallbacks,2,"Separate paths only load after bundle fails");
  assert.deepEqual(errors,[]);
  const focus=()=>window.dispatchEvent(new Event("focus"));
  now+=3000;
  focus();focus();document.dispatchEvent(new Event("visibilitychange"));
  await tick();
  assert.equal(fallbacks,2,"Combined focus events must not multiply fallback requests");
  now+=21000;
  online=true;
  focus();
  await until(()=>states.events.length===2&&states.menu.length===2,
    "Bundle automatically recovers after short backoff");
  assert.equal(bundles,2,"One recovered bundle replaces every fallback path");
  assert.equal(fallbacks,2,"No further per-path reads after bundle recovers");
  assert.deepEqual(states.events[1],["events-live"]);
  assert.deepEqual(states.menu[1],["menu-live"]);
  now+=16000;
  focus();
  await tick();await tick();
  assert.equal(bundles,2,"Successful bundle reuses its five-minute cache");
  assert.equal(states.events.length,2,"Unchanged content must not trigger repeat DOM updates");
  assert.equal(states.menu.length,2,"Unchanged menus must not trigger repeat DOM updates");
  assert.deepEqual(errors,[]);
  console.log("BALI public API: shared outage, short recovery, focus debouncing, unchanged content PASS");
}finally{
  stops.forEach(stop=>stop());
  Date.now=realNow;
}
