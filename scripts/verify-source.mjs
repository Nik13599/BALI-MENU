import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = (name) => readFileSync(name, "utf8");
const html = source("index.html");
const auth = source("auth.js");
const app = source("app.js");
const rules = source("firestore.rules");
const backend = source("Code.gs");
const config = source("firebase-config.js");
const firebaseJson = JSON.parse(source("firebase.json"));

const ids = [
  "accountBtn", "authModal", "closeAuth", "authGoogleBtn",
  "authProfileForm", "authName", "authPhone", "authEmail",
  "authMessage", "authSignOutBtn", "customerName",
  "customerPhone", "customerEmail", "eventDate", "tableNumber"
];
for (const id of ids) {
  assert(html.includes('id="' + id + '"'), "HTML missing " + id);
}
assert(/type="module"\s+src="auth\.js(?:\?v=[0-9-]+)?"/.test(html), "auth.js must be loaded");
assert(auth.includes("GoogleAuthProvider"), "Google sign-in missing");
assert(auth.includes("emailVerified"), "Email must be verified");
assert(auth.includes("serverTimestamp()"), "Server timestamps missing");
assert(auth.includes('doc(database, "users", user.uid)'), "User profile persistence missing");
assert(app.includes("BaliAuth.requireProfile()"), "Checkout must require profile");
const ordersClient = source("orders-firestore.js");
assert(app.includes("window.BaliOrders.save"), "Checkout must use Firestore order service");
assert(ordersClient.includes("getAuth(") && ordersClient.includes("writeBatch("), "Order service must use Firebase authentication and atomic writes");
assert(rules.includes("request.auth.uid == uid"), "Rules need UID ownership");
assert(rules.includes("data.email == request.auth.token.email"), "Rules must pin email");
assert(rules.includes("allow read, write: if false"), "Default deny required");
assert(backend.includes("function verifyAdminToken(token) { return false; }"), "Legacy admin auth must be disabled");
assert(backend.includes("Google authentication is not yet configured"), "Legacy order endpoint must remain disabled");
assert(!config.includes("PRIVATE KEY") && !config.includes("client_secret"), "Secrets must not be in client config");
const start = config.indexOf("Object.freeze(");
const end = config.indexOf(");", start);
assert(start >= 0 && end > start, "Missing web Firebase config");
const cfg = JSON.parse(config.slice(start + "Object.freeze(".length, end));
for (const field of ["apiKey", "authDomain", "projectId", "appId"]) {
  assert(typeof cfg[field] === "string" && cfg[field].trim(), "Firebase config missing " + field);
}
assert(cfg.projectId === "bali-menu-5a48b", "Unexpected Firebase project");
assert(cfg.authDomain === cfg.projectId + ".firebaseapp.com", "Firebase auth domain mismatch");
assert(!Object.values(cfg).some(v => typeof v === "string" && v.startsWith("REPLACE_WITH_")), "Firebase placeholders remain");
assert(firebaseJson.firestore.rules === "firestore.rules", "Missing Firestore rules path");
assert(firebaseJson.hosting.public === ".", "Unexpected Firebase Hosting public directory");
const admin = source("admin.html");
const menuClient = source("menu-firestore.js");
const adminClient = source("admin-firestore.js");
assert(html.includes('id="eventSelect"'), "Preorder event selection missing");
assert(html.includes('id="bookingId"'), "Booking ID input missing");
assert(html.includes('id="tableNumber"'), "Table number input missing");
assert(html.includes('menu-firestore.js?v='), "Firestore public catalog module missing");
assert(admin.includes('admin-firestore.js?v='), "Secure admin module missing");
assert(!admin.includes('id="adminPassword"'), "Legacy admin password form must be removed");
assert(menuClient.includes('collection(db, "menu")') && menuClient.includes('collection(db, "events")'), "Catalog must read Firestore menu and events");
assert(adminClient.includes('doc(db,"admins",user.uid)') && adminClient.includes('role.data().active!==true'), "Admin role check missing");
assert(rules.includes('match /menu/{itemId}') && rules.includes('match /events/{eventId}'), "Firestore catalog rules missing");
assert(rules.includes('allow create, update: if isAdmin()'), "Catalog writes must require admin role");
assert((rules.match(/match \/\{document=\*\*\}/g) || []).length === 1, "Unexpected catch-all rules or corrupted rules");
const seedSource = source("menu-seed.js");
const { BALI_MENU_SEED } = await import("data:text/javascript," + encodeURIComponent(seedSource));
assert(BALI_MENU_SEED.length === 18, "Menu photo must contain 18 items");
assert(new Set(BALI_MENU_SEED.map(item => item.id)).size === 18, "Menu IDs must be unique");
assert(new Set(BALI_MENU_SEED.map(item => item.category)).size === 5, "Menu must contain five groups");
assert(BALI_MENU_SEED.every(item => Number.isInteger(item.price) && item.price > 0), "Every product requires a positive BYN price");
assert(admin.includes('id="seedImportBtn"') && admin.includes('id="seedPreview"'), "Menu import controls missing");
assert(adminClient.includes('runTransaction(db') && adminClient.includes('current[i].exists()'), "Menu import must skip existing documents in a transaction");
const responsive = source("responsive-menu.css");
assert(html.includes('responsive-menu.css?v=20261017-13'), "Responsive stylesheet must be loaded with current cache version");
assert(html.indexOf('responsive-menu.css?v=20261017-13') > html.indexOf('href="auth.css"'), "Responsive stylesheet must load after auth.css");
assert(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/.test(responsive), "Desktop must use 5 columns");
assert(/@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1199px\)/.test(responsive), "Tablet breakpoint missing");
assert(/@media\s*\(max-width:\s*767px\)/.test(responsive), "Phone breakpoint missing");
assert(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(responsive), "Tablet must use 3 columns");
assert(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(responsive), "Phone must use 2 columns");
assert(responsive.includes('grid-template-areas:') && responsive.includes('display: contents'), "Mobile two-row header missing");
assert(responsive.includes('.modal-content') && responsive.includes('.cart-sidebar'), "Phone modal/cart adjustments missing");
assert(responsive.includes('font-size: 16px;'), "iOS form-zoom prevention missing");
assert((responsive.match(/\{/g)||[]).length === (responsive.match(/\}/g)||[]).length, "Responsive CSS brace mismatch");
const css = source("styles.css");
assert(css.includes("repeat(5, minmax(0, 1fr))"), "Desktop/tablet BALI menu must have 5 columns");
assert(css.includes("repeat(3, minmax(0, 1fr))"), "Mobile BALI menu must have 3 columns");
assert(app.includes("menu-quantity-value") && app.includes("data-menu-action=\"minus\"")
  && app.includes("data-menu-action=\"plus\"") && app.includes("addToCart(itemId, quantity)"),
  "Product quantity controls must add selected number of items");
assert(css.includes(".menu-quantity-btn"), "Quantity selector styles missing");
assert(html.includes("app.js?v=20261017-12"), "Published app.js cache version must be current");
assert(html.includes("styles.css?v=20261017-12"), "Published menu styles must be refreshed");
assert(rules.includes("match /orders/{orderId}"), "Order Rules must exist before enabling order UI");
console.log("BALI source checks passed: " + ids.length + " required UI IDs, 18 priced menu items and security checks.");
