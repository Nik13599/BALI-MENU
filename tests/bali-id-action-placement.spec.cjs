const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
test('BALI ID action positions: Pay and History at top right, three controls beneath card',async({page})=>{
  await page.goto('/index.html#id');
  await page.evaluate(()=>{
    document.getElementById('baliIdSection').hidden=false;
    document.body.dataset.baliPage='id';
  });
  for(const id of ['baliIdPayOpen','baliIdHistoryOpen','baliIdTransferOpen','baliIdTopupOpen','baliShowQr']){
    await expect(page.locator('#'+id)).toBeVisible();
  }
  const result=await page.evaluate(()=>{
    const rect=id=>{
      const r=document.getElementById(id).getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
    };
    return {
      section:rect('baliIdSection'),
      card:rect('baliIdFlipScene'),
      pay:rect('baliIdPayOpen'),
      history:rect('baliIdHistoryOpen'),
      transfer:rect('baliIdTransferOpen'),
      topup:rect('baliIdTopupOpen'),
      qr:rect('baliShowQr'),
      columns:getComputedStyle(document.querySelector('#baliIdSection .bali-bank-actions')).gridTemplateColumns,
      viewport:innerWidth
    };
  });
  expect(result.pay.right).toBeLessThan(result.history.left+1);
  expect(result.pay.bottom).toBeLessThan(result.card.top+3);
  expect(result.history.bottom).toBeLessThan(result.card.top+3);
  expect(result.history.right).toBeLessThanOrEqual(result.viewport+1);
  expect(result.transfer.top).toBeGreaterThanOrEqual(result.card.bottom-4);
  expect(Math.abs(result.transfer.top-result.topup.top)).toBeLessThanOrEqual(3);
  expect(Math.abs(result.topup.top-result.qr.top)).toBeLessThanOrEqual(3);
  expect(result.transfer.right).toBeLessThan(result.topup.left+2);
  expect(result.topup.right).toBeLessThan(result.qr.left+2);
  expect(result.qr.right).toBeLessThanOrEqual(result.viewport+1);
  expect(result.transfer.width).toBeGreaterThan(35);
  expect(result.topup.width).toBeGreaterThan(35);
  expect(result.qr.width).toBeGreaterThan(35);
});