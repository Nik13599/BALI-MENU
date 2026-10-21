/* BALI Share · real event card -> vertical 1080×1920 story artwork.
   Everything is rendered locally. Never changes source posters or Firebase. */
(()=>{
  "use strict";
  const WIDTH=1080,HEIGHT=1920;
  let target=null,lastBlob=null,lastName="bali-story.png";
  const modal=document.createElement("dialog");modal.className="bali-share-dialog";modal.id="baliShareDialog";
  modal.innerHTML='<div class="bali-share-window"><div class="bali-share-title"><strong>BALI SHARE · STORIES</strong><button type="button" data-share-close aria-label="Закрыть">✕</button></div><p class="bali-share-status" aria-live="polite">Готовим вашу сторис…</p><img class="bali-share-preview" alt="Готовая сторис с афишей BALI" hidden><div class="bali-share-actions"><button type="button" data-share-native>Поделиться</button><button type="button" data-share-download>Скачать PNG</button></div></div>';
  document.body.append(modal);
  const $=selector=>modal.querySelector(selector);
  const status=$(".bali-share-status"),preview=$(".bali-share-preview");
  const close=()=>{if(modal.open)modal.close();};
  $("[data-share-close]").addEventListener("click",close);
  modal.addEventListener("click",e=>{if(e.target===modal)close();});
  function getData(card){
    const date=card.dataset.eventDate||"";
    const img=card.querySelector(".event-poster,.bali-home-poster-wrap img");
    const title=card.querySelector(".bali-event-info h3,.event-card-body h3,.bali-home-event-info h3")?.textContent||"BALI NIGHT";
    return {date,title,src:img?.currentSrc||img?.src||""};
  }
  function attach(){
    for(const card of document.querySelectorAll("#eventsGrid .event-card")){
      const actions=card.querySelector(".bali-event-actions");
      if(!actions||["past","live"].includes(card.dataset.eventStatus)||actions.querySelector(".bali-share-trigger"))continue;
      const button=document.createElement("button");
      button.type="button";button.className="bali-share-trigger";
      button.setAttribute("aria-label","Создать сторис с афишей "+(card.querySelector("h3")?.textContent||"BALI"));
      button.innerHTML='<svg class="bali-event-action-icon bali-share-plane" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3 3.7 10.4a1 1 0 0 0 .08 1.86l6.6 2.3 2.3 6.6a1 1 0 0 0 1.86.08L21 3ZM10.4 14.6 21 3"/></svg><span class="bali-event-action-text">Поделиться</span>';
      button.addEventListener("click",event=>{
        event.preventDefault();event.stopPropagation();void start(getData(card));
      });
      actions.append(button);
    }
  }
  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.addedNodes.length))attach();
  });
  for(const root of [document.getElementById("eventsGrid")]){
    if(root)observer.observe(root,{childList:true});
  }
  attach();
  function load(src){
    return new Promise(resolve=>{
      if(!src)return resolve(null);
      const img=new Image();img.crossOrigin="anonymous";
      img.onload=()=>resolve(img);img.onerror=()=>resolve(null);
      img.src=src;
    });
  }
  const cover=(ctx,img,x,y,w,h)=>{
    const scale=Math.max(w/img.width,h/img.height);
    const sw=w/scale,sh=h/scale;
    ctx.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,x,y,w,h);
  };
  const contain=(ctx,img,x,y,w,h)=>{
    const scale=Math.min(w/img.width,h/img.height),dw=img.width*scale,dh=img.height*scale;
    ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
  };
  function lines(ctx,text,maxWidth,maxLines=3){
    const words=String(text).split(/\s+/),result=[];let line="";
    for(const word of words){
      const next=line?line+" "+word:word;
      if(ctx.measureText(next).width>maxWidth&&line){result.push(line);line=word;}
      else line=next;
    }
    if(line)result.push(line);
    return result.slice(0,maxLines);
  }
  async function generate(data){
    const canvas=document.createElement("canvas");canvas.width=WIDTH;canvas.height=HEIGHT;
    const ctx=canvas.getContext("2d",{alpha:false});
    const fill=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);fill.addColorStop(0,"#121d19");fill.addColorStop(.55,"#050809");fill.addColorStop(1,"#17231b");
    ctx.fillStyle=fill;ctx.fillRect(0,0,WIDTH,HEIGHT);
    // subtle club rings and atmosphere
    ctx.strokeStyle="rgba(185,255,81,.12)";ctx.lineWidth=2;
    for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(940,1450,175+i*108,0,Math.PI*2);ctx.stroke();}
    const poster=await load(data.src);
    if(poster){
      ctx.fillStyle="#121515";ctx.fillRect(72,285,936,1190);
      // Keep original poster entirely visible (no text cropped).
      contain(ctx,poster,72,285,936,1190);
    }
    const shade=ctx.createLinearGradient(0,1160,0,1800);shade.addColorStop(0,"transparent");shade.addColorStop(1,"rgba(2,5,4,.95)");
    ctx.fillStyle=shade;ctx.fillRect(0,1120,WIDTH,690);
    const logo=await load("assets/bali-nightclub-logo.png");
    if(logo)contain(ctx,logo,66,45,355,142);
    else{ctx.fillStyle="#fff";ctx.font="900 104px Arial";ctx.fillText("BALI",72,155);}
    ctx.fillStyle="#b9ff51";ctx.font="800 30px Arial";ctx.letterSpacing="8px";ctx.fillText("BALI SHARE · ТВОЙ ВЕЧЕР",72,242);
    ctx.fillStyle="#fff";ctx.font="900 70px Arial";
    let yy=1560;for(const line of lines(ctx,data.title.toUpperCase(),940,3)){ctx.fillText(line,72,yy);yy+=84;}
    let formatted=data.date;
    try{formatted=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Minsk"}).format(new Date(data.date+"T12:00:00+03:00"));}catch{}
    ctx.fillStyle="#b9ff51";ctx.font="750 43px Arial";ctx.fillText(formatted.toUpperCase(),72,Math.max(1727,yy+16));
    const guestName=window.BaliAuth?.getProfile?.()?.name?.trim()?.split(" ")?.[0]||"";
    const guestLabel=guestName?("Я, "+guestName.slice(0,24)+", ХОЧУ ПОЙТИ"):"Я ХОЧУ ПОЙТИ";
    ctx.fillStyle="#dfe6e0";ctx.font="500 31px Arial";ctx.fillText(guestLabel+" · BALI",72,1800);
    ctx.fillStyle="#fff";ctx.font="600 26px Arial";ctx.fillText("nik13599.github.io/BALI-MENU/",72,1860);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("Ошибка создания PNG")),"image/png"));
  }
  async function start(data){
    target=data;lastBlob=null;preview.hidden=true;status.textContent="Создаём вертикальную афишу 1080 × 1920…";
    $("[data-share-native]").disabled=true;$("[data-share-download]").disabled=true;
    if(!modal.open)modal.showModal();
    try{
      lastBlob=await generate(data);
      lastName="BALI-"+data.date+"-story.png";
      preview.src=URL.createObjectURL(lastBlob);preview.hidden=false;
      status.textContent="Сторис готова · 1080 × 1920 px";
      $("[data-share-native]").disabled=false;$("[data-share-download]").disabled=false;
    }catch(err){
      status.textContent="Не удалось обработать исходную афишу. "+(err.message||"Попробуйте снова.");
    }
  }
  const download=()=>{
    if(!lastBlob)return;
    const url=URL.createObjectURL(lastBlob),a=document.createElement("a");
    a.href=url;a.download=lastName;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  };
  $("[data-share-download]").addEventListener("click",download);
  $("[data-share-native]").addEventListener("click",async()=>{
    if(!lastBlob)return;
    const file=new File([lastBlob],lastName,{type:"image/png"});
    try{
      if(navigator.share&&navigator.canShare?.({files:[file]}))
        await navigator.share({files:[file],title:"BALI Share",text:target.title});
      else download();
    }catch(err){if(err.name!=="AbortError")download();}
  });
  window.BaliShare={open:start};
})();
