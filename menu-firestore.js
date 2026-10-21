/**
 * BALI MENU — публичный Firestore каталог и даты мероприятий.
 * НЕ записывает и НЕ подтверждает предзаказы.
 */
import { initializeApp, getApps, getApp } from "./bali-public-reader.js?v=20261021-fast1";
import { getFirestore, collection, onSnapshot } from "./bali-public-reader.js?v=20261021-fast1";

const config = window.BALI_FIREBASE_CONFIG;
const app = getApps().length ? getApp() : initializeApp(config);
const db = getFirestore(app);

const notify = (event, detail) => window.dispatchEvent(
  new CustomEvent(event, { detail })
);

onSnapshot(collection(db, "menu"), (snapshot) => {
  const items = snapshot.docs.map((entry) => ({ ...entry.data() }))
    .filter((item) => Number.isSafeInteger(item.id) &&
      typeof item.name === "string" &&
      Number.isFinite(item.price) &&
      item.price >= 0)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "ru"));
  notify("bali:menu", { items });
}, (error) => {
  console.warn("BALI menu read:", error.code);
  notify("bali:menu-error", { code: error.code });
});

onSnapshot(collection(db, "events"), (snapshot) => {
  const events = snapshot.docs.map((entry) => ({ ...entry.data(), id:entry.id }))
    .filter((event) => typeof event.date === "string" && 
      /^\d{4}-\d{2}-\d{2}$/.test(event.date))
    .sort((a, b) => a.date.localeCompare(b.date) ||
      (a.startTime||"").localeCompare(b.startTime||"") ||
      a.id.localeCompare(b.id));
  notify("bali:events", { events });
}, (error) => {
  console.warn("BALI events read:", error.code);
  notify("bali:events-error", { code: error.code });
});
