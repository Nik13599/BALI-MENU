/* Read-only BALI COIN ledger in the guest's BALI ID history dialog.
 * Independent from gifts, QR bonus quantities and monetary payments. */
import {sheetsEnabled,sheetsRequest} from "./bali-sheets-api.js";
const dialog=document.getElementById("baliHistoryDialog");
const panel=document.getElementById("baliIdCoinHistory");
const host=document.getElementById("baliIdCoinHistoryList");
const fmt=new Intl.NumberFormat("ru-RU");
const date=new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Minsk",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
let revision=0;
async function load(){
  const run=++revision;
  if(!sheetsEnabled()||!window.BaliAuth?.isRegistered?.()){
    panel.hidden=true;return;
  }
  panel.hidden=false;
  host.textContent="Получаем историю баллов...";
  try{
    const result=await sheetsRequest("coinHistory");
    if(run!==revision||!dialog.open)return;
    host.replaceChildren();
    if(!result.items?.length){host.textContent="Операций BALI COIN пока нет.";return;}
    for(const op of result.items){
      const item=document.createElement("article");item.className="bali-id-coin-history-entry";
      const left=document.createElement("div");left.className="bali-id-coin-history-caption";
      const heading=document.createElement("strong");
      heading.textContent=op.type==="credit"?"Начисление":op.type==="debit"?"Списание":"Операция";
      const time=document.createElement("small");
      time.textContent=Number.isFinite(Date.parse(op.createdAt))?date.format(new Date(op.createdAt)):"";
      left.append(heading,time);
      const amount=document.createElement("strong");amount.className="bali-id-coin-history-count";
      amount.textContent=(op.type==="credit"?"+":"−")+fmt.format(op.count)+" BALI COIN";
      item.append(left,amount);
      const note=document.createElement("p");note.textContent=op.reason+
        " · остаток "+fmt.format(op.balanceAfter);
      item.append(note);host.append(item);
    }
  }catch(e){if(run===revision)host.textContent="Не удалось загрузить историю BALI COIN: "+(e.message||"ошибка сети");}
}
document.getElementById("baliIdHistoryOpen")?.addEventListener("click",()=>void load());
dialog?.addEventListener("close",()=>{revision++});
window.addEventListener("bali:coin-updated",()=>{if(dialog?.open)void load()});
