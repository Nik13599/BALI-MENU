import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=path=>readFileSync(path,"utf8");
const styleEntries=JSON.parse(readFileSync("styles/entries.json","utf8"));
const expandHtml=value=>value.replace(/<link rel="stylesheet" data-bali-bundle="index"[^>]+>/,styleEntries["index.html"].map(href=>'<link rel="stylesheet" href="'+href+'">').join("\n"));
const html=expandHtml(s("index.html")),bank=s("bali-id-bank.js"),backend=s("functions/index.js");
const css=s("bali-id-bank.css"),rules=s("firestore.rules");
for(const id of [
  "baliIdFlipScene","baliIdTransferOpen","baliIdHistoryOpen","baliShowQr",
  "baliTransferDialog","baliTransferLookupForm","baliTransferRecipient",
  "baliTransferRecipientName","baliTransferNext","baliTransferChoices",
  "baliTransferConfirm","baliHistoryDialog","baliIdHistoryScroll","baliIdHistoryList"
])assert(html.includes('id="'+id+'"'),"Missing banking UI: "+id);
assert(html.indexOf('id="baliIdTransferOpen"')<html.indexOf('id="baliShowQr"') &&
  html.indexOf('id="baliShowQr"')<html.indexOf('class="bali-bank-wallet"'),
  "Transfer, history, QR must share one centred action toolbar");
assert(html.includes('bali-id-bank.js?v=')&&html.includes('bali-id-bank.css?v='),
  "Banking assets not loaded");
for(const fn of ["previewBaliRecipient","transferBaliBenefits","listMyBaliHistory"]){
  assert(bank.includes('httpsCallable(functions,"'+fn+'")'),"Guest callable missing: "+fn);
  assert(backend.includes("exports."+fn+"=api"),"Firebase callable missing: "+fn);
}
assert(!/(\bsetDoc\b|\bupdateDoc\b|\bwriteBatch\b|\brunTransaction\b)/.test(bank),
  "Guest browser must never write wallets or histories directly");
assert(backend.includes("db.runTransaction(async tx=>")&&
  backend.includes("tx.set(fromRef,")&&backend.includes("tx.set(toRef,")&&
  backend.includes("tx.create(transferRef,")&&
  backend.includes("tx.create(debitRef,")&&backend.includes("tx.create(creditRef,"),
  "Transfer and both audit entries must be atomic");
assert(backend.includes('const transferId=digest(uid+":"+requestId)') &&
  backend.includes("if(previous.exists)"),
  "Transfer must be idempotent when the client retries");
assert(backend.includes('typeof value!=="string"||!/^\\d{6}$/.test(value)'),
  "Receiver must have exactly 6-digit BALI ID");
assert(backend.includes('g.transferable!==true')&&backend.includes("grant.remaining-=part.quantity"),
  "Do not transfer unlimited, expired or unavailable benefits");
assert(backend.includes("where(\"guestUid\",\"==\",uid)") &&
  backend.includes('orderBy("createdAt","desc")') &&
  backend.includes("limit(historyPage)"),
  "History must be private and paginated");
assert(css.includes("overflow:hidden!important")&&
  css.includes(".bali-bank-history-scroll{overflow-y:auto!important"),
  "Main page must be fixed and scrolling restricted to history");
assert(bank.includes("wallet.hidden=aggregates.size===0") &&
  !bank.includes("Войдите в аккаунт для просмотра баланса"),
  "Do not show an empty wallet placeholder in the banking screen");
assert(rules.includes("match /guestWallets/{uid}") &&
  rules.includes("allow list, create, update, delete: if false;") &&
  rules.includes("match /bonusTransfers/{transferId}") &&
  rules.includes("allow read, write: if false;"),
  "Guest wallet writes and direct transfer access must be denied");
const firebase=JSON.parse(s("firebase.json"));
const pkg=JSON.parse(s("functions/package.json"));
assert(firebase.functions?.some(x=>x.source==="functions"&&x.codebase==="bali-id"),
  "Firebase codebase missing");
assert(firebase.firestore.indexes==="firestore.indexes.json"&&
  Array.isArray(JSON.parse(s("firestore.indexes.json")).indexes),
  "Private history indexes missing");
assert(pkg.dependencies["firebase-admin"]&&pkg.dependencies["firebase-functions"],
  "Firebase Functions dependencies missing");
console.log("BALI ID: frontend/server transfer and history invariants verified.");
