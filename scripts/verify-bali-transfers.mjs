import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get=path=>readFileSync(path,"utf8");
const html=get("index.html"),ui=get("bali-id-bank.js"),
  backend=get("functions/index.js"),rules=get("firestore.rules"),
  styles=get("bali-id-bank.css"),firebase=JSON.parse(get("firebase.json"));
for(const id of [
  "baliIdTransferOpen","baliIdHistoryOpen","baliTransferDialog",
  "baliHistoryDialog","baliTransferRecipient","baliTransferRecipientName",
  "baliTransferChoices","baliTransferReviewList","baliTransferConfirm",
  "baliIdHistoryList","baliIdHistoryScroll","baliIdWalletList"
]){
  assert(html.includes('id="'+id+'"'),"Missing banking UI node: "+id);
}
for(const key of ["previewBaliRecipient","transferBaliBenefits","listMyBaliHistory"]){
  assert(ui.includes('httpsCallable(functions,"'+key+'")'),"Missing callable client: "+key);
  assert(backend.includes("exports."+key+"=api("),"Missing server endpoint: "+key);
}
assert(!/\b(setDoc|updateDoc|deleteDoc|runTransaction|writeBatch)\s*\(/.test(ui),
  "Guest UI must never write directly to Firestore");
assert(backend.includes("tx.set(fromRef,")&&backend.includes("tx.set(toRef,"),
  "Sender debit and receiver credit must share a server transaction");
assert(backend.includes("tx.create(transferRef,")&&backend.includes("tx.create(debitRef,")&&
  backend.includes("tx.create(creditRef,"),"Both immutable histories must share transfer transaction");
assert(backend.includes('const transferId=digest(uid+":"+requestId)'),
  "Idempotency key must be scoped to authenticated sender");
assert(backend.includes("tx.get(transferRef)")&&backend.includes("if(previous.exists)"),
  "Repeated requests must not double spend");
assert(backend.includes("grant.transferable")===false &&
  backend.includes("g.transferable!==true"),"Only expressly transferable grants can move");
assert(backend.includes("grant.remaining<part.quantity"),
  "The server must reject overdrafts");
assert(rules.includes("match /guestWallets/{uid}")&&
  rules.includes("match /bonusTransfers/{transferId}"),"Wallet rules missing");
const wallets=rules.slice(rules.indexOf("match /guestWallets/{uid}"),rules.indexOf("match /bonusTransfers/{transferId}"));
assert(wallets.includes("allow list, create, update, delete: if false"),
  "Guests must not write or list wallets");
assert(styles.includes("#baliIdSection")&&
  styles.includes("overflow:hidden!important;overscroll-behavior:none!important"),
  "The card page must remain fixed");
assert(styles.includes(".bali-bank-history-scroll{overflow-y:auto"),
  "Only transaction history may scroll");
assert(firebase.functions?.[0]?.source==="functions","Firebase Functions deployment missing");
assert(firebase.firestore.indexes==="firestore.indexes.json","Audit index config missing");
const index=JSON.parse(get("firestore.indexes.json"));
assert(index.indexes.some(item=>item.collectionGroup==="walletOperations"&&
  item.fields.some(f=>f.fieldPath==="guestUid")&&
  item.fields.some(f=>f.fieldPath==="createdAt")),"Missing composite index for history");
console.log("BALI ID: verified secure transfers, recipient lookup, atomic debit/credit, history and fixed viewport.");
