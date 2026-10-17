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

const themeClient=source("bali-theme.js");
const themeCss=source("bali-theme.css");

const neutralLimeCss=source("bali-lime-neutral.css");

const desktopLayoutCss=source("bali-desktop-fullwidth.css");

const barPublic=source("bali-bar-menu.js");
const barCss=source("bali-bar-menu.css");
// On phones the four menu maps use accessible icon-only square controls,
// not the previous two-row arrangement of wide text buttons.
for(const [key,label] of [
  ["kitchen","Меню кухни"],["bar","Барная карта"],
  ["hookah","Кальянная карта"],["tea","Чайная карта"]
]){
  const tab=html.match(new RegExp('<button[^>]*data-bali-menu-mode="'+key+'"[^>]*>[\\s\\S]*?<\\/button>'));
  assert(tab && tab[0].includes('aria-label="'+label+'"') &&
    tab[0].includes('bali-menu-mode-icon') &&
    tab[0].includes('bali-menu-mode-label') &&
    tab[0].includes('<svg') && tab[0].includes('viewBox="0 0 48 48"'),
    "Mobile icon button missing or not accessible: "+key);
}
assert(barCss.includes('@media(max-width:767px)') &&
  barCss.includes('flex-flow:row nowrap!important') &&
  barCss.includes('flex:0 0 46px!important') &&
  barCss.includes('.bali-menu-mode-label{') &&
  barCss.includes('display:none!important;') &&
  barCss.includes('.bali-menu-mode-btn[hidden]{display:none!important}') &&
  barCss.includes('.bali-menu-mode-btn.is-active{'),
  "Four compact mobile icon-only menu switches must stay on a single row and support hidden/selected states");
// PC-only improvements: menu tabs and calendar title align with the top of the
// BALI sidebar logo; six fully functional cards per dish row; fading event edges.
assert(html.includes('bali-pc-reference.css?v=20261017-86') &&
  source("bali-pc-reference.css").includes('v81 — Desktop menu/calendar') &&
  source("bali-pc-reference.css").includes('padding-top:21px!important') &&
  source("bali-pc-reference.css").includes('body.bali-guest-theme #menuPage #baliMenuModeSwitch') &&
  source("bali-pc-reference.css").includes('grid-template-columns:repeat(6,minmax(0,1fr))!important') &&
  source("bali-pc-reference.css").includes('body.bali-guest-theme #menuPage .menu-category-block .menu-purchase-controls') &&
  source("bali-pc-reference.css").includes('grid-template-columns:1fr!important') &&
  source("bali-pc-reference.css").includes('body.bali-guest-theme #eventsSection .events-topbar') &&
  source("bali-pc-reference.css").includes('grid-template-columns:minmax(0,1fr) auto clamp(200px,18.5vw,280px)!important') &&
  source("bali-pc-reference.css").includes('body.bali-guest-theme #eventsSection .events-topbar #eventsViewTabs') &&
  source("bali-pc-reference.css").includes('grid-column:2!important') &&
  source("bali-pc-reference.css").includes('--bali-calendar-edge-width:') &&
  source("bali-pc-reference.css").includes('--bali-calendar-edge-opacity:') &&
  source("bali-pc-reference.css").includes('-webkit-mask-image:linear-gradient(to right,') &&
  source("bali-pc-reference.css").includes('scroll-behavior:smooth!important') &&
  source("bali-pc-reference.css").includes('(prefers-reduced-motion:reduce)'),
  "PC menu/category grid and calendar heading, profile clearance and fade animation must be preserved");
// Kitchen, Bar, Hookah, Tea now share ONE permanent category/search toolbar
// on desktop, tablet and phone, with live Firebase categories per collection.
assert(html.includes('id="baliSharedMenuControls"') &&
  html.includes('id="baliSharedCategories"') &&
  ["categoryFilter","baliBarCategoryFilter","baliHookahCategoryFilter","baliTeaCategoryFilter"]
    .every(id=>html.includes('id="'+id+'"')) &&
  html.includes('id="baliMenuSearch"') &&
  html.indexOf('id="baliSharedMenuControls"') < html.indexOf('id="baliKitchenContent"') &&
  html.indexOf('id="baliSharedMenuControls"') < html.indexOf('id="baliBarContent"') &&
  html.includes('id="baliMenuHeading"') &&
  html.includes('BALI МЕНЮ') &&
  barCss.includes('v85 — ONE shared category strip and search') &&
  barCss.includes('#menuPage .bali-shared-menu-controls') &&
  barCss.includes('#menuPage #baliSharedCategories .bali-shared-category-filter[hidden]') &&
  barCss.includes('@media(max-width:767px)') &&
  app.includes('window.BaliActiveMenuMode=mode') &&
  app.includes('bali:menu-mode-changed') &&
  barPublic.includes('search?.addEventListener("input"') &&
  barPublic.includes('current.term') &&
  source("bali-extra-menus.js").includes('search?.addEventListener("input"') &&
  source("bali-extra-menus.js").includes('state.term') &&
  !barPublic.includes('addToCart(') &&
  !source("bali-extra-menus.js").includes('addToCart('),
  "Every device and all four menu maps must share identical category/search layout without food preorders in other maps");
const liveStudio=source("bali-design-studio.js");
const studioCss=source("bali-design-studio.css");
const siteAdmin=source("bali-site-content-admin.js");
const sitePublic=source("bali-site-content.js");
assert(admin.includes('bali-design-studio.css?v=20261017-84') &&
  admin.includes('bali-design-studio.js?v=20261017-85') &&
  admin.includes('bali-site-content-admin.js?v=20261018-96') &&
  admin.includes('id="baliDesignLiveFrame"') &&
  admin.includes('id="baliDesignCanvas"') &&
  admin.includes('data-studio-device="desktop"') &&
  admin.includes('data-studio-device="tablet"') &&
  admin.includes('data-studio-device="phone"') &&
  admin.includes('data-site-field="menuPageTitle"') &&
  html.includes('bali-site-content.js?v=20261018-95') &&
  liveStudio.includes('frame.contentDocument') &&
  liveStudio.includes('selectionFrom(target)') &&
  liveStudio.includes('fit()') &&
  studioCss.includes('body[data-bali-admin-section="design"] .admin-stats{display:none!important}') &&
  siteAdmin.includes('doc(db,"settings","homeInterface")') &&
  siteAdmin.includes('menuPageTitle:"BALI МЕНЮ"') &&
  sitePublic.includes('label("#baliMenuHeading",data.menuPageTitle)') &&
  rules.includes('function validHomeInterface(d)') &&
  rules.includes("settingId == 'homeInterface' && validHomeInterface(request.resource.data)") &&
  rules.includes("allow get: if settingId in ['appearance','menuVisibility','homeDesign','homeInterface','homeEventPlaceholder']"),
  "Live admin design studio must preview all 3 real device layouts, permit block editing and protect the site settings in Firestore");
// v87 PC viewport is a fixed full-width, full-height 3-column dashboard.
// Other desktop pages must not scroll down; only product lists scroll.
const viewportCss=source("bali-pc-viewport.css");
assert(html.includes('bali-pc-viewport.css?v=20261018-93') &&
  viewportCss.includes('@media (min-width:1180px)') &&
  viewportCss.includes('--bali-pc-side:clamp(195px,15vw,640px)') &&
  viewportCss.includes('--bali-pc-gap:clamp(11px,1vw,42px)') &&
  viewportCss.includes('--bali-pc-right:clamp(275px,20.7vw,900px)') &&
  viewportCss.includes('grid-template-columns:minmax(0,1fr) var(--bali-pc-right)!important') &&
  viewportCss.includes('grid-template-rows:minmax(0,2.75fr) minmax(0,1fr)!important') &&
  viewportCss.includes('height:100dvh!important') &&
  viewportCss.includes('body.bali-guest-theme #homeSection .bali-home-inner') &&
  viewportCss.includes('body.bali-guest-theme #homeSection .bali-home-events-panel') &&
  viewportCss.includes('body.bali-guest-theme #homeSection .bali-home-menu-banner') &&
  viewportCss.includes('body.bali-guest-theme #homeSection .bali-pc-right-rail') &&
  viewportCss.includes('body.bali-guest-theme #eventsSection #eventsGrid') &&
  viewportCss.includes('overflow-x:auto!important') &&
  viewportCss.includes('body.bali-guest-theme #menuPage #baliKitchenContent .menu-section') &&
  viewportCss.includes('overflow-y:auto!important') &&
  viewportCss.includes('body.bali-guest-theme #eventsSection,') &&
  viewportCss.includes('body.bali-guest-theme #profileSection,') &&
  viewportCss.includes('v88 — Unified graphite-free PC centre') &&
  viewportCss.includes('background:#080b11!important') &&
  viewportCss.includes('background-image:none!important') &&
  viewportCss.includes('body.bali-guest-theme #homeSection .bali-home-events-panel::before') &&
  viewportCss.includes('body.bali-guest-theme #homeSection .bali-home-menu-banner') &&
  viewportCss.includes('body.bali-guest-theme #contactsSection,'),
  "Desktop approved dashboard must fit the full viewport and preserve only catalog/horizontal event scrolling");
// Only the PC HOME teaser is padded to five slots. The actual calendar
// receives no invented event objects, RSVP buttons, or coming-soon entries.
const homeTeaser=app.slice(app.indexOf('function renderHomeEvents()'),app.indexOf('function renderUpcomingEvents()'));
assert(homeTeaser.includes('const isPcHome=window.matchMedia("(min-width:1180px)").matches') &&
  homeTeaser.includes('Math.max(0,5-upcoming.length)') &&
  homeTeaser.includes('bali-home-event-card bali-home-event-placeholder') &&
  homeTeaser.includes('posterTitle:"SECRET"') &&
  homeTeaser.includes('Совсем скоро узнаете') &&
  homeTeaser.includes('if(!upcoming.length&&!isPcHome)') &&
  !app.slice(app.indexOf('function renderUpcomingEvents()')).includes('bali-home-event-placeholder') &&
  viewportCss.includes('v89 — Desktop home: cards take the former calendar heading') &&
  viewportCss.includes('v90 — Five balanced HOME event slots') &&
  viewportCss.includes('grid-template-columns:repeat(5,minmax(0,1fr))!important') &&
  viewportCss.includes('body.bali-guest-theme #homeSection .bali-pc-events-title {') &&
  viewportCss.includes('body.bali-guest-theme #homeSection #homeEventCarousel>.bali-home-event-placeholder'),
  "PC HOME only must display five slots and extend posters; full calendar stays real-only.");
// All 5 PC Home event cells share one editable visual style, NOT fake events.
const placeholderAdmin=source("bali-home-placeholder-admin.js");
const placeholderPublic=source("bali-home-placeholder.js");
const adminPlaceholderCss=source("bali-home-placeholder-admin.css");
assert(admin.includes('id="baliEventPlaceholderEditor"') &&
  admin.includes('id="baliEventPlaceholderForm"') &&
  admin.includes('id="baliPlaceholderImageFile"') &&
  admin.includes('id="baliPlaceholderPosterTitle"') &&
  admin.includes('bali-home-placeholder-admin.js?v=20261018-92') &&
  admin.includes('bali-home-placeholder-admin.css?v=20261018-93') &&
  html.includes('bali-home-placeholder.js?v=20261018-92') &&
  placeholderAdmin.includes('doc(db,"settings","homeEventPlaceholder")') &&
  placeholderAdmin.includes('compressImage(upload,"design-placeholder")') &&
  placeholderAdmin.includes('getDoc(doc(db,"admins",user.uid))') &&
  placeholderAdmin.includes('setDoc(ref,{...values,updatedAt:serverTimestamp()})') &&
  placeholderAdmin.includes('baliPlaceholderRestoreDefaults') &&
  placeholderPublic.includes('posterTitle:"SECRET"') &&
  placeholderPublic.includes('footerTitle:"СКОРО В BALI"') &&
  placeholderPublic.includes('footerSubtitle:"Совсем скоро узнаете"') &&
  placeholderPublic.includes('onSnapshot(doc(db,"settings","homeEventPlaceholder")') &&
  placeholderPublic.includes('new CustomEvent("bali:home-placeholder")') &&
  app.includes('window.BaliHomePlaceholder||{') &&
  app.includes('if(settings.imageUrl){') &&
  !homeTeaser.includes('assets/bali-secret-placeholder.svg') &&
  !homeTeaser.includes('overlay.append(kicker,message)') &&
  !admin.includes('id="baliPlaceholderKicker"') &&
  !admin.includes('id="baliPlaceholderPreviewKicker"') &&
  !placeholderAdmin.includes('baliPlaceholderPreviewKicker') &&
  placeholderAdmin.includes('data.kicker="SECRET"') &&
  placeholderAdmin.includes('image.hidden=!customPicture') &&
  viewportCss.includes('v92 — Minimal PC HOME placeholders') &&
  viewportCss.includes('v93 — SECRET is centered geometrically') &&
  viewportCss.includes('top:50%!important') &&
  viewportCss.includes('left:50%!important') &&
  viewportCss.includes('transform:translate(-50%,-50%)!important') &&
  adminPlaceholderCss.includes('v93 — Match the site: SECRET') &&
  viewportCss.includes('background:#000!important') &&
  viewportCss.includes('justify-content:flex-start!important') &&
  viewportCss.includes('padding:8px 11px!important') &&
  viewportCss.includes('font-size:clamp(13px,1vw,17px)!important') &&
  viewportCss.includes('font-size:11px!important') &&
  adminPlaceholderCss.includes('v92 — Default SECRET artwork is solid black') &&
  app.includes('window.addEventListener("bali:home-placeholder"') &&
  viewportCss.includes('v91 — Branded SECRET picture') &&
  viewportCss.includes('bali-home-placeholder-image') &&
  adminPlaceholderCss.includes('.bali-placeholder-preview-card') &&
  source("image-compressor.js").includes('"design-placeholder":{ratio:3/4,maxChars:120000') &&
  rules.includes('function validHomeEventPlaceholder(d)') &&
  rules.includes("settingId == 'homeEventPlaceholder' && validHomeEventPlaceholder(request.resource.data)") &&
  !app.slice(app.indexOf('function renderUpcomingEvents()')).includes('BaliHomePlaceholder'),
  "Shared SECRET poster must be editable in admin Events, default consistently, and never appear on full calendar.");
// v96: PC contact actions and socials are independent sets of 3; cart is
// fluorescent whenever nonempty; image-less menu cards reserve no photo.
const contactsCss=source("bali-contact-channels.css");
assert(html.includes('bali-contact-channels.css?v=20261018-96') &&
  html.includes('bali-site-content.js?v=20261018-95') &&
  admin.includes('bali-site-content-admin.js?v=20261018-96') &&
  html.includes('data-bali-contact="telegram-chat"') &&
  html.includes('href="https://t.me/BALI_MINSK"') &&
  html.includes('data-bali-contact="whatsapp"') &&
  html.includes('data-bali-contact="viber"') &&
  html.includes('data-bali-contact="telegram-channel"') &&
  html.includes('data-bali-contact="instagram"') &&
  html.includes('data-bali-contact="tiktok"') &&
  contactsCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))') &&
  contactsCss.includes('button#baliPcCartBtn:not([hidden])') &&
  contactsCss.includes('background:#b9ff51!important') &&
  contactsCss.includes('#menuPage .menu-item--no-image') &&
  app.includes("menu-item--no-image") &&
  app.includes("const withImage=Boolean(imageSource") &&
  app.includes("image.remove();") &&
  source("bali-site-content.js").includes('wa.href="https://wa.me/"+digits') &&
  source("bali-site-content.js").includes('viber.href="viber://chat?number=%2B"+digits') &&
  source("bali-site-content-admin.js").includes('telegramChatUrl:"https://t.me/BALI_MINSK"') &&
  rules.includes('d.telegramChatUrl is string') &&
  rules.includes('d.tiktokUrl is string'),
  "PC contact rows, glowing nonempty cart, and no-image dish cards must render correctly.");
// 18+ age confirmation is required for bar and hookah only, never tea.
const ageGate=source("bali-age-gate.js");
const ageCss=source("bali-age-gate.css");
assert(html.includes('id="baliAgeGate"') &&
  html.includes('bali-age-gate.js?v=20261018-97') &&
  html.includes('bali-age-gate.css?v=20261018-98') &&
  app.includes('if(mode==="bar"||mode==="hookah")') &&
  app.includes('switchBaliMenuMode("kitchen")') &&
  app.includes('window.BaliAgeGate?.confirm?.()') &&
  ageGate.includes('consentRef=uid=>doc(db,"users",uid,"ageConfirmations","restrictedMenus")') &&
  ageGate.includes('window.BaliAuth?.isRegistered?.()') &&
  ageGate.includes('dialog.showModal()') &&
  ageCss.includes('.bali-age-dialog::backdrop') &&
  html.includes('Предзаказ кальянов недоступен') &&
  html.includes('Заказать кальян можно непосредственно в заведении') &&
  html.includes('Предзаказ чая недоступен') &&
  html.includes('Заказать чай можно непосредственно в заведении') &&
  source('bali-bar-menu.css').includes('#menuPage #baliHookahContent .bali-bar-intro') &&
  rules.includes('match /users/{uid}/ageConfirmations/{consentId}'),
  "Bar and hookah require 18+ account-based confirmation; tea and hookah read-only notices display.");
const barAdmin=source("bali-admin-bar.js");
const barAdminCss=source("bali-admin-bar.css");
assert(html.includes('id="baliMenuModeSwitch"') &&
  html.includes('data-bali-menu-mode="kitchen"') &&
  html.includes('data-bali-menu-mode="bar"') &&
  html.includes('id="baliKitchenContent"') &&
  html.includes('id="baliBarContent"') &&
  html.includes('id="baliBarList"') &&
  html.includes('id="baliBarCategoryFilter"') &&
  html.includes('Предзаказ алкогольной продукции недоступен') &&
  html.indexOf('id="baliMenuModeSwitch"') < html.indexOf('id="categoryFilter"') &&
  html.includes('bali-bar-menu.css?v=20261018-98') &&
  html.includes('bali-bar-menu.js?v=20261017-85'),
  "Menu must open on Kitchen and place a read-only Bar tab above Kitchen categories");
assert(app.includes("let baliActiveMenuMode = 'kitchen'") &&
  app.includes('function switchBaliMenuMode(nextMode)') &&
  app.includes('mode!=="kitchen"') &&
  app.includes('selected!=="menu"||baliActiveMenuMode!=="kitchen"') &&
  app.includes('switchBaliMenuMode("kitchen")') &&
  app.includes('if(mode!=="kitchen"&&typeof closeCart==="function")closeCart()'),
  "Bar page must never expose checkout dock or food order interactions");
assert(barPublic.includes('collection(db,"bar_menu")') &&
  barPublic.includes('onSnapshot(') &&
  barPublic.includes('bali-bar-row') &&
  barPublic.includes('bali-bar-portions') &&
  barPublic.includes('bali-bar-volume') &&
  barPublic.includes('bali-bar-price') &&
  barPublic.includes('bali-bar-category-name') &&
  barPublic.includes('formatPrice(price)') &&
  !barPublic.includes('BaliOrders') &&
  !barPublic.includes('add-to-cart-btn') &&
  !barPublic.includes('openCheckout('),
  "Bar prices must be real Firestore data shown as grouped rows, without preorder code");
const extraMenus=source("bali-extra-menus.js");
assert(["kitchen","bar","hookah","tea"].every(name=>html.includes('data-bali-menu-mode="'+name+'"')) &&
  html.includes('id="baliHookahContent"') && html.includes('id="baliTeaContent"') &&
  html.includes('id="baliHookahCategoryFilter"') && html.includes('id="baliTeaCategoryFilter"') &&
  html.includes('id="baliHookahList"') && html.includes('id="baliTeaList"') &&
  html.includes('bali-extra-menus.js?v=20261017-85') &&
  app.includes('hookah:"baliHookahContent"') && app.includes('tea:"baliTeaContent"') &&
  app.includes('mode!==section') &&
  extraMenus.includes('collection:"hookah_menu"') && extraMenus.includes('collection:"tea_menu"') &&
  extraMenus.includes('onSnapshot(') &&
  !extraMenus.includes('BaliOrders') &&
  !extraMenus.includes('addToCart(') &&
  !extraMenus.includes('openCheckout('),
  "Kitchen bar hookah and tea must be distinct; hookah and tea are live read-only prices, never preorder");
assert(rules.includes('match /hookah_menu/{hookahId}') &&
  rules.includes('match /tea_menu/{teaId}') &&
  /match \/hookah_menu\/\{hookahId\}\s*\{\s*allow get, list: if true;/.test(rules) &&
  /match \/tea_menu\/\{teaId\}\s*\{\s*allow get, list: if true;/.test(rules) &&
  rules.includes('validBarMenuItem(request.resource.data)'),
  "Guest price lists are public but only verified administrators can edit their content");
// Administrators can toggle all four public menu tabs without deleting catalog records.
const visibilitySource=source("bali-menu-visibility.js");
const adminVisibilityCss=source("bali-admin-cards.css");
const pcReferenceCss=source("bali-pc-reference.css");
assert(["kitchen","bar","hookah","tea"].every(key=>
    admin.includes('data-bali-visibility-toggle="'+key+'"') &&
    admin.includes('data-bali-visibility-state="'+key+'"')) &&
  admin.includes('id="baliCatalogVisibilityTitle"') &&
  admin.includes('id="baliVisibilityStatus"') &&
  admin.includes('bali-menu-visibility.js?v=20261017-72') &&
  html.includes('bali-menu-visibility.js?v=20261017-72') &&
  visibilitySource.includes('doc(db,"settings","menuVisibility")') &&
  visibilitySource.includes('onSnapshot(configRef') &&
  visibilitySource.includes('onAuthStateChanged(auth') &&
  visibilitySource.includes('role.data()?.active!==true') &&
  visibilitySource.includes('serverTimestamp()') &&
  visibilitySource.includes('window.dispatchEvent(new CustomEvent("bali:menu-visibility"') &&
  rules.includes("data.sections.keys().hasOnly(['kitchen','bar','hookah','tea'])") &&
  rules.includes("settingId == 'menuVisibility' && validMenuVisibility(request.resource.data)") &&
  app.includes('window.addEventListener("bali:menu-visibility"') &&
  app.includes('button.hidden=!visible') &&
  app.includes('switchBaliMenuMode(baliActiveMenuMode)') &&
  barCss.includes('.bali-menu-mode-btn[hidden]{display:none!important}') &&
  html.includes('id="baliMenuUnavailableNotice"') &&
  adminVisibilityCss.includes('.bali-visibility-track'),
  "Four independent menu visibility switches must be secure, persisted and reflected live for guests");
assert(html.includes('class="bali-pc-sidebar-contacts"') &&
  html.includes('class="bali-pc-contact-phone"') &&
  html.includes('class="bali-pc-contact-socials"') &&
  html.includes('class="bali-pc-contact-location"') &&
  html.includes('3-й этаж · Яндекс Карты') &&
  html.includes('href="https://t.me/baliclubminsk"') &&
  html.includes('href="https://www.instagram.com/baliminsk/"') &&
  html.includes('href="tel:+375296700300"') &&
  html.includes('class="bali-home-contacts-card"') &&
  pcReferenceCss.includes('.bali-pc-sidebar-contacts') &&
  pcReferenceCss.includes('body.bali-guest-theme #homeSection .bali-home-contacts-card{display:none!important}') &&
  !html.includes('Барная карта и кухня'),
  "PC contacts belong in persistent left sidebar, mobile contacts remain available, menu banner no subtitle");
// Homepage design tools must be publicly read-only and safely admin-managed.
const designAdmin=source("bali-home-design-admin.js");
const designPublic=source("bali-home-design.js");
const designVariants=source("bali-design-variants.js");
const promosAdmin=source("bali-admin-promos.js");
const promosPublic=source("bali-pc-offers.js");
assert(admin.includes('id="adminDesignPanel"') &&
  admin.includes('data-admin-tab="design"') &&
  source("admin-dashboard.js").includes('design: ["Дизайн главной"') &&
  admin.includes('id="baliHomeAboutForm"') &&
  admin.includes('id="baliHomeMerchForm"') &&
  admin.includes('id="baliPromoForm"') &&
  admin.includes('bali-home-design-admin.js?v=20261017-79') &&
  admin.includes('bali-admin-promos.js?v=20261017-79') &&
  html.includes('bali-home-design.js?v=20261017-79') &&
  html.includes('bali-pc-offers.js?v=20261017-79') &&
  html.includes('class="bali-pc-about-picture"') &&
  html.includes('class="bali-pc-merch-picture"') &&
  !html.includes('>Забронировать стол</strong>') &&
  !html.includes('>Фотогалерея</strong>') &&
  designAdmin.includes('makeImageVariants(') &&
  promosAdmin.includes('makeImageVariants(') &&
  designVariants.includes('compressImage(f,kind+"-"+suffix)') &&
  designPublic.includes('where("published","==",true)') &&
  promosPublic.includes('imageMobileUrl') &&
  rules.includes("match /merch/{merchId}") &&
  rules.includes('validHomeDesign(request.resource.data)') &&
  rules.includes('validMerch(request.resource.data)') &&
  rules.includes('validDesignImage(data.imageTabletUrl, 155000)'),
  "Home Design must allow safe admin artwork uploads, responsive previews and published merch.");
assert(html.includes('>ГЛАВНАЯ</button>') &&
  html.includes('>КАЛЕНДАРЬ</button>') &&
  html.includes('>МЕНЮ</button>') &&
  html.includes('class="bali-pc-nav-icon"') &&
  html.includes('data-bali-nav="events"') &&
  pcReferenceCss.includes('bali-pc-nav-icon'),
  "Desktop sidebar must use uppercase Home Calendar Menu and matching SVG icons.");
assert(barCss.includes('grid-template-columns:repeat(4,minmax(0,190px))') &&
  barCss.includes('background:var(--bt-primary)') &&
  barCss.includes('bali-bar-row') &&
  barCss.includes('bali-bar-portions') &&
  barCss.includes('@media(max-width:767px)'),
  "Kitchen/Bar tabs and bar list must adapt to desktop and mobile in the same theme");
assert(admin.includes('id="baliAdminBarSection"') &&
  admin.includes('id="baliAdminBarForm"') &&
  admin.includes('id="baliAdminBarCategory"') &&
  admin.includes('id="baliAdminBarVolume1"') &&
  admin.includes('id="baliAdminBarPrice1"') &&
  admin.includes('id="baliAdminBarVolume2"') &&
  admin.includes('id="baliAdminBarPrice2"') &&
  admin.includes('bali-admin-bar.js?v=20261017-65') &&
  admin.includes('bali-admin-bar.css?v=20261017-65') &&
  barAdmin.includes('role.data()?.active!==true') &&
  barAdmin.includes('onAuthStateChanged(auth,') &&
  barAdmin.includes('setDoc(ref,') &&
  barAdmin.includes('deleteDoc(doc(db,"bar_menu",item.id))') &&
  barAdminCss.includes('.bali-admin-bar-row'),
  "Bar menu must be editable only in the authorized admin UI with one or two price volumes");
assert(rules.includes('match /bar_menu/{drinkId}') &&
  rules.includes('allow get, list: if true;') &&
  rules.includes('allow create, update: if isAdmin() && validBarMenuItem(request.resource.data)') &&
  rules.includes('allow delete: if isAdmin();') &&
  rules.includes('data.keys().hasOnly([\'name\',\'category\',\'volume1\',\'price1\',\'volume2\',\'price2\',\'sort\',\'updatedAt\'])') &&
  rules.includes('data.updatedAt == request.time'),
  "Bar Firestore collection must be publicly read-only and securely admin-editable");

assert(html.includes('bali-desktop-fullwidth.css?v=20261017-64') &&
  html.indexOf('bali-desktop-fullwidth.css?v=20261017-64') >
  html.indexOf('bali-lime-neutral.css?v=20261017-62'),
  "Desktop studio redesign must load last while LIME remains the default skin");
assert(desktopLayoutCss.includes('/* BALI STUDIO / v64') &&
  desktopLayoutCss.includes('@media (min-width:768px)') &&
  desktopLayoutCss.includes('@media (min-width:1180px)') &&
  desktopLayoutCss.includes('grid-template-columns:minmax(0,1fr) clamp(320px,25vw,400px)') &&
  desktopLayoutCss.includes('grid-row:1/3') &&
  desktopLayoutCss.includes('content:"Афиша"') &&
  desktopLayoutCss.includes('aspect-ratio:3/4!important') &&
  desktopLayoutCss.includes('aspect-ratio:1/1') &&
  desktopLayoutCss.includes('body.bali-guest-theme #homeSection .bali-home-menu-banner') &&
  desktopLayoutCss.includes('display:contents!important') &&
  desktopLayoutCss.includes('grid-template-columns:repeat(4,minmax(0,154px))') &&
  desktopLayoutCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))') &&
  desktopLayoutCss.includes('body.bali-guest-theme #homeSection .bali-home-social .bali-social-telegram{grid-column:2;grid-row:2}') &&
  desktopLayoutCss.includes('body.bali-guest-theme #homeSection .bali-home-contacts-card .bali-yandex-map') &&
  desktopLayoutCss.includes('height:55px!important') &&
  desktopLayoutCss.includes('background:#23252a!important') &&
  desktopLayoutCss.includes('body.bali-guest-theme #eventsSection > .container') &&
  !desktopLayoutCss.includes('@media(max-width:767px)') &&
  !desktopLayoutCss.includes('@media (max-width:767px)'),
  "2026-style desktop must be a cinematic gallery and compact equal-size contact sidebar without touching mobile");

assert(html.includes('class="bali-yandex-pin"') &&
  !html.includes('<circle cx="12" cy="12" r="4.25" fill="white"/>') &&
  html.includes('M12 7.75a4.25 4.25 0 1 0 0 8.5') &&
  html.includes('fill-rule="evenodd" clip-rule="evenodd"') &&
  neutralLimeCss.includes('#homeSection .bali-home-contacts-card .bali-yandex-pin{') &&
  neutralLimeCss.includes('background:transparent!important;') &&
  neutralLimeCss.includes('border-radius:0!important;') &&
  neutralLimeCss.includes('color:var(--bt-text)!important;'),
  "The home address icon must have a transparent cut-out centre, not a white dot or red tile");

assert(html.includes('data-bali-theme="lime"') &&
  admin.includes('data-bali-theme="lime"') &&
  html.includes('history.scrollRestoration="manual"') &&
  html.includes('bali-lime-neutral.css?v=20261017-62') &&
  admin.includes('bali-lime-neutral.css?v=20261017-62') &&
  html.indexOf('bali-lime-neutral.css?v=20261017-62') >
  html.indexOf('bali-theme.css?v=20261017-60') &&
  admin.indexOf('bali-lime-neutral.css?v=20261017-62') >
  admin.indexOf('bali-theme.css?v=20261017-60'),
  "LIME neutral skin and manual Safari scroll restoration must be loaded after base styles");
assert(app.includes('function resetGuestVerticalPosition(page)') &&
  app.includes('document.scrollingElement||document.documentElement') &&
  app.includes('document.documentElement.scrollTop=0') &&
  app.includes('document.body.scrollTop=0') &&
  app.includes('window.addEventListener("pageshow"') &&
  app.includes('document.addEventListener("visibilitychange"') &&
  app.includes('renderGuestPage(routeFromLocation());') &&
  !app.includes('renderGuestPage(routeFromLocation(),{scroll:false})'),
  "Restore first-open viewport at vertical top and protect iOS Safari back-forward history");
assert(!/function resetGuestVerticalPosition\\(page\\) \\{[^}]*scrollLeft/s.test(app) &&
  neutralLimeCss.includes(':root[data-bali-theme="lime"]') &&
  neutralLimeCss.includes('body.bali-guest-theme #homeSection .bali-home-menu-banner') &&
  neutralLimeCss.includes('background:#23252b!important') &&
  neutralLimeCss.includes('body.bali-guest-theme #homeSection .bali-home-contacts-card') &&
  neutralLimeCss.includes('body.bali-admin-theme .card') &&
  neutralLimeCss.includes('background:transparent!important') &&
  !neutralLimeCss.includes('scroll-snap-type:none'),
  "Fix only vertical offset; remove blue panels in LIME without changing carousels");


assert(themeClient.includes('const defaultSelection=()=>({theme:"lime",colors:clone(palettes.lime)})') &&
  themeClient.includes('let lastCustom=clone(palettes.lime)') &&
  themeClient.includes('const themeRef=doc(db,"settings","appearance")') &&
  admin.includes('name="baliThemePreset" value="lime" checked') &&
  !admin.includes('name="baliThemePreset" value="cobalt" checked') &&
  admin.includes('id="baliColorPrimaryHex" class="bali-color-hex" type="text" value="#B9FF51"') &&
  admin.includes('id="baliColorTextHex" class="bali-color-hex" type="text" value="#D8FF9F"'),
  "LIME SHADOW must be the selected default without disabling explicitly published Firestore themes");
assert(themeCss.includes('--bt-primary:#B9FF51;') &&
  themeCss.includes('--bt-secondary:#88D43E;') &&
  themeCss.includes('--bt-text:#D8FF9F;') &&
  themeCss.includes('--bt-border:#B2EF5F;') &&
  themeCss.includes('--bt-on-primary:#10131A;') &&
  !themeClient.includes('setProperty("--bg-'),
  "LIME SHADOW initial CSS must prevent cobalt flash and preserve fixed site background");



assert(themeCss.includes('background:var(--bt-primary)!important') &&
  themeCss.includes('color:var(--bt-on-primary)!important') &&
  themeCss.includes('body.bali-guest-theme .bali-bottom-nav button.active') &&
  themeCss.includes('bali-theme-rules-help[hidden]') &&
  !themeCss.includes('background:#1b2640!important') &&
  !themeCss.includes('background:#29354d!important'),
  "Active elements must reflect the theme while existing menu and site backgrounds remain unchanged");
assert(admin.includes('id="baliCopyRules"') &&
  admin.includes('Firebase Console → Firestore → Rules') &&
  themeClient.includes('raw.githubusercontent.com/Nik13599/BALI-MENU/main/firestore.rules') &&
  themeClient.includes('navigator.clipboard.writeText(rulesText)') &&
  themeClient.includes('if(help)help.hidden=true'),
  "Appearance editor needs a safe recovery path for publishing protected Firestore rules");

const dashboardClient=source("admin-dashboard.js");
assert(html.includes('bali-theme.css?v=20261017-60') &&
  admin.includes('bali-theme.css?v=20261017-60') &&
  html.includes('bali-theme.js?v=20261017-60') &&
  admin.includes('bali-theme.js?v=20261017-60') &&
  html.indexOf('bali-theme.css?v=20261017-60') >
  html.indexOf('bali-obsidian-premium.css?v=20261017-57') &&
  admin.indexOf('bali-theme.css?v=20261017-60') >
  admin.indexOf('bali-obsidian-premium.css?v=20261017-57'),
  "Global accent CSS and realtime settings module must load last on both interfaces");
assert(admin.includes('data-admin-tab="appearance"') &&
  admin.includes('id="adminAppearancePanel"') &&
  admin.includes('id="baliThemeForm"') &&
  admin.includes('id="baliThemeSave"') &&
  admin.includes('id="baliThemeCancel"') &&
  admin.includes('id="baliThemeRulesHelp"') &&
  ['cobalt','lime','white','custom'].every(x=>admin.includes('name="baliThemePreset" value="'+x+'"')) &&
  ['Primary','Secondary','Text','Border'].every(x=>admin.includes('id="baliColor'+x+'"')&&admin.includes('id="baliColor'+x+'Hex"')) &&
  dashboardClient.includes('appearance: ["Цветовая тема"'),
  "Admin must provide three preset palettes, custom hex editing, preview and publish/revert controls");
assert(themeClient.includes('const palettes=Object.freeze({') &&
  themeClient.includes('cobalt:Object.freeze(') &&
  themeClient.includes('lime:Object.freeze(') &&
  themeClient.includes('white:Object.freeze(') &&
  themeClient.includes('const themeRef=doc(db,"settings","appearance")') &&
  themeClient.includes('onSnapshot(themeRef,') &&
  themeClient.includes('await setDoc(themeRef,') &&
  themeClient.includes('getDoc(doc(db,"admins",user.uid))') &&
  themeClient.includes('updatedAt:serverTimestamp()') &&
  themeClient.includes('const colorValid=/^#[0-9A-Fa-f]{6}$/') &&
  themeClient.includes('contrastText(colors.primary)') &&
  themeClient.includes('root.style.setProperty("--bt-primary"'),
  "Color themes must sync globally with Firebase, validate manual HEX input and prevent unauthorized writes");
assert(themeCss.includes("/* BALI v58") &&
  themeCss.includes("body.bali-guest-theme #homeSection .bali-home-menu-banner") &&
  themeCss.includes("body.bali-guest-theme #eventsSection .events-view-button.active") &&
  themeCss.includes("body.bali-guest-theme #menuPage .category-btn.active") &&
  themeCss.includes("body.bali-guest-theme .bali-profile-action") &&
  themeCss.includes(".bali-admin-theme .admin-tab.active") &&
  themeCss.includes("grid-template-columns:repeat(5,minmax(0,1fr))") &&
  !themeClient.includes('setProperty("background') &&
  !themeClient.includes('setProperty("--bg-'),
  "Theme may change interactive accents only, leaving fixed background color unchanged");
assert(rules.includes('match /settings/{settingId}') &&
  rules.includes("allow get: if settingId in ['appearance','menuVisibility','homeDesign','homeInterface','homeEventPlaceholder']") &&
  rules.includes('allow list: if false') &&
  rules.includes("settingId == 'appearance' && validAppearance(request.resource.data)") &&
  rules.includes("data.colors.keys().hasOnly(['primary','secondary','text','border'])") &&
  rules.includes("data.theme in ['cobalt','lime','white','custom']") &&
  rules.includes("data.updatedAt == request.time") &&
  rules.includes('allow delete: if false'),
  "Global palette document must allow public single-document reads and only admin writes with strict field validation");
assert(customIconJs.includes('appearance:"palette"') &&
  customIconJs.includes('menu:"book"'),
  "Palette editor and open-book menu must use custom accessible SVG icons");

const obsidianCss=source("bali-obsidian-premium.css");
assert(html.includes('bali-obsidian-premium.css?v=20261017-57') &&
  admin.includes('bali-obsidian-premium.css?v=20261017-57') &&
  html.indexOf('bali-obsidian-premium.css?v=20261017-57') >
  html.indexOf('bali-home-stories.css?v=20261017-52') &&
  admin.indexOf('bali-obsidian-premium.css?v=20261017-57') >
  admin.indexOf('admin-dashboard.css?v=20261017-20'),
  "One current premium theme must load last on the guest and admin sites");
assert(['bali-atelier-theme.css','bali-velvet-night.css','bali-editorial-minimal.css']
  .every(name=>!html.includes('href="'+name)&&!admin.includes('href="'+name)),
  "Superseded palettes must not cascade on the live site or dashboard");
assert(html.includes('class="bali-guest-theme"') &&
  admin.includes('class="bali-admin-theme"') &&
  html.includes('content="#080b11"') &&
  admin.includes('content="#080b11"') &&
  html.includes('family=Manrope') && admin.includes('family=Manrope'),
  "Premium layout classes, display theme and consistent contemporary typography required");
assert(obsidianCss.includes("/* BALI / OBSIDIAN v57") &&
  obsidianCss.includes("--bali-obsidian:#080b11") &&
  obsidianCss.includes("--bali-cobalt:#7585ff") &&
  obsidianCss.includes("--bali-ice:#f5f7ff") &&
  obsidianCss.includes("body.bali-guest-theme #homeSection .bali-home-menu-banner") &&
  obsidianCss.includes("body.bali-guest-theme #homeSection .bali-home-heart.is-liked") &&
  obsidianCss.includes("body.bali-guest-theme #eventsSection #eventsGrid>.event-card") &&
  obsidianCss.includes("body.bali-guest-theme #menuPage .category-btn.active") &&
  obsidianCss.includes("body.bali-guest-theme .bali-profile-card") &&
  obsidianCss.includes(".bali-admin-theme .admin-tab.active") &&
  obsidianCss.includes(".bali-admin-theme button.primary"),
  "Unified obsidian cobalt premium palette must cover all website and admin surfaces");
assert(obsidianCss.includes(".bali-icon-slot .bali-custom-icon") &&
  html.includes('bali-icon-atelier.js?v=20261017-58') &&
  admin.includes('bali-icon-atelier.js?v=20261017-58'),
  "Every designer vector icon must retain its local SVG sizing and handlers");
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
assert(html.includes("app.js?v=20261018-96"), "Published app.js cache version must be current");
assert(html.includes("styles.css?v=20261017-12"), "Published menu styles must be refreshed");
assert(rules.includes("match /orders/{orderId}"), "Order Rules must exist before enabling order UI");
const dashboardCss = source("admin-dashboard.css");
const dashboardJs = source("admin-dashboard.js");
assert(admin.includes('id="adminOrdersPanel"') && admin.includes('id="adminMenuPanel"') && admin.includes('id="adminEventsPanel"'), "Admin must have separate Orders, Menu and Events workspaces");
assert(admin.includes('data-admin-tab="orders"') && admin.includes('data-admin-tab="menu"') && admin.includes('data-admin-tab="events"'), "Admin navigation tabs missing");
assert(admin.includes('admin-dashboard.css?v=20261017-20') && admin.includes('admin-dashboard.js?v=20261017-84'), "Updated dashboard files must be loaded");
assert(dashboardCss.includes('@media(max-width:760px)') && dashboardCss.includes('.admin-sidebar'), "Mobile dashboard navigation CSS missing");
assert(dashboardJs.includes('adminPageTitle') && dashboardJs.includes('menuSearch'), "Dashboard navigation and menu search missing");
assert(dashboardJs.includes('bali:admin:orders') && dashboardJs.includes('bali:admin:menu') && dashboardJs.includes('bali:admin:events'), "Dashboard realtime counters missing");
assert(html.includes('responsive-menu.css?v=20261017-21'), "Guest mobile layout CSS cache version outdated");
assert(html.includes('app.js?v=20261018-96'), "Guest cart code cache version outdated");
assert(responsive.includes('.cart-total > .total-amount') && responsive.includes('white-space:nowrap'), "Cart total must fit amount and BYN in one line");
assert(app.includes('${total.toFixed(2)} BYN') && html.includes('<span>Итого:</span>'), "Cart total must use compact BYN format");
assert(html.includes('auth.js?v=20261017-67'), "Guest profile label code should load without old cache");
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
assert(imageProcessor.includes('canvas.toDataURL("image/webp"') && imageProcessor.includes('const ratio=design?.ratio||(poster?4/5:1);'),
  "Image compression must create 1:1 dishes and 4:5 flyers");
assert(adminClient.includes('compressImage(file,"product")') &&
  adminClient.includes('compressImage(file,"poster")'), "Image picker must upload to Firestore");
assert(html.includes('data-bali-nav="events"') && html.includes('id="eventsSection"'), "Guest events page missing");
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
  html.includes('aria-label="BALI календарь — открыть все предстоящие мероприятия"'), "Home page full calendar button missing");
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
// Home uses a promotion hero plus a single calendar-title link (no duplicate filter strip).
assert(!html.includes('class="bali-hero-scene"') &&
  html.includes('class="bali-pc-hero"') &&
  html.includes('id="baliPcOfferTitle"') &&
  html.includes('class="bali-pc-events-title"'),
  "Home should display BALI PRIVILEGE hero above the event carousel");
assert(!html.includes('class="bali-home-calendar-row"') &&
  !html.includes('data-home-events-view="all"') &&
  !html.includes('data-home-events-view="planned"') &&
  html.includes('aria-label="BALI календарь — открыть все предстоящие мероприятия"') &&
  !html.includes('Смотреть всё'),
  "Home must use one full-calendar heading without top filters or redundant More button");
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
  html.includes('<h2 class="events-eyebrow" id="eventsHeadingGuest">BALI КАЛЕНДАРЬ</h2>'),
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
