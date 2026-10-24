/* Firestore BALI COIN API. Keep the previous UI response shapes while
 * removing Google Sheets / Cloudflare / Apps Script from coin operations.
 * All writes occur exclusively inside authenticated Firebase Functions.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const fn=getFunctions(app,"europe-west1");
export const coinEnabled=()=>true;
const names=Object.freeze({
 me:"coinMe",card:"coinCard",adminCard:"coinAdminCard",coinHistory:"coinHistory",
 coinRecipient:"coinRecipient",coinTransfer:"coinTransfer",coinChange:"coinChange",
 coinSetReward:"coinSetReward",coinClaimVisit:"coinClaimVisit",
 coinAwardActivity:"coinAwardActivity",coinLotManage:"coinLotManage",
 coinLots:"coinLots",coinRedeemLot:"coinRedeemLot",
 coinVouchers:"coinVouchers",coinVoucherFulfill:"coinVoucherFulfill"
});
const invoke=Object.fromEntries(Object.values(names).map(name=>[name,httpsCallable(fn,name)]));
export async function coinRequest(action,payload={}){
 const operation=names[action];
 if(!operation)throw Error("Неизвестная операция BALI COIN.");
 return (await invoke[operation](payload)).data;
}
window.BaliCoinAPI=Object.freeze({enabled:coinEnabled,request:coinRequest});
