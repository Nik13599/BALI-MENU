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
 expect(result.values["background-position"]).toBe("top");
 expect(result.bad.display).toBeUndefined();
 expect(result.bad.objectFit).toBeUndefined();
 expect(result.bad.maxWidth).toBeUndefined();
 expect(result.bad.gap).toBe(3000);
 expect(result.bad.marginLeft).toBe(-2000);
 expect(result.clean).toBe(true);
});
