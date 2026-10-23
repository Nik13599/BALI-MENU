const {test,expect}=require('@playwright/test');

// One browser visits a matrix of actual CSS viewport sizes rather than relying
// only on four named Playwright device projects. External Firebase traffic is
// intentionally blocked; this is a geometry/release regression, not a wallet test.
test('BALI static screens remain viewport-bound from small phones to wide PC',async({page},info)=>{
  test.skip(info.project.name!=='phone','The viewport matrix runs once per CI build');
  test.setTimeout(150000);
  await page.route('**/*',r=>
    new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('/index.html');
  const sizes=[
    [320,568],[360,640],[375,667],[390,844],[414,896],
    [540,720],[768,1024],[820,1180],[1024,768],
    [1280,720],[1440,900],[1920,1080]
  ];
  for(const [width,height] of sizes){
    await page.setViewportSize({width,height});
    for(const section of ['home','profile','id']){
      await page.evaluate(name=>{
        navigateGuestPage(name);
        document.body.dataset.baliPage=name;
      },section);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const state=await page.evaluate(name=>{
        const root=document.scrollingElement||document.documentElement;
        const id={home:'homeSection',profile:'profileSection',id:'baliIdSection'}[name];
        const main=document.getElementById(id);
        const r=main.getBoundingClientRect();
        const visible=element=>{
          const b=element.getBoundingClientRect();
          const s=getComputedStyle(element);
          return s.display!=='none'&&s.visibility!=='hidden'&&b.width>0&&b.height>0;
        };
        const important=name==='profile'?
          [...main.querySelectorAll('.bali-profile-action')].filter(visible):
          name==='id'?
          ['baliShowQr','baliIdHistoryOpen','baliIdPayOpen','baliIdTopupOpen','baliIdTransferOpen']
            .map(key=>document.getElementById(key)).filter(x=>x&&visible(x)):
          [];
        return {
          width:innerWidth,height:innerHeight,
          scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight,
          rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},
          important:important.map(x=>{
            const b=x.getBoundingClientRect();
            return {id:x.id||x.textContent?.trim().slice(0,35),left:b.left,right:b.right,top:b.top,bottom:b.bottom};
          })
        };
      },section);
      expect(state.scrollWidth,section+' horizontal root overflow at '+width+'x'+height)
        .toBeLessThanOrEqual(width+3);
      expect(state.scrollHeight,section+' scrolls vertically at '+width+'x'+height)
        .toBeLessThanOrEqual(height+4);
      for(const element of state.important){
        expect(element.left,section+' '+element.id+' left at '+width+'x'+height).toBeGreaterThanOrEqual(-2);
        expect(element.right,section+' '+element.id+' right at '+width+'x'+height).toBeLessThanOrEqual(width+2);
        expect(element.top,section+' '+element.id+' top at '+width+'x'+height).toBeGreaterThanOrEqual(-2);
        expect(element.bottom,section+' '+element.id+' bottom at '+width+'x'+height).toBeLessThanOrEqual(height+2);
      }
    }
  }
});

test('BALI working sections remain horizontally contained on narrow phones',async({page},info)=>{
  test.skip(info.project.name!=='phone','The matrix is intentionally single-project');
  test.setTimeout(90000);
  await page.route('**/*',r=>
    new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('/index.html');
  for(const [width,height] of [[320,568],[360,640],[390,844],[540,720],[768,1024],[1024,768]]){
    await page.setViewportSize({width,height});
    for(const screen of ['events','menu','contacts']){
      await page.evaluate(key=>navigateGuestPage(key),screen);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
      const x=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.scrollingElement.scrollWidth}));
      expect(x.scrollWidth,screen+' horizontal overflow at '+width+'x'+height).toBeLessThanOrEqual(width+3);
    }
  }
});
