/* Profile avatar: private Firestore media, small WebP only; never upload arbitrary source files. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,onSnapshot,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const button=document.getElementById("baliAvatarButton");
const input=document.getElementById("baliAvatarUpload");
const photo=document.getElementById("baliAvatarImage");
const initial=document.getElementById("baliAvatarInitial");
const feedback=document.getElementById("baliAvatarFeedback");
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app);
const db=getFirestore(app);
let activeUser=null,unsubscribe=null,session=0,feedbackTimer=0,saving=false;

function notify(text) {
  if(!feedback)return;
  clearTimeout(feedbackTimer);
  feedback.textContent=text;
  feedback.hidden=false;
  feedbackTimer=setTimeout(()=>{feedback.hidden=true;},4500);
}
function showImage(dataUri) {
  const valid=typeof dataUri==="string"&&/^data:image\/webp;base64,[a-z0-9+/=]+$/i.test(dataUri)&&dataUri.length<=100000;
  if(photo) {
    photo.hidden=!valid;
    if(valid)photo.src=dataUri;
    else photo.removeAttribute("src");
  }
  if(initial)initial.hidden=valid;
}
function avatarDocument(uid){return doc(db,"users",uid,"profileMedia","avatar");}
function readyToEdit(){
  return !!activeUser?.emailVerified&&!!window.BaliAuth?.isRegistered?.();
}
button?.addEventListener("click",()=>{
  if(!readyToEdit()){window.BaliAuth?.open?.();return;}
  input?.click();
});
function createWebp(bitmap,edge,quality) {
  const canvas=document.createElement("canvas");
  canvas.width=edge;canvas.height=edge;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("canvas");
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  const side=Math.min(bitmap.width,bitmap.height);
  ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,edge,edge);
  return canvas.toDataURL("image/webp",quality);
}
async function compressAvatar(file) {
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>10*1024*1024)
    throw Error("unsupported");
  // Browser decodes the original and renders a square crop; no EXIF is stored.
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width<16||bitmap.height<16||bitmap.width*bitmap.height>50000000)throw Error("dimensions");
    for(const edge of [256,192,160]){
      for(const quality of [.85,.7,.55,.4]){
        const value=createWebp(bitmap,edge,quality);
        if(value.startsWith("data:image/webp;base64,")&&value.length<=94000)return value;
      }
    }
    throw Error("oversize");
  }finally{bitmap.close?.();}
}
input?.addEventListener("change",async()=>{
  const file=input.files?.[0];
  input.value="";
  if(!file||saving)return;
  if(!readyToEdit()){notify("Сначала войдите в аккаунт.");return;}
  const uid=activeUser.uid;
  saving=true;
  button.disabled=true;
  try{
    notify("Подготавливаем фотографию…");
    const image=await compressAvatar(file);
    if(!readyToEdit()||activeUser.uid!==uid)return;
    await setDoc(avatarDocument(uid),{image,updatedAt:serverTimestamp()});
    if(activeUser.uid===uid){showImage(image);notify("Фотография профиля сохранена.");}
  }catch(error){
    const msg=["unsupported","dimensions","oversize"].includes(error?.message)
      ?"Выберите JPG, PNG или WebP до 10 МБ.":"Не удалось сохранить фото. Проверьте соединение и повторите попытку.";
    if(activeUser?.uid===uid)notify(msg);
  }finally{saving=false;button.disabled=false;}
});
// Private profile avatar is relevant only to the "Мой BALI" page.
// A restored Google session alone must not start a Firestore listener.
let pendingUid=null;
const profileIsOpen=()=>document.body.dataset.baliPage==="profile";
function stopAvatar({clear=true}={}){
  ++session;
  pendingUid=null;
  unsubscribe?.();
  unsubscribe=null;
  activeUser=null;
  if(clear)showImage(null);
}
async function syncAvatar(user){
  if(!profileIsOpen()||!user?.emailVerified){
    if(unsubscribe||activeUser||pendingUid)stopAvatar();
    return;
  }
  if(user.uid===activeUser?.uid&&unsubscribe)return;
  if(user.uid===pendingUid)return;
  const run=++session;
  unsubscribe?.();unsubscribe=null;
  pendingUid=user.uid;activeUser=null;
  showImage(null);
  try{
    await window.BaliAuth?.ready;
    if(run!==session||!profileIsOpen()||auth.currentUser?.uid!==user.uid)return;
    if(!window.BaliAuth?.getProfile?.())return;
    activeUser=user;
    unsubscribe=onSnapshot(avatarDocument(user.uid),snapshot=>{
      if(run!==session||!profileIsOpen())return;
      showImage(snapshot.exists()?snapshot.data()?.image:null);
    },()=>{
      if(run===session&&profileIsOpen())notify("Не удалось получить фото. Повторите попытку позже.");
    });
  }catch(_){
    if(run===session&&profileIsOpen())notify("Не удалось загрузить фотографию.");
  }finally{
    if(run===session)pendingUid=null;
  }
}
onAuthStateChanged(auth,user=>void syncAvatar(user));
window.addEventListener("bali:guest-page",()=>void syncAvatar(auth.currentUser));
window.addEventListener("bali:auth-state",event=>{
  if(!event.detail?.registered){
    if(unsubscribe||activeUser||pendingUid)stopAvatar();
  }else if(profileIsOpen()){
    void syncAvatar(auth.currentUser);
  }
});
