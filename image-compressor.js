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
    "design-hero":{ratio:8/3,maxChars:155000,widths:[1280,1120,960,800,640]},
    "design-about":{ratio:1,maxChars:125000,widths:[850,720,600,480,400]},
    "design-merch":{ratio:3/2,maxChars:125000,widths:[1000,850,720,600,480]}
  };
  const design=designPresets[kind];
  const maxChars=design?.maxChars||(poster?145000:90000);
  const ratio=design?.ratio||(poster?4/5:1);
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
    ctx.drawImage(image,sx,sy,cropWidth,cropHeight,0,0,canvas.width,canvas.height);
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
