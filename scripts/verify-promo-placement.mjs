/* BALI promo CTA regression checks; pure, no Firebase connection required. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const helper=readFileSync("bali-promo-placement.js","utf8");
const imported=await import("data:text/javascript;base64,"+Buffer.from(helper).toString("base64"));
const {PROMO_POSITION_PRESETS,PROMO_POSITION_OPTIONS,promoEditorMode,promoEditorXY,promoStorePlacement,promoPositionStyle}=imported;
const presets=Object.entries(PROMO_POSITION_PRESETS);
assert.equal(presets.length,9,"Nine preset locations required");
assert.equal(PROMO_POSITION_OPTIONS.length,12,"Nine locations + original + hidden + free movement");
assert.equal(new Set(PROMO_POSITION_OPTIONS.map(([name])=>name)).size,12,"Dropdown entries must be distinct");

for(const [key,coords] of presets){
  assert.deepEqual(promoEditorXY(key),coords,key+" should be correctly aligned");
  const stored=promoStorePlacement(key);
  assert.deepEqual(stored,{mode:"manual",x:coords.x,y:coords.y},
    key+" must use the existing Firestore schema");
  assert.equal(promoEditorMode(stored),key,"Position must round-trip "+key);
}
assert.deepEqual(promoStorePlacement("none"),{mode:"none",x:50,y:82},"Hiding CTA must persist");
assert.equal(promoStorePlacement("original"),null,"Original artwork must not create a new CTA");
assert.equal(promoEditorMode(undefined),"original","Existing holiday hotspots must remain available");
assert.equal(promoPositionStyle(promoStorePlacement("top-left")).left,"4%","Left CTA must stay in frame");
assert.equal(promoPositionStyle(promoStorePlacement("top-right")).right,"4%","Right CTA must stay in frame");
assert.equal(promoPositionStyle(promoStorePlacement("bottom-right")).lowerRight,true,"Avoid carousel control collision");
assert.equal(promoEditorMode({mode:"none",x:50,y:82}),"none","Hidden state must round-trip");
assert.deepEqual(promoStorePlacement("manual",-20,140),{mode:"manual",x:5,y:95},
  "Manual drag coordinates must stay within the existing security limits");
for(const [oldMode,newMode] of [["left","bottom-left"],["center","bottom-center"],["right","bottom-right"]]){
  assert.equal(promoEditorMode({mode:oldMode,x:50,y:82}),newMode,"Legacy layout compatibility");
}
const html=readFileSync("admin.html","utf8");
const normal=readFileSync("bali-admin-promos.js","utf8");
const visual=readFileSync("bali-promo-simple-editor.js","utf8");
const host=readFileSync("bali-pc-offers.js","utf8");
const css=readFileSync("bali-admin-promo-placement.css","utf8");
assert(html.includes('id="baliPromoButtonPlacement"'),"Admin editor selector missing");
const styles=JSON.parse(readFileSync("styles/entries.json","utf8"));
assert(html.includes('data-bali-bundle="admin"')&&styles['admin.html'].some(file=>file.split('?')[0]==="bali-admin-promo-placement.css"),"Admin preview styling missing");
for(const [key] of presets){
  assert(html.includes('<option value="'+key+'">'),"Admin dropdown missing "+key);
}
assert(normal.includes("promoStorePlacement"),"Main editor must serialize via shared helper");
assert(visual.includes("promoStorePlacement"),"Visual editor must serialize via shared helper");
assert(visual.includes("promoEditorMode"),"Visual editor must restore saved position");
assert(visual.includes("data-promo-position-stage"),"Visual preview for all devices missing");
assert(host.includes('const disabled=mode==="none"'),"Hidden CTA not recognized by public carousel");
assert(host.includes("action.hidden=offer.destination"),"Public hide logic missing");
assert(host.includes("image.getAttribute(\"src\")!==primary"),"Public renderer should avoid reloading unchanged images");
assert(visual.includes("previewScheduled"),"Editor drag-preview updates must be coalesced");
assert(css.includes(".bali-promo-simple-position-stage"),"Position preview styles missing");
const rules=readFileSync("firestore.rules","utf8");
assert(rules.includes("data.buttonPlacement.mode in ['none','left','center','right','manual']"),
  "Storage compatibility with live Firestore rules lost");
console.log("BALI: 9 CTA presets, hidden/manual, legacy restore and both admin editors OK.");
