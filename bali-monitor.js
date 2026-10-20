/* Bounded operational diagnostics. Never store messages, URLs, identities or payloads. */
(() => {
  const health=new Map(),history=[];
  const token=value=>/^[a-z][a-z0-9_./-]{0,63}$/i.test(String(value))?String(value):'unknown';
  function record(area,code='unknown',ok=false){
    const entry={area:token(area),code:token(code),ok:!!ok,at:new Date().toISOString()};
    const previous=health.get(entry.area);
    if(previous?.code===entry.code&&previous?.ok===entry.ok)return;
    health.set(entry.area,entry);history.push(entry);if(history.length>40)history.shift();
    window.dispatchEvent(new CustomEvent('bali:health',{detail:entry}));render();
  }
  window.BaliMonitor=Object.freeze({report:(area,error)=>record(area,error?.code||error),
    ok:area=>record(area,'ready',true),snapshot:()=>[...health.values()].map(x=>({...x})),
    history:()=>history.map(x=>({...x})),download:()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,health:[...health.values()],history},null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='bali-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }});
  for(const area of ['menu','events','orders']){
    window.addEventListener('bali:'+area,()=>record(area,'ready',true));
    window.addEventListener('bali:'+area+'-error',event=>record(area,event.detail?.code||'unavailable'));
  }
  window.addEventListener('bali:auth-state',()=>record('auth','ready',true));
  window.addEventListener('unhandledrejection',event=>record('application',event.reason?.code||'unhandled-rejection'));
  window.addEventListener('error',event=>{
    if(event.target instanceof HTMLImageElement)return;
    record('application','resource-or-script-error');
  },true);
  function connection(){
    record('network',navigator.onLine?'online':'offline',navigator.onLine);
    const banner=document.querySelector('.bali-preview-banner');
    if(banner){
      banner.dataset.originalText ||= banner.textContent;
      banner.textContent=navigator.onLine?banner.dataset.originalText:'Нет сети. Сохранённые данные могут быть неактуальны; отправка заказа требует подключения.';
    }
  }
  window.addEventListener('online',connection);window.addEventListener('offline',connection);
  function render(){
    const root=document.getElementById('baliHealthRows');if(!root)return;
    root.replaceChildren();
    for(const entry of health.values()){
      const p=document.createElement('p');p.textContent=entry.area+' · '+(entry.ok?'Работает':entry.code)+' · '+new Date(entry.at).toLocaleTimeString('ru-RU');root.append(p);
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const overview=document.getElementById('adminOverviewPanel');
    if(overview){
      const panel=document.createElement('details');panel.className='card bali-service-card';
      const title=document.createElement('summary');title.textContent='Состояние подключения и диагностика';
      const rows=document.createElement('div');rows.id='baliHealthRows';
      const info=document.createElement('p');info.textContent='Состояние текущего браузера. Серверные ошибки и задержки доступны в Cloud Logging.';
      const download=document.createElement('button');download.type='button';download.textContent='Скачать диагностику без персональных данных';download.addEventListener('click',window.BaliMonitor.download);
      panel.append(title,info,rows,download);overview.append(panel);render();
    }
    connection();
  });
})();
