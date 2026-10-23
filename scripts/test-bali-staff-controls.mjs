import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const html=read("preorders.html"),access=read("preorders-access.js"),
  orders=read("admin-orders.js"),staffRole=read("cloudflare-pages/functions/api/staff-session.js"),
  canonical=read("cloudflare-pages/functions/_lib/d1-orders.js"),
  direct=read("cloudflare-pages/functions/api/d1-preorders.js");
// A single login panel has both choices visible; no expanding another panel.
assert(html.includes('id="adminSignIn"')&&html.includes("Войти через Google"));
assert(html.indexOf('id="adminSignIn"')<html.indexOf('id="preorderStaffLogin"'));
assert(!html.includes("preorder-admin-owner-entry")&&!html.includes('id="adminSwitchAccount"'));
assert(html.includes('id="loginStatus"')&&html.includes('aria-live="polite"'));
assert(access.includes('display("ready")')&&access.includes('display("login")'));
assert(access.includes('showLogin(roleError(error))'));
assert(access.includes('/api/staff-session'));
assert(!access.includes("staffRecentOrders"),"Login may not fetch the entire queue to test a role");
assert(orders.includes('document.addEventListener("toggle",event=>'));
assert(orders.includes('opened.open'));
assert(orders.includes('if(menu!==opened)menu.open=false'));
assert(orders.includes('document.addEventListener("keydown",event=>'));
assert(orders.includes('event.key!=="Escape"'));
assert(orders.includes('expectedUpdatedAt:o.updatedAt'));
assert(orders.includes('if(saved?.deleted!==o.id)'));
assert(!canonical.includes('adminOnly:action==="staffDeleteOrder"'));
assert(!direct.includes('adminOnly:action==="staffDeleteOrder"'));
assert(canonical.includes('"DELETE FROM preorder_orders WHERE id=? AND updated_at_ms=?"'));
assert(direct.includes('"DELETE FROM preorder_orders WHERE id=? AND updated_at_ms=?"'));
assert(staffRole.includes("authorizeStaff(request,{env})"));
assert(!staffRole.includes("staffRecentOrders"));
const injected=staffRole.replace(
  'import {authorizeStaff} from "../_lib/staff-auth.js";',
  'const authorizeStaff=async request=>{if(request.headers.get("Authorization")!=="Bearer valid")throw Object.assign(Error("access-denied"),{status:403});return {uid:"staff-uid",role:"staff"};}'
);
const session=await import("data:text/javascript;base64,"+Buffer.from(injected).toString("base64"));
const url="https://baliminsk.by/api/staff-session";
let response=await session.onRequestGet({request:new Request(url,{headers:{"Authorization":"Bearer valid"}}),env:{}});
assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,role:"staff"});
response=await session.onRequestGet({request:new Request(url,{headers:{"Authorization":"Bearer invalid"}}),env:{}});
assert.equal(response.status,403);
response=await session.onRequestGet({request:new Request(url,{headers:{"Authorization":"Bearer valid","Origin":"https://evil.example"}}),env:{}});
assert.equal(response.status,403);
console.log("BALI STAFF unified login, exclusive ⋯ menus and deletion access contract PASS");
