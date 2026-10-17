/* BALI Home Design image variants. Each editable card may have tablet/mobile art.
   Empty variants fall back to the primary desktop image on the guest website. */
import {compressImage} from "./image-compressor.js?v=20261017-79";
const el=id=>document.getElementById(id);
export function makeImageVariants(prefix,kind,notify=()=>{}){
  const variants={};
  for(const [key,label,suffix] of [["Tablet","Планшет","tablet"],["Mobile","Телефон","mobile"]]){
    const root=prefix+key;
    const file=el(root+"File"),url=el(root+"ImageUrl"),preview=el(root+"Preview"),remove=el(root+"RemoveImage");
    if(!file||!url||!preview||!remove)throw new Error("Не найден блок изображения "+root);
    let local="",seq=0,busy=false;
    const max=kind==="design-hero"?155000:125000;
    const valid=x=>!x||(x.startsWith("https://")&&x.length<=2048)||
      (x.startsWith("data:image/webp;base64,")&&x.length<=max);
    const draw=value=>{
      preview.replaceChildren();
      if(value&&valid(value)){
        const img=document.createElement("img");img.src=value;img.alt="Предпросмотр: "+label;
        preview.append(img);
      }else{
        const placeholder=document.createElement("span");
        placeholder.textContent="Фото: "+label;preview.append(placeholder);
      }
    };
    function set(value=""){
      seq++;busy=false;local="";
      const next=typeof value==="string"&&valid(value)?value:"";
      if(next.startsWith("data:image/webp;base64,"))local=next;
      url.value=next.startsWith("https://")?next:"";
      file.value="";
      draw(next);
    }
    file.addEventListener("change",async()=>{
      const f=file.files?.[0];if(!f)return;
      const token=++seq;busy=true;notify("Обрабатываем фотографию: "+label+"…");
      try{
        const value=await compressImage(f,kind+"-"+suffix);
        if(token!==seq)return;
        local=value;url.value="";draw(value);
        notify("Версия «"+label+"» готова. Нажмите «Сохранить».");
      }catch(error){
        if(token===seq)notify(error.message||"Не удалось прочитать фотографию.");
      }finally{if(token===seq)busy=false;}
    });
    url.addEventListener("input",()=>{
      seq++;busy=false;local="";file.value="";
      draw(url.value.trim());
    });
    remove.addEventListener("click",()=>{set("");notify("Версия «"+label+"» очищена в форме.");});
    set("");
    variants[key.toLowerCase()]={set,read:()=>local||url.value.trim(),busy:()=>busy,valid};
  }
  return {
    set:(data={})=>{
      variants.tablet.set(data.tablet||"");
      variants.mobile.set(data.mobile||"");
    },
    read:()=>({tablet:variants.tablet.read(),mobile:variants.mobile.read()}),
    busy:()=>variants.tablet.busy()||variants.mobile.busy(),
    valid:()=>Object.values(variants).every(v=>v.valid(v.read()))
  };
}
