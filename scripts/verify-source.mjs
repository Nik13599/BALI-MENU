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
const customIconJs=source("bali-icon-atelier.js");
const premiumAtelierCss=source("bali-atelier-theme.css");

const velvetCss=source("bali-velvet-night.css");
assert(html.includes('bali-velvet-night.css?v=20261017-55') &&
  admin.includes('bali-velvet-night.css?v=20261017-55') &&
  html.indexOf('bali-velvet-night.css?v=20261017-55') >
  html.indexOf('bali-atelier-theme.css?v=20261017-54') &&
  admin.indexOf('bali-velvet-night.css?v=20261017-55') >
  admin.indexOf('bali-atelier-theme.css?v=20261017-54'),
  "Vibrant BALI palette must override old bamboo colors on guests and admin");
assert(velvetCss.includes("/* BALI v55") &&
  velvetCss.includes("--bali-v55-pink:#ff4ba5") &&
  velvetCss.includes("--bali-v55-gold:#f0bf66") &&
  velvetCss.includes("body.bali-guest-theme #homeSection .bali-home-menu-banner") &&
  velvetCss.includes("body.bali-guest-theme #eventsSection #eventsGrid>.event-card.is-active") &&
  velvetCss.includes("body.bali-guest-theme #menuPage .category-btn.active") &&
  velvetCss.includes("body.bali-guest-theme .bali-profile-action") &&
  velvetCss.includes(".bali-admin-theme .admin-tab.active") &&
  velvetCss.includes(".bali-admin-theme button.primary"),
  "High-contrast premium fuchsia, champagne and black must cover all pages");
assert(html.includes('content="#090811"') && admin.includes('content="#090811"') &&
  html.includes('bali-icon-atelier.js?v=20261017-53') &&
  admin.includes('bali-icon-atelier.js?v=20261017-53'),
  "System theme color and custom menu-book icons must remain consistent");

const guestClass='class="bali-guest-theme"';
const adminClass='class="bali-admin-theme"';
assert(html.includes(guestClass) &&
  admin.includes(adminClass) &&
  html.includes('bali-atelier-theme.css?v=20261017-54') &&
  admin.includes('bali-atelier-theme.css?v=20261017-54') &&
  html.includes('bali-icon-atelier.js?v=20261017-53') &&
  admin.includes('bali-icon-atelier.js?v=20261017-53'),
  "BALI low-glare design and custom icons must load on public site and admin");
assert(premiumAtelierCss.includes("--bali-luxe-night:#0c0d11") &&
  premiumAtelierCss.includes("--bali-luxe-champagne:#c8ae86") &&
  premiumAtelierCss.includes("--bali-luxe-wine:#372630") &&
  premiumAtelierCss.includes(".bali-bottom-nav") &&
  premiumAtelierCss.includes(".bali-home-event-card") &&
  premiumAtelierCss.includes("#menuPage") &&
  premiumAtelierCss.includes(".bali-admin-theme"),
  "All app sections and admin should use the same muted premium color system");
assert(premiumAtelierCss.includes("/* BALI v54 • BASALT / BAMBOO / VOLCANO") &&
  premiumAtelierCss.includes("--bali-basalt:#0d100e") &&
  premiumAtelierCss.includes("--bali-bamboo:#9eae8a") &&
  premiumAtelierCss.includes("--bali-leaf:#2a382d") &&
  premiumAtelierCss.includes("--bali-ember:#aa6750") &&
  premiumAtelierCss.includes("body.bali-guest-theme #menuPage .category-btn.active") &&
  premiumAtelierCss.includes("body.bali-guest-theme #homeSection .bali-home-menu-banner") &&
  premiumAtelierCss.includes("body.bali-guest-theme .bali-bottom-nav") &&
  premiumAtelierCss.includes("body.bali-admin-theme") &&
  premiumAtelierCss.includes(".bali-admin-theme .admin-tab.active") &&
  html.includes('<meta name="theme-color" content="#0d100e">') &&
  admin.includes('<meta name="theme-color" content="#0d100e">'),
  "Bamboo, leafy basalt and subtle volcanic ember colors required on mobile, tablet, desktop and admin");
assert(customIconJs.includes('"book":') &&
  customIconJs.includes('menu:"book"') &&
  customIconJs.includes('replaceAll(".bali-menu-banner-icon","book")') &&
  customIconJs.includes('menu:"book",events:"calendar"') &&
  !customIconJs.includes('"cocktail"') &&
  customIconJs.includes("setAttribute(\"aria-label\",\"Закрыть\")"),
  "Menu must use a designed open book; icon controls must remain accessible");

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
assert(html.includes('responsive-menu.css?v=20261017-21'), "Responsive stylesheet must be loaded with current cache version");
assert(html.indexOf('responsive-menu.css?v=20261017-21') > html.indexOf('href="auth.css"'), "Responsive stylesheet must load after auth.css");
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
assert(html.includes("app.js?v=20261017-52"), "Published app.js cache version must be current");
assert(html.includes("styles.css?v=20261017-12"), "Published menu styles must be refreshed");
assert(rules.includes("match /orders/{orderId}"), "Order Rules must exist before enabling order UI");
const dashboardCss = source("admin-dashboard.css");
const dashboardJs = source("admin-dashboard.js");
assert(admin.includes('id="adminOrdersPanel"') && admin.includes('id="adminMenuPanel"') && admin.includes('id="adminEventsPanel"'), "Admin must have separate Orders, Menu and Events workspaces");
assert(admin.includes('data-admin-tab="orders"') && admin.includes('data-admin-tab="menu"') && admin.includes('data-admin-tab="events"'), "Admin navigation tabs missing");
assert(admin.includes('admin-dashboard.css?v=20261017-20') && admin.includes('admin-dashboard.js?v=20261017-20'), "Updated dashboard files must be loaded");
assert(dashboardCss.includes('@media(max-width:760px)') && dashboardCss.includes('.admin-sidebar'), "Mobile dashboard navigation CSS missing");
assert(dashboardJs.includes('adminPageTitle') && dashboardJs.includes('menuSearch'), "Dashboard navigation and menu search missing");
assert(dashboardJs.includes('bali:admin:orders') && dashboardJs.includes('bali:admin:menu') && dashboardJs.includes('bali:admin:events'), "Dashboard realtime counters missing");
assert(html.includes('responsive-menu.css?v=20261017-21'), "Guest mobile layout CSS cache version outdated");
assert(html.includes('app.js?v=20261017-52'), "Guest cart code cache version outdated");
assert(responsive.includes('.cart-total > .total-amount') && responsive.includes('white-space:nowrap'), "Cart total must fit amount and BYN in one line");
assert(app.includes('${total.toFixed(2)} BYN') && html.includes('<span>Итого:</span>'), "Cart total must use compact BYN format");
assert(html.includes('auth.js?v=20261017-16'), "Guest profile label code should load without old cache");
assert(html.includes('id="homeSection"') && html.includes('id="menuPage"') &&
  html.includes('id="eventsSection"'), "Guest app must provide separate Home, Menu and Events pages");
assert(responsive.includes('#accountBtn::before') && responsive.includes("data:image/svg+xml"), "Mobile account must show the person icon");
assert(responsive.includes('touch-action: manipulation'), "Double-tap zoom must be disabled while pinch zoom stays available");
assert(auth.includes('profile ? profile.name : "Профиль"'), "Mobile cabinet button must display signed-in name");
const adminCategoryIds = [
  "addMenuBtn","addCategoryBtn","menuDialog","categoryDialog",
  "menuForm","menuCategory","newCategoryFromProduct","categoryForm",
  "categoryName","categoryList","menuList","menuSearch"
];
for(const id of adminCategoryIds)
  assert(admin.includes('id="' + id + '"'), "Admin category/product UI missing " + id);
assert(admin.includes('<select id="menuCategory" required>'), "Product category must be selected from saved options");
assert(admin.includes('id="menuDialog"') && admin.includes('id="categoryDialog"'), "Product and category editors must be popup dialogs");
assert(adminClient.includes('collection(db,"categories")') && adminClient.includes('categoryDocId(name)'), "Category collection persistence missing");
assert(adminClient.includes('menu-category-group') && adminClient.includes('openProductDialog(item)'), "Catalog must group products by category and edit via modal");
assert(adminClient.includes('closeProductDialog();') && adminClient.includes('await setDoc(ref,data)'), "Saving edits must close the product dialog");
assert(rules.includes('match /categories/{categoryId}') && rules.includes('validCategory(request.resource.data)'), "Category write permissions must be admin-only");
assert(dashboardJs.includes('group.querySelectorAll(".entry")'), "Category groups must be searchable");
assert(dashboardCss.includes('.admin-form-dialog') && dashboardCss.includes('.menu-category-group'), "Modal and categorized catalog styles missing");
const clientSource = source("admin-clients.js");
const orderAdminSource = source("admin-orders.js");
const imageProcessor = source("image-compressor.js");
for (const id of ["adminClientsPanel","clientSearch","clientList","clientHistoryList",
  "orderEditDialog","editOrderLines","editOrderAddProduct","menuImageFile",
  "eventPosterFile","showArchivedOrders"]) {
  assert(admin.includes('id="' + id + '"'), "CRM/Orders/Uploads: missing " + id);
}
assert(admin.includes('admin-clients.js?v=20261017-20'), "Client CRM JS not loaded");
assert(admin.includes('admin-orders.js?v=20261017-20'), "Staff order editor JS not loaded");
assert(admin.includes('admin-firestore.js?v=20261017-46'), "Admin event fix must load without cache");
assert(clientSource.includes('where("ownerUid","==",selected.uid)') && clientSource.includes('startAfter(lastOrder)'),
  "Client history needs owner-only paged retrieval");
assert(orderAdminSource.includes('writeBatch(db)') && orderAdminSource.includes('archiveOrder') &&
  orderAdminSource.includes('getDoc(doc(db,"menu",String(line.id)))'), "Order item edit + archive must validate menu price");
assert(rules.includes('allow list: if isAdmin();') && rules.includes('match /orders/{orderId}'),
  "Guest CRM privacy and admin access missing");
assert(rules.includes("data.poster_url") && rules.includes("data:image/webp;base64") &&
  rules.includes("image_url.size() <= 95000"), "Secure compressed poster/product storage missing");
assert(imageProcessor.includes('canvas.toDataURL("image/webp"') && imageProcessor.includes('const ratio=poster?4/5:1;'),
  "Image compression must create 1:1 dishes and 4:5 flyers");
assert(adminClient.includes('compressImage(file,"product")') &&
  adminClient.includes('compressImage(file,"poster")'), "Image picker must upload to Firestore");
assert(html.includes('id="eventsNavBtn"') && html.includes('id="eventsSection"'), "Guest events tab missing");
assert(app.includes('renderUpcomingEvents()') && app.includes('.sort((a,b)=>a.date.localeCompare(b.date))'),
  "Upcoming events must display nearest first");
assert(responsive.includes('grid-template-rows:auto 42px') &&
  responsive.includes('.header-content #menuNavBtn,') &&
  responsive.includes('.header-content #eventsNavBtn{') &&
  responsive.includes('height:42px'), "Mobile Menu and Events must align on one baseline");
const modernHeader = source("header-modern.css");
assert(html.includes('header-modern.css?v=20261017-22'), "Modern BALI navigation must load");
assert(html.indexOf('header-modern.css?v=20261017-22') >
  html.indexOf('responsive-menu.css?v=20261017-21'), "Header overrides must load after responsive CSS");
assert(modernHeader.includes('grid-template-areas:"brand brand brand account" "menu events orders cart"'),
  "Premium mobile header must keep profile above cart and all four controls in the same row");
assert(modernHeader.includes('grid-template-rows:43px 42px') &&
  modernHeader.includes('height:42px'), "Mobile navigation items must align");
assert(modernHeader.includes('.header #menuNavBtn.active') &&
  modernHeader.includes('.header #eventsNavBtn.active'), "Active navigation state must remain visible");
assert(modernHeader.includes('prefers-reduced-motion:reduce') &&
  modernHeader.includes('focus-visible'), "Header must support keyboard and reduced motion");
assert((modernHeader.match(/\\{/g)||[]).length === (modernHeader.match(/\\}/g)||[]).length,
  "Modern BALI header CSS has unbalanced braces");
const categoryCss = source("menu-categories.css");
assert(html.includes('menu-categories.css?v=20261017-23'), "Category layout CSS not linked");
assert(html.indexOf('menu-categories.css?v=20261017-23') >
  html.indexOf('header-modern.css?v=20261017-22'), "Sticky category stylesheet must load after header CSS");
assert(app.includes("class=\"menu-category-block\"") && app.includes("menu-category-heading"),
  "All menu view must render product categories with visible headings");
assert(app.includes("const groups = new Map()") && app.includes("groups.get(name).push(item)"),
  "Products must be grouped by their category");
assert(app.includes('initStickyCategories()') &&
  app.includes("new ResizeObserver(syncHeight)"), "Sticky category toolbar needs accurate header height");
assert(categoryCss.includes("position: sticky") &&
  categoryCss.includes("var(--bali-header-height, 80px)") &&
  categoryCss.includes("z-index: 950"), "Category toolbar must stay below sticky header");
assert(categoryCss.includes("overflow-x: auto") &&
  categoryCss.includes("flex-wrap: nowrap"), "Category filters must remain horizontally scrollable");
assert(categoryCss.includes("repeat(5, minmax(0, 1fr))") &&
  categoryCss.includes("repeat(3, minmax(0,1fr))") &&
  categoryCss.includes("repeat(2, minmax(0,1fr))"), "Grouped menu must keep desktop/tablet/mobile grids");
assert(admin.includes('id="eventRulesHelp"') &&
  admin.includes('https://console.firebase.google.com/project/bali-menu-5a48b/firestore/rules'),
  "Event admin error must link to live Firestore rules");
assert(adminClient.includes('if(poster)payload.poster_url=poster'),
  "Event saves without a poster must omit the optional field");
assert(adminClient.includes('e.code==="permission-denied"') &&
  adminClient.includes("if(help)help.hidden=false"),
  "Permission denial during event poster save must provide rule deployment guidance");
assert(app.includes('button.textContent="Сделать предзаказ";'), "Upcoming event CTA must read Сделать предзаказ");
const interestSource = source("event-interests.js");
const interestCss = source("event-interests.css");
assert(html.includes('event-interests.js?v=20261017-26') &&
  html.includes('event-interests.css?v=20261017-29'), "Guest interest module and styles must load");
assert(html.includes('id="plannedEventsCount"') &&
  html.includes('id="eventsViewTabs"'), "My Plans event filter missing");
assert(app.includes('Хочу пойти') &&
  app.includes('Хочет пойти: ') &&
  app.includes('guestInterestDates.has(event.date)'), "Event cards must display RSVP button and public counts");
assert(app.includes('window.setInterval(()=>') &&
  app.includes('renderUpcomingEvents();'), "Past events must disappear automatically from My Plans");
assert(app.includes('details.append(name,times,description,interested,message);') &&
  app.includes('actions.append(planBtn);') &&
  app.includes('actions.append(button);') &&
  app.includes('body.append(details,actions);') &&
  !app.includes('className="event-card-date"'),
  "Date must only appear on square poster; event details above bottom-anchored CTAs");
assert(interestSource.includes('runTransaction(db,async transaction=>') &&
  interestSource.includes('transaction.update(eventRef,{interestCount:') &&
  interestSource.includes('transaction.delete(selectedRef)') &&
  interestSource.includes('transaction.set(selectedRef,'), "Attendance and counts must update in one transaction");
assert(interestSource.includes('collection(db,"users",watcherUid,"eventInterests")'),
  "User event choices must be private");
assert(rules.includes('match /users/{uid}/eventInterests/{eventDate}') &&
  rules.includes('existsAfter(mine)') &&
  rules.includes('getAfter(/databases/$(database)/documents/events/$(eventDate))'),
  "Firestore Rules must enforce atomic RSVP document and count updates");
assert(rules.includes('validInterestCountChange(eventId)') &&
  rules.includes("hasOnly(['interestCount'])"), "Guests must only change public counters through their own RSVP");
assert(adminClient.includes('" · Хочет пойти: "') &&
  adminClient.includes('payload,{merge:true}'),
  "Admin calendar must show counts and preserve them when editing events");
assert(interestCss.includes('.event-want-to-go') &&
  interestCss.includes('.event-interest-count'), "Mobile RSVP styling must exist");
assert((rules.match(/match \/events\/\{eventId\}/g)||[]).length===1 &&
  (rules.match(/match \/\{document=\*\*\}/g)||[]).length===1,
  "Firestore Rules must contain one event match and one catchall");
const landingCss = source("bali-pages.css");
assert(html.includes('<title>Bali</title>') &&
  html.includes('bali-pages.css?v=20261017-32'), "Bali landing brand and CSS missing");
assert(html.includes('id="homeSection"') &&
  html.includes('id="menuPage"') &&
  html.includes('id="contactsSection"') &&
  html.includes('id="homeFloatingBtn"'), "Separate guest page sections missing");
assert(html.includes('id="homeBrandBtn"') &&
  html.includes('id="menuNavBtn"') &&
  html.includes('id="eventsNavBtn"'), "Home page navigation missing");
assert(app.includes('renderGuestPage(routeFromLocation()') &&
  app.includes('addEventListener("popstate"') &&
  app.includes('navigateGuestPage(page'), "Guest app must support browser Back navigation");
assert(landingCss.includes('.bali-floating-home{left:') &&
  landingCss.includes('right:auto'), "Floating home navigation must be bottom-left");
assert(!html.includes('id="cartBtn"') &&
  !html.includes('id="myOrdersBtn"') &&
  !html.includes('id="cartCount"') &&
  !html.includes('class="bali-menu-toolbar"') &&
  html.includes('id="baliCartDock"') &&
  html.includes('id="baliDockCount"') &&
  html.includes('id="baliDockTotal"') &&
  html.includes('id="profileMyOrdersBtn"'),
  "Menu top toolbar must be absent; fixed cart and Profile/My Orders must remain");
assert(html.includes('id="accountMyOrdersBtn"'), "My Orders shortcut must remain in account");
// Home starts with the calendar: advertising hero intentionally removed.
assert(!html.includes('class="bali-hero-scene"') &&
  !html.includes('Современный<br>ночной клуб') &&
  !html.includes('Лучшие вечеринки.') &&
  html.includes('class="bali-home-calendar-row"'),
  "Home should start at calendar without redundant club advertising hero");
assert(html.includes('class="bali-home-calendar-row"') &&
  html.includes('data-home-events-view="all"') &&
  html.includes('data-home-events-view="planned"'), "Home calendar and My Plans controls missing");
assert(html.includes('id="homeEventCarousel"') &&
  app.includes('function renderHomeEvents()') &&
  app.includes('bali-home-event-card'), "Home event story carousel missing");
assert(!html.includes('id="homeEventPosition"') &&
  !html.includes('class="bali-home-story-note"') &&
  !app.includes('updateHomeEventPosition()'),
  "Homepage must not show slide numbering or redundant introductory text");
assert(html.includes('class="bali-home-contacts-card"') &&
  html.includes('class="bali-home-social"') &&
  html.includes('bali-social-phone') &&
  html.includes('bali-social-telegram') &&
  html.includes('bali-social-instagram') &&
  html.includes('class="bali-home-map bali-yandex-map"') &&
  html.includes('href="tel:+375296700300"') &&
  html.includes('href="https://t.me/baliclubminsk"') &&
  html.includes('href="https://www.instagram.com/baliminsk/"') &&
  html.includes('href="https://yandex.by/maps/org/bali_night_club/104137822369/"') &&
  (html.match(/class="bali-social-svg"/g)||[]).length===3,
  "Home must retain original Call, Telegram, Instagram SVG buttons and Yandex Maps button");
assert(html.includes('class="bali-home-menu-banner"') &&
  html.includes('id="menuNavBtn"'), "Home menu shortcut must remain functional");
assert(html.includes('class="bali-home-contacts-card"') &&
  html.includes('class="bali-home-social"') &&
  html.includes('class="bali-home-map bali-yandex-map"'),
  "Original BALI contact actions must remain present");
const mobileLayoutCss=source("bali-redesign.css");
assert(mobileLayoutCss.includes("/* BALI v38: self-contained viewport layout on phones.") &&
  mobileLayoutCss.includes("#menuPage .menu-section{") &&
  mobileLayoutCss.includes("overflow-y:auto!important") &&
  mobileLayoutCss.includes("touch-action:pan-x pan-y!important"),
  "Static mobile screens must keep only menu scrolling vertically and event stories horizontally");
assert(app.includes("menuSection.scrollTop = 0") &&
  app.includes('if(window.matchMedia("(max-width:767px)").matches)return;'),
  "Mobile category change must scroll the product list without hijacking gestures");
const approvedCss=source("bali-redesign.css");
const squareCss=source("bali-event-square.css");
assert(html.includes('bali-event-square.css?v=20261017-50') &&
  html.indexOf('bali-event-square.css?v=20261017-50') >
  html.indexOf('bali-home-premium.css?v=20261017-49'),
  "Square event styling must load after the mobile and premium styles");
assert(squareCss.includes("aspect-ratio:1 / 1") &&
  squareCss.includes(".bali-event-info {") &&
  squareCss.includes(".bali-event-actions {") &&
  squareCss.includes("margin-top:auto") &&
  squareCss.includes("overflow-y:auto"),
  "Square poster, independently scrollable info and bottom pinned actions required");
assert(app.includes('track.clientHeight-(mobile?185:195)') &&
  app.includes('(track.clientHeight-14)*9/16'),
  "Carousel must reserve vertical space for square image and event actions");

const premiumCss=source("bali-home-premium.css");
const homeStoriesCss=source("bali-home-stories.css");
assert(html.includes('bali-home-stories.css?v=20261017-52') &&
  html.indexOf('bali-home-stories.css?v=20261017-52') >
  html.indexOf('bali-event-square.css?v=20261017-50'),
  "Homepage square card overrides must load after event card styles");
assert(homeStoriesCss.includes("aspect-ratio:1/1") &&
  homeStoriesCss.includes(".bali-home-poster-wrap") &&
  homeStoriesCss.includes(".bali-home-event-info") &&
  homeStoriesCss.includes(".bali-home-heart.is-liked svg") &&
  homeStoriesCss.includes("fill:#f02b50") &&
  homeStoriesCss.includes("touch-action:pan-x pan-y"),
  "Home events should show square artwork and a clear-to-red accessible heart while preserving horizontal swipes");
assert(app.includes('const card=document.createElement("article");') &&
  app.includes('heart.setAttribute("aria-pressed",String(liked))') &&
  app.includes('window.BaliInterests.toggle(event.date)') &&
  app.includes('click.stopPropagation()') &&
  app.includes('syncHeart(guestInterestDates.has(event.date))') &&
  app.includes('requestAnimationFrame(()=>{\n            track.scrollLeft='),
  "Home RSVP hearts must persist through Firebase and not activate the event overlay or reset carousel scroll");
assert(html.includes('id="homeInterestFeedback"') &&
  app.includes('getElementById("homeInterestFeedback")') &&
  app.includes('result?.loginRequired') &&
  app.includes('heart.disabled=true') &&
  app.includes('heart.disabled=false'),
  "Home hearts need login, pending-operation and save-error feedback");

assert(html.includes('<section class="bali-home-events-panel"') &&
  html.includes('id="homeEventCarousel"') &&
  html.includes('id="menuNavBtn"') &&
  html.includes('class="bali-home-contacts-card"') &&
  html.indexOf('bali-home-events-panel') < html.indexOf('id="menuNavBtn"') &&
  html.indexOf('id="menuNavBtn"') < html.indexOf('class="bali-home-contacts-card"'),
  "Home should be grouped in order: events, menu and contacts");
assert(html.includes('bali-home-premium.css?v=20261017-49') &&
  html.indexOf('bali-home-premium.css?v=20261017-49') >
  html.indexOf('bali-redesign.css?v=20261017-46'),
  "Premium home CSS must load after the existing phone, tablet and desktop CSS");
assert(premiumCss.includes("/* BALI NIGHT CLUB · premium home zones, v49") &&
  premiumCss.includes("grid-template-rows:minmax(0,1fr) auto auto!important") &&
  premiumCss.includes("@media(max-width:767px)") &&
  premiumCss.includes("@media(min-width:768px)") &&
  premiumCss.includes(".bali-home-events-panel") &&
  premiumCss.includes(".bali-home-menu-banner") &&
  premiumCss.includes(".bali-home-contacts-card"),
  "Premium home zones must fit the viewport on both small and large devices");
assert(premiumCss.includes("overflow-x:auto!important") &&
  premiumCss.includes("overflow-y:hidden!important") &&
  premiumCss.includes("touch-action:pan-x pan-y") &&
  html.includes('href="tel:+375296700300"') &&
  html.includes('href="https://t.me/baliclubminsk"'),
  "Home carousel must preserve native swipe, and existing contact links must remain");

assert(approvedCss.includes("/* BALI v47: mobile viewport slots.") &&
  approvedCss.includes("body>.header{") &&
  approvedCss.includes("order:-3;") &&
  approvedCss.includes("body>.bali-bottom-nav{") &&
  approvedCss.includes("inset:auto 0 0 0!important") &&
  approvedCss.includes("grid-template-rows:auto minmax(0,1fr) auto auto") &&
  approvedCss.includes("#menuPage .menu-section{") &&
  approvedCss.includes("overflow-y:auto!important"),
  "Mobile header must stay at top, bottom navigation at bottom and only menu list scroll");

assert(admin.includes('id="eventDescription"') &&
  admin.includes('id="eventStartTime"') && admin.includes('id="eventEndTime"') &&
  admin.includes('admin-firestore.js?v=20261017-46'),
  "Event description, start and end time must be configurable in the admin form");
assert(adminClient.includes('payload.description=description') &&
  adminClient.includes('payload.startTime=startTime') &&
  adminClient.includes('payload.endTime=endTime') &&
  adminClient.includes('$("eventStartTime").value=event.startTime||""') &&
  adminClient.includes('$("eventEndTime").value=event.endTime||""'),
  "Event timing and description must persist and load when editing");
assert(rules.includes("'description','startTime','endTime'") &&
  rules.includes("data.description.size() <= 600") &&
  rules.includes("data.startTime.matches") &&
  rules.includes("data.endTime.matches") &&
  rules.includes("validInterestCountChange(eventId)"),
  "Firestore event validation must allow safe admin-written descriptions and event times");
assert(!app.includes('className="event-preorder-state"') &&
  app.includes('openBadge.textContent="● Предзаказ открыт"') &&
  app.includes('if(open){'),
  "Preorder status should be visible only in poster badge, not duplicated in details");
assert(app.includes('className="bali-event-hours"') &&
  app.includes('className="bali-event-description"') &&
  app.includes('startTime+"–"+endTime') &&
  !app.includes('event.cutoff+"–"'),
  "Public events must show configured times without substituting preorder cutoff");
assert(approvedCss.includes("/* BALI v46: poster on top, event information and time beneath the image.") &&
  approvedCss.includes("position:relative!important;") &&
  approvedCss.includes(".bali-event-description{") &&
  approvedCss.includes(".bali-event-hours{"),
  "Descriptions and event times should render in a separate card area below the poster");

assert(approvedCss.includes("/* BALI v45: home alignment and compact single-row menu purchase controls.") &&
  approvedCss.includes(".bali-home .bali-home-inner>.bali-home-menu-banner{") &&
  approvedCss.includes("align-self:stretch;") &&
  approvedCss.includes("width:100%;") &&
  approvedCss.includes("#menuPage .menu-category-block .menu-purchase-controls{") &&
  approvedCss.includes("grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);") &&
  approvedCss.includes("grid-template-columns:minmax(0,1.23fr) minmax(0,1fr);") &&
  approvedCss.includes("min-height:113px;"),
  "Menu cards must be compact; quantity (- 1 +) and Add-to-cart inline across breakpoints");
assert(app.includes('data-menu-action="minus"') &&
  app.includes('data-menu-action="plus"') &&
  app.includes('data-menu-action="add"'),
  "Existing quantity and cart handlers must remain connected");
const adaptiveCss=approvedCss;
assert(adaptiveCss.includes("/* BALI v44") &&
  adaptiveCss.includes("@media (min-width:768px)") &&
  adaptiveCss.includes("@media (min-width:768px) and (max-width:1199px)") &&
  adaptiveCss.includes("@media (min-width:1200px)") &&
  adaptiveCss.includes("@media (min-width:768px) and (max-height:720px)") &&
  adaptiveCss.includes("#menuPage .menu-section{") &&
  adaptiveCss.includes("overflow-y:auto!important") &&
  adaptiveCss.includes(".bali-home .bali-home-inner{"),
  "Phone/tablet/desktop breakpoints need viewport fitting, fixed category/cart and catalog scroll");
assert(app.includes("const rounded=Math.max(96,Math.floor(width));") &&
  app.includes("(track.clientHeight-14)*9/16"),
  "Event slide sizing must respond to viewport height and never force old 155px minimum");

assert(approvedCss.includes("/* BALI v42") &&
  approvedCss.includes("height:86%!important") &&
  approvedCss.includes("aspect-ratio:9/16") &&
  approvedCss.includes("width:94%") &&
  approvedCss.includes("min-height:76px!important") &&
  approvedCss.includes("min-height:66px!important") &&
  !approvedCss.includes("width:calc(100vw - 8px)") &&
  approvedCss.includes("min-height:41px") &&
  approvedCss.includes("min-height:45px;height:45px"),
  "Homepage posters must be smaller and calendar, menu, contacts must have larger mobile controls");
assert(approvedCss.includes("/* BALI v40: home screen begins immediately with the calendar.") &&
  approvedCss.includes("width:calc(100% + 14px)") &&
  approvedCss.includes("height:40px;min-height:40px") &&
  approvedCss.includes("height:39px;min-height:39px"),
  "Home must have wider menu and moderately larger contact controls");
assert(approvedCss.includes("/* BALI v41: compact event calendar above its tabs; shorter posters,") &&
  approvedCss.includes("height:calc(100% - 18px)!important") &&
  approvedCss.includes("#eventsSection .events-topbar .events-heading{") &&
  approvedCss.includes("#eventsSection .event-interest-count{display:block!important"),
  "Events should show compact calendar, slightly shorter stories and all event details");
assert(html.includes('bali-redesign.css?v=20261017-46') &&
  html.indexOf('bali-redesign.css?v=20261017-46') >
    html.indexOf('events-carousel.css?v=20261017-36'),
  "Approved mobile visual override must load last");
assert(html.includes('id="profileSection"') &&
  html.includes('id="profileMyOrdersBtn"') &&
  html.includes('id="profileMyPlansBtn"') &&
  html.includes('id="profileDataBtn"') &&
  html.includes('id="profileLogoutBtn"'), "Guest account screen must preserve profile actions");
assert(html.includes('id="baliCartDock"') &&
  html.includes('id="baliDockCount"') &&
  html.includes('id="baliDockTotal"') &&
  app.includes('dockCount.textContent=String(totalItems)') &&
  app.includes('dockTotal.textContent='), "Fixed cart must show quantity and total");
assert(approvedCss.includes('.bali-cart-dock{position:fixed') &&
  approvedCss.includes('bottom:calc(var(--bali-bottom-size)') &&
  approvedCss.includes('.bali-bottom-nav{position:fixed'), "Fixed cart must stay above bottom navigation");
assert(approvedCss.includes('/* Menu: original sticky category filters intentionally not changed.') &&
  app.includes('const groups = new Map()') &&
  app.includes('updateCategoryButtons()'), "Original menu category filtering must remain intact");
const carouselCss=source("events-carousel.css");
assert(html.includes('events-carousel.css?v=20261017-36'), "Swipe carousel stylesheet must load");
assert(html.indexOf('events-carousel.css?v=20261017-36') >
  html.indexOf('bali-pages.css?v=20261017-32'), "Carousel must override older event grid styles");
assert(html.includes('id="eventsCarouselShell"') &&
  html.includes('id="eventsCarouselPosition"') &&
  html.includes('aria-roledescription="карусель"'), "Accessible event carousel shell missing");
assert(!html.includes('<h2 class="section-title">Меню BALI</h2>'),
  "Do not duplicate menu title after category buttons");
assert(app.includes('function initEventCarousel()') &&
  app.includes('track.addEventListener("wheel"') &&
  app.includes('track.addEventListener("keydown"'),
  "Events must scroll by desktop wheel and keyboard");
assert(app.includes('const previousDate=previousCards[previousIndex]?.dataset.eventDate') &&
  app.includes('centerEventCard(grid,cards[restoreIndex],false)'),
  "Realtime RSVP refreshes must preserve carousel position");
assert(carouselCss.includes('scroll-snap-type:x mandatory') &&
  carouselCss.includes('touch-action:pan-x') &&
  carouselCss.includes('overflow-x:auto'),
  "Carousel must swipe horizontally and snap to event cards");
assert(carouselCss.includes('body[data-bali-page="events"]{overflow-y:hidden}') &&
  carouselCss.includes('height:calc(100dvh - var(--bali-header-height'),
  "Events must remain a fixed-height screen instead of a vertical feed");
assert(carouselCss.includes('BALI EVENTS v35') &&
  carouselCss.includes('object-fit:contain') &&
  carouselCss.includes('.event-card.is-active'), "Centered carousel must display a full poster with legible detail controls");
assert(carouselCss.includes('padding:9px 0 max(64px,env(safe-area-inset-bottom))'),
  "Carousel must reserve safe room for floating home button on mobile");
assert(html.includes('class="events-info-panel"') &&
  html.includes('Твой вечер начинается в BALI'), "Bottom event information area is missing");
assert(carouselCss.includes('transform:scale(.86) translateY(7px)') &&
  carouselCss.includes('transform:scale(1) translateY(0)') &&
  carouselCss.includes('transition:'), "Neighbor slides must shrink and active slide must grow smoothly");
assert(app.includes('card.classList.toggle("is-active",focused)') &&
  app.includes('const middle=viewport.left+viewport.width/2') &&
  app.includes('function centerEventCard('), "Carousel must track and center active event during swipe");
assert(carouselCss.includes('font-size:16px') &&
  carouselCss.includes('min-height:41px') &&
  carouselCss.includes('.events-info-panel'), "Mobile detail labels, actions and info panel must be readable");
assert(html.includes('class="events-topbar"') &&
  html.includes('<h2 class="events-eyebrow" id="eventsHeadingGuest">BALI календарь</h2>'),
  "Bali Calendar must be the only visible title above Stories");
assert(!html.includes('Ближайшие мероприятия по датам — от самого раннего к следующему.') &&
  !html.includes('id="eventsHeadingGuest">События</h2>'),
  "Remove redundant Events title and explanatory subtitle");
const topbarStart=html.indexOf('class="events-topbar"');
const topbarEnd=html.indexOf('id="eventsInterestStatus"',topbarStart);
assert(topbarStart>=0 && topbarEnd>topbarStart &&
  html.slice(topbarStart,topbarEnd).includes('id="eventsViewTabs"'),
  "All Events/My Plans must share a row with Bali Calendar");
assert(html.includes('Выбирай событие, добавляй в «Мои планы» или оформляй предзаказ.'),
  "Small footer copy must be concise and fit two lines");
assert(carouselCss.includes('BALI v36') &&
  carouselCss.includes('aspect-ratio:9 / 16') &&
  carouselCss.includes('grid-template-columns:none'),
  "Mobile stories must use vertical 9:16 slides instead of split mini cards");
assert(carouselCss.includes('line-clamp:2') &&
  carouselCss.includes('.events-topbar') &&
  carouselCss.includes('flex-wrap:nowrap'),
  "Calendar topbar and footer must remain compact");
assert(app.includes('const fitStorySlides=()=>') &&
  app.includes('(track.clientHeight-14)*9/16') &&
  app.includes('observer.observe(track)'),
  "Stories must size from measured available height");
console.log("BALI source checks passed: " + ids.length + " required UI IDs, 18 priced menu items and security checks.");

assert(!app.includes("elements.cartCount") &&
  !app.includes("getElementById('cartBtn')") &&
  !app.includes("getElementById('myOrdersBtn')") &&
  app.includes('document.getElementById("baliCartDock")?.addEventListener("click",openCart)'),
  "Fixed bottom cart and profile order actions must not depend on deleted menu toolbar controls");
