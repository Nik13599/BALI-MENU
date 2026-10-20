/* In-app only. First load is quiet; updates use already-authorized order snapshots. */
(() => {
  const labels={pending:'ожидает подтверждения',confirmed:'подтверждён',completed:'выполнен',cancelled:'отменён'};
  let uid=null,scope=null,known=new Map(),feed=[],initialized=false;
  const storageKey=()=>`bali-order-notices-v1:${scope}:${uid}`;
  function reset(nextUid,nextScope){
    if(uid===nextUid&&scope===nextScope)return;
    uid=nextUid||null;scope=nextScope;feed=[];known=new Map();initialized=false;
    const live=document.getElementById('baliOrderNoticeLive');if(live){live.hidden=true;const open=live.querySelector('button');if(open)open.textContent='';}
    if(uid)try{
      const data=JSON.parse(localStorage.getItem(storageKey())||'[]');
      if(Array.isArray(data))known=new Map(data.slice(0,100).filter(x=>Array.isArray(x)&&typeof x[0]==='string'&&x[0].length<=120&&labels[x[1]]));
    }catch(_){}
    initialized=known.size>0;render();
  }
  function snapshot(nextUid,nextScope,orders){
    reset(nextUid,nextScope);if(!uid)return;
    const previous=new Map(known),initial=!initialized;initialized=true;
    for(const order of (Array.isArray(orders)?orders:[]).slice(0,100)){
      if(typeof order.id!=='string'||!labels[order.status])continue;
      const old=previous.get(order.id);
      if(!initial&&((scope==='admin'&&!old&&order.status==='pending')||(scope==='guest'&&old&&old!==order.status))){
        // Read persisted cursors too, preventing duplicate notices in another tab.
        let alreadySeen=false;
        try{alreadySeen=new Map(JSON.parse(localStorage.getItem(storageKey())||'[]')).get(order.id)===order.status;}catch(_){}
        if(!alreadySeen){
          const number=Number.isInteger(order.orderNumber)?String(order.orderNumber).padStart(2,'0'):'';
          const text=scope==='admin'?'Новый предзаказ'+(number?' № '+number:''):('Предзаказ'+(number?' № '+number:'')+' '+labels[order.status]);
          feed.unshift({id:order.id,text});feed=feed.slice(0,30);announce(text);
        }
      }
      known.set(order.id,order.status);
    }
    known=new Map([...known].slice(-100));
    try{localStorage.setItem(storageKey(),JSON.stringify([...known]));}catch(_){}
    render();
  }
  function announce(text){const live=document.getElementById('baliOrderNoticeLive');if(live){const open=live.querySelector('button');if(open)open.textContent=text;live.hidden=false;clearTimeout(window.baliNoticeTimer);window.baliNoticeTimer=setTimeout(()=>{live.hidden=true;},8000);}}
  function render(){
    const list=document.getElementById('baliOrderNoticeList');if(!list)return;
    list.replaceChildren();
    if(!feed.length){const p=document.createElement('p');p.textContent='Новых уведомлений пока нет. Обновления появятся, пока сайт открыт.';list.append(p);}
    for(const item of feed){
      const button=document.createElement('button');button.type='button';button.textContent=item.text+' →';
      button.addEventListener('click',()=>{
        if(scope==='admin')window.dispatchEvent(new CustomEvent('bali:admin:open-order',{detail:{id:item.id}}));
        else void window.openMyOrders?.();
      });list.append(button);
    }
    const count=document.getElementById('baliNoticeCount');if(count)count.textContent=feed.length?` (${feed.length})`:'';
  }
  window.addEventListener('bali:orders',event=>snapshot(event.detail?.ownerUid,'guest',event.detail?.orders));
  window.addEventListener('bali:admin:orders',event=>{
    if('orders' in (event.detail||{}))snapshot(event.detail.ownerUid,'admin',event.detail.orders);
  });
  window.addEventListener('bali:admin:session',event=>reset(event.detail?.uid,'admin'));
  window.addEventListener('bali:auth-state',event=>{if(!event.detail?.signedIn)reset(null,'guest');});
  document.addEventListener('DOMContentLoaded',()=>{
    const host=document.getElementById('adminOverviewPanel')||document.querySelector('#profileSection .bali-profile-card');
    if(!host)return;
    const panel=document.createElement('details');panel.className='bali-service-card';panel.id='baliOrderNotifications';
    const title=document.createElement('summary');title.append('Уведомления о заказах');const count=document.createElement('span');count.id='baliNoticeCount';title.append(count);
    const list=document.createElement('div');list.id='baliOrderNoticeList';
    const clear=document.createElement('button');clear.type='button';clear.textContent='Отметить прочитанными';clear.addEventListener('click',()=>{feed=[];const live=document.getElementById('baliOrderNoticeLive');if(live)live.hidden=true;render();});
    const live=document.createElement('div');live.id='baliOrderNoticeLive';live.className='bali-notice-live';live.role='status';live.setAttribute('aria-live','polite');live.hidden=true;
    const open=document.createElement('button');open.type='button';open.className='bali-notice-open';live.append(open);
    live.addEventListener('click',()=>{live.hidden=true;panel.open=true;panel.scrollIntoView({block:'nearest'});});
    panel.append(title,list,clear);host.append(panel);document.body.append(live);render();
  });
})();
