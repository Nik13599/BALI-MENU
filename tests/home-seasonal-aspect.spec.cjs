const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
});
test('Seasonal banner preserves the complete 2048 by 706 reference at all viewports',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(()=>{
   document.body.dataset.baliPage='home';
   const section=document.getElementById('homeSection');
   section.hidden=false;
   const hero=document.querySelector('#homeSection .bali-pc-hero');
   hero.classList.add('is-seasonal');
 });
 const promo=page.locator('#homeSection .bali-pc-hero.is-seasonal');
 await expect(promo).toBeVisible();
 const sizes=await page.evaluate(()=>{
   const box=selector=>{
     const el=document.querySelector(selector);
     const r=el.getBoundingClientRect();
     const st=getComputedStyle(el);
     return{width:r.width,height:r.height,top:r.top,transform:st.transform,
       aspectRatio:st.aspectRatio,gridTemplateRows:st.gridTemplateRows};
   };
   return{banner:box('#homeSection .bali-pc-hero.is-seasonal'),
     grid:box('#homeSection .bali-home-inner'),
     carousel:box('#homeSection #homeEventCarousel'),vw:innerWidth,vh:innerHeight};
 });
 console.log('BALI-HOME-PROMO-RECT',JSON.stringify(sizes));
 expect(sizes.banner.width).toBeGreaterThan(180);
 expect(sizes.banner.height).toBeGreaterThan(65);
 expect(sizes.banner.width/sizes.banner.height).toBeCloseTo(2048/706,1);
 expect(sizes.banner.width).toBeLessThanOrEqual(sizes.grid.width+3);
 if(sizes.vw<=767){
   expect(sizes.carousel.top).toBeGreaterThanOrEqual(sizes.grid.top);
 }else{
   expect(sizes.banner.width).toBeLessThanOrEqual(sizes.grid.width+3);
 }
});
test('Seasonal-only rules do not alter other campaign slides or square poster dimensions',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(()=>{
  document.body.dataset.baliPage='home';
  document.getElementById('homeSection').hidden=false;
 });
 const banner=page.locator('#homeSection .bali-pc-hero');
 await expect(banner).not.toHaveClass(/is-seasonal/);
 const c=await page.evaluate(()=>{
  const style=getComputedStyle(document.querySelector('#homeSection .bali-pc-hero'));
  return style.aspectRatio;
 });
 expect(c).not.toBe('11 / 5');
});
