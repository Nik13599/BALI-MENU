const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{
  // Browser fixture: never contacts the live event database.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'
    ?route.continue():route.abort());
});

test('calendar event shows its schedule first, then reveals the caption on Подробнее',async({page})=>{
  await page.goto('/index.html#events');
  await page.evaluate(()=>{
    document.getElementById('eventsSection').hidden=false;
    document.body.dataset.baliPage='events';
  });
  await expect.poll(()=>page.evaluate(()=>window.BaliCalendarShowcase?.mode)).toBe('stage');
  await page.evaluate(()=>{
    const grid=document.getElementById('eventsGrid');
    const card=document.createElement('article');
    card.className='event-card';
    card.dataset.eventDate='2026-10-02';
    const poster=document.createElement('div');
    poster.className='bali-event-poster-wrap';
    const image=document.createElement('img');
    image.className='event-poster';
    image.src='assets/bali-id-card-readable.svg';
    poster.append(image);
    const body=document.createElement('div');
    body.className='event-card-body';
    const info=document.createElement('div');
    info.className='bali-event-info';
    const name=document.createElement('h3');
    name.textContent='Тест календаря';
    const hours=document.createElement('p');
    hours.className='bali-event-hours';
    hours.textContent='23:00–06:00';
    const description=document.createElement('p');
    description.className='bali-event-description';
    description.textContent='Подробное описание BALI, видимое только после клика';
    info.append(name,hours,description);
    body.append(info);
    card.append(poster,body);
    grid.replaceChildren(card);
  });
  const poster=page.locator('#eventsGrid .event-card.is-active .bali-event-poster-wrap');
  await expect(poster).toBeVisible();
  await poster.click();

  const dialog=page.locator('#baliEventDetailDialog');
  const caption=page.locator('#baliEventDetailCaption');
  const button=page.locator('#baliEventDetailComments');
  await expect(dialog).toHaveAttribute('open','');
  await expect(page.locator('#baliEventDetailTitle')).toHaveText('Тест календаря');
  await expect(page.locator('#baliEventDetailDate')).toHaveText('пятница, 2 октября 2026 года,');
  await expect(page.locator('#baliEventDetailHours')).toHaveText('23:00 — 06:00');
  await expect(caption).toBeHidden();
  await expect(caption).toHaveAttribute('hidden','');
  await expect(button).toHaveAttribute('aria-expanded','false');
  await expect(dialog).toHaveAttribute('data-scroll-unlocked','false');
  const visibleDate=await page.evaluate(()=>{
    const dialog=document.getElementById('baliEventDetailDialog').getBoundingClientRect();
    const date=document.getElementById('baliEventDetailDate').getBoundingClientRect();
    const hours=document.getElementById('baliEventDetailHours').getBoundingClientRect();
    return date.bottom<=dialog.bottom+1&&hours.bottom<=dialog.bottom+1;
  });
  expect(visibleDate,'Date and time must fit inside the locked dialog').toBe(true);

  await button.click();
  await expect(caption).toBeVisible();
  await expect(page.locator('#baliEventDetailDescription'))
    .toHaveText('Подробное описание BALI, видимое только после клика');
  await expect(button).toHaveAttribute('aria-expanded','true');
  await expect(button).toHaveAttribute('aria-label','Скрыть подробности мероприятия');
  await expect(dialog).toHaveAttribute('data-scroll-unlocked','true');

  // Repeated presses of the SAME control must hide and show the details.
  await button.click();
  await expect(caption).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded','false');
  await expect(button).toHaveAttribute('aria-label','Читать подробности мероприятия');
  await expect(dialog).toHaveAttribute('data-scroll-unlocked','false');
  expect(await dialog.evaluate(node=>node.scrollTop)).toBe(0);
  await button.click();
  await expect(caption).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded','true');
  await expect(dialog).toHaveAttribute('data-scroll-unlocked','true');

  await page.locator('#baliEventDetailClose').click();
  await expect(dialog).not.toHaveAttribute('open','');
  await poster.click();
  await expect(caption).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded','false');
  await expect(dialog).toHaveAttribute('data-scroll-unlocked','false');
});
