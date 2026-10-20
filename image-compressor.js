/**
 * Free-tier image import for BALI.
 * All images are compressed locally to WebP data URIs and stored in the
 * corresponding admin-only-written Firestore document. No API key or
 * third-party image host is required; keep photos small due to Firestore limits.
 */
export async function compressImage(file,kind="product") {
  if(!(file instanceof Blob)||!file.type.startsWith("image/"))
    throw new Error("Выберите изображение JPG, PNG, HEIC или WebP.");
  if(file.size > 15*1024*1024)
    throw new Error("Файл слишком большой. Максимум 15 МБ.");
  const poster=kind==="poster";
  const designPresets={
    "design-icon":{ratio:1,maxChars:24000,widths:[160,128,96,80,64]},
    "design-placeholder":{ratio:3/4,maxChars:120000,widths:[720,600,520,440,360]},
    "menu-detail":{ratio:4/3,maxChars:95000,widths:[720,600,480,380,300]},
    "design-hero":{ratio:8/3,maxChars:155000,widths:[1280,1120,960,800,640]},
    "design-hero-tablet":{ratio:16/9,maxChars:155000,widths:[1050,900,760,640,520]},
    "design-hero-mobile":{ratio:3/4,maxChars:155000,widths:[600,520,440,360,300]},
    "design-about":{ratio:9/14,maxChars:125000,widths:[630,550,470,390,320]},
    "design-about-tablet":{ratio:4/3,maxChars:125000,widths:[850,720,600,480,400]},
    "design-about-mobile":{ratio:3/4,maxChars:125000,widths:[600,520,440,360,300]},
    "design-mobile-about-hero":{ratio:2,maxChars:120000,widths:[960,840,720,600,480]},
    "design-merch":{ratio:3/2,maxChars:125000,widths:[1000,850,720,600,480]},
    "design-merch-tablet":{ratio:1,maxChars:125000,widths:[780,650,550,450,350]},
    "design-merch-mobile":{ratio:4/5,maxChars:125000,widths:[560,480,400,340,280]}
  };
  const design=designPresets[kind];
  const maxChars=design?.maxChars||(poster?145000:90000);
  let ratio=design?.ratio||(poster?4/5:1);
  const url=URL.createObjectURL(file);
  let image;
  try {
    image = await new Promise((resolve,reject)=>{
      const el=new Image();
      el.onload=()=>resolve(el);
      el.onerror=()=>reject(new Error("Не удалось прочитать изображение. Попробуйте JPG или PNG."));
      el.src=url;
    });
  }finally{URL.revokeObjectURL(url);}
  const iw=image.naturalWidth,ih=image.naturalHeight;
  if(!iw||!ih)throw new Error("У изображения нет доступных размеров.");
  // Do not add black letterbox bands inside a designer-prepared Privilege banner.
  // Use its native aspect. The website will display the whole image (contain),
  // and the admin live preview reports the exact target dimensions to designers.
  if(kind==="design-hero"||kind.startsWith("design-hero-"))ratio=iw/ih;
  // Product images are centered square, event posters 4:5; homepage artwork uses designer-sized ratios.
  let cropWidth,cropHeight;
  if(iw/ih > ratio){cropHeight=ih;cropWidth=ih*ratio;}
  else{cropWidth=iw;cropHeight=iw/ratio;}
  const sx=(iw-cropWidth)/2,sy=(ih-cropHeight)/2;
  let result="";
  const bases=design?.widths||(poster?[640,560,480,400,320]:[560,480,400,320,256]);
  for(const width of bases){
    const canvas=document.createElement("canvas");
    canvas.width=width;
    canvas.height=Math.round(width/ratio);
    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx)throw new Error("Браузер не смог обработать фотографию.");
    if(design&&kind!=="design-icon"&&kind!=="design-mobile-about-hero"){
      // Creative posters can contain essential text and logos near the edges.
      // Fit all their pixels into the target aspect ratio instead of cropping.
      const scale=Math.min(canvas.width/iw,canvas.height/ih);
      const drawWidth=iw*scale,drawHeight=ih*scale;
      ctx.fillStyle="#080b10";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,iw,ih,
        (canvas.width-drawWidth)/2,(canvas.height-drawHeight)/2,drawWidth,drawHeight);
    }else{
      ctx.drawImage(image,sx,sy,cropWidth,cropHeight,0,0,canvas.width,canvas.height);
    }
    for(const quality of [.82,.68,.52,.38]){
      const encoded=canvas.toDataURL("image/webp",quality);
      if(!encoded.startsWith("data:image/webp;base64,"))
        throw new Error("Браузер не поддерживает обработку WebP. Попробуйте обновить браузер.");
      if(encoded.length <= maxChars){result=encoded;break;}
    }
    if(result)break;
  }
  if(!result)throw new Error("Не удалось сжать фото до безопасного размера. Выберите другое изображение.");
  return result;
}

/** Upload mode is explicit: no silent fallback when a configured bucket fails. */
export async function prepareImage(file,kind="product") {
  const encoded=await compressImage(file,kind);
  if(window.BALI_IMAGE_STORAGE_ENABLED!==true)return encoded;
  const [{getApp},{getAuth},{getStorage,ref,getMetadata,getDownloadURL,uploadBytes}]=await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js")
  ]);
  const app=getApp(),user=getAuth(app).currentUser;
  if(!user?.emailVerified)throw new Error("Войдите в аккаунт администратора перед загрузкой.");
  const blob=await (await fetch(encoded)).blob();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  if(!/^[a-z-]{1,40}$/.test(kind))throw new Error("Неизвестный тип изображения.");
  const target=ref(getStorage(app),`public/${user.uid}/${kind}/${hash}.webp`);
  try{
    let exists=false;
    try{await getMetadata(target);exists=true;}catch(error){if(error.code!=="storage/object-not-found")throw error;}
    if(!exists)await uploadBytes(target,blob,{contentType:'image/webp',cacheControl:'public,max-age=31536000,immutable'});
    window.BaliMonitor?.ok("image-storage");
    return await getDownloadURL(target);
  }catch(error){window.BaliMonitor?.report("image-storage",error);throw new Error("Не удалось загрузить фото в хранилище. Проверьте подключение и права Storage; изображение не опубликовано.");}
}
