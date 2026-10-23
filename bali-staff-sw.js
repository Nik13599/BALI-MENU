/* BALI STAFF-only push worker. No offline caching of orders or credentials. */
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
  let detail={};
  try{detail=event.data?.json()||{};}catch{}
  // No guest names, phone numbers or order contents on the lock screen.
  const title="BALI STAFF • Новый заказ";
  const options={
    body:"Откройте предзаказы, чтобы посмотреть новый заказ.",
    icon:"/bali-staff-approved-icon.png?v=20261023-1",
    badge:"/bali-staff-approved-icon.png?v=20261023-1",
    tag:detail.orderId?"bali-order-"+String(detail.orderId).slice(0,128):"bali-new-order",
    data:{url:"/preorders.html"},
    renotify:false
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const path="/preorders.html";
    const matches=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing=matches.find(client=>{
      try{return new URL(client.url).pathname===path;}catch{return false;}
    });
    if(existing){await existing.focus();return;}
    await self.clients.openWindow(path);
  })());
});
