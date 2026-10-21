"use strict";
/* BALI preorder staff accounts: only existing verified site administrators can
 * create, disable or reset dedicated login/password accounts. Firebase Auth
 * stores password hashes; passwords never enter Firestore or server logs. */
module.exports=({admin,db,api,fail})=>{
 const loginPattern=/^[a-z][a-z0-9_-]{2,31}$/;
 const staffEmail=login=>"staff+"+login+"@staff.baliminsk.by";
 const validatePassword=password=>{
   if(typeof password!=="string"||password.length<12||password.length>72||
     /[\x00-\x1F\x7F]/.test(password))
     fail("invalid-argument","Пароль должен содержать от 12 до 72 символов.");
 };
 const isAdmin=async req=>{
   if(!req.auth?.uid||req.auth.token?.email_verified!==true)
     fail("unauthenticated","Войдите в основную админку BALI.");
   const role=await db.doc("admins/"+req.auth.uid).get();
   if(!role.exists||role.data().active!==true)
     fail("permission-denied","Управлять сотрудниками может только администратор.");
 };
 return {manageBaliPreorderStaff:api("manageBaliPreorderStaff",async req=>{
   await isAdmin(req);
   const command=req.data?.action;
   const auth=admin.auth();
   if(command==="list"){
     const snap=await db.collection("preorderStaff").limit(100).get();
     const staff=snap.docs.map(d=>({uid:d.id,login:d.data().login,name:d.data().name,
       active:d.data().active===true})).sort((a,b)=>a.login.localeCompare(b.login));
     return {staff};
   }
   if(command==="create"){
     const login=String(req.data?.login||"").trim().toLowerCase();
     const name=String(req.data?.name||"").trim();
     if(!loginPattern.test(login)||name.length<2||name.length>80)
       fail("invalid-argument","Логин: 3–32 латинских символа, цифры, _ или -. Укажите имя сотрудника.");
     validatePassword(req.data?.password);
     let account;
     try{
       account=await auth.createUser({email:staffEmail(login),password:req.data.password,
         displayName:name,emailVerified:true,disabled:false});
     }catch(error){
       if(error?.code==="auth/email-already-exists")
         fail("already-exists","Такой логин уже занят.");
       throw error;
     }
     try{
       await db.doc("preorderStaff/"+account.uid).create({
         login,name,active:true,role:"preorders",createdBy:req.auth.uid,
         createdAt:admin.firestore.FieldValue.serverTimestamp(),
         updatedAt:admin.firestore.FieldValue.serverTimestamp()
       });
     }catch(error){
       await auth.deleteUser(account.uid).catch(()=>{});
       throw error;
     }
     return {ok:true,uid:account.uid,login};
   }
   if(["setActive","resetPassword"].includes(command)){
     const uid=req.data?.uid;
     if(typeof uid!=="string"||!/^[-_a-zA-Z0-9]{10,128}$/.test(uid))
       fail("invalid-argument","Некорректный идентификатор сотрудника.");
     const ref=db.doc("preorderStaff/"+uid),staff=await ref.get();
     if(!staff.exists||staff.data().role!=="preorders")
       fail("not-found","Сотрудник не найден.");
     if(command==="setActive"){
       if(typeof req.data?.active!=="boolean")
         fail("invalid-argument","Укажите статус доступа.");
       // Turn off access in Firestore first, before disabling authentication.
       if(!req.data.active)await ref.update({active:false,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
       await auth.updateUser(uid,{disabled:!req.data.active});
       if(req.data.active)await ref.update({active:true,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
       if(!req.data.active)await auth.revokeRefreshTokens(uid);
       return {ok:true};
     }
     validatePassword(req.data?.password);
     await auth.updateUser(uid,{password:req.data.password});
     await auth.revokeRefreshTokens(uid);
     return {ok:true};
   }
   fail("invalid-argument","Неизвестная операция с сотрудником.");
 })};
};
