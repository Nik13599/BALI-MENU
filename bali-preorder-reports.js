/* BALI staff reports: offline PDF/PNG rendering, Telegram message preview.
 * No external libraries, uploads, billing or server-side report generation.
 */
const fmt=value=>Number(value||0).toFixed(2).replace(".",",")+" BYN";
const normalizedStatus=value=>value==="completed"?"confirmed":value;
const labels={pending:"Ожидает подтверждения",confirmed:"Подтверждён",cancelled:"Отменён"};
const safeCount=x=>Number.isFinite(Number(x))?Number(x):0;
const lineTotal=line=>safeCount(line.unitPrice)*safeCount(line.quantity);
const orderTotal=o=>(o.items||[]).reduce((sum,item)=>sum+lineTotal(item),0);
export function composeBaliPreorderReport({kind,date,eventTitle,orders,includeCancelled=false,allEvents=false}){
  if(!["orders","dishes"].includes(kind))throw new Error("Неизвестный тип отчёта.");
  const all=[...(orders||[])].sort((a,b)=>
    (allEvents?String(a.eventTitle||"").localeCompare(String(b.eventTitle||""),"ru"):0)
    ||(a.orderNumber||0)-(b.orderNumber||0)
    ||(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
  const selected=kind==="orders"?all:all.filter(o=>includeCancelled||(!o.archived&&o.status!=="cancelled"));
  const count=selected.length,portions=selected.reduce((sum,o)=>sum+(o.items||[]).reduce((v,x)=>v+safeCount(x.quantity),0),0);
  const amount=selected.reduce((sum,o)=>sum+orderTotal(o),0);
  const tally=new Map();
  for(const o of selected)for(const item of o.items||[]){
    const key=String(item.id)+"|"+String(item.name);
    const old=tally.get(key)||{id:item.id,name:item.name,quantity:0,total:0};
    old.quantity+=safeCount(item.quantity);old.total+=lineTotal(item);tally.set(key,old);
  }
  return {kind,date,eventTitle,count,portions,amount,orders:selected,
    dishes:[...tally.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),"ru")),
    includeCancelled:kind==="orders"||includeCancelled,allEvents};
}
export function preorderTelegramText(report){
  if(report.singleOrder){
    const o=report.orders[0];
    if(!o)throw new Error("Предзаказ не найден.");
    const parts=["BALI NIGHT CLUB","ПРЕДЗАКАЗ · "+report.eventTitle+" №"+(o.orderNumber??o.id),
      "Дата: "+report.date,"Статус: "+(labels[normalizedStatus(o.status)]||o.status)];
    const reference=[o.tableNumber,o.bookingId].filter(Boolean).join(" / ");
    if(reference)parts.push("ID брони / номер стола: "+reference);
    parts.push("Гость: "+(o.customerName||"—"),"Телефон: "+(o.customerPhone||"—"));
    if(o.email)parts.push("Email: "+o.email);
    parts.push("","Состав предзаказа:");
    for(const item of o.items||[])parts.push("• "+item.name+" × "+item.quantity+
      " ("+fmt(item.unitPrice)+"/шт.) = "+fmt(lineTotal(item)));
    if(!(o.items||[]).length)parts.push("Нет позиций.");
    if(o.notes)parts.push("Пожелания: "+o.notes);
    parts.push("","ИТОГО: "+fmt(orderTotal(o)));
    return parts.join("\n");
  }
  const result=["BALI NIGHT CLUB",report.kind==="orders"?"ОТЧЁТ ПО ПРЕДЗАКАЗАМ":"ОТЧЁТ ПО БЛЮДАМ",
    "Мероприятие: "+report.eventTitle,"Дата: "+report.date,""];
  if(report.kind==="orders"){
    if(!report.orders.length)result.push("Предзаказов нет.");
    for(const o of report.orders){
      const ref=[o.tableNumber,o.bookingId].filter(Boolean).join(" / ");
      result.push((report.allEvents?(o.eventTitle||"Мероприятие")+" · ":"")+"№ "+(o.orderNumber??o.id)+" · "+(o.customerName||"Гость")+
        " · "+(labels[normalizedStatus(o.status)]||"Подтверждён")+(o.archived?" · архив":""));
      result.push("Тел.: "+(o.customerPhone||"не указан")+(ref?" · ID брони / номер стола: "+ref:""));
      for(const item of o.items||[])result.push("• "+item.name+" × "+item.quantity+" — "+fmt(lineTotal(item)));
      if(o.notes)result.push("Пожелания: "+o.notes);
      result.push("Итого: "+fmt(orderTotal(o)),"");
    }
  }else{
    if(!report.dishes.length)result.push("Блюд нет.");
    for(const d of report.dishes)result.push("• "+d.name+" × "+d.quantity+" — "+fmt(d.total));
  }
  result.push("Заказов: "+report.count+" · Порций: "+report.portions,"Общая сумма: "+fmt(report.amount));
  return result.join("\n");
}
export function splitTelegramReport(text,maxLength=3300){
  const chunks=[],lines=String(text).split("\n");let chunk="";
  const flush=()=>{if(chunk){chunks.push(chunk);chunk="";}};
  for(const line of lines){
    if(line.length>maxLength){
      flush();
      for(let i=0;i<line.length;i+=maxLength)chunks.push(line.slice(i,i+maxLength));
      continue;
    }
    if(chunk.length+line.length+1>maxLength)flush();
    chunk+=(chunk?"\n":"")+line;
  }
  flush();return chunks;
}
function wrap(ctx,text,width){
  const words=String(text??"").split(/\s+/),lines=[];let row="";
  for(const word of words){
    const test=row?row+" "+word:word;
    if(ctx.measureText(test).width>width&&row){lines.push(row);row=word;}else row=test;
  }
  if(row)lines.push(row);
  return lines.length?lines:[""];
}
function reportPages(report){
  const W=1240,H=1754,L=64,R=W-L,B=H-99;
  const pages=[];let canvas,ctx,y;
  const color={ink:"#16211a",muted:"#637167",border:"#dae4d9",lime:"#b9ff51",soft:"#f4f7f3"};
  const setFont=(size=24,weight=400)=>{ctx.font=weight+" "+size+"px Arial, sans-serif";};
  function newPage(){
    if(pages.length>=160)throw new Error("Отчёт слишком большой для одной выгрузки. Выберите меньше заказов.");
    canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("Браузер не поддерживает формирование отчёта.");
    pages.push(canvas);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
    ctx.fillStyle=color.ink;ctx.fillRect(0,0,W,19);ctx.fillStyle=color.lime;ctx.fillRect(0,19,W,7);
    setFont(35,800);ctx.fillStyle=color.ink;ctx.fillText("BALI",L,88);
    setFont(15,700);ctx.fillStyle="#68796b";ctx.fillText("NIGHT CLUB  /  ПРЕДЗАКАЗЫ",L+127,86);
    setFont(27,800);ctx.fillStyle=color.ink;ctx.fillText(report.singleOrder?"КАРТОЧКА ПРЕДЗАКАЗА":report.kind==="orders"?"ОТЧЁТ ПО ЗАКАЗАМ":"ОТЧЁТ ПО БЛЮДАМ",L,139);
    setFont(20,400);ctx.fillStyle=color.muted;
    const description=report.eventTitle+"  ·  "+report.date;
    const nameLines=wrap(ctx,description,W-2*L).slice(0,2);
    for(let i=0;i<nameLines.length;i++)ctx.fillText(nameLines[i],L,180+i*26);
    y=200+(nameLines.length-1)*26;ctx.strokeStyle=color.border;
    ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();y+=26;
  }
  function text(str,x,yy,size=20,weight=400,colorValue=color.ink){
    setFont(size,weight);ctx.fillStyle=colorValue;ctx.fillText(String(str??""),x,yy);
  }
  function reserve(height){if(y+height>B)newPage();}
  function multiline(str,x,width,size=20,leading=27,weight=400,maxLines=99){
    setFont(size,weight);let lines=wrap(ctx,str,width).slice(0,maxLines);
    for(const line of lines){reserve(leading+10);text(line,x,y+size,size,weight);y+=leading;}
  }
  newPage();
  if(report.kind==="orders"){
    for(const o of report.orders){
      const items=o.items||[];
      // Prefer to keep an entire order on one sheet when it fits.
      const needed=110+items.length*30+(o.notes?45:0);
      reserve(Math.min(needed,1040));
      ctx.fillStyle=color.soft;ctx.fillRect(L,y,W-L*2,47);
      ctx.fillStyle=color.lime;ctx.fillRect(L,y,7,47);
      text((report.allEvents?(String(o.eventTitle||"Мероприятие")+" · "):"")+"№ "+(o.orderNumber??o.id)+"  ·  "+(o.customerName||"Гость"),L+18,y+31,20,800);
      text(fmt(orderTotal(o)),R-220,y+31,22,800);
      y+=62;
      const reference=[o.tableNumber,o.bookingId].filter(Boolean).join(" / ");
      const ref=[o.customerPhone,reference&&"ID брони / номер стола: "+reference,(report.singleOrder||report.kind==="orders")&&o.email&&"Email: "+o.email].filter(Boolean).join(" · ");
      multiline(ref,L+14,W-2*L-20,18,25);
      text("Статус: "+(labels[normalizedStatus(o.status)]||"Подтверждён")+(o.archived?" · Архив":""),L+14,y+18,17,400,color.muted);y+=33;
      for(const item of items){
        reserve(35);
        ctx.fillStyle="#b4c2b5";ctx.fillRect(L+14,y+2,5,5);
        setFont(19,400);const maxName=W-2*L-340;
        const nameLines=wrap(ctx,item.name,maxName);
        for(let i=0;i<nameLines.length;i++){reserve(29);text(nameLines[i],L+30,y+19,19);if(i===0){
          text("× "+item.quantity,L+W-2*L-285,y+19,18,700);
          text(fmt(lineTotal(item)),R-200,y+19,18,700);
        }y+=29;}
      }
      if(o.notes){multiline("Пожелания: "+o.notes,L+14,W-2*L-26,17,23);}
      y+=18;
    }
    if(!report.orders.length){text("Предзаказов не найдено.",L,y+32,23);y+=50;}
  }else{
    reserve(55);ctx.fillStyle=color.soft;ctx.fillRect(L,y,R-L,48);
    text("Блюдо",L+14,y+31,19,700);
    text("Порций",R-300,y+31,19,700);
    text("Сумма",R-160,y+31,19,700);y+=59;
    for(let i=0;i<report.dishes.length;i++){
      const item=report.dishes[i];setFont(19,400);
      const nameLines=wrap(ctx,(i+1)+". "+item.name,R-L-365);
      reserve(nameLines.length*29+14);
      for(let n=0;n<nameLines.length;n++){
        text(nameLines[n],L+14,y+21,19);
        if(n===0){text(String(item.quantity),R-293,y+21,19,800);text(fmt(item.total),R-160,y+21,19,700);}
        y+=29;
      }
      ctx.strokeStyle=color.border;ctx.beginPath();ctx.moveTo(L,y+5);ctx.lineTo(R,y+5);ctx.stroke();y+=12;
    }
    if(!report.dishes.length){text("Блюд не найдено.",L,y+32,23);y+=50;}
  }
  reserve(107);
  ctx.fillStyle=color.soft;ctx.fillRect(L,y,R-L,82);
  text("Всего заказов: "+report.count+"   ·   Всего порций: "+report.portions,L+18,y+31,20,800);
  text("Сумма: "+fmt(report.amount),L+18,y+62,20,700);y+=100;
  pages.forEach((page,index)=>{
    const context=page.getContext("2d");context.strokeStyle=color.border;
    context.beginPath();context.moveTo(L,H-72);context.lineTo(R,H-72);context.stroke();
    context.font="16px Arial, sans-serif";context.fillStyle=color.muted;
    context.fillText("BALI · "+report.eventTitle+" · "+report.date,L,H-43);
    context.textAlign="right";context.fillText("Страница "+(index+1)+" / "+pages.length,R,H-43);
  });
  return pages;
}
function packPdfJpeg(jpegs,width,height){
  const te=new TextEncoder(),parts=[];let offset=0;const locations=[];
  const write=b=>{const data=typeof b==="string"?te.encode(b):b;parts.push(data);offset+=data.length;};
  const object=(id,prefix,bytes=null,suffix="")=>{
    locations[id]=offset;write(id+" 0 obj\n"+prefix);
    if(bytes)write(bytes);
    write(suffix+"\nendobj\n");
  };
  write("%PDF-1.4\n");
  const kids=jpegs.map((_,i)=>(3+i*3)+" 0 R").join(" ");
  object(1,"<< /Type /Catalog /Pages 2 0 R >>");
  object(2,"<< /Type /Pages /Kids ["+kids+"] /Count "+jpegs.length+" >>");
  for(let i=0;i<jpegs.length;i++){
    const n=3+i*3,content="q 595 0 0 842 0 0 cm /Im1 Do Q\n";
    object(n,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 "+(n+2)+" 0 R >> >> /Contents "+(n+1)+" 0 R >>");
    object(n+1,"<< /Length "+te.encode(content).length+" >>\nstream\n"+content+"endstream");
    object(n+2,"<< /Type /XObject /Subtype /Image /Width "+width+" /Height "+height+
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+jpegs[i].length+" >>\nstream\n",
      jpegs[i],"\nendstream");
  }
  const xref=offset,n=2+jpegs.length*3;
  write("xref\n0 "+(n+1)+"\n0000000000 65535 f \n");
  for(let i=1;i<=n;i++)write(String(locations[i]).padStart(10,"0")+" 00000 n \n");
  write("trailer\n<< /Size "+(n+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF");
  const output=new Uint8Array(offset);let pos=0;for(const b of parts){output.set(b,pos);pos+=b.length;}
  return output;
}
function download(blob,name){
  const link=document.createElement("a"),url=URL.createObjectURL(blob);
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
const toBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Не удалось создать изображение.")),type,quality));
function zipPng(files){
  // STORE ZIP, supported by Windows Explorer and all common archivers.
  const te=new TextEncoder(),parts=[],central=[];let position=0;
  const uint16=(b,n,o)=>new DataView(b.buffer).setUint16(o,n,true);
  const uint32=(b,n,o)=>new DataView(b.buffer).setUint32(o,n>>>0,true);
  const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  const checksum=data=>{let crc=-1;for(const n of data)crc=(crc>>>8)^table[(crc^n)&255];return (crc^-1)>>>0;};
  const write=b=>{parts.push(b);position+=b.length;};
  for(const file of files){
    const name=te.encode(file.name),crc=checksum(file.data),start=position;
    const local=new Uint8Array(30);
    uint32(local,0x04034b50,0);uint16(local,20,4);uint16(local,0,6);
    uint32(local,crc,14);uint32(local,file.data.length,18);uint32(local,file.data.length,22);uint16(local,name.length,26);
    write(local);write(name);write(file.data);
    const entry=new Uint8Array(46);
    uint32(entry,0x02014b50,0);uint16(entry,20,4);uint16(entry,20,6);
    uint32(entry,crc,16);uint32(entry,file.data.length,20);uint32(entry,file.data.length,24);
    uint16(entry,name.length,28);uint32(entry,start,42);
    central.push(entry,name);
  }
  const centralOffset=position;for(const x of central)write(x);
  const end=new Uint8Array(22);
  uint32(end,0x06054b50,0);uint16(end,files.length,8);uint16(end,files.length,10);
  uint32(end,position-centralOffset,12);uint32(end,centralOffset,16);write(end);
  return new Blob(parts,{type:"application/zip"});
}
const namePart=x=>String(x).normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu,"_").slice(0,44);
export function composeBaliSinglePreorder(order){
  if(!order||!Array.isArray(order.items))throw new Error("Не загружен состав предзаказа.");
  return {...composeBaliPreorderReport({
    kind:"orders",date:order.eventDate||"",eventTitle:order.eventTitle||"Мероприятие",
    orders:[order]
  }),singleOrder:true};
}
async function deliverReportFile(blob,filename,preferNativeShare){
  if(preferNativeShare&&typeof File==="function"&&
     typeof navigator.share==="function"&&typeof navigator.canShare==="function"){
    const file=new File([blob],filename,{type:blob.type});
    try{
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:"BALI · Предзаказ"});
        return;
      }
    }catch(error){
      if(error?.name==="AbortError")throw error;
      // Some mobile browsers reject sharing a file after canvas encoding:
      // preserve the generated document and let the guest share it manually.
    }
  }
  download(blob,filename);
}
export async function downloadBaliPreorderReport(report,type,{preferNativeShare=false}={}){
  if(!["pdf","png"].includes(type))throw new Error("Формат отчёта не поддерживается.");
  const pages=reportPages(report);
  const base="BALI_"+report.date+"_"+namePart(report.eventTitle)+"_"+(report.singleOrder?"preorder_"+namePart(report.orders[0]?.orderNumber??report.orders[0]?.id??"1"):report.kind);
  if(type==="pdf"){
    const jpegs=[];for(const canvas of pages){
      const blob=await toBlob(canvas,"image/jpeg",.87);
      jpegs.push(new Uint8Array(await blob.arrayBuffer()));
    }
    await deliverReportFile(new Blob([packPdfJpeg(jpegs,pages[0].width,pages[0].height)],{type:"application/pdf"}),base+".pdf",preferNativeShare);
  }else if(pages.length===1){
    await deliverReportFile(await toBlob(pages[0],"image/png"),base+".png",preferNativeShare);
  }else{
    const files=[];for(let i=0;i<pages.length;i++){
      const blob=await toBlob(pages[i],"image/png");
      files.push({name:"page_"+String(i+1).padStart(3,"0")+".png",data:new Uint8Array(await blob.arrayBuffer())});
    }
    await deliverReportFile(zipPng(files),base+"_PNG_pages.zip",preferNativeShare);
  }
  return pages.length;
}
export function showBaliPreorderTelegram(report){
  const messages=splitTelegramReport(preorderTelegramText(report));
  if(!messages.length)throw new Error("Не удалось составить текст отчёта.");
  const old=document.getElementById("baliTelegramReportDialog");
  old?.remove();
  const dialog=document.createElement("dialog");
  dialog.id="baliTelegramReportDialog";dialog.className="bali-telegram-report-dialog";
  const heading=document.createElement("h2");heading.textContent=report.singleOrder?"Предзаказ для Telegram":"Отчёт для Telegram";
  const caption=document.createElement("p");
  const body=document.createElement("textarea");body.readOnly=true;body.rows=15;
  body.setAttribute("aria-label","Текст отчёта для Telegram");
  const notice=document.createElement("p");notice.textContent=report.kind==="orders"
    ?"В отчёте присутствуют данные гостей. Пересылайте только уполномоченным сотрудникам."
    :"Перед отправкой проверьте выбранное мероприятие.";
  const actions=document.createElement("div");actions.className="bali-telegram-report-actions";
  const close=document.createElement("button"),copy=document.createElement("button"),
    send=document.createElement("button"),previous=document.createElement("button"),
    next=document.createElement("button");
  close.textContent="Закрыть";copy.textContent="Копировать";send.textContent="Открыть Telegram";
  previous.textContent="←";next.textContent="→";send.className="primary";
  let index=0;
  function display(){body.value=messages[index];caption.textContent="Часть "+(index+1)+" из "+messages.length;
    previous.disabled=index===0;next.disabled=index===messages.length-1;}
  close.onclick=()=>dialog.close();
  previous.onclick=()=>{index--;display();};
  next.onclick=()=>{index++;display();};
  copy.onclick=async()=>{
    try{await navigator.clipboard.writeText(messages[index]);copy.textContent="Скопировано ✓";}
    catch{body.focus();body.select();copy.textContent="Выделено, нажмите Ctrl+C";}
    setTimeout(()=>{copy.textContent="Копировать";},1800);
  };
  send.onclick=()=>{
    const url="https://t.me/share/url?url=&text="+encodeURIComponent(messages[index]);
    const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer";
    document.body.append(a);a.click();a.remove();
  };
  actions.append(previous,next,copy,send,close);dialog.append(heading,caption,body,notice,actions);
  document.body.append(dialog);dialog.addEventListener("close",()=>dialog.remove(),{once:true});
  display();dialog.showModal();
}
