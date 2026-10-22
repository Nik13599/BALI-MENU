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
import {sheetsEnabled,sheetsRequest} from "./bali-sheets-api.js";

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
  saveStatus: $("authSaveMessage"),
  signOut: $("authSignOutBtn"),
  overlay: $("overlay"),
  title: $("authModalTitle"),
  submit: $("authSaveBtn")
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
let authGeneration = 0;
let privacyAcceptedUid = null;
// Only an explicit Google login (popup or redirect) sends a returning guest
// straight home; restoring an existing Firebase session preserves navigation.
let pendingGoogleLogin = false;
const redirectLoginKey = "bali-google-login-pending";
const privacyVersion = "2026-10-21";
const consentRef = uid => doc(database,"users",uid,"privacyConsents",privacyVersion);
const withdrawalRef = uid => doc(database,"users",uid,"privacyWithdrawals",privacyVersion);
const hasPrivacyConsent = snapshot => snapshot.exists() && snapshot.data()?.version===privacyVersion &&
  snapshot.data()?.processing===true && snapshot.data()?.international===true;
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

function saveMessage(text, isError = false) {
  if (!els.saveStatus) return;
  els.saveStatus.textContent = text;
  els.saveStatus.classList.toggle("error", isError);
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
  // На мобильном вместо фиксированной подписи "Кабинет" отображаем настоящее имя.
  // До авторизации остаётся короткая кнопка "Кабинет".
  const accountLabel = !user ? "Войти в личный кабинет" :
    profile ? profile.name : "Профиль";
  els.button.textContent = accountLabel;
  els.button.title = !user ? "Мой BALI" : accountLabel;
  els.button.setAttribute("aria-label", !user ? "Открыть Мой BALI" : "Личный кабинет: " + accountLabel);
  const step = user && !profile && privacyAcceptedUid === user.uid
    ? "complete" : user && profile ? "edit" : "sign-in";
  els.dialog.dataset.authStep = step;
  els.title.textContent = step === "complete" ? "Завершите регистрацию" : "Личный кабинет BALI";
  els.submit.textContent = step === "complete" ? "Продолжить" : "Сохранить профиль";
  els.google.hidden = !isConfigured || !!user;
  els.form.hidden = !isConfigured || !user || privacyAcceptedUid !== user.uid;
  els.signOut.hidden = !user;
  if (user) {
    els.email.value = user.email || "";
    // In the first-time form the guest must enter their own name,
    // not silently inherit Google displayName.
    els.name.value = profile?.name || "";
    els.phone.value = profile?.phone || "";
  } else {
    els.form.reset();
  }
  if($("baliPrivacyWithdraw"))$("baliPrivacyWithdraw").hidden=!user||privacyAcceptedUid!==user.uid;
  window.dispatchEvent(new CustomEvent("bali:auth-state",{
    detail:{
      signedIn:!!user, registered:!!profile && privacyAcceptedUid===user?.uid,
      name:profile?.name||user?.displayName||"",
      phone:profile?.phone||"",
      email:profile?.email||user?.email||""
    }
  }));
}

function show() {
  saveMessage("");
  render();
  els.dialog.classList.add("active");
  els.dialog.setAttribute("aria-hidden", "false");
  els.overlay.classList.add("active");
  if (!isConfigured) {
    message("Вход временно недоступен. Повторите попытку позже.", true);
  } else if (user && !profile) {
    message("Введите имя и номер телефона, чтобы завершить регистрацию.");
  } else if (user && profile) {
    message("Профиль сохранён. Вы можете изменить имя или телефон.");
  } else {
    message("Войдите через Google, чтобы подтвердить электронную почту.");
  }
  if (els.dialog.dataset.authStep === "complete") {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (els.dialog.classList.contains("active") &&
          els.dialog.dataset.authStep === "complete" &&
          !document.querySelector("dialog[open]")) els.name.focus({preventScroll:true});
    }));
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
  window.BaliMonitor?.report("auth",code);
  const errors = {
    "auth/network-request-failed":"Нет соединения. Проверьте соединение с интернетом.",
    "auth/web-storage-unsupported":"Разрешите хранение данных сайта в настройках браузера для входа.",
    "auth/popup-blocked":"Браузер заблокировал окно Google. Разрешите всплывающие окна.",
    "auth/popup-closed-by-user":"Окно входа было закрыто.",
    "auth/cancelled-popup-request":"Повторный вход отменён.",
    "auth/unauthorized-domain":"Домен сайта не разрешён в Firebase Authentication. Администратору нужно добавить его в Authorized domains.",
    "auth/operation-not-allowed":"Вход через Google пока не включён в Firebase Authentication.",
    "auth/invalid-api-key":"Ошибка конфигурации Firebase. Сообщите администрации клуба.",
    "auth/invalid-continue-uri":"Ошибка адреса возврата Google. Проверьте разрешённые домены Firebase.",
    "auth/account-exists-with-different-credential":"Почта уже связана с другим способом входа.",
    "privacy/withdrawn":"По вашему аккаунту получен отзыв согласия. Для возобновления обратитесь в клуб: Kolyaselekh@gmail.com.",
    "permission-denied":"Не удалось сохранить данные. Повторите попытку позже.",
    "unavailable":"Сервис временно недоступен. Повторите попытку позже.",
    "upstream":"Сервер базы BALI временно недоступен. Повторите позже.",
    "not-configured":"Google Таблицы ещё не подключены. Сообщите администрации клуба.",
    "unauthenticated":"Войдите в аккаунт Google повторно."
  };
  return errors[code] || "Не удалось выполнить действие. Повторите попытку позже.";
}

els.button.addEventListener("click", () => {
  // My BALI and its Info entry are public on every device.
  // Guests can sign in separately from the profile page.
  window.location.hash="profile";
});
els.close.addEventListener("click", hide);
els.signOut.addEventListener("click", async () => {
  if (!auth) return;
  try {
    await signOut(auth);
    message("Вы вышли из аккаунта.");
  } catch (error) {
    message(friendlyError(error), true);
  }
});

// Start signInWithPopup synchronously inside the actual user click.
 // The consent dialog's accept handler invokes this directly, without
 // awaiting a Promise (which would lose transient browser user activation).
async function startGoogleSignIn() {
  if (!auth || els.google.disabled) return;
  const insecure = location.protocol === "http:" &&
    !["localhost","127.0.0.1","[::1]"].includes(location.hostname);
  if (insecure) {
    message("Для входа через Google нужен защищённый HTTPS. Откройте сайт по адресу https://" + location.host + location.pathname, true);
    return;
  }
  message("Открываем вход через Google...");
  pendingGoogleLogin = true;
  els.google.disabled = true;
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === "auth/popup-blocked" ||
        error.code === "auth/operation-not-supported-in-this-environment") {
      try {
        try { sessionStorage.setItem(redirectLoginKey,"1"); } catch (_error) {}
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return;
      } catch (redirectError) {
        pendingGoogleLogin = false;
        try { sessionStorage.removeItem(redirectLoginKey); } catch (_error) {}
        message(friendlyError(redirectError), true);
        return;
      }
    }
    pendingGoogleLogin = false;
    message(friendlyError(error), true);
  } finally {
    els.google.disabled = false;
  }
}

els.google.addEventListener("click", () => {
  if (!auth || els.google.disabled) return;
  // We cannot know if this is a returning account until Google identifies it.
  // Sign in directly; require consent only when Firestore has no valid receipt.
  void startGoogleSignIn();
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth?.currentUser || (!sheetsEnabled()&&!database) || !user ||
      auth.currentUser.uid !== user.uid || !user.emailVerified || !user.email) {
    const info = "Сначала войдите с подтверждённой электронной почтой.";
    message(info, true);
    saveMessage(info, true);
    return;
  }
  if(privacyAcceptedUid!==user.uid){saveMessage("Сначала подтвердите согласие на обработку данных.",true);return;}
  const name = els.name.value.trim().replace(/\s+/g, " ");
  const phone = normalizePhone(els.phone.value);
  if (name.length < 2 || name.length > 100) {
    saveMessage("Введите имя от 2 до 100 символов.", true); return;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    saveMessage("Укажите телефон в международном формате, например +375291234567.", true);
    return;
  }

  const submit = els.form.querySelector('button[type="submit"]');
  const completingRegistration = !profile;
  const savingUser = user;
  const savingGeneration = authGeneration;
  submit.disabled = true;
  submit.textContent = "Сохраняем...";
  saveMessage("Сохраняем профиль...");
  try {
    if(sheetsEnabled()){
      await sheetsRequest("profileSave",{name,phone});
    }else{
      const ref = doc(database, "users", savingUser.uid);
      const existing = await getDoc(ref);
      if (savingGeneration !== authGeneration || auth.currentUser?.uid !== savingUser.uid) return;
      if (existing.exists()) {
        await updateDoc(ref, { name, phone, updatedAt: serverTimestamp() });
      } else {
        await setDoc(ref, {
          uid: savingUser.uid,
          email: savingUser.email,
          name, phone,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }
    // Закрываем форму только после подтверждённой Firestore записи.
    if (savingGeneration !== authGeneration || auth.currentUser?.uid !== savingUser.uid) return;
    profile = { uid: savingUser.uid, email: savingUser.email, name, phone };
    render();
    message("Профиль успешно сохранён.");
    hide();
    // The first completed registration goes directly to the homepage.
    // Editing "Мои данные" later keeps the user on their current page.
    if (completingRegistration) window.location.hash = "home";
    else els.button.focus();
  } catch (error) {
    if (savingGeneration !== authGeneration) return;
    const info = friendlyError(error);
    message(info, true);
    saveMessage(info, true);
  } finally {
    submit.disabled = false;
    submit.textContent = profile ? "Сохранить профиль" : "Продолжить";
  }
});

window.BaliAuth = {
  ready,
  isConfigured,
  isRegistered: () => !!(user && user.emailVerified && profile && privacyAcceptedUid===user.uid),
  getProfile: () => user && profile ? { ...profile } : null,
  getIdToken: async () => auth?.currentUser ? auth.currentUser.getIdToken() : null,
  open: show,
  close: hide,
  requireProfile: async () => {
    await ready;
    if (!isConfigured || !user || !user.emailVerified || !profile || privacyAcceptedUid!==user.uid) {
      show();
      return false;
    }
    return true;
  }
};

async function handleUser(authUser) {
  const current = ++authGeneration;
  const stillCurrent = () => current === authGeneration && auth.currentUser?.uid === authUser?.uid;
  window.BaliPrivacy?.cancel();
  user = authUser;
  profile = null;
  privacyAcceptedUid = null;
  render();
  if (user && (!user.email || !user.emailVerified)) {
    try {
      await signOut(auth);
      if (current === authGeneration) { user = null; render(); }
      message("Вход возможен только с подтверждённым email.", true);
    } catch (error) {
      if (current === authGeneration) message(friendlyError(error), true);
    }
  } else if (user) {
    try {
      if(sheetsEnabled()){
        let snapshot=await sheetsRequest("me");
        if(!stillCurrent())return;
        if(snapshot.privacyWithdrawn)throw Object.assign(new Error(),{code:"privacy/withdrawn"});
        if(snapshot.privacyAccepted!==true){
          const accepted=await window.BaliPrivacy?.review();
          if(!stillCurrent())return;
          if(accepted!==true){
            pendingGoogleLogin=false;
            try{sessionStorage.removeItem(redirectLoginKey);}catch(_error){}
            await signOut(auth);hide();return;
          }
          await sheetsRequest("consentAccept",{type:"privacy",accepted:true});
          if(!stillCurrent())return;
          snapshot=await sheetsRequest("me");
          if(!stillCurrent())return;
          if(snapshot.privacyAccepted!==true)
            throw Object.assign(new Error("Согласие не сохранено."),{code:"permission-denied"});
        }
        privacyAcceptedUid=authUser.uid;
        const candidate=snapshot.profile;
        profile=validProfile(candidate,authUser)?candidate:null;
        if(!profile){
          pendingGoogleLogin=false;
          try{sessionStorage.removeItem(redirectLoginKey);}catch(_error){}
          show();
        }else{
          if(els.dialog.classList.contains("active"))hide();
          let redirected=false;
          try{
            redirected=sessionStorage.getItem(redirectLoginKey)==="1";
            sessionStorage.removeItem(redirectLoginKey);
          }catch(_error){}
          if(pendingGoogleLogin||redirected){
            pendingGoogleLogin=false;
            window.location.hash="home";
          }
        }
      }else{
      const [consent,withdrawal]=await Promise.all([getDoc(consentRef(authUser.uid)),getDoc(withdrawalRef(authUser.uid))]);
      if(!stillCurrent())return;
      if(withdrawal.exists())throw Object.assign(new Error(),{code:"privacy/withdrawn"});
      if(!hasPrivacyConsent(consent)){
        // A first-time guest must explicitly consent. Returning guests with
        // an existing receipt never see the consent dialog again, even on a
        // new browser or device.
        const accepted = await window.BaliPrivacy?.review();
        if(!stillCurrent())return;
        if(accepted!==true){
          pendingGoogleLogin=false;
          try{sessionStorage.removeItem(redirectLoginKey);}catch(_error){}
          await signOut(auth);
          hide();
          return;
        }
        try{
          await setDoc(consentRef(authUser.uid),{version:privacyVersion,processing:true,international:true,acceptedAt:serverTimestamp()});
        }catch(error){
          // Another tab may have recorded this immutable receipt first.
          const [saved,revoked]=await Promise.all([getDoc(consentRef(authUser.uid)),getDoc(withdrawalRef(authUser.uid))]);
          if(!stillCurrent())return;
          if(!hasPrivacyConsent(saved)||revoked.exists())throw error;
        }
        if(!stillCurrent())return;
      }
      privacyAcceptedUid=authUser.uid;
      const snapshot = await getDoc(doc(database, "users", authUser.uid));
      if (!stillCurrent()) return;
      const candidate = snapshot.exists() ? snapshot.data() : null;
      profile = validProfile(candidate, authUser) ? candidate : null;
      if (!profile) {
        pendingGoogleLogin=false;
        try{sessionStorage.removeItem(redirectLoginKey);}catch(_error){}
        show();
      } else {
        if (els.dialog.classList.contains("active")) hide();
        let redirected=false;
        try {
          redirected=sessionStorage.getItem(redirectLoginKey)==="1";
          sessionStorage.removeItem(redirectLoginKey);
        } catch (_error) {}
        if (pendingGoogleLogin || redirected) {
          pendingGoogleLogin=false;
          // No profile/consent forms or success popups on repeat Google login.
          window.location.hash="home";
        }
      }
      }
    } catch (error) {
      if (!stillCurrent()) return;
      pendingGoogleLogin=false;
      try{sessionStorage.removeItem(redirectLoginKey);}catch(_error){}
      show();
      message(friendlyError(error), true);
    }
  }
  if (current !== authGeneration) return;
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
      pendingGoogleLogin=false;
      try{sessionStorage.removeItem(redirectLoginKey);}catch(_error){}
      message(friendlyError(error), true);
    });
  } catch (error) {
    message("Вход временно недоступен. Повторите попытку позже.", true);
    finishInitialization();
  }
}

$("baliPrivacyWithdraw")?.addEventListener("click",async()=>{
  if(!user||privacyAcceptedUid!==user.uid)return;
  if(!window.confirm("Отозвать согласие на обработку персональных данных? Вы выйдете из аккаунта. Запрос на прекращение обработки и удаление будет передан клубу; сведения, обязательные по закону, могут сохраняться."))return;
  const withdrawingUser=user,button=$("baliPrivacyWithdraw"),status=$("baliPrivacyStatus");
  button.disabled=true;
  try{
    if(sheetsEnabled())await sheetsRequest("consentAccept",{type:"privacy-withdrawal",accepted:true});
    else await setDoc(withdrawalRef(withdrawingUser.uid),{version:privacyVersion,requestedAt:serverTimestamp()});
    if(auth.currentUser?.uid!==withdrawingUser.uid)return;
    privacyAcceptedUid=null;profile=null;render();
    status.textContent="Отзыв согласия получен. Обработка на основании согласия будет прекращена в срок до 15 дней, если нет иных законных оснований. Контакт: Kolyaselekh@gmail.com.";
    await signOut(auth);
  }catch(error){status.textContent="Не удалось завершить отзыв. Повторите попытку или напишите на Kolyaselekh@gmail.com.";}
  finally{button.disabled=false;}
});
