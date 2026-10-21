const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
});
test('BALI ID: History and QR below heading; Pay, Top up, Transfer stay aligned under unscaled card',async({page})=>{
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
    return {heading:r('baliIdPageHeading'),history:r('baliIdHistoryOpen'),
      qr:r('baliShowQr'),card:r('baliIdFlipScene'),pay:r('baliIdPayOpen'),
      topup:r('baliIdTopupOpen'),transfer:r('baliIdTransferOpen'),
      ratio:getComputedStyle(scene).aspectRatio,viewport:window.innerWidth};
  });
  const {heading,history,qr,card,pay,topup,transfer}=rects;
  expect(history.y).toBeGreaterThanOrEqual(heading.b+1);
  expect(qr.y).toBeGreaterThanOrEqual(heading.b+1);
  expect(Math.abs(history.y-qr.y)).toBeLessThan(3);
  expect(history.r).toBeLessThan(qr.x+2);
  expect(qr.r).toBeLessThanOrEqual(rects.viewport+1);
  expect(qr.b).toBeLessThan(card.y+4);
  expect(pay.y).toBeGreaterThanOrEqual(card.b-4);
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