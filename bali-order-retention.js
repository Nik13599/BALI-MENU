// 30 calendar-independent days counted from the order creation timestamp.
export const ORDER_RETENTION_MS=30*24*60*60*1000;
export function withinOrderRetention(order,now=Date.now()){
  const created=typeof order?.createdAt?.toMillis==="function"
    ?order.createdAt.toMillis()
    :(Number.isFinite(order?.createdAt?.seconds)?order.createdAt.seconds*1000:null);
  return created===null||!Number.isFinite(created)||created>now-ORDER_RETENTION_MS;
}
