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
assert(html.includes("app.js?v=20261017-28"), "Published app.js cache version must be current");
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
assert(html.includes('app.js?v=20261017-28'), "Guest cart code cache version outdated");
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
assert(admin.includes('admin-firestore.js?v=20261017-26'), "Admin event fix must load without cache");
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
assert(app.includes('body.append(date,name,preorder,interested,planBtn,message);'),
  "RSVP must appear before preorder button");
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
assert(html.includes('id="cartBtn"') &&
  html.indexOf('id="cartBtn"') > html.indexOf('id="menuPage"') &&
  html.indexOf('id="cartBtn"') < html.indexOf('<!-- /menuPage -->'),
  "Cart must be displayed inside Menu section, not header");
assert(html.includes('id="accountMyOrdersBtn"'), "My Orders shortcut must remain in account");
assert(html.includes('class="bali-home-social"') &&
  html.includes('href="tel:+375296700300"') &&
  html.includes('href="https://t.me/baliclubminsk"') &&
  html.includes('href="https://www.instagram.com/baliminsk/"'),
  "Home page must show Call, Telegram and Instagram");
assert(html.includes('class="bali-home-map bali-yandex-map"') &&
  html.includes('href="https://yandex.by/maps/org/bali_night_club/104137822369/"'),
  "Home address must open Yandex Maps");
assert(interestCss.includes('position:sticky') &&
  interestCss.includes('top:var(--bali-header-height,70px)') &&
  interestCss.includes('#eventsSection .events-view-tabs'), "Event plans selector must stick below Bali header");
assert(ordersClient.includes('runTransaction(db,async tx=>') &&
  ordersClient.includes('collection(db,"orders")') &&
  ordersClient.includes('doc(db,"orderCounters",eventDate)') &&
  ordersClient.includes('order_number:orderNumber'), "Order numbers must be sequential per date in transaction");
assert(rules.includes('match /orderCounters/{date}') &&
  rules.includes('validOrderSequence(') &&
  rules.includes('counterWitness(date)'), "Firestore rules must enforce per-date order counters");
assert(app.includes("String(result.order_number).padStart(2,'0')") &&
  app.includes('String(order.orderNumber).padStart(2'), "Guest must see padded date-specific order number");
assert(orderAdminSource.includes('orderLabel = o =>') &&
  orderAdminSource.includes('runTransaction(db,async tx=>'), "Admin must show date-based order numbers and renumber date changes");
assert(html.includes('bali-pages.css?v=20261017-32'), "Updated social icon CSS must load");
const socialStart=html.indexOf('class="bali-home-social"');
const socialEnd=html.indexOf('class="bali-home-map bali-yandex-map"',socialStart);
assert(socialStart>=0 && socialEnd>socialStart, "Home social row missing");
const socialMarkup=html.slice(socialStart,socialEnd);
assert((socialMarkup.match(/class="bali-social-svg"/g)||[]).length===3, "Social row must contain 3 actual SVG icons");
assert((socialMarkup.match(/aria-label="[^"]+"/g)||[]).length>=4, "Social links must have accessible descriptions");
assert(!/>\s*(Позвонить|Telegram|Instagram)\s*</.test(socialMarkup), "Social icons should replace textual button labels");
assert(landingCss.includes(".bali-home-social .bali-social-btn") &&
  landingCss.includes("min-height:66px"), "Icon links need visible touch targets");
const homeTileStart=html.indexOf('class="bali-home-actions"');
const homeTileEnd=html.indexOf('class="bali-home-social"',homeTileStart);
assert(homeTileStart>=0&&homeTileEnd>homeTileStart, "Home navigation tiles must be present");
assert(!html.slice(homeTileStart,homeTileEnd).includes('bali-home-action-arrow'),
  "Menu and Events tiles should have no right arrows");
const yandexMapStart=html.indexOf('class="bali-home-map bali-yandex-map"');
const yandexMapEnd=html.indexOf('</a>',yandexMapStart);
assert(yandexMapStart>=0 && yandexMapEnd>yandexMapStart &&
  html.slice(yandexMapStart,yandexMapEnd).includes('bali-yandex-pin') &&
  html.slice(yandexMapStart,yandexMapEnd).includes('bali-yandex-address') &&
  !html.slice(yandexMapStart,yandexMapEnd).includes('bali-yandex-brand') &&
  !html.slice(yandexMapStart,yandexMapEnd).includes('bali-home-map-arrow'),
  "Address must retain Yandex map pin, centered text, and no arrow");
assert(landingCss.includes('BALI v32') &&
  landingCss.includes('justify-content:center') &&
  landingCss.includes('text-align:center') &&
  landingCss.includes('.bali-yandex-pin{left:10px;top:50%'),
  "Yandex Maps address text must be centered with red pin left on mobile");
console.log("BALI source checks passed: " + ids.length + " required UI IDs, 18 priced menu items and security checks.");
