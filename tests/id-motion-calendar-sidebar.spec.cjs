const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
});

async function showId(page){
  await page.goto('/index.html#id');
  await page.evaluate(()=>{
    document.getElementById('baliIdSection').hidden=false;
    document.body.dataset.baliPage='id';
  });
  await expect(page.locator('#baliIdFlipScene')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>!!window.BaliIdMotion)).toBe(true);
}

test('BALI ID retains exact original artwork bounds and has a legible NIGHT CLUB subtitle',async({page})=>{
  await showId(page);
  const logo=page.locator('#baliIdSection .bali-id-brand-master');
  await expect(logo).toHaveAttribute('width','450');
  await expect(logo).toHaveAttribute('height','531');
  await expect(logo).toHaveAttribute('src','assets/bali-id-card-readable.svg');
  const src=await (await page.request.get('/assets/bali-id-card-readable.svg')).text();
  expect(src).toContain('viewBox="0 0 450 531"');
  expect(src).toContain('NIGHT CLUB');
  expect(src).toContain('textLength="358"');
  const original=await (await page.request.get('/assets/bali-id-full-logo.svg')).text();
  const originalPath=original.match(/<path[^>]*d="([^"]+)"/)[1];
  const cardPath=src.match(/<path[^>]*d="([^"]+)"/)[1];
  // Lettering becomes legible while the entire original BALI illustration
  // (all art above the old microscopic footer) stays path-for-path intact.
  expect(originalPath.endsWith(cardPath)).toBe(true);
  await expect(page.locator('#baliIdSection .bali-id-3d-edge')).toHaveCount(4);
  const thickness=await page.locator('#baliIdSection .bali-id-3d-edge-left').evaluate(n=>parseFloat(getComputedStyle(n).width));
  expect(thickness).toBeGreaterThanOrEqual(14);
  const dims=await logo.evaluate(n=>{const r=n.getBoundingClientRect();return [r.width,r.height]});
  expect(dims[0]).toBeGreaterThan(25);
  expect(dims[1]).toBeGreaterThan(45);
});

test('mouse press, drag in either direction, and click flip a real 3D card',async({page})=>{
  await showId(page);
  const scene=page.locator('#baliIdFlipScene');
  const box=await scene.boundingBox();
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  await page.mouse.move(cx,cy);
  await page.mouse.down();
  await page.mouse.move(cx+Math.min(110,box.width*.4),cy,{steps:7});
  const partial=await page.locator('#baliIdFlipTrack').evaluate(n=>n.style.transform);
  expect(partial).toContain('rotateY(');
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.BaliIdMotion.getState().flipped)).toBe(true);
  await page.mouse.move(cx,cy);await page.mouse.down();
  await page.mouse.move(cx-100,cy,{steps:7});await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.BaliIdMotion.getState().flipped)).toBe(false);
  await page.mouse.move(cx,cy);await page.mouse.click(cx,cy);
  await expect.poll(()=>page.evaluate(()=>window.BaliIdMotion.getState().flipped)).toBe(true);
});

test('touch movement responds from center and edges; double-tap flips',async({page})=>{
  await showId(page);
  const out=await page.evaluate(()=>{
    const node=document.getElementById('baliIdFlipScene');
    const b=node.getBoundingClientRect();
    let pid=30;
    const fire=(name,id,x,y)=>node.dispatchEvent(new PointerEvent(name,{
      bubbles:true,pointerType:'touch',pointerId:id,isPrimary:true,button:0,
      clientX:x,clientY:y
    }));
    const startX=b.left+b.width*.12,y=b.top+b.height*.4;
    fire('pointerdown',++pid,startX,y);
    const initial=document.getElementById('baliIdFlipTrack').style.transform;
    fire('pointermove',pid,startX+75,y);
    const moved=document.getElementById('baliIdFlipTrack').style.transform;
    fire('pointerup',pid,startX+75,y);
    const swiped=window.BaliIdMotion.getState().flipped;
    window.BaliIdMotion.reset();
    const centre=b.left+b.width*.5;
    fire('pointerdown',++pid,centre,y);fire('pointerup',pid,centre,y);
    const afterOne=window.BaliIdMotion.getState().flipped;
    fire('pointerdown',++pid,centre,y);fire('pointerup',pid,centre,y);
    const afterTwo=window.BaliIdMotion.getState().flipped;
    return {initial,moved,swiped,afterOne,afterTwo};
  });
  expect(out.initial).toContain('rotateY(');
  expect(out.moved).not.toBe(out.initial);
  expect(out.swiped).toBe(true);
  expect(out.afterOne).toBe(false);
  expect(out.afterTwo).toBe(true);
});

test('desktop calendar posters sit left of date picker',async({page})=>{
  await page.goto('/index.html#events');
  if(page.viewportSize().width>=1180){
    const result=await page.evaluate(()=>{
      const left=document.getElementById('eventsCarouselShell').getBoundingClientRect();
      const right=document.getElementById('baliCalendarPanel').getBoundingClientRect();
      return {left:left.left,leftEnd:left.right,right:right.left,rightEnd:right.right,
        posterWidth:left.width,calendarWidth:right.width};
    });
    expect(result.posterWidth).toBeGreaterThan(100);
    expect(result.calendarWidth).toBeGreaterThan(150);
    expect(result.left).toBeLessThan(result.right);
    expect(result.leftEnd).toBeLessThanOrEqual(result.right+2);
  }else{
    await expect(page.locator('#baliCalendarPanel')).toHaveCount(1);
  }
});

test('desktop sidebar navigation and contact calls remain legible and clickable',async({page})=>{
  await page.goto('/index.html');
  if(page.viewportSize().width<1180)return;
  const nav=page.locator('.bali-pc-sidebar .bali-pc-navigation');
  await expect(nav).toBeVisible();
  for(const route of ['home','events','menu']){
    const button=nav.locator('[data-bali-nav="'+route+'"]');
    await expect(button).toBeVisible();
    const style=await button.evaluate(n=>{
      const s=getComputedStyle(n);return {height:n.getBoundingClientRect().height,
        border:s.borderWidth,color:s.color,background:s.backgroundImage||s.backgroundColor};
    });
    expect(style.height).toBeGreaterThanOrEqual(38);
    expect(style.border).not.toBe('0px');
  }
  await expect(page.locator('.bali-pc-sidebar .bali-pc-contact-phone'))
    .toHaveAttribute('href','tel:+375296700300');
  await expect(page.locator('.bali-pc-sidebar .bali-pc-contact-location a').first()).toHaveAttribute('href',/yandex/);
});
