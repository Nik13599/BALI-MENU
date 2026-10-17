/* BALI v58: one public Firestore appearance setting, admin-only updates.
   The whole guest site and admin use four accent variables. The shared
   background/photography is intentionally immutable across all presets. */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,onSnapshot,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const palettes=Object.freeze({
  cobalt:Object.freeze({primary:"#7585FF",secondary:"#536AE0",text:"#C3CAFF",border:"#8192FF"}),
  lime:Object.freeze({primary:"#B9FF51",secondary:"#88D43E",text:"#D8FF9F",border:"#B2EF5F"}),
  white:Object.freeze({primary:"#F0F0EE",secondary:"#D6D7DB",text:"#F1F1F0",border:"#E1E2E2"})
});
const keys=Object.freeze(["primary","secondary","text","border"]);
const colorValid=/^#[0-9A-Fa-f]{6}$/;
const allModes=new Set([...Object.keys(palettes),"custom"]);
const clone=colors=>Object.fromEntries(keys.map(k=>[k,colors[k]]));
const normalize=color=>String(color||"").trim().toUpperCase();
const sanitized=colors=>colors&&typeof colors==="object"&&
  keys.every(k=>typeof colors[k]==="string"&&colorValid.test(colors[k]))?
  Object.fromEntries(keys.map(k=>[k,normalize(colors[k])])):null;
const defaultSelection=()=>({theme:"lime",colors:clone(palettes.lime)});
function selectionFor(theme,colors){
  if(!allModes.has(theme))return defaultSelection();
  if(theme!=="custom")return {theme,colors:clone(palettes[theme])};
  const validated=sanitized(colors);
  return validated?{theme,colors:validated}:defaultSelection();
}
function contrastText(hex){
  const values=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const lightness=.2126*values[0]+.7152*values[1]+.0722*values[2];
  return lightness>.179?"#10131A":"#FFFFFF";
}
function rgb(hex,alpha){
  return "rgba("+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(",")+","+alpha+")";
}
function applyTheme(selection){
  const colors=selection.colors;
  const root=document.documentElement;
  root.style.setProperty("--bt-primary",colors.primary);
  root.style.setProperty("--bt-secondary",colors.secondary);
  root.style.setProperty("--bt-text",colors.text);
  root.style.setProperty("--bt-border",colors.border);
  root.style.setProperty("--bt-on-primary",contrastText(colors.primary));
  root.style.setProperty("--bt-on-secondary",contrastText(colors.secondary));
  root.style.setProperty("--bt-tint",rgb(colors.primary,.17));
  root.style.setProperty("--bt-stroke",rgb(colors.border,.60));
  root.dataset.baliTheme=selection.theme;
  // No JS or theme stylesheet ever sets html/body/page background colors.
}
let published=defaultSelection();
let local=defaultSelection();
let lastCustom=clone(palettes.lime);
let editing=false;
let received=false;
const isAdminPage=Boolean(document.getElementById("baliThemeForm"));
const $=id=>document.getElementById(id);
const form=$("baliThemeForm");
const status=$("baliThemeStatus");
const help=$("baliThemeRulesHelp");
const saveButton=$("baliThemeSave");
const fields=Object.fromEntries(keys.map(k=>[k,{
  picker:$("baliColor"+k[0].toUpperCase()+k.slice(1)),
  hex:$("baliColor"+k[0].toUpperCase()+k.slice(1)+"Hex")
}]));
const report=(message)=>{
  if(status)status.textContent=message;
};
function renderEditor(){
  if(!form)return;
  const selected=form.querySelector('input[name="baliThemePreset"][value="'+local.theme+'"]');
  if(selected)selected.checked=true;
  for(const key of keys){
    const entry=fields[key];
    if(!entry.picker||!entry.hex)continue;
    entry.picker.value=local.colors[key];
    entry.hex.value=local.colors[key];
    entry.hex.removeAttribute("aria-invalid");
  }
}
function draft(selection,message){
  local=selection;
  editing=true;
  applyTheme(local);
  renderEditor();
  report(message||"Предпросмотр готов. Нажмите «Опубликовать тему», чтобы сохранить её для всех.");
}
if(form){
  // Admin-only convenience: copy the public, reviewed rules from this repo.
  // Clipboard access requires a user gesture and is never attempted silently.
  $("baliCopyRules")?.addEventListener("click",async()=>{
    const button=$("baliCopyRules");
    if(button.disabled)return;
    button.disabled=true;
    try{
      const response=await fetch("https://raw.githubusercontent.com/Nik13599/BALI-MENU/main/firestore.rules",{cache:"no-store"});
      if(!response.ok)throw new Error("Не удалось загрузить актуальный файл правил.");
      const rulesText=await response.text();
      if(!rulesText.startsWith("rules_version = '2';") ||
        !rulesText.includes("match /settings/{settingId}") ||
        !rulesText.includes("match /orders/{orderId}") ||
        !rulesText.includes("match /{document=**}")){
        throw new Error("Файл правил не прошёл проверку. Скопируйте его напрямую с GitHub.");
      }
      if(!navigator.clipboard?.writeText)throw new Error("В этом браузере недоступно копирование. Откройте исходник на GitHub.");
      await navigator.clipboard.writeText(rulesText);
      report("Правила скопированы. Теперь вставьте их в Firebase Console → Firestore → Rules и нажмите Publish.");
    }catch(error){
      report("Не удалось скопировать правила: "+(error?.message||"Ошибка")+". Используйте ссылку «Просмотреть исходник».");
    }finally{button.disabled=false;}
  });
  form.querySelectorAll('input[name="baliThemePreset"]').forEach(radio=>{
    radio.addEventListener("change",()=>{
      if(!radio.checked)return;
      const mode=radio.value;
      if(mode==="custom")draft(selectionFor("custom",lastCustom));
      else draft(selectionFor(mode));
    });
  });
  function manualUpdate(key,value,isPicker){
    // Start manual edits from the currently previewed preset, not an older draft.
    if(local.theme!=="custom")lastCustom=clone(local.colors);
    const normalized=normalize(value);
    const entry=fields[key];
    const valid=colorValid.test(normalized);
    if(!isPicker && !valid){
      entry.hex.setAttribute("aria-invalid","true");
      const customRadio=form.querySelector('input[value="custom"][name="baliThemePreset"]');
      if(customRadio)customRadio.checked=true;
      editing=true;
      local={theme:"custom",colors:clone(lastCustom)};
      report("Введите полный HEX-код цвета, например #B9FF51.");
      return;
    }
    entry.hex.removeAttribute("aria-invalid");
    lastCustom={...lastCustom,[key]:normalized};
    draft(selectionFor("custom",lastCustom));
  }
  for(const key of keys){
    fields[key].picker?.addEventListener("input",event=>manualUpdate(key,event.target.value,true));
    fields[key].hex?.addEventListener("input",event=>{
      const before=event.target.value;
      const normalized=normalize(before);
      if(colorValid.test(normalized)){
        manualUpdate(key,normalized,false);
      }else{
        manualUpdate(key,before,false);
      }
    });
    fields[key].hex?.addEventListener("blur",event=>{
      if(event.target.getAttribute("aria-invalid")==="true")return;
      event.target.value=normalize(event.target.value);
    });
  }
  $("baliThemeCancel")?.addEventListener("click",()=>{
    editing=false;
    local=selectionFor(published.theme,published.colors);
    if(local.theme==="custom")lastCustom=clone(local.colors);
    applyTheme(local);
    renderEditor();
    report("Предпросмотр отменён. Показана опубликованная тема.");
  });
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(saveButton?.disabled)return;
    if(keys.some(k=>!colorValid.test(normalize(fields[k].hex?.value)))){
      report("Проверьте HEX-коды: все цвета должны иметь вид #RRGGBB.");
      return;
    }
    const requested=selectionFor(local.theme,local.colors);
    const user=auth.currentUser;
    if(!user?.emailVerified){
      report("Для публикации темы войдите в администраторский Google-аккаунт.");
      return;
    }
    saveButton.disabled=true;
    if(help)help.hidden=true;
    report("Сохраняем выбранную цветовую тему для всех посетителей...");
    try{
      // Server rules enforce the same permission even if the browser UI is modified.
      const role=await getDoc(doc(db,"admins",user.uid));
      if(role.data()?.active!==true)throw new Error("Аккаунт не имеет прав администратора.");
      await setDoc(themeRef,{
        theme:requested.theme,
        colors:clone(requested.colors),
        updatedAt:serverTimestamp()
      });
      published=selectionFor(requested.theme,requested.colors);
      local=selectionFor(published.theme,published.colors);
      editing=false;
      if(local.theme==="custom")lastCustom=clone(local.colors);
      applyTheme(local);
      renderEditor();
      report("Тема опубликована. Цветовые акценты обновятся у гостей автоматически.");
    }catch(error){
      if(error?.code==="permission-denied"){
        if(help)help.hidden=false;
        report("Firebase отклонил запись. В блоке ниже нажмите «Скопировать правила», опубликуйте их в Firebase Console и обновите страницу.");
      }else report("Не удалось опубликовать тему: "+(error?.message||error?.code||"неизвестная ошибка"));
    }finally{
      saveButton.disabled=false;
    }
  });
}
applyTheme(local);
if(isAdminPage)renderEditor();
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app);
const auth=getAuth(app);
const themeRef=doc(db,"settings","appearance");
onSnapshot(themeRef,snapshot=>{
  received=true;
  if(help)help.hidden=true;
  const data=snapshot.exists()?snapshot.data():null;
  published=data?selectionFor(data.theme,data.colors):defaultSelection();
  if(!editing){
    local=selectionFor(published.theme,published.colors);
    if(local.theme==="custom")lastCustom=clone(local.colors);
    applyTheme(local);
    renderEditor();
    if(isAdminPage)report(data?"Опубликована тема: "+({cobalt:"Кобальтово-синий",lime:"LIME SHADOW",white:"Матовый белый",custom:"Свои цвета"}[local.theme])+".":"Основная тема: LIME SHADOW. Чтобы закрепить её в Firebase для всех посетителей, нажмите «Опубликовать тему».");
  }else if(isAdminPage){
    report("Опубликованная тема обновлена. Ваш локальный предпросмотр не изменён.");
  }
},error=>{
  if(isAdminPage){
    if(error?.code==="permission-denied"){
      if(help)help.hidden=false;
      report("Firestore пока не разрешает чтение темы. Скопируйте актуальные правила ниже, опубликуйте их в Firebase Console и обновите страницу.");
    }else report("Нет соединения с настройками цветов: "+(error?.code||"ошибка")+".");
  }
  // A safe LIME SHADOW fallback remains usable without Firestore.
});
