const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const source=fs.readFileSync('bali-pc-offers.js','utf8').replace(/^import\s+.*?;\s*$/gm,'');
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const artwork='https://promo-fixture.example.test/current.webp';
const offer=(id='current-campaign',patch={})=>({id,title:'АКТУАЛЬНАЯ АКЦИЯ',description:'Опубликованное предложение клуба',imageUrl:artwork,imageMobileUrl:'',imageTabletUrl:'',destination:'contact-modal',buttonText:'Узнать подробности',sort:0,published:true,...patch});

test.beforeEach(async({page})=>{
  // Real markup and renderer, with snapshot delivery controlled locally.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('**/index.html',route=>route.fulfill({contentType:'text/html',body:html}));
});

async function installRenderer(page,{reload=false}={}){
  if(reload)await page.reload();else await page.goto('/index.html');
  await page.evaluate(async()=>{window.__promoPositionStyle=(await import('/bali-promo-placement.js')).promoPositionStyle});
  await page.addScriptTag({content:`(()=>{
    const initializeApp=()=>({}),getApps=()=>[],getApp=()=>({});
    const getFirestore=()=>({}),collection=()=>({}),query=()=>({}),where=()=>({});
    const promoPositionStyle=window.__promoPositionStyle;
    const onSnapshot=(_,options,notify,onError)=>{
      window.__offerSnapshotOptions=options;
      window.__emitOffers=(records,metadata={fromCache:false,hasPendingWrites:false})=>notify({
        metadata,docs:records.map(({id,...data})=>({id,data:()=>data}))
      });
      window.__offerSnapshotError=onError;
      return ()=>{};
    };
    ${source}
  })();`});
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-carousel-count','0');
}

const emit=(page,records,metadata)=>page.evaluate(({records,metadata})=>window.__emitOffers(records,metadata),{records,metadata});
async function expectEmpty(page){
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-offer-id','');
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-carousel-count','0');
  expect(await page.locator('#baliPcHeroPoster').evaluate(image=>image.hasAttribute('src'))).toBe(false);
  await expect(page.locator('#baliPcOfferAction')).toBeHidden();
}

test('startup ignores a cached old holiday until the current server publication arrives',async({page})=>{
  await installRenderer(page);
  expect(await page.evaluate(()=>window.__offerSnapshotOptions)).toEqual({includeMetadataChanges:true});
  await expectEmpty(page);
  await emit(page,[offer('bali-new-year-2026',{title:'СТАРАЯ НОВОГОДНЯЯ АКЦИЯ'})],{fromCache:true,hasPendingWrites:false});
  await expectEmpty(page);
  await expect(page.locator('#baliPcOfferTitle')).toHaveText('Загружаем предложения…');
  await emit(page,[offer()]);
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-offer-id','current-campaign');
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-carousel-count','1');
  await expect(page.locator('#baliPcOfferTitle')).toHaveText('АКТУАЛЬНАЯ АКЦИЯ');
  await expect(page.locator('#baliPcHeroPoster')).toHaveAttribute('src',artwork);
});

test('live edits update the current slide immediately and a later stale cache cannot revert it',async({page})=>{
  await installRenderer(page);await emit(page,[offer()]);
  const updated=offer('current-campaign',{title:'ОБНОВЛЁННАЯ АКЦИЯ',imageUrl:'https://promo-fixture.example.test/updated.webp',buttonText:'Забронировать новое'});
  // Local pending writes are authoritative for an immediate editor update.
  await emit(page,[updated],{fromCache:true,hasPendingWrites:true});
  await expect(page.locator('#baliPcOfferTitle')).toHaveText('ОБНОВЛЁННАЯ АКЦИЯ');
  await expect(page.locator('#baliPcHeroPoster')).toHaveAttribute('src',updated.imageUrl);
  await expect(page.locator('#baliPcOfferAction')).toContainText('Забронировать новое');
  await emit(page,[offer('bali-new-year-2026',{title:'СТАРАЯ АКЦИЯ'})],{fromCache:true,hasPendingWrites:false});
  await expect(page.locator('#baliPcOfferTitle')).toHaveText('ОБНОВЛЁННАЯ АКЦИЯ');
  await emit(page,[updated]);
  await page.evaluate(()=>window.addEventListener('bali:promo-contacts',event=>{window.__clickedOffer=event.detail.offer}));
  await page.locator('#baliPcOfferAction').click();
  expect(await page.evaluate(()=>window.__clickedOffer.title)).toBe('ОБНОВЛЁННАЯ АКЦИЯ');
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-carousel-count','1');
});

test('unpublishing and deleting campaigns never resurrects the shipped holiday, including after reload',async({page})=>{
  await installRenderer(page);
  const holiday=offer('bali-new-year-2026',{title:'СОХРАНЁННАЯ НОВОГОДНЯЯ АКЦИЯ',sort:-1});
  await emit(page,[holiday,offer()]);
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-carousel-count','2');
  await emit(page,[{...holiday,published:false},offer()]);
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-offer-id','current-campaign');
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-carousel-count','1');
  await emit(page,[]);await expectEmpty(page);
  await expect(page.locator('#baliPcOfferTitle')).toHaveText('Предложений пока нет');
  await installRenderer(page,{reload:true});
  await emit(page,[holiday],{fromCache:true,hasPendingWrites:false});await expectEmpty(page);
  await emit(page,[]);await expectEmpty(page);
});

test('reload shows the latest saved campaign without briefly selecting the old holiday',async({page})=>{
  const latest=offer('saved-current',{title:'ПОСЛЕДНЯЯ СОХРАНЁННАЯ АКЦИЯ',imageUrl:'https://promo-fixture.example.test/latest.webp'});
  await installRenderer(page);await emit(page,[latest]);
  await expect(page.locator('#baliPcOfferTitle')).toHaveText(latest.title);
  await installRenderer(page,{reload:true});await expectEmpty(page);
  await emit(page,[latest]);
  await expect(page.locator('#baliPcOfferTitle')).toHaveText(latest.title);
  await expect(page.locator('#baliPcHeroPoster')).toHaveAttribute('src',latest.imageUrl);
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-offer-id','saved-current');
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-carousel-count','1');
});

test('a saved holiday without an image never substitutes the original artwork',async({page})=>{
  await installRenderer(page);
  await emit(page,[offer('bali-new-year-2026',{title:'НОВАЯ ТЕКСТОВАЯ АКЦИЯ',imageUrl:'',imageMobileUrl:'',imageTabletUrl:''})]);
  await expect(page.locator('.bali-pc-hero')).toHaveAttribute('data-bali-offer-id','bali-new-year-2026');
  const images=await page.evaluate(()=>({
    poster:document.getElementById('baliPcHeroPoster').getAttribute('src'),
    mobile:document.getElementById('baliPcHeroMobileSource').getAttribute('srcset'),
    tablet:document.getElementById('baliPcHeroTabletSource').getAttribute('srcset')
  }));
  expect(images).toEqual({poster:null,mobile:null,tablet:null});
  await expect(page.locator('#baliPcHeroPoster')).toBeHidden();
  await expect(page.locator('#baliPcOfferTitle')).toHaveText('НОВАЯ ТЕКСТОВАЯ АКЦИЯ');
  await expect(page.locator('#baliPcOfferTitle')).toBeVisible();
  await expect(page.locator('.bali-pc-hero')).not.toHaveClass(/has-artwork/);
});

test('the inline editor cannot recreate a deleted holiday document from a bundled preset',async({page})=>{
  await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js',route=>route.fulfill({
    contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:`
      export const doc=()=>({id:'bali-new-year-2026'});
      export const getDoc=async()=>({exists:()=>false});
      export const setDoc=async()=>{window.__unexpectedPromoWrite=true};
      export const serverTimestamp=()=>1;`
  }));
  await page.goto('/index.html');
  await page.evaluate(async()=>{
    const {createSimplePromoEditor}=await import('/bali-promo-simple-editor.js');
    const editor=createSimplePromoEditor({db:{},frame:{contentWindow:window,contentDocument:document},canEdit:()=>true});
    document.body.append(editor.root);await editor.select('bali-new-year-2026');
  });
  await expect(page.locator('[data-promo-status]')).toContainText('Предложение не найдено');
  await page.locator('[data-promo-save]').click();
  await expect(page.locator('[data-promo-status]')).toContainText('Не удалось загрузить слайд');
  expect(await page.evaluate(()=>Boolean(window.__unexpectedPromoWrite))).toBe(false);
});

async function openEditor(page,{delayedImages=false}={}){
  const initial=offer();delete initial.id;
  await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js',route=>route.fulfill({
    contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:`
      const initial=${JSON.stringify(initial)};
      export const doc=()=>({id:'current-campaign'});
      export const getDoc=async()=>({exists:()=>true,data:()=>structuredClone(window.__latestPromo||initial)});
      export const setDoc=async(_,data)=>{window.__latestPromo=structuredClone(data)};
      export const serverTimestamp=()=>1;`
  }));
  if(delayedImages)await page.route('**/image-compressor.js*',route=>route.fulfill({
    contentType:'text/javascript',body:'export const prepareImage=file=>new Promise(resolve=>{(window.__uploads??=[]).push({name:file.name,resolve})});'
  }));
  await page.goto('/index.html');
  await page.evaluate(async()=>{
    const {createSimplePromoEditor}=await import('/bali-promo-simple-editor.js');
    const editor=createSimplePromoEditor({db:{},frame:{contentWindow:window,contentDocument:document},canEdit:()=>true});
    document.body.append(editor.root);
    window.addEventListener('bali:promo-preview',event=>window.__lastPromoPreview=event.detail.offer);
    await editor.select('current-campaign');
  });
}

test('reset restores the latest saved image, including after publishing a replacement',async({page})=>{
  await openEditor(page);
  const input=page.locator('[data-promo-image-url]');
  const change=async url=>{await input.fill(url);await input.dispatchEvent('change')};
  const reset=()=>page.locator('[data-promo-reset-image]').evaluate(button=>button.click());
  const replacement='https://promo-fixture.example.test/replacement.webp';
  await change(replacement);await reset();
  await expect(input).toHaveValue(artwork);
  await change(replacement);
  await page.locator('[data-promo-save]').evaluate(button=>button.click());
  await expect(page.locator('[data-promo-status]')).toContainText('Слайд опубликован');
  await change('https://promo-fixture.example.test/unsaved.webp');await reset();
  await expect(input).toHaveValue(replacement);
  expect(await page.evaluate(()=>window.__lastPromoPreview.imageUrl)).toBe(replacement);
});

test('a slower earlier image upload cannot overwrite the newer published choice',async({page})=>{
  await openEditor(page,{delayedImages:true});
  const sharp=require('sharp');
  const images=await Promise.all(['#ff0000','#0000ff'].map(background=>
    sharp({create:{width:2,height:2,channels:3,background}}).webp().toBuffer()));
  const data=images.map(buffer=>'data:image/webp;base64,'+buffer.toString('base64'));
  const input=page.locator('[data-promo-file]');
  for(const name of ['earlier.png','latest.png'])await input.setInputFiles({name,mimeType:'image/png',buffer:Buffer.from('fixture')});
  await expect.poll(()=>page.evaluate(()=>window.__uploads?.length)).toBe(2);
  await page.evaluate(value=>window.__uploads[1].resolve(value),data[1]);
  await expect(page.locator('[data-promo-status]')).toContainText('Картинка загружена');
  await page.locator('[data-promo-save]').evaluate(button=>button.click());
  await expect(page.locator('[data-promo-status]')).toContainText('Слайд опубликован');
  await page.evaluate(value=>window.__uploads[0].resolve(value),data[0]);
  await expect(page.locator('.bali-promo-simple-preview img')).toHaveAttribute('src',data[1]);
  expect(await page.evaluate(()=>window.__latestPromo.imageUrl)).toBe(data[1]);
});
