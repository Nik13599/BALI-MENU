"use strict";
/* Read-only preflight. This script never creates Firebase users, card IDs or wallets. */
const path=require("node:path");
function parse(raw){
  const ids=String(raw||"").split(",").map(v=>v.trim());
  if(ids.length<2||ids.length>10||
      ids.some(v=>!/^[A-Za-z0-9_-]{8,128}$/.test(v))||
      new Set(ids).size!==ids.length)
    throw Error("Pilot requires 2-10 unique, real TEST Firebase Auth UIDs in protected BALI_COIN_PILOT_UIDS.");
  return ids;
}
async function check(ids,{auth,db}){
  const seen=new Set();
  for(const uid of ids){
    let person;
    try{person=await auth.getUser(uid);}
    catch{throw Error("One or more pilot UIDs do not exist in Firebase Auth or the deployer lacks Firebase Auth read permission.");}
    if(!person||person.uid!==uid||person.disabled||person.emailVerified!==true)
      throw Error("Every pilot identity must be an enabled, email-verified Firebase Auth user.");
    const refs=["users/","baliIds/","baliCoinAccounts/","admins/","preorderStaff/"].map(prefix=>db.doc(prefix+uid));
    const [user,card,wallet,admin,staff]=await Promise.all(refs.map(ref=>ref.get()));
    if(!user.exists||!card.exists)
      throw Error("One or more pilot UIDs have no registered users/{uid} and baliIds/{uid} Bali Card.");
    const number=card.data().number;
    if(!Number.isSafeInteger(number)||number<1||number>999999||seen.has(number))
      throw Error("Pilot Bali Card numbers must exist, be numeric, distinct and within 000001–999999.");
    seen.add(number);
    if(admin.exists||staff.exists)
      throw Error("Do not use a BALI administrator or preorder Staff identity as a test guest.");
    if(wallet.exists){
      const data=wallet.data();
      if(data.source!=="bali-coin-pilot"||
         !Number.isSafeInteger(data.balance)||data.balance<0||data.balance>999999999)
        throw Error("A pilot identity has an existing non-pilot or invalid COIN wallet. Never overwrite real balances.");
    }
  }
  return {verified:ids.length,distinctCards:seen.size,walletWrites:0};
}
async function main(){
  const project=process.env.FIREBASE_PROJECT_ID;
  if(project!=="bali-menu-5a48b")
    throw Error("Pilot validation is restricted to Firebase project bali-menu-5a48b.");
  const ids=parse(process.env.PILOT_UIDS);
  const admin=require(require.resolve("firebase-admin",{paths:[path.join(__dirname,"../functions")]}));
  if(!admin.apps.length)admin.initializeApp({projectId:project});
  const result=await check(ids,{auth:admin.auth(),db:admin.firestore()});
  // Do not expose UIDs, email addresses, names, card numbers or account contents.
  console.log("Validated dedicated, verified pilot guests and Bali Cards:",result.verified,
    "identities. No Firestore writes.");
}
if(require.main===module)main().catch(err=>{
  console.error("PILOT PREFLIGHT BLOCKED:",err.message);
  process.exitCode=1;
});
module.exports={parse,check};
