/* Staff-only content checklist. Never invent schedules, ingredients or portions. */
(() => {
  let menu=[],events=[];
  function inspect(catalog,calendar){
    const issues=[];
    for(const item of catalog)if(item.available!==false&&!String(item.description||'').trim())
      issues.push({type:'menu',id:String(item.id),title:String(item.name||''),issue:'Не заполнен состав / описание'});
    for(const event of calendar)if(!event.startTime||!event.endTime)
      issues.push({type:'event',id:String(event.date),title:String(event.title||''),issue:'Не подтверждено время начала и окончания'});
    return issues;
  }
  function render(){
    const list=document.getElementById('baliContentIssues');if(!list)return;
    list.replaceChildren();const issues=inspect(menu,events);
    const status=document.createElement('p');status.textContent=issues.length?'Нужно уточнить: '+issues.length:'Описание меню и расписание заполнены.';list.append(status);
    for(const issue of issues.slice(0,15)){const p=document.createElement('p');p.textContent=issue.id+' · '+issue.title+' — '+issue.issue;list.append(p);}
  }
  window.BaliContentAudit=Object.freeze({inspect});
  window.addEventListener('bali:admin:menu',event=>{menu=event.detail?.items||[];window.BaliMonitor?.ok('admin-menu');render();});
  window.addEventListener('bali:admin:events',event=>{events=event.detail?.items||[];window.BaliMonitor?.ok('admin-events');render();});
  window.addEventListener('bali:admin:session',event=>{if(!event.detail?.uid){menu=[];events=[];render();}});
  document.addEventListener('DOMContentLoaded',()=>{
    const overview=document.getElementById('adminOverviewPanel');if(!overview)return;
    const panel=document.createElement('details');panel.className='card bali-service-card bali-content-readiness';
    const title=document.createElement('summary');title.textContent='Готовность меню и расписания';const list=document.createElement('div');list.id='baliContentIssues';panel.append(title,list);overview.append(panel);render();
    for(const button of document.querySelectorAll('[data-bali-time-preset]'))button.addEventListener('click',()=>{
      const [start,end]=button.dataset.baliTimePreset.split(',');
      document.getElementById('eventStartTime').value=start;document.getElementById('eventEndTime').value=end;
    });
  });
})();
