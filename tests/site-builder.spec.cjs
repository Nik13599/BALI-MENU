const {test,expect}=require("@playwright/test");

test("builder preserves original components and applies opt-in adaptive overrides",async({page})=>{
  await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>Boolean(window.BaliBuilderCore));
  const result=await page.evaluate(()=>{
    const core=window.BaliBuilderCore;
    const target=document.querySelector("#baliMenuHeading");
    const original=target?.textContent||"";
    const payload=core.emptyModel();
    payload.desktop.rules["#baliMenuHeading"]={
      props:{fontSize:32,fontWeight:"900",fontStyle:"italic",animation:"bounce",effect:"neon"},
      text:"ТЕСТ МЕНЮ"
    };
    payload.desktop.blocks.push({
      id:"bali-test-button",page:"home",kind:"button",text:"Открыть меню",
      link:"route:menu",image:"",x:12,y:10,props:{width:"215px",height:"54px",buttonStyle:"pill"}
    });
    core.mount(document,payload,"desktop",{editor:true});
    const first={
      fontSize:target.style.getPropertyValue("font-size"),
      fontWeight:target.style.getPropertyValue("font-weight"),
      animation:target.style.getPropertyValue("animation"),
      effect:target.getAttribute("data-bali-builder-effect"),
      text:target.textContent,
      count:document.querySelectorAll('[data-bali-builder-id="bali-test-button"]').length,
      original
    };
    core.mount(document,payload,"desktop",{editor:true});
    const afterRefresh=document.querySelectorAll('[data-bali-builder-id="bali-test-button"]').length;
    document.__baliBuilderRestore();
    const restored=target.textContent===original&&
      !target.hasAttribute("data-bali-builder-effect")&&
      document.querySelectorAll('[data-bali-builder-id="bali-test-button"]').length===0;
    // Dangerous inputs are ignored by the same sanitizer used by guests.
    const unsafe=core.sanitizeProps({fontSize:99999,image:"javascript:alert(1)",fontFamily:"url(x)",color:"red"});
    return {first,afterRefresh,restored,unsafe};
  });
  expect(result.first.fontSize).toBe("32px");
  expect(result.first.fontWeight).toBe("900");
  expect(result.first.animation).toContain("bali-builder-bounce");
  expect(result.first.effect).toBe("neon");
  expect(result.first.text).toContain("ТЕСТ МЕНЮ");
  expect(result.first.count).toBe(1);
  expect(result.afterRefresh).toBe(1);
  expect(result.restored).toBe(true);
  expect(result.unsafe.fontSize).toBe(200);
  expect(result.unsafe.image).toBeUndefined();
  expect(result.unsafe.fontFamily).toBeUndefined();
  expect(result.unsafe.color).toBeUndefined();
});

test("builder respects device layouts and reduced-motion stylesheet",async({page})=>{
  await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>Boolean(window.BaliBuilderCore));
  const result=await page.evaluate(()=>{
    const core=window.BaliBuilderCore;
    const m=core.emptyModel();
    m.desktop.rules["#baliMenuHeading"]={props:{fontSize:35}};
    m.phone.rules["#baliMenuHeading"]={props:{fontSize:19}};
    const el=document.getElementById("baliMenuHeading");
    core.mount(document,m,"phone",{editor:true});
    const phone=el.style.fontSize;
    core.mount(document,m,"desktop",{editor:true});
    const desktop=el.style.fontSize;
    const style=document.querySelector("#baliBuilderBaseStyle")?.textContent||"";
    document.__baliBuilderRestore();
    return {phone,desktop,reducedMotion:style.includes("prefers-reduced-motion:reduce"),originalRestored:el.style.fontSize!=="19px"&&el.style.fontSize!=="35px"};
  });
  expect(result.phone).toBe("19px");
  expect(result.desktop).toBe("35px");
  expect(result.reducedMotion).toBe(true);
  expect(result.originalRestored).toBe(true);
});


test("About page stays isolated while inline layouts and animations work inside its iframe",async({page})=>{
  await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>Boolean(window.BaliBuilderCore));
  await page.locator("#baliAboutFrame").evaluate(el=>{el.loading="eager";});
  await page.waitForFunction(()=>{
    const inner=document.getElementById("baliAboutFrame")?.contentDocument;
    return Boolean(inner?.querySelector("h1"));
  });
  const actual=await page.evaluate(()=>{
    const inner=document.getElementById("baliAboutFrame").contentDocument;
    const heading=inner.querySelector("h1");
    const original=heading.textContent;
    const core=window.BaliBuilderCore,m=core.emptyModel();
    m.desktop.rules["about::h1"]={props:{fontSize:31,animation:"float",effect:"hover-lift"},text:"Новый заголовок "};
    m.desktop.blocks.push({
      id:"bali-about-demo",page:"about",kind:"button",text:"В календарь",
      link:"route:events",x:15,y:100,props:{width:"220px",height:"48px",buttonStyle:"glass"}
    });
    core.mount(document,m,"desktop",{editor:true});
    core.mount(inner,m,"desktop",{editor:true,scope:"about"});
    const before={
      isolated:document.querySelector('[data-bali-builder-id="bali-about-demo"]')===null,
      visible:inner.querySelectorAll('[data-bali-builder-id="bali-about-demo"]').length===1,
      fontSize:heading.style.fontSize,
      effect:heading.getAttribute("data-bali-builder-effect"),
      text:heading.textContent,
      original
    };
    core.mount(inner,m,"desktop",{editor:true,scope:"about"});
    const single=inner.querySelectorAll('[data-bali-builder-id="bali-about-demo"]').length===1;
    inner.__baliBuilderRestore();
    document.__baliBuilderRestore();
    return {...before,single,restored:heading.textContent===original};
  });
  expect(actual.isolated).toBe(true);
  expect(actual.visible).toBe(true);
  expect(actual.fontSize).toBe("31px");
  expect(actual.effect).toBe("hover-lift");
  expect(actual.text).toContain("Новый заголовок");
  expect(actual.single).toBe(true);
  expect(actual.restored).toBe(true);
});


test("advanced responsive layout controls are opt-in and revert cleanly",async({page})=>{
 await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>Boolean(window.BaliBuilderCore));
 const result=await page.evaluate(()=>{
  const core=window.BaliBuilderCore,model=core.emptyModel();
  const element=document.getElementById("baliMenuHeading");
  model.desktop.rules["#baliMenuHeading"]={props:{
   width:"75%",maxWidth:"550px",marginTop:18,marginBottom:4,gap:12,
   fontSize:26,fontWeight:"600",fontStyle:"italic",textTransform:"uppercase",
   backgroundPosition:"top",objectFit:"contain",animation:"float"
  }};
  core.mount(document,model,"desktop",{editor:true});
  const props=["width","max-width","margin-top","margin-bottom","gap","text-transform","object-fit","background-position"];
  const values=Object.fromEntries(props.map(key=>[key,element.style.getPropertyValue(key)]));
  const bad=core.sanitizeProps({display:"expression(alert(1))",objectFit:"bad",gap:99999,
   maxWidth:"javascript:alert(1)",marginLeft:-999999});
  document.__baliBuilderRestore();
  const clean=props.every(key=>!element.style.getPropertyValue(key));
  return {values,bad,clean};
 });
 expect(result.values.width).toBe("75%");
 expect(result.values["max-width"]).toBe("550px");
 expect(result.values["margin-top"]).toBe("18px");
 expect(result.values.gap).toBe("12px");
 expect(result.values["text-transform"]).toBe("uppercase");
 expect(result.values["object-fit"]).toBe("contain");
 expect(result.values["background-position"]).toBe("center top");
 expect(result.bad.display).toBeUndefined();
 expect(result.bad.objectFit).toBeUndefined();
 expect(result.bad.maxWidth).toBeUndefined();
 expect(result.bad.gap).toBe(3000);
 expect(result.bad.marginLeft).toBe(-2000);
 expect(result.clean).toBe(true);
});


test("builder movement never overwrites an existing transform-based animation",async({page})=>{
 await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>Boolean(window.BaliBuilderCore));
 const result=await page.evaluate(()=>{
  const core=window.BaliBuilderCore,model=core.emptyModel();
  const element=document.getElementById("baliMenuHeading");
  const originalTransform=element.style.transform;
  element.style.transform="rotateY(12deg)";
  model.desktop.rules["#baliMenuHeading"]={props:{translateX:24,translateY:9,rotate:5,scale:1.15}};
  core.mount(document,model,"desktop",{editor:true});
  const state={
   transform:element.style.transform,
   translate:element.style.translate,
   rotate:element.style.rotate,
   scale:element.style.scale
  };
  document.__baliBuilderRestore();
  const restored=element.style.transform==="rotateY(12deg)"&&!element.style.translate&&!element.style.rotate&&!element.style.scale;
  element.style.transform=originalTransform;
  return {...state,restored};
 });
 expect(result.transform).toBe("rotateY(12deg)");
 expect(result.translate).toBe("24px 9px");
 expect(result.rotate).toBe("5deg");
 expect(result.scale).toBe("1.15");
 expect(result.restored).toBe(true);
});


test("button links from embedded About navigate on the main site, not inside the iframe",async({page})=>{
 await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>Boolean(window.BaliBuilderCore));
 await page.locator("#baliAboutFrame").evaluate(el=>{el.loading="eager";});
 await page.waitForFunction(()=>Boolean(document.querySelector("#baliAboutFrame")?.contentDocument?.body));
 const actual=await page.evaluate(()=>{
  const nested=document.getElementById("baliAboutFrame").contentWindow;
  window.BaliBuilderCore.navigate(nested,"route:menu");
  return {
   parentPage:document.body.dataset.baliPage,
   nestedLocation:nested.location.pathname
  };
 });
 expect(actual.parentPage).toBe("menu");
 expect(actual.nestedLocation).toContain("about.html");
});


test("visual editor replaces active picture artwork and restores tablet/mobile source sets",async({page})=>{
 await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>Boolean(window.BaliBuilderCore));
 const result=await page.evaluate(()=>{
  const core=window.BaliBuilderCore,m=core.emptyModel();
  const picture=document.createElement("picture");
  const source=document.createElement("source");
  const image=document.createElement("img");
  const wrapper=document.createElement("div");
  const original="https://example.com/previous.webp",replacement="https://example.com/new-poster.webp";
  wrapper.id="baliBuilderPictureTestWrap";image.id="baliBuilderPictureTestImage";
  source.media="(max-width:767px)";source.setAttribute("srcset",original);
  image.setAttribute("src","https://example.com/original.webp");
  picture.append(source,image);wrapper.append(picture);
  document.getElementById("homeSection").append(wrapper);
  m.desktop.rules["#baliBuilderPictureTestImage"]={props:{image:replacement}};
  m.desktop.rules["#baliBuilderPictureTestWrap"]={props:{backgroundPosition:"top",image:replacement}};
  core.mount(document,m,"desktop",{editor:true});
  const applied={
   src:image.getAttribute("src"),srcset:source.getAttribute("srcset"),
   backgroundPosition:wrapper.style.backgroundPosition
  };
  document.__baliBuilderRestore();
  const restored={
   src:image.getAttribute("src"),srcset:source.getAttribute("srcset"),
   backgroundImage:wrapper.style.backgroundImage
  };
  wrapper.remove();return{applied,restored};
 });
 expect(result.applied.src).toBe("https://example.com/new-poster.webp");
 expect(result.applied.srcset).toBe("https://example.com/new-poster.webp");
 expect(result.applied.backgroundPosition).toContain("top");
 expect(result.restored.src).toBe("https://example.com/original.webp");
 expect(result.restored.srcset).toBe("https://example.com/previous.webp");
 expect(result.restored.backgroundImage).toBe("");
});


test("unfinished uploaded-photo slots stay visible to editors but hidden from visitors",async({page})=>{
 await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>Boolean(window.BaliBuilderCore));
 const result=await page.evaluate(()=>{
  const core=window.BaliBuilderCore,m=core.emptyModel();
  m.desktop.blocks.push({id:"bali-empty-image-slot",page:"home",kind:"image",image:"",
   text:"",link:"route:home",x:12,y:50,props:{width:"230px",height:"160px"}});
  core.mount(document,m,"desktop",{editor:true});
  const editorSlot=document.querySelector('[data-bali-builder-id="bali-empty-image-slot"]');
  const editable=editorSlot?.tagName==="IMG"&&!editorSlot.hasAttribute("src");
  core.mount(document,m,"desktop",{editor:false});
  const hidden=document.querySelector('[data-bali-builder-id="bali-empty-image-slot"]')===null;
  document.__baliBuilderRestore();
  return {editable,hidden};
 });
 expect(result.editable).toBe(true);
 expect(result.hidden).toBe(true);
});


test("editing a button label keeps its icon and adjacent markup unchanged",async({page})=>{
 await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>Boolean(window.BaliBuilderCore));
 const result=await page.evaluate(()=>{
  const core=window.BaliBuilderCore,model=core.emptyModel();
  const button=document.createElement("button");
  button.id="baliBuilderIconTest";
  button.innerHTML='  <span class="icon" aria-hidden="true">✦</span> Исходная надпись';
  const before=button.innerHTML;
  document.getElementById("homeSection").append(button);
  model.desktop.rules["#baliBuilderIconTest"]={props:{fontWeight:"800"},text:" Новая надпись"};
  core.mount(document,model,"desktop",{editor:true});
  const applied={
   visible:button.textContent,
   icon:button.querySelector("span.icon")?.textContent,
   iconCount:button.querySelectorAll("span.icon").length,
   duplicates:button.textContent.includes("Исходная надпись")
  };
  document.__baliBuilderRestore();
  const restored=button.innerHTML===before;
  button.remove();
  return {applied,restored};
 });
 expect(result.applied.visible).toContain("Новая надпись");
 expect(result.applied.icon).toBe("✦");
 expect(result.applied.iconCount).toBe(1);
 expect(result.applied.duplicates).toBe(false);
 expect(result.restored).toBe(true);
});


test("full-width mobile banner can use manual crop, aspect and safe layer controls",async({page})=>{
 await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>Boolean(window.BaliBuilderCore));
 const result=await page.evaluate(()=>{
  const core=window.BaliBuilderCore,model=core.emptyModel();
  const div=document.createElement("div");div.id="baliBuilderCoverTest";
  document.getElementById("homeSection").append(div);
  model.phone.rules["#baliBuilderCoverTest"]={props:{
   width:"100%",minHeight:"240px",aspectRatio:"16 / 9",
   image:"https://example.com/event-banner.webp",backgroundSize:"100% 100%",
   backgroundPosition:"top",overflow:"hidden",zIndex:5
  }};
  core.mount(document,model,"phone",{editor:true});
  const applied={
   size:div.style.backgroundSize,position:div.style.backgroundPosition,
   aspect:div.style.aspectRatio,overflow:div.style.overflow,
   zIndex:div.style.zIndex,width:div.style.width
  };
  document.__baliBuilderRestore();
  const restored=!div.style.backgroundImage&&!div.style.aspectRatio&&!div.style.zIndex;
  div.remove();
  const denied=core.sanitizeProps({
   backgroundSize:"url(javascript:alert(1))",aspectRatio:"11 / 0",
   zIndex:99999,overflow:"url(alert(1))"
  });
  return {applied,restored,denied};
 });
 expect(result.applied.size).toBe("100% 100%");
 expect(result.applied.position).toContain("top");
 expect(result.applied.aspect).toBe("16 / 9");
 expect(result.applied.overflow).toBe("hidden");
 expect(result.applied.zIndex).toBe("5");
 expect(result.applied.width).toBe("100%");
 expect(result.restored).toBe(true);
 expect(result.denied.backgroundSize).toBeUndefined();
 expect(result.denied.aspectRatio).toBeUndefined();
 expect(result.denied.overflow).toBeUndefined();
 expect(result.denied.zIndex).toBe(100);
});

test("homepage composer adds content into existing cards without resizing the grid",async({page})=>{
 await page.goto("/index.html?bali-admin-design-preview=1",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>Boolean(window.BaliBuilderCore&&window.BaliIconAtelier));
 const result=await page.evaluate(()=>{
  const core=window.BaliBuilderCore,model=core.emptyModel();
  const nav=document.querySelector('.bali-pc-navigation [data-bali-nav="events"]');
  const bottom=document.querySelector('.bali-bottom-nav [data-bali-nav="events"]');
  const card=document.querySelector(".bali-pc-about");
  const originalNav=nav.textContent,originalBottom=bottom.querySelector("small").textContent;
  const initialStyle={width:card.style.width,height:card.style.height};
  model.desktop.rules[core.selectorFor(nav)]={props:{iconName:"star"},text:"АФИША"};
  model.phone.rules[core.selectorFor(bottom)]={props:{iconName:"calendar-heart"},text:"СОБЫТИЯ"};
  model.desktop.blocks.push({
   id:"bali-home-overlay-test",page:"home",kind:"text",anchor:core.selectorFor(card),
   text:"Новый текст",link:"route:home",x:10,y:16,props:{fontSize:19,width:"160px"}
  });
  const sanitized=core.cleanModel(model);
  core.mount(document,model,"desktop",{editor:true});
  const pc={
   label:nav.textContent,
   icon:nav.querySelector(".bali-builder-custom-art")?.tagName,
   anchored:card.querySelector('[data-bali-builder-id="bali-home-overlay-test"]')?.textContent,
   unchangedSize:card.style.width===initialStyle.width&&card.style.height===initialStyle.height,
   anchorSaved:sanitized.desktop.blocks[0].anchor===core.selectorFor(card)
  };
  core.mount(document,model,"phone",{editor:true});
  const phone={text:bottom.querySelector("small")?.textContent,icon:bottom.querySelector(".bali-builder-custom-art")?.tagName};
  document.__baliBuilderRestore();
  return {pc,phone,restored:nav.textContent===originalNav&&bottom.querySelector("small").textContent===originalBottom&&!card.querySelector('[data-bali-builder-id="bali-home-overlay-test"]')};
 });
 expect(result.pc.anchored).toBe("Новый текст");
 expect(result.pc.label).toContain("АФИША");
 expect(result.pc.icon).toBe("svg");
 expect(result.pc.unchangedSize).toBe(true);
 expect(result.pc.anchorSaved).toBe(true);
 expect(result.phone.text).toBe("СОБЫТИЯ");
 expect(result.phone.icon).toBe("svg");
 expect(result.restored).toBe(true);
});
