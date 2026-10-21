const {test,expect}=require('@playwright/test');
test('a plan for the second party highlights its date and survives calendar navigation',async({page})=>{
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('/index.html#events');
  const date=await page.evaluate(()=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date()).map(p=>[p.type,p.value]));
    const date=`${parts.year}-${parts.month}-${parts.day}`;
    window.dispatchEvent(new CustomEvent('bali:events',{detail:{events:[
      {id:date,date,title:'Первая вечеринка',startTime:'23:00',endTime:'06:00'},
      {id:date+'__2',date,title:'Вторая вечеринка',startTime:'23:00',endTime:'06:00'}
    ]}}));
    window.dispatchEvent(new CustomEvent('bali:interests',{detail:{dates:[date+'__2']}}));
    return date;
  });
  const day=page.locator(`#baliCalendarDays [data-date="${date}"]`);
  await expect(day).toHaveAttribute('data-planned','true');
  await page.locator('#baliCalendarNext').click();
  await page.locator('#baliCalendarPrev').click();
  await expect(day).toHaveAttribute('data-planned','true');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bali:interests',{detail:{dates:[]}})));
  await expect(day).toHaveAttribute('data-planned','false');
});
