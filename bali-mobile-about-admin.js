/* BALI mobile About background gallery: admin-only management.
 * Each compressed background is a separate Firestore document.
 */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,onSnapshot,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {compressImage} from "./image-compressor.js?v=20261019-115";
const form=document.getElementById("baliMobileAboutUploadForm");
const root=document.getElementById("baliMobileAboutAdminList");
if(form&&root){
  const $=id=>document.getElementById(id);
  const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
  const db=getFirestore(app),auth=getAuth(app),coll=collection(db,"mobileAboutBackgrounds");
  const entries=new Map();
  const MAX=8;
  let allowed=false,working=false,epoch=0,unsub=null;
  const say=message=>{$("baliMobileAboutAdminStatus").textContent=message;};
  function enable(){
    $("baliMobileAboutFiles").disabled=!allowed||working||entries.size>=MAX;
    $("baliMobileAboutUploadBtn").disabled=!allowed||working||entries.size>=MAX;
  }
  function el(tag,className,value){
    const item=document.createElement(tag);
    if(className)item.className=className;
    if(value!==undefined)item.textContent=value;
    return item;
  }
  function list(){return [...entries.values()].sort((a,b)=>a.sort-b.sort||a.id.localeCompare(b.id));}
  async function guarded(action){
    if(!allowed||working)return;
    working=true;enable();render();
    try{await action();}
    catch(error){say(error?.code==="permission-denied"
      ?"Недостаточно прав. Опубликуйте Firestore Rules для новых фонов."
      :"Ошибка изменения фона: "+(error.code||error.message||"неизвестная"));}
    finally{working=false;enable();render();}
  }
  function render(){
    root.replaceChildren();
    const items=list();
    if(!items.length){
      root.append(el("p","hint","Фонов пока нет. Загрузите первый вариант для телефона."));
      enable();return;
    }
    items.forEach((item,index)=>{
      const entry=el("article","bali-mobile-about-admin-entry");
      const image=el("img");image.src=item.imageUrl;image.alt="Фон №"+(index+1);image.loading="lazy";
      entry.append(image);
      const details=el("div");
      details.append(el("p","","Фон "+(index+1)+" из "+items.length),
        el("p","bali-mobile-about-entry-state",item.published?"ПОКАЗЫВАЕТСЯ":"СКРЫТ"));
      const actions=el("div","bali-mobile-about-entry-actions");
      const up=el("button","","↑ Выше");up.type="button";up.disabled=!allowed||working||index===0;
      up.addEventListener("click",()=>void guarded(async()=>{
        const prev=items[index-1],batch=writeBatch(db);
        batch.update(doc(coll,item.id),{sort:prev.sort,updatedAt:serverTimestamp()});
        batch.update(doc(coll,prev.id),{sort:item.sort,updatedAt:serverTimestamp()});
        await batch.commit();say("Порядок фонов обновлён.");
      }));
      const down=el("button","","↓ Ниже");down.type="button";down.disabled=!allowed||working||index===items.length-1;
      down.addEventListener("click",()=>void guarded(async()=>{
        const next=items[index+1],batch=writeBatch(db);
        batch.update(doc(coll,item.id),{sort:next.sort,updatedAt:serverTimestamp()});
        batch.update(doc(coll,next.id),{sort:item.sort,updatedAt:serverTimestamp()});
        await batch.commit();say("Порядок фонов обновлён.");
      }));
      const toggle=el("button","",item.published?"Скрыть":"Опубликовать");
      toggle.type="button";toggle.disabled=!allowed||working;
      toggle.addEventListener("click",()=>void guarded(async()=>{
        await updateDoc(doc(coll,item.id),{published:!item.published,updatedAt:serverTimestamp()});
        say(item.published?"Фон скрыт.":"Фон опубликован.");
      }));
      const remove=el("button","","Удалить");remove.type="button";remove.dataset.remove="";
      remove.disabled=!allowed||working;
      remove.addEventListener("click",()=>{
        if(!confirm("Удалить выбранный фон мобильного блока «О клубе»?"))return;
        void guarded(async()=>{
          await deleteDoc(doc(coll,item.id));
          say("Фон удалён.");
        });
      });
      actions.append(up,down,toggle,remove);details.append(actions);entry.append(details);root.append(entry);
    });
    enable();
  }
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const files=[...($("baliMobileAboutFiles").files||[])];
    if(!allowed||working)return;
    if(!files.length){say("Выберите хотя бы один фон.");return;}
    if(files.length>MAX-entries.size){
      say("Можно хранить не больше "+MAX+" фонов. Свободно мест: "+(MAX-entries.size)+".");return;
    }
    void guarded(async()=>{
      let nextSort=Math.max(0,...[...entries.values()].map(x=>x.sort))+10;
      let completed=0;
      for(const file of files){
        say("Сжимаем и публикуем "+(completed+1)+" из "+files.length+"…");
        const imageUrl=await compressImage(file,"design-mobile-about-hero");
        await setDoc(doc(coll),{
          imageUrl,sort:nextSort,published:true,updatedAt:serverTimestamp()
        });
        nextSort+=10;completed++;
      }
      $("baliMobileAboutFiles").value="";
      say("Готово: загружено "+completed+" фонов. Они появились на мобильной главной.");
    });
  });
  onAuthStateChanged(auth,async user=>{
    const current=++epoch;allowed=false;working=false;entries.clear();
    if(unsub){unsub();unsub=null;}
    render();
    if(!user?.emailVerified){say("Для редактирования фонов войдите в аккаунт администратора.");return;}
    say("Проверяем права администратора…");
    try{
      const data=await getDoc(doc(db,"admins",user.uid));
      if(current!==epoch||auth.currentUser?.uid!==user.uid)return;
      if(data.data()?.active!==true){say("Только администратор может редактировать фоны.");return;}
      allowed=true;enable();say("Галерея синхронизируется с сайтом.");
      unsub=onSnapshot(coll,snapshot=>{
        entries.clear();
        for(const row of snapshot.docs){
          const v=row.data();
          if(typeof v.imageUrl==="string"&&typeof v.sort==="number"&&typeof v.published==="boolean")
            entries.set(row.id,{id:row.id,...v});
        }
        render();
        if(!working)say("Фоны: "+entries.size+" из "+MAX+". Опубликовано: "+list().filter(x=>x.published).length+".");
      },error=>say("Ошибка загрузки галереи: "+(error.code||"неизвестная")));
    }catch(error){if(current===epoch)say("Ошибка проверки прав: "+(error.code||"неизвестная"));}
  });
  render();
}
