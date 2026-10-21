const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{
  // Exercise the real page router with an already accepted fixture account.
  await page.addInitScript(()=>{window.BaliIdOnboarding={isAccepted:()=>true,open:async()=>true}});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('/index.html');
  await page.evaluate(()=>{
    navigateGuestPage('profile');
    document.getElementById('profileSection').hidden=true;
    navigateGuestPage('id');
    document.getElementById('baliIdFlipScene').dataset.baliLoading='false';
    document.body.dataset.baliPage='id';
  });
});

test('grabbing a partially rotated card preserves its visible orientation',async({page})=>{
  const angles=await page.evaluate(()=>{
    const track=document.getElementById('baliIdFlipTrack');
    const scene=document.getElementById('baliIdFlipScene');
    track.style.transition='none';
    track.style.transform='rotateY(63deg)';
    const angle=()=>{
      const m=new DOMMatrixReadOnly(getComputedStyle(track).transform);
      return Math.atan2(-m.m13,m.m11)*180/Math.PI;
    };
    const before=angle();
    scene.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,
      pointerType:'touch',pointerId:71,button:0,clientX:100,clientY:200}));
    return {before,after:angle()};
  });
  expect(angles.before).toBeCloseTo(63,2);
  expect(angles.after).toBeCloseTo(angles.before,2);
});

test('lost pointer capture releases the card and permits another interaction',async({page})=>{
  const state=await page.evaluate(()=>{
    const scene=document.getElementById('baliIdFlipScene');
    const fire=type=>scene.dispatchEvent(new PointerEvent(type,{bubbles:true,isPrimary:true,
      pointerType:'touch',pointerId:72,button:0,clientX:100,clientY:200}));
    fire('pointerdown');fire('lostpointercapture');
    return window.BaliIdMotion.getState();
  });
  expect(state.dragging).toBe(false);
});

test('reduced motion keeps drag feedback static while retaining swipe navigation',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const state=await page.evaluate(()=>{
    const scene=document.getElementById('baliIdFlipScene');
    const track=document.getElementById('baliIdFlipTrack');
    const fire=(type,x)=>scene.dispatchEvent(new PointerEvent(type,{bubbles:true,isPrimary:true,
      pointerType:'touch',pointerId:73,button:0,clientX:x,clientY:200}));
    fire('pointerdown',100);
    const before=track.style.transform;
    fire('pointermove',180);
    const during=track.style.transform;
    fire('pointerup',180);
    return {before,during,...window.BaliIdMotion.getState(),animations:track.getAnimations().length};
  });
  expect(state.during).toBe(state.before);
  expect(state.flipped).toBe(true);
  expect(state.animations).toBe(0);
});
