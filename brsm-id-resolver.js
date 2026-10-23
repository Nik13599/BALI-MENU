/* Firebase BALI ID is the only account number for all card tiers and COIN. */
export async function resolveBrsmGuest(value){
 const number=String(value||"").trim();
 if(!/^\d{6}$/.test(number)||Number(number)<1)throw Error("Укажите шестизначный BALI ID.");
 return {number};
}
