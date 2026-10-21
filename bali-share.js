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
    const timeLabel=card.querySelector(".bali-event-hours")?.textContent||"";
    const startTime=/\b(?:[01]\d|2[0-3]):[0-5]\d\b/.exec(timeLabel)?.[0]||"";
    return {date,title,startTime,src:img?.currentSrc||img?.src||""};
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
    if(!ctx)throw Error("Ваш браузер не поддерживает экспорт сторис.");
    // Instagram Stories, 9:16. No decorative text, URLs or dummy comments.
    ctx.fillStyle="#050505";ctx.fillRect(0,0,WIDTH,HEIGHT);
    const poster=await load(data.src);
    if(!poster)throw Error("Не удалось загрузить афишу для сторис.");
    const logo=await load("assets/bali-nightclub-logo.png");
    if(logo)contain(ctx,logo,230,115,620,222);
    else{
      ctx.fillStyle="#fff";ctx.font="900 128px Arial";
      ctx.textAlign="center";ctx.fillText("BALI",WIDTH/2,260);
    }
    ctx.fillStyle="#101010";ctx.fillRect(92,408,896,896);
    cover(ctx,poster,100,416,880,880); // exact 1:1 square
    ctx.textAlign="center";
    ctx.fillStyle="#fff";
    ctx.font="800 65px Arial";
    let titleLines=lines(ctx,String(data.title||"BALI NIGHT CLUB").toUpperCase(),930,3);
    let yy=1410;
    for(const line of titleLines){ctx.fillText(line,WIDTH/2,yy,920);yy+=76;}
    let formatted="";
    if(/^\d{4}-\d{2}-\d{2}$/.test(data.date||"")){
      formatted=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(data.date+"T12:00:00Z"));
    }
    ctx.fillStyle="#d7ff9f";ctx.font="700 41px Arial";
    ctx.fillText(formatted.toUpperCase(),WIDTH/2,1682,930);
    ctx.fillStyle="#fff";ctx.font="650 43px Arial";
    ctx.fillText(data.startTime?("НАЧАЛО · "+data.startTime):"ВРЕМЯ УТОЧНЯЕТСЯ",WIDTH/2,1758,930);
    ctx.fillStyle="#f1f1f1";ctx.font="600 39px Arial";
    ctx.fillText("Я хочу пойти в Бали",WIDTH/2,1860,950);
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
  window.BaliShare={open:start,openForCard:card=>start(getData(card))};
})();
