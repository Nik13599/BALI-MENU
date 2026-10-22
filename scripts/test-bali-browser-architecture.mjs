import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const load=path=>readFile(path,"utf8");
const [guest,admin,staff,app,workflows,reader,publisher,api,stage,schema]=await Promise.all([
  load("index.html"),load("admin.html"),load("preorders.html"),load("app.js"),
  load("cloudflare-pages/build.mjs"),load("bali-public-reader.js"),
  load("cloudflare-pages/functions/api/publish-public.js"),
  load("cloudflare-pages/functions/api/staff-preorders.js"),
  load("cloudflare-pages/functions/api/admin/migrate-preorders.js"),
  load("cloudflare-pages/d1/migrations/0001_preorders.sql")
]);
// BALI is a browser web application. Never prompt to install as a PWA.
for(const [name,page] of [["guest",guest],["admin",admin],["staff",staff]]){
  assert(!/<link[^>]+rel=["']manifest["']/i.test(page),name+" installs a PWA");
  assert(!/beforeinstallprompt|navigator\.serviceWorker\.register/i.test(page),name+" registers an installable worker");
}
assert(!/manifest\.webmanifest|service-worker\.js/i.test(workflows));
assert(app.includes("history.pushState("),"Guest SPA navigation must preserve the page");
assert(app.includes("history.replaceState("),"Browser Back and shared links must remain supported");
assert(app.includes('new CustomEvent("bali:guest-page"'),"Page changes must notify BALI ID modules");
const idClient=await load("bali-id.js");
const idWallet=await load("bali-id-bank.js");
assert(idClient.includes('onAuthStateChanged(auth,resumeCard)')&&
  idWallet.includes('document.body.dataset.baliPage!=="id"'),
  "BALI ID and wallet data may only auto-load while the user is viewing the card");

assert(!guest.includes('src="orders-firestore.js'),"Guest entry must not preload order database");
assert(app.includes('ensureOrdersService()'),"Orders service should be loaded on the actual action");
assert(app.includes('orders.startHistory?.()'),"Order history is requested on demand");
const orderSvc=await load("orders-firestore.js");
assert(!/^onAuthStateChanged\(auth,watchUserOrders\);/m.test(orderSvc) &&
  orderSvc.includes('stopHistoryAuth=onAuthStateChanged(auth,watchUserOrders);'),
  "Order collection subscription must only start when order history is opened");
assert(orderSvc.includes('function stopHistory()'),"Closing history must stop order reads");

assert(guest.includes('id="homeSection"')&&guest.includes('id="eventsSection"')&&
  guest.includes('id="menuPage"'),"Guest sections must stay in a single browser app");
assert(admin.includes('id="adminView"')&&staff.includes('id="adminView"'),
  "Staff and administrator must retain independent workspaces");
assert(!staff.includes('href="admin.html"'),"Staff has no navigation to private admin");
assert(admin.includes("baliPublicPublishAll"),"Public content manual publication missing");
assert(admin.includes("bali-public-publisher.js"),"Public content publish bridge missing");
assert(reader.includes("/api/public-data?path="),"Public data must use the Cloudflare reader");
const visibilityGuest=await load("bali-menu-visibility-guest.js");
assert(visibilityGuest.includes("./bali-public-reader.js")&&!visibilityGuest.includes("firebasejs"),
  "Public menu tabs should not require the Firebase client SDK");
assert(guest.includes("bali-menu-visibility-guest.js"),
  "Guest menu visibility should come from Cloudflare");

assert(publisher.includes("administrator")&&publisher.includes("BALI_PUBLIC_CONTENT"));
assert(!publisher.includes("guestWallets")&&!publisher.includes("preorder_orders"));
assert(api.includes('migration?.status!=="complete"'),"Do not show empty D1 as active queue");
assert(stage.includes("authorizeStaff(request,{adminOnly:true})"),
  "Only the owner can stage private Firestore orders");
assert(stage.includes("cutover:false"),"Data staging must not switch active orders");
assert(schema.includes("UNIQUE(event_id,order_number)"),
  "Event-specific order numbering must remain unique");
assert(schema.includes("REFERENCES preorder_orders(id) ON DELETE CASCADE"),
  "Order/item integrity missing");
console.log("BALI browser-app contract, standalone workspaces and staged D1 migration PASS.");
