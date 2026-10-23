"use strict";
/* Canonical BRSM identity registry, bound to the single Firebase UID.
 * Each association is immutable, role-protected and unique by card number.
 * Staff attest a number only after reading the authenticated Sheets wallet.
 */
module.exports=({api,db,TS,verified,privileged,fail,nameAndId})=>{
  const canonical=uid=>db.doc("brsmCanonicalIds/"+uid);
  const reservation=number=>db.doc("brsmCanonicalNumbers/"+number);
  const validUid=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
  const validNumber=value=>typeof value==="string"&&/^\d{6}$/.test(value);
  async function staff(req){
    const uid=verified(req);
    if(!await privileged(uid))
      fail("permission-denied","Подтверждать номера Bali Card может только руководство.");
    return uid;
  }
  const getBrsmCanonicalId=api("getBrsmCanonicalId",async req=>{
    const caller=verified(req),uid=req.data?.uid||caller;
    if(!validUid(uid))fail("invalid-argument","Неверный UID.");
    if(uid!==caller&&!await privileged(caller))
      fail("permission-denied","Можно просматривать только свой номер.");
    const row=await canonical(uid).get();
    return {identity:row.exists?{uid,number:row.data().number,source:row.data().source}:null};
  });
  const attestBrsmCanonicalId=api("attestBrsmCanonicalId",async req=>{
    const director=await staff(req),uid=req.data?.uid,number=req.data?.number;
    if(!validUid(uid)||!validNumber(number))
      fail("invalid-argument","Укажите UID и канонический шестизначный номер из Google Sheets.");
    await nameAndId(uid); // Existing BALI account, never a synthetic participant.
    return db.runTransaction(async tx=>{
      const [person,numberOwner]=await Promise.all([
        tx.get(canonical(uid)),tx.get(reservation(number))
      ]);
      if(person.exists){
        if(person.data().number!==number)
          fail("failed-precondition","Номер уже подтверждён. Изменение требует отдельной контролируемой миграции.");
        if(!numberOwner.exists||numberOwner.data().uid!==uid)
          fail("failed-precondition","Конфликт реестра номеров. Необходимо вмешательство администратора.");
        return {ok:true,alreadyVerified:true,uid,number};
      }
      if(numberOwner.exists&&numberOwner.data().uid!==uid)
        fail("already-exists","Номер уже принадлежит другому пользователю.");
      const record={uid,number,source:"director-verified-sheets",verifiedBy:director,verifiedAt:TS.now()};
      tx.create(canonical(uid),record);
      if(!numberOwner.exists)tx.create(reservation(number),{uid,number,verifiedBy:director,verifiedAt:TS.now()});
      return {ok:true,uid,number};
    });
  });
  return {getBrsmCanonicalId,attestBrsmCanonicalId};
};
