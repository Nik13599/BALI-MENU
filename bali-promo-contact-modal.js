/* Contact chooser for BALI promotional banners. Links are validated before rendering. */
(function(){
  const channels=[
    {key:"phone",title:"Позвонить",subtitle:"Звонок менеджеру BALI",mark:"☎",selector:".bali-pc-contact-phone"},
    {key:"telegram",title:"Написать в Telegram",subtitle:"Перейти в чат с менеджером",mark:"➤",selector:'[data-bali-contact="telegram-chat"]'},
    {key:"instagram",title:"Написать в Instagram",subtitle:"Сообщение в Direct",mark:"◎",selector:'[data-bali-contact="instagram"]'},
    {key:"whatsapp",title:"Написать в WhatsApp",subtitle:"Открыть чат WhatsApp",mark:"✆",selector:'[data-bali-contact="whatsapp"]'},
    {key:"viber",title:"Написать в Viber",subtitle:"Открыть чат Viber",mark:"◈",selector:'[data-bali-contact="viber"]'}
  ];
  const safeLink=(type,value)=>{
    if(typeof value!=="string"||!value||value.length>300)return false;
    if(type==="phone")return /^tel:\+?[0-9]{5,22}$/.test(value);
    try{
      const parsed=new URL(value);
      if(type==="viber"){
        return parsed.protocol==="viber:"&&parsed.hostname==="chat"&&
          /^\+[0-9]{5,22}$/.test(parsed.searchParams.get("number")||"");
      }
      if(parsed.protocol!=="https:")return false;
      const host=parsed.hostname.toLowerCase().replace(/^www\./,"");
      const allowed={
        telegram:["t.me","telegram.me"],instagram:["instagram.com"],
        whatsapp:["wa.me","api.whatsapp.com"]
      };
      return (allowed[type]||[]).includes(host)&&parsed.pathname.length>1;
    }catch{return false;}
  };
  const dialog=document.createElement("dialog");
  dialog.id="baliPromoContactDialog";
  dialog.className="bali-promo-contact-dialog";
  dialog.setAttribute("aria-labelledby","baliPromoContactDialogTitle");
  dialog.setAttribute("aria-describedby","baliPromoContactDialogDescription");
  dialog.innerHTML=
    '<div class="bali-promo-contact-inner">'+
      '<span class="bali-promo-contact-topline">BALI NIGHT CLUB · МИНСК</span>'+
      '<button class="bali-promo-contact-close" type="button" aria-label="Закрыть окно">×</button>'+
      '<h2 id="baliPromoContactDialogTitle">Выберите удобный способ связи</h2>'+
      '<p id="baliPromoContactDialogDescription">Свяжитесь с менеджером, чтобы уточнить условия и свободные даты.</p>'+
      '<div class="bali-promo-contact-list" aria-label="Способы связи"></div>'+
    '</div>';
  document.body.append(dialog);
  const close=dialog.querySelector(".bali-promo-contact-close");
  const title=dialog.querySelector("#baliPromoContactDialogTitle");
  const list=dialog.querySelector(".bali-promo-contact-list");
  close.addEventListener("click",()=>dialog.close());
  dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
  window.addEventListener("bali:promo-contacts",event=>{
    const offer=event.detail?.offer||{};
    title.textContent=typeof offer.contactTitle==="string"&&offer.contactTitle.trim()
      ?offer.contactTitle.trim().slice(0,70):"Выберите удобный способ связи";
    list.replaceChildren();
    for(const channel of channels){
      if(offer.contactEnabled?.[channel.key]===false)continue;
      const candidate=typeof offer.contactLinks?.[channel.key]==="string"
        ?offer.contactLinks[channel.key].trim():"";
      const fallback=document.querySelector(channel.selector)?.getAttribute("href")||"";
      const href=candidate||fallback;
      if(!safeLink(channel.key,href))continue;
      const link=document.createElement("a");
      link.className="bali-promo-contact-link";
      link.href=href;
      if(channel.key!=="phone"&&channel.key!=="viber"){
        link.target="_blank";
        link.rel="noopener noreferrer";
      }
      const icon=document.createElement("span");
      icon.className="bali-promo-contact-icon";
      icon.setAttribute("aria-hidden","true");
      icon.textContent=channel.mark;
      const copy=document.createElement("span");
      const heading=document.createElement("strong");
      heading.textContent=channel.title;
      const description=document.createElement("small");
      description.textContent=channel.subtitle;
      copy.append(heading,description);
      const arrow=document.createElement("span");
      arrow.className="bali-promo-contact-arrow";
      arrow.setAttribute("aria-hidden","true");
      arrow.textContent="↗";
      link.append(icon,copy,arrow);
      list.append(link);
    }
    if(!list.childElementCount){
      const message=document.createElement("div");
      message.className="bali-promo-contact-empty";
      message.textContent="Свяжитесь с администрацией через раздел «Информация».";
      list.append(message);
    }
    if(!dialog.open)dialog.showModal();
  });
})();