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
assert(/BaliAuth\??\.getIdToken\(\)/.test(app), "Checkout must obtain ID token");
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
console.log("BALI source checks passed: " + ids.length + " required UI IDs + security checks.");
