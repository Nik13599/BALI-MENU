import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const styleEntries = JSON.parse(readFileSync("styles/entries.json", "utf8"));
const source = (name) => {
  const contents=readFileSync(name, "utf8");
  // Evaluate the same ordered source cascade now compiled into one network asset.
  return styleEntries[name] ? contents.replace(/<link rel="stylesheet" data-bali-bundle="[^"]+"[^>]+>/,
    styleEntries[name].map(href=>'<link rel="stylesheet" href="'+href+'">').join('\n')) : contents;
};
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
assert(/type="module"\s+src="auth\.js(?:\?v=[A-Za-z0-9_-]+)?"/.test(html), "auth.js must be loaded");
assert(auth.includes("GoogleAuthProvider"), "Google sign-in missing");
assert(auth.includes("emailVerified"), "Email must be verified");
assert(auth.includes("serverTimestamp()"), "Server timestamps missing");
assert(auth.includes('doc(database, "users", savingUser.uid)'), "User profile persistence missing");
assert(app.includes("BaliAuth.requireProfile()"), "Checkout must require profile");
const ordersClient = source("orders-firestore.js");
assert(app.includes('orders.save(orderData, editingOrderId)') && app.includes('ensureOrdersService()'), "Checkout must lazy-load Firestore order service on submit");
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
// All devices use the four icons traced from the supplied BALI brand reference.
// Keep the real menu route buttons (and their age gates) accessible.
const referenceIcons=source("bali-menu-reference-icons.css");
for(const [key,label] of [
  ["kitchen","Меню кухни"],["bar","Барная карта"],
  ["hookah","Кальянная карта"],["tea","Чайная карта"]
]){
  const tab=html.match(new RegExp('<button[^>]*data-bali-menu-mode="'+key+'"[^>]*>[\\s\\S]*?<\\/button>'));
  const file="assets/menu-icons/bali-"+key+".svg";
  assert(tab && tab[0].includes('aria-label="'+label+'"') &&
    tab[0].includes('bali-menu-mode-icon') &&
    tab[0].includes('bali-menu-mode-label') &&
    tab[0].includes('src="'+file+'"') &&
    tab[0].includes('aria-pressed=') &&
    source(file).includes('viewBox='),
    "Menu reference icon missing or inaccessible: "+key);
}
assert(html.includes('bali-menu-reference-icons.css?v=') &&
  html.includes('<div class="bali-menu-search container" hidden aria-hidden="true">') &&
  referenceIcons.includes('#menuPage .bali-menu-search') &&
  referenceIcons.includes('display:none!important;') &&
  referenceIcons.includes('.bali-menu-mode-btn.is-active') &&
  referenceIcons.includes('.bali-menu-mode-btn[hidden]') &&
  referenceIcons.includes('filter:brightness(0) invert(1)') &&
  barCss.includes('.bali-menu-mode-btn[hidden]{display:none!important}'),
  "Menu switches must use four reference silhouettes, keep selected/hidden states, and hide guest search.");
// PC-only improvements: menu tabs and calendar title align with the top of the
// BALI sidebar logo; six fully functional cards per dish row; fading event edges.
assert(html.includes('bali-pc-reference.css?v=') &&
  source("bali-pc-reference.css").includes('v81 — Desktop menu/calendar') &&
  source("bali-pc-reference.css").includes('padding-top:21px!important') &&
  source("bali-pc-reference.css").includes('body.bali-guest-theme #menuPage #baliMenuModeSwitch') &&
  source("bali-pc-reference.css").includes('grid-template-columns:repeat(6,minmax(0,1fr))!important') &&
  source("bali-pc-reference.css").includes('body.bali-guest-theme #menuPage .menu-category-block .menu-purchase-controls') &&
  source("bali-pc-reference.css").includes('grid-template-columns:1fr!important') &&
  source("bali-pc-reference.css").includes('body.bali-guest-theme #eventsSection .events-topbar') &&
  source("bali-pc-reference.css").includes('grid-template-columns:minmax(0,1fr) clamp(200px,18.5vw,280px)!important') &&
  source("bali-pc-reference.css").includes('body.bali-guest-theme #eventsSection .events-topbar .events-heading') &&
  source("bali-pc-reference.css").includes('grid-column:1!important') &&
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
const adminOverview=source("admin-dashboard.js");
const adminClarity=source("bali-admin-clarity.css");
assert(admin.includes('id="adminOverviewPanel"') &&
  admin.includes('data-admin-tab="overview"') &&
  ["orders","clients","menu","events","design","appearance"].every(section=>
    admin.includes('data-admin-tab="'+section+'"')) &&
  ["kitchen","bar","hookah","tea"].every(mode=>
    admin.includes('data-admin-menu="'+mode+'"')) &&
  admin.includes('bali-admin-clarity.css?v=20261018-') &&
  admin.includes('admin-dashboard.js?v=20261021-workspace1') &&
  adminOverview.includes('activate("overview",false)') &&
  adminOverview.includes('[data-admin-go]') &&
  adminClarity.includes('.admin-quick-grid'),
  "Admin overview must expose all live editors without changing catalog data or permissions");
const liveStudio=source("bali-design-studio.js");
const studioCss=source("bali-design-studio.css");
const siteAdmin=source("bali-site-content-admin.js");
const sitePublic=source("bali-site-content.js");
assert(admin.includes('bali-design-studio.css?v=') &&
  admin.includes('bali-design-studio.js?v=20261019-idcard1') &&
  admin.includes('bali-site-content-admin.js?v=') &&
  admin.includes('id="baliDesignLiveFrame"') &&
  admin.includes('id="baliDesignCanvas"') &&
  admin.includes('data-studio-device="desktop"') &&
  admin.includes('data-studio-device="tablet"') &&
  admin.includes('data-studio-device="phone"') &&
  admin.includes('data-site-field="menuPageTitle"') &&
  html.includes('bali-site-content.js?v=') &&
  liveStudio.includes('frame.contentDocument') &&
  liveStudio.includes('selectionFrom(target)') &&
  liveStudio.includes('fit()') &&
  studioCss.includes('body[data-bali-admin-section="design"] .admin-stats{display:none!important}') &&
  siteAdmin.includes('doc(db,"settings","homeInterface")') &&
  siteAdmin.includes('menuPageTitle:"BALI МЕНЮ"') &&
  sitePublic.includes('label("#baliMenuHeading",data.menuPageTitle)') &&
  rules.includes('function validHomeInterface(d)') &&
  rules.includes("settingId == 'homeInterface' && validHomeInterface(request.resource.data)") &&
  rules.includes("allow get: if settingId in ['appearance','menuVisibility','homeDesign','homeInterface','homeEventPlaceholder','siteBuilderPublished','preorderSecurity']"),
  "Live admin design studio must preview all 3 real device layouts, permit block editing and protect the site settings in Firestore");

// Site builder must remain presentation-only, with admin drafts not readable by guests.
const builderCore=source("bali-builder-core.js");
const builderEditor=source("bali-builder-admin.js");
const builderPublic=source("bali-builder-public.js");
const builderCss=source("bali-builder-admin.css");
assert(admin.includes('id="baliBuilderInspector"') &&
  admin.includes('id="baliBuilderSaveDraft"') &&
  admin.includes('id="baliBuilderPublish"') &&
  admin.includes('data-bali-builder-add="button"') &&
  admin.includes('bali-builder-core.js?v=') &&
  admin.includes('bali-builder-admin.js?v=') &&
  admin.includes('bali-builder-admin.css?v=') &&
  html.includes('bali-builder-core.js?v=') &&
  html.includes('bali-builder-public.js?v=') &&
  builderCore.includes('sanitizeProps') &&
  builderCore.includes('prefers-reduced-motion:reduce') &&
  builderCore.includes('bali-builder-shimmer') &&
  builderCore.includes('bali-builder-heartbeat') &&
  builderEditor.includes('siteBuilderDraft') &&
  builderEditor.includes('siteBuilderPublished') &&
  builderPublic.includes('siteBuilderPublished') &&
  !builderPublic.includes('siteBuilderDraft') &&
  builderPublic.includes('bali-admin-design-preview') &&
  builderCss.includes('.bali-builder-top') &&
  rules.includes("settingId == 'siteBuilderDraft' && isAdmin()") &&
  rules.includes("settingId in ['siteBuilderDraft','siteBuilderPublished'] && validSiteBuilder(request.resource.data)"),
  "Builder must have live visual controls, safe published presentation and protected drafts");

// Mobile About artwork follows the user's new design while remaining separate
// from the desktop About card; staff can upload, reorder and publish 8 photos.
const mobileAboutCss=source("bali-mobile-about-hero.css");
const mobileAboutGuest=source("bali-mobile-about-hero.js");
const mobileAboutAdmin=source("bali-mobile-about-admin.js");
const mobileAboutAdminCss=source("bali-mobile-about-admin.css");
assert(html.includes('id="baliMobileAboutBackgroundA"') &&
  html.includes('id="baliMobileAboutBackgroundB"') &&
  html.includes('id="baliMobileAboutBackgroundDots"') &&
  html.includes('bali-mobile-about-hero.css?v=20261019-6') &&
  html.includes('bali-mobile-about-hero.js?v=') &&
  mobileAboutCss.includes('@media(max-width:767px)') &&
  mobileAboutCss.includes('object-fit:cover!important') &&
  mobileAboutCss.includes('background:linear-gradient(90deg') &&
  mobileAboutGuest.includes('collection(db,"mobileAboutBackgrounds")') &&
  mobileAboutGuest.includes('where("published","==",true)') &&
  mobileAboutGuest.includes('prefers-reduced-motion:reduce') &&
  mobileAboutGuest.includes('8500') &&
  admin.includes('data-design-editor="mobileAbout"') &&
  admin.includes('id="baliMobileAboutFiles"') &&
  admin.includes('multiple>') &&
  admin.includes('bali-mobile-about-admin.js?v=') &&
  admin.includes('bali-mobile-about-admin.css?v=20261019-1') &&
  mobileAboutAdmin.includes('const MAX=8') &&
  mobileAboutAdmin.includes('writeBatch(db)') &&
  mobileAboutAdmin.includes('compressImage(file,"design-mobile-about-hero")') &&
  mobileAboutAdminCss.includes('.bali-mobile-about-admin-entry') &&
  liveStudio.includes('mobileAbout:["Мобильный блок «О клубе»"') &&
  source("image-compressor.js").includes('"design-mobile-about-hero":{ratio:2,maxChars:120000') &&
  rules.includes('function validMobileAboutBackground(d)') &&
  rules.includes('match /mobileAboutBackgrounds/{backgroundId}') &&
  rules.includes('allow get, list: if isAdmin() || resource.data.published == true;') &&
  rules.includes('allow create, update: if isAdmin() && validMobileAboutBackground(request.resource.data);'),
  "Mobile About must support independently uploaded and protected published backgrounds");
// Compact owner-approved top hero: full horizontal headline in the same
// home-grid row, not a vertically stacked text block that consumes the viewport.
const heroMarkup=html.slice(html.indexOf('<section class="bali-mobile-home-hero"'),
  html.indexOf('<!-- Existing live events'));
assert(heroMarkup.includes('<h1><span>BALI — </span><em>БОЛЬШЕ, ЧЕМ КЛУБ</em></h1>') &&
  heroMarkup.includes('Площадка для мероприятий в центре Минска.') &&
  heroMarkup.includes('id="baliMobileAboutBtn"') &&
  !heroMarkup.includes('bali-mobile-hero-formats') &&
  !heroMarkup.includes('bali-mobile-hero-chip') &&
  !heroMarkup.includes('Вечеринки') &&
  !heroMarkup.includes('Закрытые мероприятия') &&
  !heroMarkup.includes('Корпоративы') &&
  !heroMarkup.includes('Концерты') &&
  !heroMarkup.includes('И многое другое') &&
  !mobileAboutCss.includes('.bali-mobile-hero-chip') &&
  !mobileAboutCss.includes('.bali-mobile-hero-formats') &&
  !heroMarkup.includes('БОЛЬШЕ<br>ЧЕМ<br>КЛУБ') &&
  mobileAboutCss.includes('clamp(148px,41vw,176px)') &&
  mobileAboutCss.includes('white-space:normal!important') &&
  mobileAboutCss.includes('font:850 clamp(19px,5.3vw,27px)/1.1') &&
  mobileAboutCss.includes('font:600 clamp(13px,3.45vw,17px)/1.35') &&
  mobileAboutCss.includes('width:clamp(136px,41vw,178px)!important;') &&
  mobileAboutCss.includes('height:clamp(36px,9.3vw,43px)!important;') &&
  mobileAboutCss.includes('margin:clamp(12px,3.4vw,17px) 0 0!important;') &&
  mobileAboutCss.includes('.bali-mobile-home-hero h1>em') &&
  mobileAboutCss.includes('grid-template-rows:clamp(146px,40vw,169px)') &&
  html.includes('bali-mobile-about-hero.css?v=20261019-6'),
  "Mobile BALI About must show only enlarged heading, subtitle and CTA with backgrounds intact");
// v87 PC viewport is a fixed full-width, full-height 3-column dashboard.
// Other desktop pages must not scroll down; only product lists scroll.
const viewportCss=source("bali-pc-viewport.css");
assert(html.includes('bali-pc-viewport.css?v=') &&
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
// Home shows three square teaser slots on phones/tablets, five on desktop.
// Calendar contains no invented placeholder events or fake RSVP buttons.
const homeTeaser=app.slice(app.indexOf('function renderHomeEvents()'),app.indexOf('function renderUpcomingEvents()'));
assert(homeTeaser.includes('const homeSlots=window.matchMedia("(min-width:1180px)").matches?5:3') &&
  homeTeaser.includes('Math.max(0,homeSlots-upcoming.length)') &&
  homeTeaser.includes('bali-home-event-card bali-home-event-placeholder') &&
  homeTeaser.includes('posterTitle:"SECRET"') &&
  homeTeaser.includes('Совсем скоро узнаете') &&
  !homeTeaser.includes('if(!upcoming.length&&!isPcHome)') &&
  homeTeaser.includes('homeUpcomingEvents().slice(0,homeSlots)') &&
  app.includes('eventStatus(e)!=="past"') &&
  source("bali-event-posters-unified.css").includes("aspect-ratio:1/1!important") &&
  !app.slice(app.indexOf('function renderUpcomingEvents()')).includes('bali-home-event-placeholder') &&
  viewportCss.includes('v89 — Desktop home: cards take the former calendar heading') &&
  viewportCss.includes('v90 — Five balanced HOME event slots') &&
  viewportCss.includes('grid-template-columns:repeat(5,minmax(0,1fr))!important') &&
  viewportCss.includes('body.bali-guest-theme #homeSection .bali-pc-events-title {') &&
  viewportCss.includes('body.bali-guest-theme #homeSection #homeEventCarousel>.bali-home-event-placeholder'),
  "Every Home viewport must show square SECRET placeholders for unused upcoming slots; calendar stays real-only.");
// All 5 PC Home event cells share one editable visual style, NOT fake events.
const placeholderAdmin=source("bali-home-placeholder-admin.js");
const placeholderPublic=source("bali-home-placeholder.js");
const adminPlaceholderCss=source("bali-home-placeholder-admin.css");
assert(admin.includes('id="baliEventPlaceholderEditor"') &&
  admin.includes('id="baliEventPlaceholderForm"') &&
  admin.includes('id="baliPlaceholderImageFile"') &&
  admin.includes('id="baliPlaceholderPosterTitle"') &&
  admin.includes('bali-home-placeholder-admin.js?v=') &&
  admin.includes('bali-home-placeholder-admin.css?v=') &&
  html.includes('bali-home-placeholder.js?v=') &&
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
  source("image-compressor.js").includes('"design-placeholder":{ratio:1,maxChars:120000') &&
  rules.includes('function validHomeEventPlaceholder(d)') &&
  rules.includes("settingId == 'homeEventPlaceholder' && validHomeEventPlaceholder(request.resource.data)") &&
  !app.slice(app.indexOf('function renderUpcomingEvents()')).includes('BaliHomePlaceholder'),
  "Shared SECRET poster must be editable in admin Events, default consistently, and never appear on full calendar.");
// v96: PC contact actions and socials are independent sets of 3; cart is
// fluorescent whenever nonempty; image-less menu cards reserve no photo.
const contactsCss=source("bali-contact-channels.css");
assert(html.includes('bali-contact-channels.css?v=') &&
  html.includes('bali-site-content.js?v=') &&
  admin.includes('bali-site-content-admin.js?v=') &&
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
  html.includes('bali-age-gate.js?v=') &&
  html.includes('bali-age-gate.css?v=') &&
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
// Details actions appear only when a product has non-empty detailed copy.
// Full text, optional photo, weight and cart controls use existing Firestore fields.
const adminClient=source("admin-firestore.js");
const moreCss=source("bali-menu-details.css");
assert(html.includes('id="baliMenuDetailsDialog"') &&
  html.includes('id="baliMenuDetailsTitle"') &&
  html.includes('bali-menu-details.css?v=') &&
  admin.includes('bali-menu-details.css?v=') &&
  admin.includes('id="menuDetailsEnabled"') &&
  admin.includes('id="menuDetailsText"') &&
  admin.includes('id="menuDetailsImageFile"') &&
  admin.includes('id="menuDetailsImagePreview"') &&
  admin.includes('id="menuWeight"') &&
  admin.includes('id="menuDetailsAvailability"') &&
  adminClient.includes('const hasText=Boolean($("menuDetailsText").value.trim())') &&
  adminClient.includes('compressImage(file,"menu-detail")') &&
  adminClient.includes('detailImageCleared') &&
  adminClient.includes('detailEnabled:detailsEnabled') &&
  app.includes('const hasDetails=Boolean(String(item.detailText||"").trim())') &&
  app.includes('${hasDetails ? `<button type="button" class="bali-menu-readmore"') &&
  app.includes('data-menu-action="details"') &&
  app.includes('function openBaliMenuDetails(product)') &&
  app.includes('bali-menu-details-quantity') &&
  app.includes('addToCart(id,selectedMenuQuantity(id))') &&
  app.includes('if(src&&src!=="https://placehold.co/400x200?text=BALI")') &&
  app.includes('product.detailText') &&
  moreCss.includes('.bali-menu-details-dialog') &&
  html.includes('id="baliMenuDetailsActions"') &&
  source("image-compressor.js").includes('"menu-detail":{ratio:4/3,maxChars:95000') &&
  rules.includes("'detailEnabled','detailText','detailImageUrl'") &&
  rules.includes("data.get('detailEnabled',false) == false") &&
  rules.includes("data.detailText.size() >= 1"),
  "Menu details action appears only for descriptions and its dialog shares cart/quantity controls.");
// The user-supplied brush artwork replaces only the mobile navigation masks.
// Keep existing page IDs, labels, active state and nav routing untouched.
const referenceBottomNav=source("bali-mobile-reference.css");
for(const [route,file] of [
  ["home","home"],["events","events"],["menu","menu"],["contacts","info"]
]){
  assert(referenceBottomNav.includes('[data-bali-nav="'+route+'"] .bali-nav-glyph') &&
    referenceBottomNav.includes('mask-image:url("assets/nav-icons/'+file+'.svg")!important') &&
    referenceBottomNav.includes('-webkit-mask-image:url("assets/nav-icons/'+file+'.svg")!important') &&
    source("assets/nav-icons/"+file+".svg").includes('viewBox=') &&
    html.includes('data-bali-nav="'+route+'"'),
    "Mobile navigation must show supplied BALI brush icon for "+route);
}
assert(referenceBottomNav.includes('.bali-bottom-nav button.active::after') &&
  html.includes('bali-mobile-reference.css?v=20261019-6') &&
  referenceBottomNav.includes('button:not(.active) .bali-nav-glyph') &&
  referenceBottomNav.includes('color:#fff!important;') &&
  referenceBottomNav.includes('button.active .bali-nav-glyph') &&
  referenceBottomNav.includes('clamp(26px,7.8vw,36px)') &&
  referenceBottomNav.includes('clamp(10px,3vw,14px)') &&
  /<button[^>]*data-bali-nav="profile"[^>]*>[\s\S]*?BALI ID[\s\S]*?<\/button>/.test(html) &&
  html.includes('id="profileInfoBtn" data-bali-nav="contacts"'),
  "Mobile navigation must retain four working actions, selected state and dot.");
assert(source("bali-mobile-reference.css").includes('Floating "Корзина" shortcut on mobile') &&
  source("bali-mobile-reference.css").includes('translateX(-50%)!important'),
  "Floating mobile cart should be narrower and raised above the bottom navigation.");
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
  html.includes('bali-bar-menu.css?v=') &&
  html.includes('bali-bar-menu.js?v='),
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
  barPublic.includes('catalogGroup(category,items,item=>catalogCard(item,{') &&
  source("bali-menu-cards.js").includes('bali-menu-portion') &&
  source("bali-menu-cards.js").includes('bali-menu-volume') &&
  source("bali-menu-cards.js").includes('money.format(value)') &&
  !barPublic.includes('BaliOrders') &&
  !barPublic.includes('add-to-cart-btn') &&
  !barPublic.includes('openCheckout(') &&
  !source("bali-menu-cards.js").includes('data-menu-action') &&
  !source("bali-menu-cards.js").includes('addToCart('),
  "Bar prices must be real Firestore data shown as grouped cards, without preorder code");
const extraMenus=source("bali-extra-menus.js");
assert(["kitchen","bar","hookah","tea"].every(name=>html.includes('data-bali-menu-mode="'+name+'"')) &&
  html.includes('id="baliHookahContent"') && html.includes('id="baliTeaContent"') &&
  html.includes('id="baliHookahCategoryFilter"') && html.includes('id="baliTeaCategoryFilter"') &&
  html.includes('id="baliHookahList"') && html.includes('id="baliTeaList"') &&
  html.includes('bali-extra-menus.js?v=') &&
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
  admin.includes('bali-menu-visibility.js?v=') &&
  html.includes('bali-menu-visibility-guest.js?v=') &&
  source("bali-menu-visibility-guest.js").includes('from "./bali-public-reader.js') &&
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
// The mobile Info tab is the complete public information page. The desktop
// sidebar remains the single editable source for the phone, chat/social and map.
const infoCss=source("bali-info-page.css");
const infoClient=source("bali-info-page.js");
const infoSection=html.slice(html.indexOf('id="contactsSection"'),html.indexOf('id="profileSection"'));
for(const term of ["Контакты и социальные сети","Режим работы","Посещение клуба","Меню и предзаказы","BALI ID · Privilege","Правовая информация","Сведения об организации","Персональные данные","Предзаказы, оплата и обращения"]){
  assert(infoSection.includes(term),"Info is missing required club/site section: "+term);
}
assert(html.includes('bali-info-page.css?v=') &&
  html.includes('bali-info-page.js?v=20261019-1') &&
  html.includes('id="baliInfoContactMirror"') &&
  infoClient.includes('sidebar.cloneNode(true)') &&
  infoClient.includes('new MutationObserver(schedule)') &&
  infoClient.includes('window.addEventListener("bali:home-interface",schedule)') &&
  infoCss.includes('overflow-y:auto!important') &&
  infoCss.includes('padding-bottom:calc(105px + env(safe-area-inset-bottom))') &&
  infoSection.includes('ПЯТНИЦА') && infoSection.includes('СУББОТА') &&
  infoSection.includes('<time>23:00</time>') && infoSection.includes('<time>06:00</time>') &&
  infoSection.includes('data-bali-nav="events"') &&
  infoSection.includes('data-bali-nav="menu"') &&
  infoSection.includes('data-bali-nav="id"') &&
  infoSection.includes('Общество с ограниченной ответственностью «МАГИШТЫК»') &&
  infoSection.includes('220030, г. Минск, ул. Кирова, 13, пом. 3') &&
  infoSection.includes('193849140') &&
  !/<dt>[^<]*(?:IBAN|Банк|БИК|руководител|личн.{0,10}телефон)/i.test(infoSection) &&
  infoSection.includes('Место оказания услуг:') &&
  infoSection.includes('<details open>') &&
  !infoSection.includes('реквизиты пока не подтверждены владельцем проекта') &&
  infoSection.includes('href="privacy.html"') &&
  infoSection.includes('id="baliInfoCloseBtn"') &&
  infoSection.includes('data-bali-nav="profile"') &&
  html.includes('bali-info-page.css?v=') &&
  infoCss.includes('.bali-info-legal-grid') &&
  infoCss.includes('word-break:break-all;') &&
  html.includes('href="tel:+375296700300"'),
  "Mobile Info must show the editable desktop contacts and truthful legal/visitor disclosures");
// Homepage design tools must be publicly read-only and safely admin-managed.
// Calendar regression: the old PC carousel had height:0; inside the new
// horizontal month + posters layout it must be explicitly stretched.
const calendarViewCss=source("bali-calendar.css");
assert(calendarViewCss.includes('.bali-event-calendar-layout>.events-carousel-shell>#eventsGrid') &&
  calendarViewCss.includes('width:auto!important;height:100%!important') &&
  calendarViewCss.includes('height:100%!important;min-height:0!important;') &&
  html.includes('bali-calendar.css?v=20261019-2'),
  "PC calendar must show its real event posters instead of a zero-height track");
const designAdmin=source("bali-home-design-admin.js");
const designPublic=source("bali-home-design.js");
const designVariants=source("bali-design-variants.js");
const promosAdmin=source("bali-admin-promos.js");
const promosPublic=source("bali-pc-offers.js");
assert(admin.includes('id="adminDesignPanel"') &&
  admin.includes('data-admin-tab="design"') &&
  source("admin-dashboard.js").includes('design: ["Конструктор сайта"') &&
  admin.includes('id="baliHomeAboutForm"') &&
  admin.includes('data-design-editor="idCard"') &&
  !admin.includes('id="baliHomeMerchForm"') &&
  !admin.includes('data-design-editor="merch"') &&
  admin.includes('id="baliPromoForm"') &&
  admin.includes('bali-home-design-admin.js?v=') &&
  admin.includes('bali-admin-promos.js?v=') &&
  html.includes('bali-home-design.js?v=') &&
  html.includes('bali-pc-offers.js?v=') &&
  html.includes('class="bali-pc-about-picture"') &&
  html.includes('id="baliHomeIdCard"') &&
  html.includes('bali-pc-id-home.js?v=') &&
  html.includes('bali-pc-id-home.css?v=') &&
  !html.includes('class="bali-pc-merch"') &&
  !html.includes('>Забронировать стол</strong>') &&
  !html.includes('>Фотогалерея</strong>') &&
  designAdmin.includes('makeImageVariants(') &&
  !designAdmin.includes('baliHomeMerchForm') &&
  designVariants.includes('compressImage(f,kind+"-"+suffix)') &&
  designPublic.includes('doc(db,"settings","homeDesign")') &&
  promosAdmin.includes('makeImageVariants(') &&
  promosPublic.includes('imageMobileUrl') &&
  html.includes('class="bali-pc-id-card bali-id-showcase"') &&
  html.includes('6 уровней привилегий') &&
  html.includes('bali-id-showcase.css?v=') &&
  source("bali-pc-id-home.js").includes('window.location.hash="id"') &&
  !source("bali-pc-id-home.js").includes('baliCardNumber') &&
  html.includes('bali-profile-viewport.css?v=') &&
  html.includes('bali-menu-wide.css?v=') &&
  html.includes('bali-home-hover.css?v=') &&
  source("bali-mobile-glass.css").includes('backdrop-filter:blur(25px)') &&
  source("bali-menu-details.css").includes('#baliKitchenContent .menu-item .menu-details-btn') &&
  rules.includes("match /merch/{merchId}") &&
  rules.includes('validHomeDesign(request.resource.data)') &&
  rules.includes('validMerch(request.resource.data)') &&
  rules.includes('validDesignImage(data.imageTabletUrl, 155000)'),
  "Home Design must retain safe artwork editing and a PC BALI ID loyalty showcase instead of merch, while keeping legacy data rules intact.");
// Desktop About converts through two independent SPA routes; custom icon uploads remain intact.
const aboutCallToActionCss=source("bali-about-cta.css");
const sharedNavIconsCss=source("bali-shared-icons.css");
assert(html.includes('class="bali-pc-about-kicker"') &&
  html.includes('Ваш повод. Наша площадка.') &&
  html.includes('class="bali-pc-about-facts"') &&
  html.includes('class="bali-pc-about-action" data-bali-nav="about"') &&
  html.includes('class="bali-pc-about-events-link" data-bali-nav="events"') &&
  !html.includes('<details class="bali-pc-about">') &&
  aboutCallToActionCss.includes('.bali-pc-about-content') &&
  aboutCallToActionCss.includes('.bali-pc-about-links') &&
  source("bali-home-design.js").includes('card?.classList.toggle("has-photo"'),
  "PC About card must present venue facts, editable imagery and separate venue/calendar actions.");
assert(html.includes('bali-shared-icons.css?v=') &&
  sharedNavIconsCss.includes('assets/nav-icons/home.svg') &&
  sharedNavIconsCss.includes('assets/nav-icons/events.svg') &&
  sharedNavIconsCss.includes('assets/nav-icons/menu.svg') &&
  sharedNavIconsCss.includes('assets/nav-icons/profile.svg') &&
  sharedNavIconsCss.includes('assets/nav-icons/id.svg') &&
  sharedNavIconsCss.includes(':not(.has-custom-icon)') &&
  source("assets/nav-icons/id.svg").includes('<svg') &&
  source("assets/nav-icons/profile.svg").includes('<svg'),
  "PC navigation, account icon and mobile ID must share the BALI silhouette icon family.");
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
  admin.includes('bali-admin-bar.js?v=') &&
  admin.includes('bali-admin-bar.css?v=') &&
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
  rules.includes('data.keys().hasOnly([\'name\',\'category\',\'volume1\',\'price1\',\'volume2\',\'price2\',\'sort\',\'updatedAt\',\'description\',\'ingredients\'])') &&
  rules.includes('data.updatedAt == request.time'),
  "Bar Firestore collection must be publicly read-only and securely admin-editable");

assert(html.includes('bali-desktop-fullwidth.css?v=') &&
  html.indexOf('bali-desktop-fullwidth.css?v=') >
  html.indexOf('bali-lime-neutral.css?v='),
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
  html.includes('bali-lime-neutral.css?v=') &&
  admin.includes('bali-lime-neutral.css?v=') &&
  html.indexOf('bali-lime-neutral.css?v=') >
  html.indexOf('bali-theme.css?v=') &&
  admin.indexOf('bali-lime-neutral.css?v=') >
  admin.indexOf('bali-theme.css?v='),
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
assert(html.includes('bali-theme.css?v=') &&
  admin.includes('bali-theme.css?v=') &&
  html.includes('bali-theme-guest.js?v=') &&
  source("bali-theme-guest.js").includes('./bali-public-reader.js') &&
  admin.includes('bali-theme.js?v=') &&
  html.indexOf('bali-theme.css?v=') >
  html.indexOf('bali-obsidian-premium.css?v=') &&
  admin.indexOf('bali-theme.css?v=') >
  admin.indexOf('bali-obsidian-premium.css?v='),
  "Global accent CSS and realtime settings module must load last on both interfaces");
assert(admin.includes('data-admin-tab="appearance"') &&
  admin.includes('id="adminAppearancePanel"') &&
  admin.includes('id="baliThemeForm"') &&
  admin.includes('id="baliThemeSave"') &&
  admin.includes('id="baliThemeCancel"') &&
  admin.includes('id="baliThemeRulesHelp"') &&
  ['cobalt','lime','white','custom'].every(x=>admin.includes('name="baliThemePreset" value="'+x+'"')) &&
  ['Primary','Secondary','Text','Border'].every(x=>admin.includes('id="baliColor'+x+'"')&&admin.includes('id="baliColor'+x+'Hex"')) &&
  dashboardClient.includes('appearance: ["Цвета сайта"'),
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
  rules.includes("allow get: if settingId in ['appearance','menuVisibility','homeDesign','homeInterface','homeEventPlaceholder','siteBuilderPublished','preorderSecurity']") &&
  rules.includes("(settingId == 'siteBuilderDraft' && isAdmin())") &&
  rules.includes("settingId in ['siteBuilderDraft','siteBuilderPublished'] && validSiteBuilder(request.resource.data)") &&
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
assert(html.includes('bali-obsidian-premium.css?v=') &&
  admin.includes('bali-obsidian-premium.css?v=') &&
  html.indexOf('bali-obsidian-premium.css?v=') >
  html.indexOf('bali-home-stories.css?v=') &&
  admin.indexOf('bali-obsidian-premium.css?v=') >
  admin.indexOf('admin-dashboard.css?v='),
  "One current premium theme must load last on the guest and admin sites");
assert(['bali-atelier-theme.css','bali-velvet-night.css','bali-editorial-minimal.css']
  .every(name=>!html.includes('href="'+name)&&!admin.includes('href="'+name)),
  "Superseded palettes must not cascade on the live site or dashboard");
assert(html.includes('class="bali-guest-theme"') &&
  /<body\b[^>]*class="[^"]*\bbali-admin-theme\b/.test(admin) &&
  html.includes('content="#080b11"') &&
  admin.includes('content="#080b11"') &&
  html.includes('bali-brand-system.css?v=') && admin.includes('bali-brand-system.css?v=') && source('bali-brand-system.css').includes('assets/fonts/manrope-variable.woff2'),
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
  html.includes('bali-icon-atelier.js?v=') &&
  admin.includes('bali-icon-atelier.js?v='),
  "Every designer vector icon must retain its local SVG sizing and handlers");
assert(customIconJs.includes('"book":') &&
  customIconJs.includes('menu:"book"') &&
  customIconJs.includes('replaceAll(".bali-menu-banner-icon","book")') &&
  customIconJs.includes('menu:"book",events:"calendar"') &&
  !customIconJs.includes('"cocktail"') &&
  customIconJs.includes("setAttribute(\"aria-label\",\"Закрыть\")"),
  "Menu must use a designed open book; icon controls must remain accessible");

const menuClient = source("menu-firestore.js");
// adminClient was initialized above the menu-detail assertions.
assert(html.includes('id="eventSelect"'), "Preorder event selection missing");
assert(html.includes('id="bookingId"'), "Booking ID input missing");
assert(html.includes('id="tableNumber"'), "Table number input missing");
assert(html.includes('menu-firestore.js?v='), "Firestore public catalog module missing");
assert(admin.includes('admin-firestore.js?v='), "Secure admin module missing");
assert(!admin.includes('id="adminPassword"'), "Legacy admin password form must be removed");
assert(menuClient.includes('collection(db, "menu")') && menuClient.includes('collection(db, "events")'), "Catalog must read Firestore menu and events");
assert(adminClient.includes('doc(db,"admins",user.uid)') && adminClient.includes('role.data().active!==true'), "Admin role check missing");
assert(rules.includes('match /menu/{itemId}') && rules.includes('match /events/{eventId}'), "Firestore catalog rules missing");
assert(rules.includes('allow update: if (isAdmin() || isDirector())'), "Catalog writes must require admin role");
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
assert(html.includes('responsive-menu.css?v='), "Responsive stylesheet must be loaded with current cache version");
assert(html.indexOf('responsive-menu.css?v=') > html.indexOf('href="auth.css"'), "Responsive stylesheet must load after auth.css");
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
assert(html.includes("app.js?v="), "Published app.js cache version must be current");
assert(html.includes("styles.css?v="), "Published menu styles must be refreshed");
assert(rules.includes("match /orders/{orderId}"), "Order Rules must exist before enabling order UI");
const dashboardCss = source("admin-dashboard.css");
const dashboardJs = source("admin-dashboard.js");
assert(admin.includes('id="adminOrdersPanel"') && admin.includes('id="adminMenuPanel"') && admin.includes('id="adminEventsPanel"'), "Admin must have separate Orders, Menu and Events workspaces");
assert(admin.includes('data-admin-tab="orders"') && admin.includes('data-admin-tab="menu"') && admin.includes('data-admin-tab="events"'), "Admin navigation tabs missing");
assert(admin.includes('admin-dashboard.css?v=') && admin.includes('admin-dashboard.js?v='), "Updated dashboard files must be loaded");
assert(dashboardCss.includes('@media(max-width:760px)') && dashboardCss.includes('.admin-sidebar'), "Mobile dashboard navigation CSS missing");
assert(dashboardJs.includes('adminPageTitle') && dashboardJs.includes('menuSearch'), "Dashboard navigation and menu search missing");
assert(dashboardJs.includes('bali:admin:orders') && dashboardJs.includes('bali:admin:menu') && dashboardJs.includes('bali:admin:events'), "Dashboard realtime counters missing");
assert(html.includes('responsive-menu.css?v='), "Guest mobile layout CSS cache version outdated");
assert(html.includes('app.js?v='), "Guest cart code cache version outdated");
assert(responsive.includes('.cart-total > .total-amount') && responsive.includes('white-space:nowrap'), "Cart total must fit amount and BYN in one line");
assert(app.includes('${total.toFixed(2)} BYN') && html.includes('<span>Итого:</span>'), "Cart total must use compact BYN format");
assert(html.includes('auth.js?v='), "Guest profile label code should load without old cache");
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
assert(admin.includes('admin-clients.js?v='), "Client CRM JS not loaded");
assert(admin.includes('admin-orders.js?v='), "Staff order editor JS not loaded");
assert(admin.includes('admin-firestore.js?v='), "Admin event fix must load without cache");
assert(clientSource.includes('where("ownerUid","==",selected.uid)') && clientSource.includes('startAfter(lastOrder)'),
  "Client history needs owner-only paged retrieval");
assert(orderAdminSource.includes('writeBatch(db)') && orderAdminSource.includes('archiveOrder') &&
  orderAdminSource.includes('getDoc(doc(db,"menu",String(line.id)))'), "Order item edit + archive must validate menu price");
assert(rules.includes('allow list: if isAdmin();') && rules.includes('match /orders/{orderId}'),
  "Guest CRM privacy and admin access missing");
assert(rules.includes("data.poster_url") && rules.includes("data:image/webp;base64") &&
  rules.includes("image_url.size() <= 95000"), "Secure compressed poster/product storage missing");
assert(imageProcessor.includes('canvas.toDataURL("image/webp"') && imageProcessor.includes('let ratio=design?.ratio||1;') &&
  imageProcessor.includes('ratio=iw/ih;'),
  "Image compression must create 1:1 dishes, flyers and SECRET placeholder images");
assert(adminClient.includes('compressImage(file,"product")') &&
  adminClient.includes('compressImage(file,"poster")'), "Image picker must upload to Firestore");
assert(html.includes('data-bali-nav="events"') && html.includes('id="eventsSection"'), "Guest events page missing");
assert(app.includes('renderUpcomingEvents()') && app.includes('.sort((a,b)=>a.date.localeCompare(b.date)||'),
  "Upcoming events must display nearest first");
assert(responsive.includes('grid-template-rows:auto 42px') &&
  responsive.includes('.header-content #menuNavBtn,') &&
  responsive.includes('.header-content #eventsNavBtn{') &&
  responsive.includes('height:42px'), "Mobile Menu and Events must align on one baseline");
const modernHeader = source("header-modern.css");
assert(html.includes('header-modern.css?v='), "Modern BALI navigation must load");
assert(html.indexOf('header-modern.css?v=') >
  html.indexOf('responsive-menu.css?v='), "Header overrides must load after responsive CSS");
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
assert(html.includes('menu-categories.css?v='), "Category layout CSS not linked");
assert(html.indexOf('menu-categories.css?v=') >
  html.indexOf('header-modern.css?v='), "Sticky category stylesheet must load after header CSS");
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
assert(!app.includes('button.textContent="Сделать предзаказ";') &&
  !app.includes('button.className="event-go-to-menu"') &&
  app.includes('actions.append(planBtn);') &&
  html.includes('id="checkoutBtn"') &&
  html.includes('id="eventSelect"'),
  "Calendar posters must not offer a preorder CTA; kitchen menu checkout stays available");
const interestSource = source("event-interests.js");
const interestCss = source("event-interests.css");
assert(html.includes('event-interests.js?v=') &&
  html.includes('event-interests.css?v='), "Guest interest module and styles must load");
assert(!html.includes('id="plannedEventsCount"') &&
  !html.includes('id="eventsViewTabs"') &&
  !html.includes('data-events-view=') &&
  html.includes('id="profileMyPlansBtn"') &&
  app.includes('showOnlyPlannedEvents=true;') &&
  app.includes('if(nav.dataset.baliNav==="events")showOnlyPlannedEvents=false;'),
  "Calendar filters must be removed; profile My Plans stays accessible and Calendar opens all events");
assert(app.includes('Хочу пойти') &&
  app.includes('Хочет пойти: ') &&
  app.includes('guestInterestDates.has(event.id||event.date)'), "Event cards must display RSVP button and public counts");
assert(app.includes('window.setInterval(()=>') &&
  app.includes('renderUpcomingEvents();'), "Past events must disappear automatically from My Plans");
assert(app.includes('details.append(name,times,description,interested,message);') &&
  app.includes('actions.append(planBtn);') &&
  !app.includes('button.className="event-go-to-menu"') &&
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
assert(html.includes('<title>BALI NIGHTCLUB · Минск</title>') &&
  html.includes('bali-pages.css?v='), "Bali landing brand and CSS missing");
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
  "Home must display BALI PRIVILEGE hero above the static poster lineup");
assert(!html.includes('class="bali-home-calendar-row"') &&
  !html.includes('data-home-events-view="all"') &&
  !html.includes('data-home-events-view="planned"') &&
  html.includes('aria-label="BALI календарь — открыть все предстоящие мероприятия"') &&
  !html.includes('Смотреть всё'),
  "Home must use one full-calendar heading without top filters or redundant More button");
assert(html.includes('id="homeEventCarousel"') &&
  app.includes('function renderHomeEvents()') &&
  app.includes('bali-home-event-card'), "Static Home event posters are missing");
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
const eventStageJs=source("bali-calendar-coverflow.js");
assert(app.includes("menuSection.scrollTop = 0") &&
  eventStageJs.includes('if(mobile()||event.ctrlKey||Math.abs(event.deltaY)<4)return;'),
  "Mobile category change must scroll the product list without hijacking gestures");
const approvedCss=source("bali-redesign.css");
const squareCss=source("bali-event-square.css");
assert(html.includes('bali-event-square.css?v=') &&
  html.indexOf('bali-event-square.css?v=') >
  html.indexOf('bali-home-premium.css?v='),
  "Square event styling must load after the mobile and premium styles");
assert(squareCss.includes("aspect-ratio:1 / 1") &&
  squareCss.includes(".bali-event-info {") &&
  squareCss.includes(".bali-event-actions {") &&
  squareCss.includes("margin-top:auto") &&
  squareCss.includes("overflow-y:auto"),
  "Square poster, independently scrollable info and bottom pinned actions required");
assert(eventStageJs.includes('available-actionsHeight-3*targetGap') &&
  eventStageJs.includes('area.height-(phone?80:76)'),
  "Carousel must reserve vertical space for square image and event actions");

const premiumCss=source("bali-home-premium.css");
const homeStoriesCss=source("bali-home-stories.css");
assert(html.includes('bali-home-stories.css?v=') &&
  html.indexOf('bali-home-stories.css?v=') >
  html.indexOf('bali-event-square.css?v='),
  "Homepage square card overrides must load after event card styles");
assert(homeStoriesCss.includes("aspect-ratio:1/1") &&
  homeStoriesCss.includes(".bali-home-poster-wrap") &&
  homeStoriesCss.includes(".bali-home-event-info") &&
  homeStoriesCss.includes(".bali-home-heart.is-liked svg") &&
  homeStoriesCss.includes("fill:#f02b50") &&
  html.includes('id="bali-home-static-posters-style"') &&
  !html.includes('<script src="bali-home-coverflow.js'),
  "Home events require square artwork and readable hearts, without an independent home carousel");
assert(app.includes('const card=document.createElement("article");') &&
  app.includes('function toggleGuestInterest(date,message)') &&
  app.includes('window.BaliInterests.toggle(date)') &&
  app.includes('click.stopPropagation()') &&
  app.includes('void toggleGuestInterest(event.id||event.date,document.getElementById("homeInterestFeedback"))') &&
  app.includes('function syncInterestVisuals(){') &&
  app.includes('const rendered=[];') &&
  html.includes('grid-template-columns:repeat(3,minmax(0,1fr))') &&
  html.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),
  "Home RSVP hearts must persist through Firebase; Home must keep its static 3-mobile/5-desktop grid");
assert(html.includes('id="homeInterestFeedback"') &&
  app.includes('getElementById("homeInterestFeedback")') &&
  app.includes('result?.loginRequired') &&
  app.includes('pendingInterestDates.add(date)') &&
  app.includes('pendingInterestDates.delete(date)') &&
  app.includes('setInterestSelection(date,previous)') &&
  app.includes('heart.disabled=waiting'),
  "Home hearts need login, pending-operation and save-error feedback");

assert(html.includes('<section class="bali-home-events-panel"') &&
  html.includes('id="homeEventCarousel"') &&
  html.includes('id="menuNavBtn"') &&
  html.includes('class="bali-home-contacts-card"') &&
  html.indexOf('bali-home-events-panel') < html.indexOf('id="menuNavBtn"') &&
  html.indexOf('id="menuNavBtn"') < html.indexOf('class="bali-home-contacts-card"'),
  "Home should be grouped in order: events, menu and contacts");
assert(html.includes('bali-home-premium.css?v=') &&
  html.indexOf('bali-home-premium.css?v=') >
  html.indexOf('bali-redesign.css?v='),
  "Premium home CSS must load after the existing phone, tablet and desktop CSS");
assert(premiumCss.includes("/* BALI NIGHT CLUB · premium home zones, v49") &&
  premiumCss.includes("grid-template-rows:minmax(0,1fr) auto auto!important") &&
  premiumCss.includes("@media(max-width:767px)") &&
  premiumCss.includes("@media(min-width:768px)") &&
  premiumCss.includes(".bali-home-events-panel") &&
  premiumCss.includes(".bali-home-menu-banner") &&
  premiumCss.includes(".bali-home-contacts-card"),
  "Premium home zones must fit the viewport on both small and large devices");
assert(html.includes('scroll-snap-type:none!important') &&
  html.includes('overflow:hidden!important') &&
  html.includes('touch-action:pan-y!important') &&
  html.includes('href="tel:+375296700300"') &&
  html.includes('href="https://t.me/baliclubminsk"'),
  "Home must not swipe or overflow; contacts and static responsive poster slots must remain");

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
  admin.includes('admin-firestore.js?v='),
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
assert(eventStageJs.includes("Math.min(390,area.width*.88,") &&
  eventStageJs.includes("Math.max(100,area.height-(phone?80:76))"),
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
assert(html.includes('bali-redesign.css?v=') &&
  html.indexOf('bali-redesign.css?v=') >
    html.indexOf('events-carousel.css?v='),
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
assert(html.includes('events-carousel.css?v='), "Swipe carousel stylesheet must load");
assert(html.indexOf('events-carousel.css?v=') >
  html.indexOf('bali-pages.css?v='), "Carousel must override older event grid styles");
assert(html.includes('id="eventsCarouselShell"') &&
  html.includes('id="eventsCarouselPosition"') &&
  html.includes('aria-roledescription="карусель"'), "Accessible event carousel shell missing");
assert(!html.includes('<h2 class="section-title">Меню BALI</h2>'),
  "Do not duplicate menu title after category buttons");
assert(source("bali-calendar-coverflow.js").includes('shell.addEventListener("wheel"') &&
  source("bali-calendar-coverflow.js").includes('grid.addEventListener("keydown"') &&
  !app.includes('function initEventCarousel()'),
  "One stage controller must own desktop wheel and keyboard without a competing legacy carousel");
assert(app.includes('const previousDate=previousCards[previousIndex]?.dataset.eventId||previousCards[previousIndex]?.dataset.eventDate') &&
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
  !html.slice(topbarStart,topbarEnd).includes('id="eventsViewTabs"') &&
  html.slice(topbarStart,topbarEnd).includes('id="eventsHeadingGuest"'),
  "Calendar header must display its heading without All Events/My Plans buttons");
assert(html.includes('Выбирай событие и добавляй его в «Мои планы».'),
  "Small footer copy must be concise and fit two lines");
assert(carouselCss.includes('BALI v36') &&
  carouselCss.includes('aspect-ratio:9 / 16') &&
  carouselCss.includes('grid-template-columns:none'),
  "Mobile stories must use vertical 9:16 slides instead of split mini cards");
assert(carouselCss.includes('line-clamp:2') &&
  carouselCss.includes('.events-topbar') &&
  carouselCss.includes('flex-wrap:nowrap'),
  "Calendar topbar and footer must remain compact");
assert(source("bali-calendar-coverflow.js").includes('function measure()') &&
  source("bali-calendar-coverflow.js").includes('area.height-(phone?80:76)') &&
  source("bali-calendar-coverflow.js").includes('observer.observe(grid)') &&
  !app.includes('fitStorySlides'),
  "The stage must measure available height without legacy code overwriting its poster width");
assert(html.includes('bali-calendar-reference.css?v=') &&
  html.includes('bali-calendar-coverflow.js?v=') &&
  html.includes('id="baliEventDetailDialog"') &&
  html.includes('id="baliPosterPrevious"') &&
  html.includes('id="baliPosterNext"') &&
  source("bali-calendar-reference.css").includes('#eventsSection #eventsGrid') &&
  html.includes('bali-calendar-stage.css?v=') &&
  source("bali-calendar-stage.css").includes('rotateY(var(--bali-stage-angle,0deg))') &&
  source("bali-calendar-stage.css").includes('.events-topbar') &&
  source("bali-calendar-coverflow.js").includes('move(event.deltaY>0?1:-1)') &&
  source("bali-calendar-coverflow.js").includes('position=initial+delta*ease(progress)') &&
  source("bali-calendar-coverflow.js").includes('mode:"stage"') &&
  source("bali-calendar-coverflow.js").includes('openDetails(card)'),
  "BALI calendar must have the clean reference layout, 3D swipe motion, arrows, wheel and event details");

// BALI ID: complete profile, immutable atomic sequence, admin-only tier assignment.
const centredIdCss=source("bali-id-flip.css");
assert(html.includes('bali-id-flip.css?v=') &&
  centredIdCss.includes('grid-template-columns:minmax(0,1fr)!important') &&
  centredIdCss.includes('width:min(100%,645px)!important') &&
  centredIdCss.includes('max-width:100%!important') &&
  centredIdCss.includes('justify-items:center!important') &&
  centredIdCss.includes('box-sizing:border-box!important'),
  "BALI ID and QR must remain centred inside the profile content box on narrow mobile screens");
const idClient=source("bali-id.js");
const privilegeClient=source("bali-privilege-admin.js");
const shareClient=source("bali-share.js");
const smartClient=source("bali-smart-design.js");
assert(!html.includes('baliIdFlipHelp') &&
  !source("bali-id-flip.js").includes('baliIdFlipHelp') &&
  !source("bali-id-flip.css").includes('bali-id-flip-help'),
  "The BALI ID flip instruction below the card must remain removed.");
assert(html.includes('id="baliCardNumber"') &&
  html.includes('id="baliBenefitsList"') &&
  html.includes('id="baliIdSection"') &&
  html.includes('id="profileSection"') &&
  !html.includes('id="baliProfileSettings"') &&
  html.includes('bali-id.js?v=') &&
  html.includes('bali-share.js?v=') &&
  html.includes('bali-id-flip.js?v=') &&
  html.includes('bali-id-flip.css?v=') &&
  html.includes('id="baliIdFront"') &&
  html.includes('id="baliIdBack"') &&
  html.includes('id="baliShowQr"') &&
  html.includes('id="baliQrDialog"') &&
  html.indexOf('id="baliShowQr"') < html.indexOf('id="baliIdFlipScene"') &&
  html.indexOf('id="baliShowQr"') > html.indexOf('id="baliIdPageHeading"') &&
  html.includes('id="profileBaliIdBtn" data-bali-nav="id"') &&
  html.includes('data-bali-profile-action="id"') &&
  source("bali-id-flip.js").includes('httpsCallable(functions,"issueGuestQr")') &&
  html.includes('bali-id-motion.js?v=') &&
  source("bali-id-motion.js").includes('scene.addEventListener("pointermove"') &&
  source("bali-id-motion.js").includes('scene.addEventListener("pointerup"') &&
  source("bali-id-motion.js").includes('frame(g.current+progress*180)') &&
  source("bali-id-motion.js").includes('lastTouchTap') &&
  source("bali-id-motion.js").includes('window.BaliIdMotion=Object.freeze') &&
  source("bali-id-flip.css").includes('justify-self:center!important') &&
  source("auth.js").includes('window.location.hash="profile"') &&
  idClient.includes('runTransaction(db,async tx=>') &&
  idClient.includes('doc(db,"baliCounters","guests")') &&
  idClient.includes('doc(db,"baliIds",uid)') &&
  idClient.includes('onAuthStateChanged(auth,resumeCard)') &&
  idClient.includes('cardIsOpen()') &&
  source("bali-id-bank.js").includes('document.body.dataset.baliPage!=="id"') &&
  rules.includes('match /baliCounters/{key}') &&
  rules.includes('getAfter(baliIdPath(request.auth.uid))') &&
  rules.includes('match /guestPrivileges/{uid}') &&
  rules.includes('allow create, update: if isAdmin()'),
  "BALI ID must use a protected sequential transaction and a full guest profile.");
assert(admin.includes('id="baliPrivilegeAssignForm"') &&
  admin.includes('id="baliPrivilegeRulesForm"') &&
  admin.includes('bali-privilege-admin.js?v=20261021-5priv') &&
  privilegeClient.includes('setDoc(doc(db,"guestPrivileges",selected)') &&
  privilegeClient.includes('setDoc(doc(db,"privilegeRules","main")'),
  "Privilege statuses and assignment rules must be admin-editable without client self-upgrades.");
// BALI ID: six named cards, custom visual language, safe default Member
// creation and a separate verified director assignment interface.
const directorHtml=source("director-id.html");
const directorClient=source("bali-director-id.js");
const tierCss=source("bali-id-tiers.css");
const residentCss=source("bali-id-resident.css");
for(const tier of ["Member","Silver","Gold","Platinum","Black","Private","ResidentDJ"]){
  assert(idClient.includes(tier+':{description:') &&
    privilegeClient.includes(tier+':{description:') &&
    admin.includes('<option value="'+tier+'">') &&
    directorHtml.includes('<option value="'+tier+'">'),
    "Six BALI ID status names must match the approved categories: "+tier);
  assert((tier==="ResidentDJ"?residentCss:tierCss).includes('data-bali-tier="'+tier.toLowerCase()+'"'),
    "Missing the approved color treatment for BALI ID tier "+tier);
}
assert(html.includes('bali-id-tiers.css?v=') &&
  html.includes('class="bali-id-centre-art"') &&
  html.includes('class="bali-id-brand-label"') &&
  html.includes('id="baliCardHeaderTier"') &&
  idClient.includes('cardScene.dataset.baliTier=tier.toLowerCase()') &&
  idClient.includes('async function ensureMemberAssignment(uid)') &&
  idClient.includes('tier:"Member",benefits:[],updatedBy:uid') &&
  rules.includes("request.resource.data.tier == 'Member'") &&
  rules.includes("request.resource.data.benefits.size() == 0") &&
  rules.includes("allow update: if (isAdmin() || isDirector())") &&
  rules.includes("function isDirector()") &&
  rules.includes('match /staffRoles/{uid}') &&
  rules.includes("data.tier in ['Member','Silver','Gold','Platinum','Black','Private','ResidentDJ']") &&
  rules.includes("data.levels.keys().hasAll(['Member','Silver','Gold','Platinum','Black','Private','ResidentDJ'])") &&
  directorClient.includes('where("number","==",number)') &&
  directorClient.includes('getDoc(doc(db,"staffRoles",user.uid))') &&
  directorClient.includes('setDoc(doc(db,"guestPrivileges",selectedUid)') &&
  directorHtml.includes('id="directorAssignForm"'),
  "BALI ID must preserve default Member and restrict upgrades to director/admin");
// Exact brand asset on all ID categories; transfer feature is prepared but
// categorically unavailable to visitors and untrusted browser clients.
// The central logo must remain measurable on iOS; percent-based heights inside
// flexible grid tracks previously caused the entire logo to disappear.
assert(!tierCss.includes('height:min(100%,210px)') &&
  !tierCss.includes('max-height:min(100%,155px)') &&
  tierCss.includes('height:clamp(106px,34vw,145px)!important;') &&
  tierCss.includes('height:clamp(110px,23vw,195px)!important;') &&
  tierCss.includes('z-index:5!important;') &&
  html.includes('bali-id-tiers.css?v=20261019-3') &&
  html.includes('width="450" height="531" loading="eager"'),
  "BALI ID full logo must have a definite mobile height and appear above card decor");
const idLogo=source("assets/bali-id-full-logo.svg");
const futureTransfer=source("bali-bonus-transfer-scaffold.js");
const qrBackend=source("functions/bonus-qr.js");
const qrScanner=source("bali-qr-scanner.js");
const qrAdmin=source("bali-qr-admin.js");
assert(qrBackend.includes("exports.")===false &&
  qrBackend.includes("applyBaliBonusQR") && qrBackend.includes("createBaliQrBatch") &&
  qrScanner.includes("previewBaliBonusQR") && qrScanner.includes("applyBaliBonusQR") &&
  qrAdmin.includes("createBaliQrBatch") && html.includes("baliIdTopupOpen") &&
  html.includes("baliIdPayOpen") && admin.includes("baliQrAdminPanel"),
  "QR creation and redemption must be server-authorized with guest review");
const directorTransfer=source("director-id.html");
assert(idLogo.includes('<svg') &&
  idLogo.includes('fill-rule="evenodd"') &&
  idLogo.includes('<path fill="white"') &&
  idLogo.includes('viewBox="0 0 450 531"') &&
  idLogo.length>5000 &&
  html.includes('src="assets/bali-id-card-readable.svg?v=20261020-no-subtitle"') &&
  html.includes('bali-id-premium-refine.css?v=') &&
  !html.includes('ЛИЧНЫЙ МИР ГОСТЯ') &&
  source("assets/bali-id-card-readable.svg").includes('transform="translate(0 54)"') &&
  !source("assets/bali-id-card-readable.svg").includes('NIGHT CLUB</text>') &&
  !html.includes('class="bali-id-seal"') &&
  !html.includes('✺') &&
  tierCss.includes('img.bali-id-brand-master') &&
  tierCss.includes('var(--bali-card-logo-filter') &&
  html.includes('class="bali-id-inline-mark"'),
  "BALI ID must preserve its original mask/BALI emblem without a subtitle on all tiers");
assert(html.includes('id="baliIdTransferOpen"') &&
  !html.includes('data-bali-transfer-form') &&
  !html.includes('bali-bonus-transfer-scaffold.js') &&
  admin.includes('data-bali-transfer-form') &&
  admin.includes('data-bali-transfer-submit disabled') &&
  directorTransfer.includes('data-bali-transfer-form') &&
  directorTransfer.includes('data-bali-transfer-submit disabled') &&
  futureTransfer.includes('enabled: false') &&
  futureTransfer.includes('endpoint: null') &&
  futureTransfer.includes('fromCardNumber') &&
  futureTransfer.includes('toCardNumber') &&
  !futureTransfer.includes('httpsCallable(') &&
  !futureTransfer.includes('setDoc(') &&
  rules.includes('match /guestWallets/{uid}') &&
  rules.includes('match /bonusTransfers/{transferId}') &&
  source("BALI_BONUS_TRANSFERS_RESERVED.md").includes('idempotencyKey'),
  "Guest transfers must be available from BALI ID while staff transfers on behalf of guests remain disabled");
const shareStyles=source("bali-new-features.css");
assert(shareClient.includes('const actions=card.querySelector(".bali-event-actions")') &&
  shareClient.includes('actions.append(button);') &&
  !shareClient.includes('card.append(button);') &&
  shareStyles.includes('#eventsSection #eventsGrid .bali-event-actions{') &&
  shareStyles.includes('grid-template-columns:minmax(0,1.32fr) minmax(0,1fr)') &&
  shareStyles.includes('position:static;') &&
  !shareStyles.includes('#eventsGrid .bali-share-trigger{position:absolute') &&
  html.includes('bali-share.js?v=') &&
  html.includes('bali-new-features.css?v=20261019-2'),
  "Calendar Share must sit beside RSVP in the event footer, never overlay the poster");
assert(shareClient.includes('canvas.width=WIDTH;canvas.height=HEIGHT') &&
  shareClient.includes('const WIDTH=1080,HEIGHT=1920;') &&
  shareClient.includes('navigator.canShare?.({files:[file]})') &&
  shareClient.includes('bali-share-trigger') &&
  smartClient.includes('bali-smart-previews') &&
  smartClient.includes('data-smart-crop') &&
  smartClient.includes('data-smart-original') &&
  admin.includes('bali-smart-design.js?v=20261019-2'),
  "Share must export 9:16 stories and Smart Design must offer previews and non-destructive crop.");

console.log("BALI source checks passed: " + ids.length + " required UI IDs, 18 priced menu items and security checks.");

assert(!app.includes("elements.cartCount") &&
  !app.includes("getElementById('cartBtn')") &&
  !app.includes("getElementById('myOrdersBtn')") &&
  app.includes('document.getElementById("baliCartDock")?.addEventListener("click",openCart)'),
  "Fixed bottom cart and profile order actions must not depend on deleted menu toolbar controls");
