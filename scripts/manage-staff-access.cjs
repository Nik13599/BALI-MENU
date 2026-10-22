#!/usr/bin/env node
/**
 * BALI STAFF owner-only provisioning tool.
 * Run locally with Firebase Admin SDK credentials, NEVER from the website.
 * Usage:
 *   node scripts/manage-staff-access.cjs create staff01 "Имя сотрудника"
 *   node scripts/manage-staff-access.cjs revoke staff01
 *   node scripts/manage-staff-access.cjs activate staff01
 * Password is read from stdin without displaying it and never passed in argv.
 *
 * Requires: npm ci --prefix functions and application default credentials.
 */
"use strict";
const {stdin,stdout,stderr}=require("node:process");
const path=require("node:path");
const admin=require(path.join(__dirname,"../functions/node_modules/firebase-admin"));
const action=process.argv[2],login=String(process.argv[3]||"").trim().toLowerCase();
const displayName=String(process.argv[4]||"").trim();
const email=()=>`staff+${login}@staff.baliminsk.by`;
if(!["create","revoke","activate"].includes(action)||!/^[a-z][a-z0-9_-]{2,31}$/.test(login)||
   (action==="create"&&(displayName.length<2||displayName.length>80))){
  stderr.write('Использование: create <логин> "<имя>" | revoke <логин> | activate <логин>\n');
  process.exit(2);
}
async function askPassword(){
  if(!stdin.isTTY||!stdout.isTTY)throw Error("Для создания нужен интерактивный терминал.");
  stdout.write("Новый пароль (не отображается): ");
  stdin.setRawMode(true);stdin.resume();
  let value="";
  try {
    for await (const chunk of stdin){
      for(const ch of String(chunk)){
        if(ch==="\r"||ch==="\n"){stdout.write("\n");return value;}
        if(ch==="\u0003")throw Error("Отменено.");
        if(ch==="\u007f"){value=value.slice(0,-1);continue;}
        if(ch.charCodeAt(0)>=32)value+=ch;
      }
    }
  }finally{stdin.setRawMode(false);stdin.pause();}
  throw Error("Ввод пароля прерван.");
}
(async()=>{
  const projectId=process.env.BALI_FIREBASE_PROJECT_ID||"bali-menu-5a48b";
  if(projectId!=="bali-menu-5a48b")throw Error("Отказ: недопустимый Firebase Project ID для BALI.");
  admin.initializeApp({credential:admin.credential.applicationDefault(),projectId});
  const auth=admin.auth(),db=admin.firestore();
  if(action==="create"){
    const password=await askPassword();
    if(password.length<12||password.length>128||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))
      throw Error("Пароль: 12–128 символов, минимум одна буква и одна цифра.");
    let user;
    try{
      user=await auth.getUserByEmail(email());
      throw Error("Учётная запись уже существует. Используйте другой логин.");
    }catch(error){if(error.code!=="auth/user-not-found")throw error;}
    user=await auth.createUser({email:email(),password,displayName,emailVerified:true,disabled:true});
    try{
      await db.doc("preorderStaff/"+user.uid).create({
        active:true,role:"preorders",name:displayName,login,
        createdAt:admin.firestore.FieldValue.serverTimestamp()
      });
      await auth.updateUser(user.uid,{disabled:false});
    }catch(error){
      // Never leave a new Auth account active without a staff role.
      await auth.updateUser(user.uid,{disabled:true}).catch(()=>{});
      throw error;
    }
    stdout.write("Учётная запись создана, Firestore роль выдана. UID: "+user.uid+"\n");
    stdout.write("Если предзаказы сейчас используют Google Sheets backend, нужна ОТДЕЛЬНАЯ staff-роль там.\n");
    return;
  }
  const user=await auth.getUserByEmail(email());
  const ref=db.doc("preorderStaff/"+user.uid);
  const record=await ref.get();
  if(!record.exists||record.data()?.role!=="preorders")throw Error("У пользователя нет роли preorders.");
  if(action==="revoke"){
    await ref.update({active:false});
    await auth.revokeRefreshTokens(user.uid);
    await auth.updateUser(user.uid,{disabled:true});
    stdout.write("Доступ отозван.\n");
  }else{
    await ref.update({active:true});
    await auth.updateUser(user.uid,{disabled:false});
    stdout.write("Доступ восстановлен.\n");
  }
})().catch(e=>{stderr.write("Ошибка: "+e.message+"\n");process.exitCode=1;});
