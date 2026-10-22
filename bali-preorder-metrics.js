/* One source of truth for BALI STAFF dashboard/report totals.
 * Rounding at the line-item level avoids 0.1+0.2-style BYN drift.
 * Works identically for authenticated Firestore orders and guest KV requests.
 */
export const preorderStatus=s=>s==="completed"?"confirmed":s;
export const preorderActive=o=>!o.archived&&preorderStatus(o.status)!=="cancelled";
export function filterBaliPreorders(records,{date="",eventId="",archive=false,includeCancelled=true}={}){
  const unique=new Map();
  for(const o of records||[]){
    if(!o||typeof o.id!=="string"||!Array.isArray(o.items))continue;
    if(date&&o.eventDate!==date)continue;
    if(eventId&&(o.eventId||o.eventDate)!==eventId)continue;
    if(!archive&&o.archived)continue;
    if(!includeCancelled&&preorderStatus(o.status)==="cancelled")continue;
    unique.set(o.id,o);
  }
  return [...unique.values()];
}
const cents=value=>Math.round(Number(value||0)*100);
export function sumBaliPreorders(orders,{kitchen=false}={}){
  const selected=kitchen?(orders||[]).filter(preorderActive):(orders||[]);
  const dishes=new Map();let amountMinor=0,portions=0;
  for(const o of selected){
    for(const item of o.items||[]){
      const quantity=Number(item.quantity),unit=Number(item.unitPrice);
      if(!Number.isSafeInteger(quantity)||quantity<1||quantity>50||
         !Number.isFinite(unit)||unit<0)continue;
      const minor=cents(unit)*quantity;
      amountMinor+=minor;portions+=quantity;
      const key=String(item.id)+"|"+String(item.name);
      const line=dishes.get(key)||{id:item.id,name:item.name,quantity:0,totalMinor:0};
      line.quantity+=quantity;line.totalMinor+=minor;
      dishes.set(key,line);
    }
  }
  return {count:selected.length,amountMinor,amount:amountMinor/100,portions,
    dishes:[...dishes.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),"ru"))
      .map(item=>({...item,total:item.totalMinor/100}))};
}
export function dashboardBaliPreorders(orders){
  return {count:orders.length,
    pending:orders.filter(o=>!o.archived&&preorderStatus(o.status)==="pending").length,
    confirmed:orders.filter(o=>!o.archived&&preorderStatus(o.status)==="confirmed").length,
    cancelled:orders.filter(o=>preorderStatus(o.status)==="cancelled").length,
    portions:sumBaliPreorders(orders,{kitchen:true}).portions};
}
