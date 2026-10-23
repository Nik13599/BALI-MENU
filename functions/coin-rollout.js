"use strict";
/* Server-only BALI COIN rollout. Defaults to frozen after any deployment. */
module.exports=({fail,env=process.env})=>{
  const mode=env.BALI_COIN_WRITE_MODE;
  const digest=env.BALI_COIN_VERIFIED_EXPORT_SHA256;
  const pilots=new Set((env.BALI_COIN_PILOT_UIDS||"").split(",").map(s=>s.trim())
    .filter(s=>/^[A-Za-z0-9_-]{8,128}$/.test(s)));
  const phase=mode==="pilot"&&env.BALI_COIN_PILOT_CONFIRM==="ALLOW_TEST_COIN_WRITES"&&
    pilots.size>0?"pilot":
    mode==="live"&&env.BALI_COIN_LIVE_CONFIRM==="VERIFIED_SOURCE_AND_WALLETS"&&
    typeof digest==="string"&&/^[a-f0-9]{64}$/.test(digest)?"live":"frozen";
  const eligible=uids=>{
    if(!Array.isArray(uids)||!uids.length||uids.some(uid=>typeof uid!=="string"||!uid))
      return false;
    if(phase==="pilot")return uids.every(uid=>pilots.has(uid));
    return phase==="live";
  };
  const assertWrite=uids=>{
    if(!eligible(uids))
      fail("failed-precondition","Операции BALI COIN ещё не активированы для этой карты.");
  };
  return {phase,eligible,assertWrite};
};
