const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
});
test('BALI ID: QR then History at top; Use, Receive, Transfer are separated below enlarged card',async({page})=>{
  await page.goto('/index.html#id');
  await page.evaluate(()=>{
    document.getElementById('baliIdSection').hidden=false;
    document.body.dataset.baliPage='id';
  });
  const ids=['baliIdHistoryOpen','baliShowQr','baliIdPayOpen','baliIdTopupOpen','baliIdTransferOpen'];
  for(const id of ids)await expect(page.locator('#'+id)).toBeVisible();
  const rects=await page.evaluate(()=>{
    const r=id=>{
      const box=document.getElementById(id).getBoundingClientRect();
      return {x:box.x,y:box.y,w:box.width,h:box.height,r:box.right,b:box.bottom};
    };
    const scene=document.getElementById('baliIdFlipScene');
    return {history:r('baliIdHistoryOpen'),
      qr:r('baliShowQr'),card:r('baliIdFlipScene'),pay:r('baliIdPayOpen'),
      topup:r('baliIdTopupOpen'),transfer:r('baliIdTransferOpen'),
      ratio:getComputedStyle(scene).aspectRatio,viewport:window.innerWidth};
  });
  const {history,qr,card,pay,topup,transfer}=rects;
  console.log('BALI-ID-GEOMETRY',JSON.stringify({viewport:rects.viewport,card,pay,topup,transfer,qr,history}));

  const styleInfo=await page.evaluate(()=>{
    const ids=['baliIdSection','baliIdFlipScene','baliIdPayOpen','baliIdTopupOpen','baliIdTransferOpen'];
    const selector=['#baliIdSection>.container','#baliIdSection .bali-profile-card.bali-id-profile','#baliIdSection .bali-bank-actions','#baliIdSection .bali-id-page-tools'];
    const nodes=[...ids.map(x=>document.getElementById(x)),...selector.map(x=>document.querySelector(x))];
    return nodes.map(n=>{
      const z=getComputedStyle(n),rect=n.getBoundingClientRect();
      return {node:n.id||n.className.toString().slice(0,65),rect:{x:rect.x,w:rect.width,r:rect.right},
       width:z.width,maxWidth:z.maxWidth,minWidth:z.minWidth,left:z.left,right:z.right,
       boxSizing:z.boxSizing,position:z.position,display:z.display,transform:z.transform,
       grid:z.gridTemplateColumns,padding:z.padding,margin:z.margin,
       variable:z.getPropertyValue('--bali-id-large-width')};
    });
  });
  console.log('BALI-ID-CSS-DIAGNOSTIC',JSON.stringify(styleInfo));

  await expect(page.locator('#baliIdPageHeading')).toHaveCount(0);
  expect(Math.abs(history.y-qr.y)).toBeLessThan(3);
  expect(qr.r).toBeLessThan(history.x+2);
  expect(history.r).toBeLessThanOrEqual(rects.viewport+1);
  expect(history.b).toBeLessThan(card.y+4);
  expect(pay.y).toBeGreaterThanOrEqual(card.b+14);
  expect(Math.abs(pay.y-topup.y)).toBeLessThan(3);
  expect(Math.abs(topup.y-transfer.y)).toBeLessThan(3);
  expect(pay.r).toBeLessThan(topup.x+2);
  expect(topup.r).toBeLessThan(transfer.x+2);
  expect(transfer.r).toBeLessThanOrEqual(rects.viewport+1);
  expect(card.w/card.h).toBeGreaterThan(1.6);
  expect(card.w/card.h).toBeLessThan(1.8);
  expect(card.w).toBeGreaterThan(160);
  expect(card.h).toBeGreaterThan(90);
});
test('mobile ID: card slightly inset, QR and history aligned just beyond its right edge, actions usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/index.html');
  await page.evaluate(()=>{
    document.getElementById('baliIdSection').hidden=false;
    document.body.dataset.baliPage='id';
  });
  const measures=await page.evaluate(()=>{
    const box=id=>{
      const r=document.getElementById(id).getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
    };
    return {card:box('baliIdFlipScene'),qr:box('baliShowQr'),
      history:box('baliIdHistoryOpen'),use:box('baliIdPayOpen'),
      earn:box('baliIdTopupOpen'),transfer:box('baliIdTransferOpen'),
      width:innerWidth};
  });
  console.log('BALI-ID-MOBILE',JSON.stringify(measures));
  expect(measures.card.width).toBeLessThan(measures.width-22);
  expect(measures.card.width).toBeGreaterThan(160);
  expect(measures.history.right).toBeGreaterThanOrEqual(measures.card.right-11);
  expect(measures.history.right).toBeLessThanOrEqual(measures.width);
  expect(Math.abs(measures.qr.top-measures.history.top)).toBeLessThan(3);
  for(const name of ['use','earn','transfer']){
    expect(measures[name].height).toBeGreaterThanOrEqual(44);
    expect(measures[name].width).toBeGreaterThanOrEqual(82);
  }
  expect(measures.use.right).toBeLessThan(measures.earn.left+3);
  expect(measures.earn.right).toBeLessThan(measures.transfer.left+3);
});


test('BALI ID: both top tools equal size and near the header, card gently lifted without scaling',async({page})=>{
  await page.goto('/index.html');
  await page.evaluate(()=>{
    document.body.dataset.baliPage='id';
    document.getElementById('baliIdSection').hidden=false;
  });
  for(const id of ['baliIdFlipScene','baliShowQr','baliIdHistoryOpen','baliIdPayOpen','baliIdTopupOpen','baliIdTransferOpen']){
    await expect(page.locator('#'+id)).toBeVisible();
  }
  const g=await page.evaluate(()=>{
    const get=el=>{
      const r=el.getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,centerY:r.top+r.height/2};
    };
    const section=document.querySelector('#baliIdSection>.container');
    return {container:get(section),card:get(document.getElementById('baliIdFlipScene')),
      qr:get(document.getElementById('baliShowQr')),
      history:get(document.getElementById('baliIdHistoryOpen')),
      pay:get(document.getElementById('baliIdPayOpen')),
      topup:get(document.getElementById('baliIdTopupOpen')),
      transfer:get(document.getElementById('baliIdTransferOpen'))};
  });
  expect(Math.abs(g.qr.width-g.history.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(g.qr.height-g.history.height)).toBeLessThanOrEqual(1);
  expect(g.qr.width).toBeGreaterThan(80);
  expect(g.qr.top-g.container.top).toBeGreaterThanOrEqual(4);
  expect(g.qr.top-g.container.top).toBeLessThanOrEqual(15);
  expect(Math.abs(g.qr.top-g.history.top)).toBeLessThanOrEqual(1);
  expect(g.qr.right).toBeLessThanOrEqual(g.history.left+2);
  expect(g.history.bottom).toBeLessThan(g.card.top);
  const shift=g.container.centerY-g.card.centerY;
  expect(shift).toBeGreaterThanOrEqual(page.viewportSize().width<=767?26:10);
  expect(shift).toBeLessThanOrEqual(page.viewportSize().width<=767?43:26);
  expect(g.pay.top).toBeGreaterThanOrEqual(g.card.bottom+12);
  expect(Math.abs(g.pay.top-g.topup.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(g.topup.top-g.transfer.top)).toBeLessThanOrEqual(1);
  expect(g.card.width/g.card.height).toBeGreaterThan(1.6);
  expect(g.card.width/g.card.height).toBeLessThan(1.8);
});
