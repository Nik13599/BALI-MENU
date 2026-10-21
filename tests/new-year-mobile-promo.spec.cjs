const {test,expect}=require("@playwright/test");
const fs=require("node:fs");
const path=require("node:path");

// Isolate the promotional renderer from the production Firebase connection.
test.beforeEach(async({page})=>{
  await page.route("**/*",route=>
    new URL(route.request().url()).hostname==="127.0.0.1"?
      route.continue():route.abort());
});

async function loadHoliday(page){
  await page.goto("/index.html");
  const source=fs.readFileSync(path.join(__dirname,"..","bali-pc-offers.js"),"utf8");
  const isolated=source.replace(/^import\s+.*?;\s*$/gm,"");
  await page.addScriptTag({content:`(()=>{
    const initializeApp=()=>({}),getApps=()=>[],getApp=()=>({});
    const getFirestore=()=>({}),collection=()=>({}),query=()=>({}),where=()=>({});
    const onSnapshot=()=>()=>{};
    `+isolated+"\n})();"});
  await expect(page.locator(".bali-pc-hero")).toHaveClass(/is-seasonal/);
  await page.locator("#baliPcHeroPoster").evaluate(image=>image.decode());
}

test("New Year image fills mobile card and labeled booking control opens contacts",async({page})=>{
  test.skip(page.viewportSize().width>=768,"mobile-only behavior");
  await loadHoliday(page);
  const hero=page.locator(".bali-pc-hero");
  const poster=page.locator("#baliPcHeroPoster");
  const imageBox=await poster.boundingBox();
  const heroBox=await hero.boundingBox();
  expect(imageBox).toBeTruthy();
  expect(heroBox).toBeTruthy();
  expect(imageBox.width).toBeGreaterThanOrEqual(heroBox.width-3);
  expect(imageBox.height).toBeGreaterThanOrEqual(heroBox.height-3);
  expect(await poster.evaluate(image=>getComputedStyle(image).objectFit)).toBe("cover");
  expect(await poster.evaluate(image=>getComputedStyle(image).objectPosition)).toMatch(/^0%|left/);
  const cta=page.locator("#baliPcOfferAction");
  await expect(cta).toBeVisible();
  await expect(cta).toContainText("Забронировать заранее");
  const buttonBox=await cta.boundingBox();
  expect(buttonBox.x).toBeGreaterThanOrEqual(heroBox.x);
  expect(buttonBox.x+buttonBox.width).toBeLessThanOrEqual(heroBox.x+heroBox.width+2);
  expect(buttonBox.y+buttonBox.height).toBeLessThanOrEqual(heroBox.y+heroBox.height+2);
  await page.evaluate(()=>{
    window.__contactPromoOpens=0;
    window.addEventListener("bali:promo-contacts",()=>window.__contactPromoOpens++);
  });
  await cta.click();
  expect(await page.evaluate(()=>window.__contactPromoOpens)).toBe(1);
});

test("Desktop keeps the complete original holiday artwork",async({page})=>{
  test.skip(page.viewportSize().width<1180,"desktop-only behavior");
  await loadHoliday(page);
  const poster=page.locator("#baliPcHeroPoster");
  expect(await poster.evaluate(image=>getComputedStyle(image).objectFit)).toBe("contain");
  await expect(page.locator(".bali-pc-artwork-hotspot:not(.bali-pc-artwork-hotspot-secondary):not(.bali-pc-artwork-hotspot-third)")).toBeVisible();
});

test("Published seasonal campaign can replace built-in artwork and still be resized in the visual builder",async({page})=>{
  await page.goto("/index.html");
  const source=fs.readFileSync(path.join(__dirname,"..","bali-pc-offers.js"),"utf8")
    .replace(/^import\s+.*?;\s*$/gm,"");
  // Simulate a published admin change without production Firebase credentials.
  await page.addScriptTag({content:`(()=>{
    const initializeApp=()=>({}),getApps=()=>[],getApp=()=>({});
    const getFirestore=()=>({}),collection=()=>({}),query=()=>({}),where=()=>({});
    const onSnapshot=(_,notify)=>{
      notify({docs:[{id:"bali-new-year-2026",data:()=>({
        title:"БРОНИРОВАНИЕ НОВОГОДНИХ КОРПОРАТИВОВ",
        description:"Новая кампания",imageUrl:"https://example.com/holiday.png",
        imageTabletUrl:"https://example.com/holiday-tablet.png",
        imageMobileUrl:"https://example.com/holiday-phone.png",
        destination:"contact-modal",buttonText:"Забронировать заранее",
        contactHotspot:{enabled:true,left:4,top:69,width:30,height:17},
        sort:0,published:true
      })}]});
      return ()=>{};
    };
    `+source+"\n})();"});
  const result=await page.evaluate(()=>{
    const hero=document.querySelector(".bali-pc-hero"),poster=document.querySelector("#baliPcHeroPoster");
    const core=window.BaliBuilderCore,model=core.emptyModel();
    const selector=core.selectorFor(hero);
    model.phone.rules[selector]={props:{width:"96%",height:"210px"}};
    core.mount(document,model,"phone",{editor:true});
    const adjusted={
      width:hero.style.width,height:hero.style.height,
      artwork:poster.getAttribute("src"),
      mobile:document.querySelector("#baliPcHeroMobileSource").getAttribute("srcset"),
      tablet:document.querySelector("#baliPcHeroTabletSource").getAttribute("srcset"),
      offerId:hero.dataset.baliOfferId,
      managed:hero.dataset.baliManagedPromo
    };
    document.__baliBuilderRestore();
    return {...adjusted,restored:hero.style.width!=="96%"&&hero.style.height!=="210px"};
  });
  expect(result.offerId).toBe("bali-new-year-2026");
  expect(result.managed).toBe("true");
  expect(result.artwork).toBe("https://example.com/holiday.png");
  expect(result.mobile).toBe("https://example.com/holiday-phone.png");
  expect(result.tablet).toBe("https://example.com/holiday-tablet.png");
  expect(result.width).toBe("96%");
  expect(result.height).toBe("210px");
  expect(result.restored).toBe(true);
});

test("carousel rotates multiple promotions by swipe/drag and exposes 15-second cadence",async({page})=>{
 await page.goto("/index.html");
 const source=fs.readFileSync(path.join(__dirname,"..","bali-pc-offers.js"),"utf8")
   .replace(/^import\s+.*?;\s*$/gm,"");
 await page.addScriptTag({content:`(()=>{
  const initializeApp=()=>({}),getApps=()=>[],getApp=()=>({});
  const getFirestore=()=>({}),collection=()=>({}),query=()=>({}),where=()=>({});
  const onSnapshot=(_,notify)=>{notify({docs:[{id:"promo-extra",data:()=>({
   title:"ВТОРОЙ БАННЕР",description:"",imageUrl:"https://example.com/banner.webp",
   imageTabletUrl:"",imageMobileUrl:"",
   destination:"menu",buttonText:"Подробнее",sort:100,published:true
  })}]});return ()=>{}};
  `+source+"\n})();"});
 const hero=page.locator(".bali-pc-hero");
 await expect(hero).toHaveAttribute("data-bali-carousel-count","2");
 await expect(hero).toHaveAttribute("data-bali-carousel-interval","15000");
 await expect(hero).toHaveAttribute("data-bali-offer-id","bali-new-year-2026");
 await page.evaluate(()=>{
   const el=document.querySelector(".bali-pc-hero");
   const fire=(type,x,y,pointerType)=>{
     el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,
       pointerId:19,pointerType,clientX:x,clientY:y,button:0}));
   };
   fire("pointerdown",280,200,"touch");
   fire("pointermove",205,201,"touch");
   fire("pointerup",150,201,"touch");
 });
 await expect(hero).toHaveAttribute("data-bali-offer-id","promo-extra");
 await page.evaluate(()=>{
   const el=document.querySelector(".bali-pc-hero");
   const fire=(type,x,y)=>{
     el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,
       pointerId:20,pointerType:"mouse",clientX:x,clientY:y,button:0}));
   };
   fire("pointerdown",110,200);
   fire("pointermove",190,199);
   fire("pointerup",265,199);
 });
 await expect(hero).toHaveAttribute("data-bali-offer-id","bali-new-year-2026");
});

test("Composed Christmas banner renders uploaded art, foreground title and colored rounded booking button",async({page})=>{
 await page.goto("/index.html");
 const source=fs.readFileSync(path.join(__dirname,"..","bali-pc-offers.js"),"utf8")
  .replace(/^import\s+.*?;\s*$/gm,"");
 await page.addScriptTag({content:`(()=>{
  const initializeApp=()=>({}),getApps=()=>[],getApp=()=>({});
  const getFirestore=()=>({}),collection=()=>({}),query=()=>({}),where=()=>({});
  const onSnapshot=(_,notify)=>{notify({docs:[{id:"bali-new-year-2026",data:()=>({
   title:"НОВОГОДНИЙ КОРПОРАТИВ",description:"",
   imageUrl:"https://example.com/new-artwork.webp",imageMobileUrl:"",imageTabletUrl:"",
   destination:"contact-modal",buttonText:"Забронировать сейчас",
   contactHotspot:{enabled:true,left:4,top:69,width:30,height:17},
   sort:0,published:true,
   overlay:{enabled:true,fontSize:40,textColor:"#ffcc22",
     buttonBackground:"#00dd99",buttonColor:"#220011",buttonRadius:18,align:"center"}
  })}]});return ()=>{}};
  `+source+"\n})();"});
 const hero=page.locator(".bali-pc-hero");
 await expect(hero).toHaveClass(/is-composed/);
 await expect(hero).toHaveAttribute("data-bali-promo-align","center");
 await expect(page.locator("#baliPcHeroPoster")).toHaveAttribute("src","https://example.com/new-artwork.webp");
 const title=page.locator("#baliPcOfferTitle"),button=page.locator("#baliPcOfferAction");
 await expect(title).toBeVisible();
 await expect(title).toHaveText("НОВОГОДНИЙ КОРПОРАТИВ");
 await expect(button).toBeVisible();
 await expect(button).toContainText("Забронировать сейчас");
 expect(await title.evaluate(el=>getComputedStyle(el).color)).toBe("rgb(255, 204, 34)");
 expect(await button.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgb(0, 221, 153)");
 expect(await button.evaluate(el=>getComputedStyle(el).color)).toBe("rgb(34, 0, 17)");
 expect(await button.evaluate(el=>getComputedStyle(el).borderRadius)).toBe("18px");
 expect(await hero.evaluate(el=>el.querySelectorAll(".bali-pc-artwork-hotspot:not([hidden])").length)).toBe(0);
 await page.evaluate(()=>{
   window.__promoClicked=0;
   window.addEventListener("bali:promo-contacts",()=>window.__promoClicked++);
   document.getElementById("baliPcOfferAction").click();
 });
 expect(await page.evaluate(()=>window.__promoClicked)).toBe(1);
});

test("Simple inline promo editor uploads real image and saves styling to the existing promotion",async({page})=>{
 await page.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js",route=>route.fulfill({
  status:200,contentType:"application/javascript",
  headers:{"access-control-allow-origin":"*"},
  body:`export function doc(){return {id:"bali-new-year-2026"}}
    export async function getDoc(){return {exists:()=>false}}
    export async function setDoc(_,payload){window.__promoSaved=payload}
    export function serverTimestamp(){return "2026-test-stamp"}`
 }));
 await page.goto("/index.html");
 await page.evaluate(async()=>{
  window.BALI_IMAGE_STORAGE_ENABLED=false;
  const {createSimplePromoEditor}=await import("/bali-promo-simple-editor.js");
  const editor=createSimplePromoEditor({db:{},frame:{contentWindow:window,contentDocument:document},
   canEdit:()=>true,notify:message=>window.__promoNotification=message});
  document.body.append(editor.root);
  window.__promoPreviewEvents=[];
  window.addEventListener("bali:promo-preview",event=>window.__promoPreviewEvents.push(event.detail.offer));
  await editor.select("bali-new-year-2026");
 });
 await expect(page.locator("#baliBuilderManagedPromo")).toBeVisible();
 await page.locator("[data-promo-title]").fill("НОВОГОДНИЙ КОРПОРАТИВ");
 await page.locator("[data-promo-font-size]").fill("42");
 await page.locator("[data-promo-text-color]").fill("#fedcba");
 await page.locator("[data-promo-button-text]").fill("Забронировать");
 await page.locator("[data-promo-button-background]").fill("#aaff33");
 await page.locator("[data-promo-button-color]").fill("#000022");
 await page.locator("[data-promo-button-radius]").fill("22");
 await page.locator("[data-promo-align]").selectOption("center");
 // A genuine browser image import, not a manually pasted URL.
 await page.locator("[data-promo-file]").setInputFiles({
  name:"banner.png",mimeType:"image/png",
  buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAFElEQVR4nGM8kWLEgA0wYRUlSwIAiIYBZhhhozkAAAAASUVORK5CYII=","base64")
 });
 await expect(page.locator("[data-promo-status]")).toContainText("Картинка загружена");
 await page.locator("[data-promo-save]").click();
 await expect(page.locator("[data-promo-status]")).toContainText("Слайд опубликован");
 const result=await page.evaluate(()=>({
  overlay:window.__promoSaved?.overlay,title:window.__promoSaved?.title,
  button:window.__promoSaved?.buttonText,image:window.__promoSaved?.imageUrl,
  destination:window.__promoSaved?.destination,
  published:window.__promoSaved?.published,previewCount:window.__promoPreviewEvents?.length
 }));
 expect(result.title).toBe("НОВОГОДНИЙ КОРПОРАТИВ");
 expect(result.button).toBe("Забронировать");
 expect(result.image).toMatch(/^data:image\/webp;base64,/);
 expect(result.destination).toBe("contact-modal");
 expect(result.published).toBe(true);
 expect(result.overlay).toEqual({
  enabled:true,fontSize:42,textColor:"#fedcba",buttonBackground:"#aaff33",
  buttonColor:"#000022",buttonRadius:22,align:"center"
 });
 expect(result.previewCount).toBeGreaterThan(0);
});
