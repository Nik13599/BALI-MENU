/**
 * BALI MENU — регистрация гостя.
 * Вход через Google (проверенный email); имя и телефон хранятся в users/{uid}.
 * До развёртывания Firebase + firestore.rules авторизация НЕ работает.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const els = {
  button: $("accountBtn"),
  dialog: $("authModal"),
  close: $("closeAuth"),
  google: $("authGoogleBtn"),
  form: $("authProfileForm"),
  name: $("authName"),
  phone: $("authPhone"),
  email: $("authEmail"),
  status: $("authMessage"),
  signOut: $("authSignOutBtn"),
  overlay: $("overlay")
};

const config = window.BALI_FIREBASE_CONFIG || {};
const isConfigured = ["apiKey", "authDomain", "projectId", "appId"].every(
  (key) => typeof config[key] === "string" &&
    config[key].trim() && !config[key].includes("REPLACE_WITH_")
);

let auth = null;
let database = null;
let user = null;
let profile = null;
let resolved = false;
let finishInitialization;
const ready = new Promise((resolve) => {
  finishInitialization = () => {
    if (!resolved) { resolved = true; resolve(); }
  };
});

function message(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", isError);
}

function normalizePhone(raw) {
  return raw.trim().replace(/[\s()\-]/g, "");
}

function validProfile(docData, authUser) {
  return !!docData && docData.uid === authUser.uid &&
    docData.email === authUser.email &&
    typeof docData.name === "string" && docData.name.trim().length >= 2 &&
    typeof docData.phone === "string" &&
    /^\+[1-9]\d{7,14}$/.test(docData.phone);
}

function render() {
  els.button.textContent = !isConfigured ? "Вход не настроен" :
    !user ? "Войти / Регистрация" :
    profile ? "👤 " + profile.name : "Заполнить профиль";
  els.google.hidden = !isConfigured || !!user;
  els.form.hidden = !isConfigured || !user;
  els.signOut.hidden = !user;
  if (user) {
    els.email.value = user.email || "";
    els.name.value = profile?.name || user.displayName || "";
    els.phone.value = profile?.phone || "+375";
  } else {
    els.form.reset();
  }
}

function show() {
  render();
  els.dialog.classList.add("active");
  els.dialog.setAttribute("aria-hidden", "false");
  els.overlay.classList.add("active");
  if (!isConfigured) {
    message("Регистрация станет доступна после настройки Firebase.", true);
  } else if (user && !profile) {
    message("Для регистрации заполните имя и номер телефона.");
  } else if (user && profile) {
    message("Профиль сохранён. Вы можете изменить имя или телефон.");
  } else {
    message("Войдите через Google, чтобы подтвердить электронную почту.");
  }
}

function hide() {
  els.dialog.classList.remove("active");
  els.dialog.setAttribute("aria-hidden", "true");
  if (!$("checkoutModal")?.classList.contains("active") &&
      !$("cartSidebar")?.classList.contains("active") &&
      !$("successModal")?.classList.contains("active")) {
    els.overlay.classList.remove("active");
  }
}

function friendlyError(error) {
  const code = String(error?.code || "unknown-error");
  const errors = {
    "auth/invalid-api-key": "Некорректный Firebase API-ключ. Проверьте настройки приложения.",
    "auth/app-not-authorized": "Этот сайт не разрешён для Firebase API-ключа.",
    "auth/unauthorized-domain": "Домен сайта не разрешён в Firebase Authentication.",
    "auth/configuration-not-found": "Для проекта не найдены настройки Firebase Authentication.",
    "auth/operation-not-allowed": "В Firebase не включён вход через Google.",
    "auth/network-request-failed": "Не удалось связаться с Firebase. Проверьте соединение, VPN или блокировку запросов.",
    "auth/internal-error": "Ошибка Google-входа. Проверьте конфигурацию и повторите.",
    "auth/invalid-app-credential": "Ошибка настроек авторизации Firebase.",
    "auth/invalid-credential": "Не удалось проверить учётные данные Google.",
    "auth/web-storage-unsupported": "Браузер блокирует хранилище, необходимое для входа.",
    "auth/popup-blocked": "Браузер заблокировал окно Google. Разрешите всплывающие окна.",
    "auth/popup-closed-by-user": "Окно входа было закрыто.",
    "auth/cancelled-popup-request": "Повторный вход отменён.",
    "auth/account-exists-with-different-credential": "Почта уже связана с другим способом входа.",
    "permission-denied": "Нет доступа к Firestore. Проверьте опубликованные правила доступа.",
    "unavailable": "Сервис Firestore временно недоступен."
  };
  // Выводим только код ошибки, но не технические детали, токены или email.
  return (errors[code] || "Не удалось выполнить действие в Firebase.") + " [код: " + code + "]";
}

els.button.addEventListener("click", show);
els.close.addEventListener("click", hide);
els.signOut.addEventListener("click", async () => {
  if (!auth) return;
  await signOut(auth);
  profile = null;
  user = null;
  message("Вы вышли из аккаунта.");
  render();
});

els.google.addEventListener("click", async () => {
  if (!auth) return;
  message("Открывается окно Google...");
  els.google.disabled = true;
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === "auth/popup-blocked" ||
        error.code === "auth/operation-not-supported-in-this-environment") {
      try {
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return;
      } catch (redirectError) {
        message(friendlyError(redirectError), true);
        return;
      }
    }
    message(friendlyError(error), true);
  } finally {
    els.google.disabled = false;
  }
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth?.currentUser || !database || !user ||
      auth.currentUser.uid !== user.uid || !user.emailVerified || !user.email) {
    message("Сначала войдите с подтверждённой электронной почтой.", true);
    return;
  }
  const name = els.name.value.trim().replace(/\s+/g, " ");
  const phone = normalizePhone(els.phone.value);
  if (name.length < 2 || name.length > 100) {
    message("Введите имя от 2 до 100 символов.", true); return;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    message("Укажите телефон в международном формате, например +375291234567.", true);
    return;
  }

  const submit = els.form.querySelector('button[type="submit"]');
  submit.disabled = true;
  message("Сохраняем профиль...");
  try {
    const ref = doc(database, "users", user.uid);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, { name, phone, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, {
        uid: user.uid,
        email: user.email,
        name, phone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    profile = { uid: user.uid, email: user.email, name, phone };
    render();
    message("Профиль сохранён. Теперь можно оформлять предзаказ.");
  } catch (error) {
    message(friendlyError(error), true);
  } finally {
    submit.disabled = false;
  }
});

window.BaliAuth = {
  ready,
  isConfigured,
  isRegistered: () => !!(user && user.emailVerified && profile),
  getProfile: () => user && profile ? { ...profile } : null,
  getIdToken: async () => auth?.currentUser ? auth.currentUser.getIdToken() : null,
  open: show,
  requireProfile: async () => {
    await ready;
    if (!isConfigured || !user || !user.emailVerified || !profile) {
      show();
      return false;
    }
    return true;
  }
};

async function handleUser(authUser) {
  user = authUser;
  profile = null;
  if (user && (!user.email || !user.emailVerified)) {
    await signOut(auth);
    user = null;
    message("Вход возможен только с подтверждённым email.", true);
  } else if (user) {
    try {
      const snapshot = await getDoc(doc(database, "users", user.uid));
      if (auth.currentUser?.uid !== user.uid) return;
      const candidate = snapshot.exists() ? snapshot.data() : null;
      profile = validProfile(candidate, user) ? candidate : null;
      if (!profile) show();
    } catch (error) {
      show();
      message(friendlyError(error), true);
    }
  }
  render();
  finishInitialization();
}

if (!isConfigured) {
  render();
  finishInitialization();
} else {
  try {
    const firebase = initializeApp(config);
    auth = getAuth(firebase);
    database = getFirestore(firebase);
    onAuthStateChanged(auth, handleUser, (error) => {
      message(friendlyError(error), true);
      finishInitialization();
    });
    getRedirectResult(auth).catch((error) => {
      message(friendlyError(error), true);
    });
  } catch (error) {
    message("Некорректные настройки Firebase.", true);
    finishInitialization();
  }
}
