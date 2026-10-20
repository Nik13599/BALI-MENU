/* Notifications appear only while the website is open. Persist guest unread list locally per account. */
(() => {
  const labels={pending:"ожидает подтверждения",confirmed:"подтверждён",completed:"выполнен",cancelled:"отменён"};
  let uid=null,scope=null,known=new Map(),feed=[],initialized=false;
  let giftUid=null,gifts=[];
  const cursorKey=()=> "bali-order-notices-v1:"+scope+":"+uid;
  const feedKey=()=> "bali-order-notice-feed-v2:"+scope+":"+uid;
  const el=id=>document.getElementById(id);
  const dialog=()=>el("baliProfileNoticeDialog");
  function saveFeed(){
    if(uid)try{localStorage.setItem(feedKey(),JSON.stringify(feed.slice(0,30)));}catch(_){}
  }
  function reset(nextUid,nextScope){
    if(uid===nextUid&&scope===nextScope)return;
    uid=nextUid||null;scope=nextScope;known=new Map();feed=[];initialized=false;
    if(dialog()?.open)dialog().close();
    if(el("baliOrderNoticeLive"))el("baliOrderNoticeLive").hidden=true;
    if(uid){
      try{
        const v=JSON.parse(localStorage.getItem(cursorKey())||"[]");
        if(Array.isArray(v))known=new Map(v.slice(0,100).filter(x=>Array.isArray(x)&&typeof x[0]==="string"&&x[0].length<=120&&labels[x[1]]));
      }catch(_){}
      try{
        const v=JSON.parse(localStorage.getItem(feedKey())||"[]");
        if(Array.isArray(v))feed=v.slice(0,30).filter(x=>x&&typeof x.id==="string"&&x.id.length<=120&&typeof x.text==="string"&&x.text.length<=200).map(x=>({id:x.id,text:x.text,read:x.read===true}));
      }catch(_){}
    }
    initialized=known.size>0;
    render();
  }
  function snapshot(nextUid,nextScope,orders){
    reset(nextUid,nextScope);
    if(!uid)return;
    const old=new Map(known),first=!initialized;initialized=true;
    for(const order of (Array.isArray(orders)?orders:[]).slice(0,100)){
      if(typeof order.id!=="string"||!labels[order.status])continue;
      const previous=old.get(order.id);
      const changed=!first&&((scope==="admin"&&!previous&&order.status==="pending")||(scope==="guest"&&previous&&previous!==order.status));
      if(changed){
        let alreadySeen=false;
        try{alreadySeen=new Map(JSON.parse(localStorage.getItem(cursorKey())||"[]")).get(order.id)===order.status;}catch(_){}
        if(!alreadySeen){
          const num=Number.isInteger(order.orderNumber)?String(order.orderNumber).padStart(2,"0"):"";
          const message=scope==="admin"?"Новый предзаказ"+(num?" № "+num:""):
            "Предзаказ"+(num?" № "+num:"")+" "+labels[order.status];
          feed.unshift({id:order.id,text:message,read:false});
          feed=feed.slice(0,30);
          saveFeed();
          announce(message);
        }
      }
      known.set(order.id,order.status);
    }
    known=new Map([...known].slice(-100));
    try{localStorage.setItem(cursorKey(),JSON.stringify([...known]));}catch(_){}
    render();
  }
  function markRead(){
    if(feed.some(x=>!x.read)){
      feed=feed.map(x=>({...x,read:true}));saveFeed();render();
    }
  }
  function showDialog(){
    if(!dialog())return;
    if(scope!=="guest"&&!window.BaliAuth?.isRegistered?.()){window.BaliAuth?.open?.();return;}
    if(!dialog().open)dialog().showModal();
    markRead();
    gifts=gifts.map(x=>({...x,read:true}));
    if(giftUid)try{localStorage.setItem("bali-gifts-read:"+giftUid,JSON.stringify(gifts.map(x=>x.id).slice(0,100)))}catch(_){}
    render();
  }
  function openItem(item){
    if(dialog()?.open)dialog().close();
    if(scope==="admin")window.dispatchEvent(new CustomEvent("bali:admin:open-order",{detail:{id:item.id}}));
    else void window.openMyOrders?.();
  }
  function announce(message){
    const live=el("baliOrderNoticeLive");
    if(!live)return;
    const button=live.querySelector("button");
    if(button)button.textContent=message;
    live.hidden=false;
    clearTimeout(window.baliNoticeTimer);
    window.baliNoticeTimer=setTimeout(()=>{live.hidden=true;},8000);
  }
  function render(){
    const unread=feed.filter(x=>!x.read).length+gifts.filter(x=>!x.read).length;
    const badge=el("baliProfileNoticeBadge");
    if(badge){badge.hidden=!(scope==="guest"&&unread);badge.textContent=unread>99?"99+":String(unread);}
    const bell=el("baliProfileNoticeBtn");
    if(bell)bell.setAttribute("aria-label",unread?"Уведомления о предзаказах: "+unread+" непрочитанных":"Уведомления о предзаказах");
    const list=scope==="admin"?el("baliOrderNoticeList"):el("baliProfileNoticeList");
    if(list){
      list.replaceChildren();
      if(!feed.length&&!gifts.length){const p=document.createElement("p");p.textContent="Новых уведомлений пока нет.";list.append(p);}
      if(scope!=="admin")for(const gift of gifts){
        const btn=document.createElement("button");btn.type="button";btn.textContent=gift.text+" →";
        btn.addEventListener("click",()=>{if(dialog()?.open)dialog().close();location.hash="id";document.getElementById("baliIdHistoryOpen")?.click()});
        list.append(btn);
      }
      for(const item of feed){
        const btn=document.createElement("button");btn.type="button";btn.textContent=item.text+" →";
        btn.addEventListener("click",()=>openItem(item));
        list.append(btn);
      }
    }
    const adminCount=el("baliNoticeCount");
    if(adminCount)adminCount.textContent=unread?" ("+unread+")":"";
    if(el("baliProfileNoticeClear"))el("baliProfileNoticeClear").hidden=feed.length===0&&gifts.length===0;
  }
  window.addEventListener("bali:transfer-inbox",event=>{
    const d=event.detail||{};
    if(d.error)return;
    giftUid=d.uid||null;
    let read=[];try{read=JSON.parse(localStorage.getItem("bali-gifts-read:"+giftUid)||"[]")}catch(_){}
    gifts=(d.items||[]).map(x=>({id:x.id,read:read.includes(x.id),text:
      (x.senderName||"Гость BALI")+" · BALI ID "+(x.senderNumber||"—")+" перевёл вам "+
      (x.items||[]).map(i=>i.quantity+" "+({shot:"шотов",cocktail:"коктейлей",hookah:"кальянов",entry:"входов"}[i.kind]||i.kind)).join(", ")+
      (x.comment?" · Пожелание: «"+x.comment+"»":"")}));
    for(const g of d.fresh||[])if(!read.includes(g.id))announce("Подарок от "+(g.senderName||"гостя BALI")+(g.comment?" · «"+g.comment+"»":""));
    render();
  });
  window.addEventListener("bali:orders",event=>snapshot(event.detail?.ownerUid,"guest",event.detail?.orders));
  window.addEventListener("bali:admin:orders",event=>{if("orders" in (event.detail||{}))snapshot(event.detail.ownerUid,"admin",event.detail.orders);});
  window.addEventListener("bali:admin:session",event=>reset(event.detail?.uid,"admin"));
  window.addEventListener("bali:auth-state",event=>{if(!event.detail?.signedIn)reset(null,"guest");});
  document.addEventListener("DOMContentLoaded",()=>{
    const adminHost=el("adminOverviewPanel");
    if(adminHost){
      const panel=document.createElement("details");panel.className="bali-service-card";panel.id="baliOrderNotifications";
      const summary=document.createElement("summary");summary.append("Уведомления о заказах");
      const counter=document.createElement("span");counter.id="baliNoticeCount";summary.append(counter);
      const list=document.createElement("div");list.id="baliOrderNoticeList";
      const clear=document.createElement("button");clear.type="button";clear.textContent="Отметить прочитанными";clear.addEventListener("click",()=>{feed=[];saveFeed();render();});
      panel.append(summary,list,clear);adminHost.append(panel);
    }else{
      el("baliProfileNoticeBtn")?.addEventListener("click",showDialog);
      el("baliProfileNoticeClose")?.addEventListener("click",()=>dialog()?.close());
      el("baliProfileNoticeClear")?.addEventListener("click",()=>{feed=[];saveFeed();gifts=[];render();});
    }
    const live=document.createElement("div");live.id="baliOrderNoticeLive";live.className="bali-notice-live";live.role="status";live.setAttribute("aria-live","polite");live.hidden=true;
    const open=document.createElement("button");open.type="button";open.className="bali-notice-open";live.append(open);
    open.addEventListener("click",()=>{live.hidden=true;if(adminHost)el("baliOrderNotifications").open=true;else showDialog();});
    document.body.append(live);
    render();
  });
})();