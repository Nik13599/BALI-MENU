const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{
  // Exercise the real page router with an already accepted fixture account.
  await page.addInitScript(()=>{window.BaliIdOnboarding={isAccepted:()=>true,open:async()=>true}});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
});

async function showId(page){
  await page.goto('/index.html#id');
  await page.evaluate(()=>{
    navigateGuestPage('id');
    document.getElementById('baliIdFlipScene').dataset.baliLoading='false';
    document.body.dataset.baliPage='id';
  });
  await expect(page.locator('#baliIdFlipScene')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>!!window.BaliIdMotion)).toBe(true);
}

test('BALI ID preserves original emblem without footer, and rounds its real 3D sides',async({page})=>{
  await showId(page);
  const logo=page.locator('#baliIdSection .bali-id-brand-master');
  await expect(logo).toHaveAttribute('width','450');
  await expect(logo).toHaveAttribute('height','531');
  await expect(logo).toHaveAttribute('src',/assets\/bali-id-card-readable\.svg\?v=/);
  const src=await (await page.request.get('/assets/bali-id-card-readable.svg')).text();
  expect(src).toContain('viewBox="0 0 450 531"');
  expect(src).not.toContain('<text');
  expect(src).toContain('transform="translate(0 54)"');
  const original=await (await page.request.get('/assets/bali-id-full-logo.svg')).text();
  const originalPath=original.match(/<path[^>]*d="([^"]+)"/)[1];
  const cardPath=src.match(/<path[^>]*d="([^"]+)"/)[1];
  // The original BALI illustration is path-for-path intact; only the footer
  // is dropped and the same art is visually re-centred in its original box.
  expect(originalPath.endsWith(cardPath)).toBe(true);
  await expect(page.locator('#baliIdSection .bali-id-3d-edge')).toHaveCount(4);
  const thickness=await page.locator('#baliIdSection .bali-id-3d-edge-left').evaluate(n=>parseFloat(getComputedStyle(n).width));
  expect(thickness).toBeGreaterThanOrEqual(4);
  expect(thickness).toBeLessThanOrEqual(7);
  const radii=await page.locator('#baliIdFront').evaluate(n=>{
    const s=getComputedStyle(n);return {radius:parseFloat(s.borderTopLeftRadius),
      overflow:s.overflow,box:n.getBoundingClientRect().width};
  });
  expect(radii.radius).toBeGreaterThanOrEqual(16);
  expect(radii.overflow).toBe('hidden');
  const edgeCorners=await page.locator('.bali-id-3d-edge-left').evaluate(n=>({
    radius:parseFloat(getComputedStyle(n).borderTopLeftRadius),
    height:n.getBoundingClientRect().height,
    cardHeight:document.getElementById('baliIdFront').getBoundingClientRect().height
  }));
  expect(edgeCorners.radius).toBeGreaterThan(4);
  expect(edgeCorners.height).toBeLessThan(edgeCorners.cardHeight);
  const corners=await page.locator('#baliIdFlipScene').evaluate(scene=>{
    const face=scene.querySelector('.bali-id-card-front');
    const wall=scene.querySelector('.bali-id-3d-edge-left');
    return {
      clip:getComputedStyle(face).clipPath,
      sideMask:getComputedStyle(wall).maskImage,
      sideRadius:getComputedStyle(wall).borderRadius,
      top:getComputedStyle(scene.querySelector('.bali-id-3d-edge-top')).display,
      bottom:getComputedStyle(scene.querySelector('.bali-id-3d-edge-bottom')).display
    };
  });
  expect(corners.clip).toContain('inset(');
  expect(corners.clip).toContain('round');
  expect(corners.sideMask).toContain('linear-gradient');
  expect(corners.sideRadius).toContain('999px');
  expect(corners.top).toBe('none');
  expect(corners.bottom).toBe('none');
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

test('original homepage and desktop sidebar are untouched by isolated ID/calendar styles',async({page})=>{
  const fs=require('node:fs');
  const html=fs.readFileSync('index.html','utf8');
  const stylesheet=fs.readFileSync('bali-id-calendar-only.css','utf8');
  expect(stylesheet).not.toContain('#homeSection');
  expect(stylesheet).not.toContain('.bali-pc-sidebar');
  expect(stylesheet).not.toContain('.bali-pc-navigation');
  expect(html).not.toContain('bali-pc-nav-heading');
  expect(html).not.toContain('bali-next-interactions.css');
  expect(html).toContain('ПОДРОБНЕЕ О КЛУБЕ');
  await page.goto('/index.html');
  await expect(page.locator('.bali-pc-sidebar .bali-pc-contacts-heading').first()).toHaveText('Контактная информация');
  await expect(page.locator('#homeSection')).toBeVisible();
  await expect(page.locator('.bali-pc-sidebar .bali-pc-brand')).toHaveCount(1);
});

test('BALI ID has no redundant heading or grey panel, and the flip keeps real depth',async({page})=>{
  await showId(page);
  await expect(page.locator('#baliIdPageHeading')).toHaveCount(0);
  await expect(page.locator('#baliIdSection')).toHaveAttribute('aria-label','BALI ID');
  await expect(page.locator('#baliIdSection .bali-id-heading')).toHaveCount(0);
  const backing=await page.locator('#baliIdSection .bali-profile-card').evaluate(n=>{
    const s=getComputedStyle(n);return {color:s.backgroundColor,image:s.backgroundImage,border:s.borderWidth,shadow:s.boxShadow};
  });
  expect(backing.color).toBe('rgba(0, 0, 0, 0)');
  expect(backing.image).toBe('none');
  expect(backing.shadow).toBe('none');
  const before=await page.locator('#baliIdFlipScene').evaluate(n=>({
    shadow:getComputedStyle(n,'::before').content,
    radius:getComputedStyle(document.getElementById('baliIdFront')).borderRadius
  }));
  expect(before.shadow).not.toBe('none');
  expect(before.radius).not.toBe('0px');
  const r=await page.locator('#baliIdFlipScene').boundingBox();
  await page.mouse.click(r.x+r.width*.51,r.y+r.height*.49);
  // Read one animation frame atomically; separate protocol round trips can
  // outlive the 820ms animation on a busy CI worker.
  const flipping=await page.evaluate(()=>({
    ...window.BaliIdMotion.getState(),
    animations:document.getElementById('baliIdFlipTrack').getAnimations().length
  }));
  expect(flipping.flipped).toBe(true);
  expect(flipping.cinematic).toBe(true);
  expect(flipping.animations).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>window.BaliIdMotion.getState().cinematic),{timeout:2200}).toBe(false);
});

test('manual swipe follows finger without cinematic retreat and the shadow responds',async({page})=>{
  await showId(page);
  const result=await page.evaluate(()=>{
    const scene=document.getElementById('baliIdFlipScene');
    const bounds=scene.getBoundingClientRect();
    const x=bounds.left+bounds.width*.35,y=bounds.top+bounds.height*.5;
    const fire=(name,dx)=>scene.dispatchEvent(new PointerEvent(name,{
      bubbles:true,isPrimary:true,pointerType:'touch',button:0,pointerId:455,clientX:x+dx,clientY:y
    }));
    fire('pointerdown',0);
    const before=scene.style.getPropertyValue('--bali-id-shadow-scale');
    fire('pointermove',85);
    const during=scene.style.getPropertyValue('--bali-id-shadow-scale');
    const cinematic=scene.classList.contains('is-cinematic');
    const drag=scene.classList.contains('is-dragging');
    fire('pointerup',85);
    return {before,during,cinematic,drag};
  });
  expect(result.drag).toBe(true);
  expect(result.cinematic).toBe(false);
  expect(result.before).not.toBe(result.during);
});

test('BALI privilege miniatures follow real card face layout without oversized member lettering',async({page})=>{
  await page.goto('/index.html');
  const c=page.locator('#baliHomeIdCard');
  await expect(c.locator('.bali-id-showcase-mini')).toHaveCount(3);
  await expect(c.locator('.bali-id-mini-heading')).toHaveCount(3);
  await expect(c.locator('.bali-id-mini-footer')).toHaveCount(3);
  await expect(c.locator('.bali-id-showcase-mini img').first()).toHaveAttribute('src',/bali-id-card-readable\.svg/);
  if(page.viewportSize().width>=1180){
    const fonts=await c.locator('.bali-id-mini-heading').first().evaluate(n=>({
      size:parseFloat(getComputedStyle(n).fontSize),
      cardWidth:n.closest('.bali-id-showcase-mini').getBoundingClientRect().width
    }));
    expect(fonts.size).toBeLessThan(8);
    expect(fonts.cardWidth).toBeGreaterThan(40);
  }
});

test('desktop About card uses its full height while preserving original hero and sidebar',async({page})=>{
  await page.goto('/index.html');
  if(page.viewportSize().width<1180)return;
  const p=await page.locator('#homeSection .bali-pc-about').evaluate(root=>{
    const content=root.querySelector('.bali-pc-about-content');
    const title=root.querySelector('.bali-pc-about-kicker').getBoundingClientRect();
    const facts=root.querySelector('.bali-pc-about-facts').getBoundingClientRect();
    const box=content.getBoundingClientRect();
    return {display:getComputedStyle(content).display,
      titleFromTop:title.top-box.top,
      factsFromTop:facts.top-box.top,
      factsBottom:facts.bottom-box.top,
      cardHeight:box.height,scrollHeight:content.scrollHeight,
      clientHeight:content.clientHeight};
  });
  expect(p.display).toBe('grid');
  expect(p.titleFromTop).toBeLessThan(p.cardHeight*.25);
  expect(p.factsFromTop).toBeGreaterThan(p.cardHeight*.48);
  expect(p.scrollHeight).toBeLessThanOrEqual(p.clientHeight+4);
  await expect(page.locator('.bali-pc-sidebar .bali-pc-navigation [data-bali-nav="home"]')).toHaveCount(1);
  await expect(page.locator('#baliMobileAboutBtn')).toHaveText('ПОДРОБНЕЕ О КЛУБЕ');
});

test('BALI ID card is centered, enlarged and top tools are QR then history',async({page})=>{
  await showId(page);
  const data=await page.evaluate(()=>{
    const section=document.querySelector('#baliIdSection>.container').getBoundingClientRect();
    const scene=document.getElementById('baliIdFlipScene').getBoundingClientRect();
    const tools=[...document.querySelectorAll('#baliIdSection .bali-id-page-tools button')].map(n=>n.id);
    const actions=document.querySelector('#baliIdSection .bali-bank-actions').getBoundingClientRect();
    const card=document.getElementById('baliIdFront').getBoundingClientRect();
    const actionLabels=[...document.querySelectorAll('#baliIdSection .bali-bank-actions>button')].map(n=>n.textContent.trim());
    return {section:{left:section.left,right:section.right,top:section.top,bottom:section.bottom,
      centerY:(section.top+section.bottom)/2},
      card:{left:card.left,right:card.right,top:card.top,bottom:card.bottom,width:card.width,height:card.height,
      centerX:(card.left+card.right)/2,centerY:(card.top+card.bottom)/2},
      actions:{top:actions.top,bottom:actions.bottom},tools,actionLabels,viewport:innerWidth};
  });
  expect(data.tools).toEqual(['baliShowQr','baliIdHistoryOpen']);
  expect(data.actionLabels).toEqual(['Использовать','Получить','Перевести']);
  expect(data.card.width/data.card.height).toBeCloseTo(1.68,1);
  expect(data.card.left).toBeGreaterThanOrEqual(2);
  expect(data.card.right).toBeLessThanOrEqual(data.viewport-2);
  expect(data.actions.top).toBeGreaterThan(data.card.bottom+14);
  // The current layout lifts the card slightly to leave space for actions.
  expect(data.section.centerY-data.card.centerY).toBeGreaterThanOrEqual(data.viewport<=767?26:10);
  expect(data.section.centerY-data.card.centerY).toBeLessThanOrEqual(data.viewport<=767?43:26);
  expect(data.actions.bottom).toBeLessThanOrEqual(data.section.bottom+1);
  if(data.viewport<=767){
    expect(data.card.width).toBeGreaterThan(data.viewport*.90);
  }else if(data.viewport>=1180){
    expect(data.card.width).toBeGreaterThan(640);
    expect(data.card.centerX).toBeCloseTo(data.viewport/2,0);
  }
});
