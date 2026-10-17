/* BALI PRIVILEGE — editor for independently published homepage offers. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,onSnapshot,setDoc,deleteDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const el=id=>document.getElementById(id);
const form=el("baliPromoForm"),list=el("baliPromoList"),status=el("baliPromoStatus");
if(form&&list&&status){
  const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
  const auth=getAuth(app),db=getFirestore(app),records=new Map();
  const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
  let canEdit=false,unsubscribe=null,serial=0;
  const say=message=>{status.textContent=message;};
  function node(tag,cls,label){
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(label!==undefined)n.textContent=label;
    return n;
  }
  function clear(){
    form.reset();
    el("baliPromoId").value="";
    el("baliPromoSort").value="100";
    el("baliPromoSave").textContent="Сохранить предложение";
  }
  el("baliPromoReset").addEventListener("click",()=>{clear();say("Форма очищена.");});
  function edit(item){
    el("baliPromoId").value=item.id;
    el("baliPromoTitle").value=item.title;
    el("baliPromoDescription").value=item.description;
    el("baliPromoImage").value=item.imageUrl;
    el("baliPromoDestination").value=item.destination;
    el("baliPromoButton").value=item.buttonText;
    el("baliPromoSort").value=item.sort;
    el("baliPromoPublished").checked=item.published;
    el("baliPromoSave").textContent="Сохранить изменения";
    form.scrollIntoView({behavior:"smooth",block:"start"});
    say("Редактирование: "+item.title);
  }
  function draw(){
    list.replaceChildren();
    const sorted=[...records.values()].sort((a,b)=>a.sort-b.sort||collator.compare(a.title,b.title));
    if(!sorted.length){
      list.append(node("p","hint","Предложений пока нет. Добавьте первое и опубликуйте его."));
      return;
    }
    for(const item of sorted){
      const row=node("div","bali-promo-item");
      if(item.imageUrl.startsWith("https://")){
        const preview=node("img","bali-promo-preview");
        preview.loading="lazy";preview.src=item.imageUrl;preview.alt="";
        row.append(preview);
      }
      const info=node("div","bali-promo-copy");
      info.append(node("strong","",item.title),
        node("small","",item.published?"Опубликовано":"Черновик"),
        node("p","",item.description));
      const controls=node("div","bali-promo-actions");
      const e=node("button","","Изменить");e.type="button";
      e.addEventListener("click",()=>edit(item));
      const remove=node("button","","Удалить");remove.type="button";
      remove.addEventListener("click",async()=>{
        if(!canEdit||!confirm("Удалить предложение «"+item.title+"»?"))return;
        remove.disabled=true;
        try{
          await deleteDoc(doc(db,"promotions",item.id));
          if(el("baliPromoId").value===item.id)clear();
          say("Предложение удалено.");
        }catch(err){say("Не удалось удалить: "+(err.code||"ошибка"));}
        finally{remove.disabled=false;}
      });
      controls.append(e,remove);row.append(info,controls);list.append(row);
    }
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!canEdit){say("Необходимы активные права администратора.");return;}
    const title=el("baliPromoTitle").value.trim();
    const description=el("baliPromoDescription").value.trim();
    const imageUrl=el("baliPromoImage").value.trim();
    const destination=el("baliPromoDestination").value;
    const buttonText=el("baliPromoButton").value.trim();
    const sort=Number(el("baliPromoSort").value);
    const published=el("baliPromoPublished").checked;
    if(title.length<2||title.length>100||!description||description.length>260
       ||imageUrl.length>2048||(imageUrl&&!imageUrl.startsWith("https://"))
       ||!["none","events","menu","contacts"].includes(destination)
       ||buttonText.length>35||!Number.isInteger(sort)||sort<0||sort>100000){
      say("Проверьте заголовок, описание, HTTPS-ссылку, кнопку и сортировку.");return;
    }
    const id=el("baliPromoId").value;
    const reference=id?doc(db,"promotions",id):doc(collection(db,"promotions"));
    const save=el("baliPromoSave");
    save.disabled=true;say("Сохраняем предложение...");
    try{
      await setDoc(reference,{
        title,description,imageUrl,destination,buttonText,sort,published,
        updatedAt:serverTimestamp()
      });
      clear();say(published?"Предложение опубликовано.":"Черновик сохранён.");
    }catch(error){
      say(error.code==="permission-denied"
        ?"Нет доступа. Опубликуйте новые firestore.rules и проверьте роль администратора."
        :"Не удалось сохранить: "+(error.code||"ошибка"));
    }finally{save.disabled=false;}
  });
  onAuthStateChanged(auth,async user=>{
    const run=++serial;
    if(unsubscribe){unsubscribe();unsubscribe=null;}
    canEdit=false;records.clear();draw();
    if(!user?.emailVerified){say("Войдите как администратор.");return;}
    try{
      const role=await getDoc(doc(db,"admins",user.uid));
      if(run!==serial||auth.currentUser?.uid!==user.uid)return;
      if(role.data()?.active!==true){say("Нет роли администратора.");return;}
      canEdit=true;
      unsubscribe=onSnapshot(collection(db,"promotions"),snapshot=>{
        records.clear();
        for(const d of snapshot.docs){
          const i={id:d.id,...d.data()};
          if(typeof i.title==="string"&&typeof i.description==="string"
             &&typeof i.imageUrl==="string"&&typeof i.destination==="string"
             &&typeof i.buttonText==="string"&&typeof i.published==="boolean"
             &&Number.isInteger(i.sort))records.set(d.id,i);
        }
        draw();say("Предложений: "+records.size+". Изменения синхронизируются с сайтом.");
      },err=>say(err.code==="permission-denied"
        ?"Нет доступа к promotions. Необходимо опубликовать Firestore Rules."
        :"Не удалось загрузить предложения: "+(err.code||"ошибка")));
    }catch(error){
      if(run===serial)say("Не удалось проверить доступ: "+(error.code||"ошибка"));
    }
  });
}
