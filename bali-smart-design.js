/* Smart Design · non-destructive local previews and opt-in crop for admin images.
   Capture the file before the existing uploader does; resume its original
   change handler only after "keep original" or "crop" is chosen. */
(()=>{
  "use strict";
  const rules=[
    [/^eventPosterFile$/,{label:"Афиша мероприятия",ratio:4/5}],
    [/^baliPromoImageFile$/,{label:"BALI PRIVILEGE · ПК",ratio:8/3}],
    [/^baliPromoTabletFile$/,{label:"BALI PRIVILEGE · планшет",ratio:16/9}],
    [/^baliPromoMobileFile$/,{label:"BALI PRIVILEGE · телефон",ratio:3/4}],
    [/^baliHomeAbout(?:Tablet|Mobile)?File$/,{label:"О клубе",ratio:9/14}],
    [/^baliHomeMerch(?:Tablet|Mobile)?File$/,{label:"BALI MERCH",ratio:3/2}],
    [/^baliHome.*ImageFile$/,{label:"Дизайн главной",ratio:3/2}],
    [/^baliEventPlaceholderImageFile$/,{label:"Афиша-заглушка",ratio:3/4}]
  ];
  const allow=new WeakSet();
  const dialog=document.createElement("dialog");dialog.className="bali-smart-dialog";
  dialog.innerHTML='<div class="bali-smart-shell"><header><strong>SMART DESIGN · ПРОВЕРКА ИЗОБРАЖЕНИЯ</strong><button type="button" data-smart-cancel aria-label="Отмена">✕</button></header><p class="bali-smart-status"></p><div class="bali-smart-previews"></div><label class="bali-smart-range">Позиция кадра по горизонтали <input data-crop-x type="range" min="0" max="100" value="50"></label><label class="bali-smart-range">Позиция по вертикали <input data-crop-y type="range" min="0" max="100" value="50"></label><div class="bali-smart-actions"><button type="button" data-smart-original>Оставить оригинал</button><button type="button" data-smart-crop>Обрезать по формату</button></div></div>';
  document.body.append(dialog);
  const $=q=>dialog.querySelector(q);let context=null;
  let objectUrl="";
  function tidy(){
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl="";}
  }
  function resume(file){
    if(!context)return;
    const input=context.input;context=null;tidy();
    try{
      const files=new DataTransfer();files.items.add(file);input.files=files.files;
      allow.add(input);
      input.dispatchEvent(new Event("change",{bubbles:true}));
    }catch(e){
      // When DataTransfer is unavailable, resume with the existing file as-is.
      allow.add(input);input.dispatchEvent(new Event("change",{bubbles:true}));
    }
    dialog.close();
  }
  function cancel(){context=null;tidy();if(dialog.open)dialog.close();}
  $("[data-smart-cancel]").addEventListener("click",cancel);
  dialog.addEventListener("cancel",event=>{event.preventDefault();cancel();});
  dialog.addEventListener("click",e=>{if(e.target===dialog)cancel();});
  $("[data-smart-original]").addEventListener("click",()=>context&&resume(context.file));
  const pos=()=>$("[data-crop-x]").value+"% "+$("[data-crop-y]").value+"%";
  function updatePosition(){
    for(const image of dialog.querySelectorAll(".bali-smart-device img"))image.style.objectPosition=pos();
  }
  for(const range of dialog.querySelectorAll('input[type="range"]'))range.addEventListener("input",updatePosition);
  function reportAndPreview(ctx){
    const data=ctx.image,aspect=data.naturalWidth/data.naturalHeight;
    const recommended=ctx.ratio;
    const deviation=Math.abs(aspect/recommended-1);
    $(".bali-smart-status").textContent=ctx.label+" · исходник "+data.naturalWidth+" × "+data.naturalHeight+
      " px · "+(deviation>.055?"Пропорции отличаются от целевого формата. Можно обрезать по желанию.":
      "Пропорции подходят. Обрезка необязательна.");
    const presets=[
      {name:"ПК",ratio:ctx.input.id==="baliPromoImageFile"?ctx.ratio:16/9,width:360},
      {name:"Планшет",ratio:ctx.input.id==="eventPosterFile"?4/5:4/3,width:300},
      {name:"Телефон",ratio:ctx.input.id==="eventPosterFile"?4/5:3/4,width:210}
    ];
    $(".bali-smart-previews").replaceChildren();
    for(const p of presets){
      const box=document.createElement("section");box.className="bali-smart-device";
      const caption=document.createElement("strong");
      caption.textContent=p.name+" · "+p.width+" × "+Math.round(p.width/p.ratio)+" px";
      const img=document.createElement("img");
      img.src=objectUrl;img.alt="Предпросмотр на "+p.name;img.style.aspectRatio=String(p.ratio);
      box.append(caption,img);$(".bali-smart-previews").append(box);
    }
    updatePosition();
  }
  $("[data-smart-crop]").addEventListener("click",async()=>{
    if(!context)return;
    const {image,ratio,file}=context;
    const originalWidth=image.naturalWidth,originalHeight=image.naturalHeight;
    const current=originalWidth/originalHeight;
    const srcWidth=current>ratio?originalHeight*ratio:originalWidth;
    const srcHeight=current>ratio?originalHeight:originalWidth/ratio;
    const x=(originalWidth-srcWidth)*(Number($("[data-crop-x]").value)/100);
    const y=(originalHeight-srcHeight)*(Number($("[data-crop-y]").value)/100);
    const canvas=document.createElement("canvas");
    canvas.width=Math.min(1600,Math.max(320,Math.round(srcWidth)));
    canvas.height=Math.round(canvas.width/ratio);
    canvas.getContext("2d").drawImage(image,x,y,srcWidth,srcHeight,0,0,canvas.width,canvas.height);
    const button=$("[data-smart-crop]");button.disabled=true;
    try{
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Ошибка обрезки")),"image/webp",.92));
      resume(new File([blob],file.name.replace(/\.[^.]+$/,"")+".webp",{type:"image/webp"}));
    }catch(err){$(".bali-smart-status").textContent=err.message||"Не удалось обрезать изображение.";}
    finally{button.disabled=false;}
  });
  document.addEventListener("change",event=>{
    const input=event.target;
    if(!(input instanceof HTMLInputElement)||input.type!=="file"||!input.files?.length)return;
    if(allow.has(input)){allow.delete(input);return;}
    const preset=rules.find(([pattern])=>pattern.test(input.id))?.[1];
    if(!preset)return;
    const file=input.files[0];if(!file.type.startsWith("image/"))return;
    event.stopImmediatePropagation();event.stopPropagation();
    if(context)cancel();
    const image=new Image();
    objectUrl=URL.createObjectURL(file);
    image.onload=()=>{
      let ratio=preset.ratio;
      if(input.id==="baliPromoImageFile"){
        const hero=document.getElementById("baliDesignLiveFrame")?.contentDocument?.querySelector(".bali-pc-hero");
        const bounds=hero?.getBoundingClientRect();
        if(bounds?.width>0&&bounds?.height>0)ratio=bounds.width/bounds.height;
      }
      context={input,file,image,ratio,label:preset.label};
      $("[data-crop-x]").value="50";$("[data-crop-y]").value="50";
      reportAndPreview(context);dialog.showModal();
    };
    image.onerror=()=>{tidy();allow.add(input);input.dispatchEvent(new Event("change",{bubbles:true}));};
    image.src=objectUrl;
  },true);
})();
