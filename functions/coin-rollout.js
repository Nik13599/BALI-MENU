"use strict";
/* Server-only BALI COIN rollout. Defaults to frozen after any deployment. */
module.exports=({fail,env=process.env})=>{
  const mode=env.BALI_COIN_WRITE_MODE;
  const digest=env.BALI_COIN_VERIFIED_EXPORT_SHA256;
  const pilotIds=(env.BALI_COIN_PILOT_UIDS||"").split(",").map(s=>s.trim());
  const pilots=new Set(pilotIds);
  // Both server and protected deployment independently validate the same
  // strict allowlist: 2–10 distinct TEST UIDs, with no ignored malformed IDs.
  const validPilots=pilotIds.length>=2&&pilotIds.length<=10&&
    pilotIds.every(s=>/^[A-Za-z0-9_-]{8,128}$/.test(s))&&
    pilots.size===pilotIds.length;
  const phase=mode==="pilot"&&env.BALI_COIN_PILOT_CONFIRM==="ALLOW_TEST_COIN_WRITES"&&
    validPilots?"pilot":
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
