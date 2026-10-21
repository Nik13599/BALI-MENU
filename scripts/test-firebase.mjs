import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithCredential,GoogleAuthProvider,signOut} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc,updateDoc,getDocs,collection,query,where,serverTimestamp,Timestamp,terminate} from 'firebase/firestore';

// Refuse to run against a real project, even when a developer exports production variables.
const projectId='demo-bali-menu';
assert.equal(process.env.GCLOUD_PROJECT,projectId,'Run via npm run test:firebase (demo project only)');
for(const variable of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']){
  assert.match(process.env[variable]||'',/^(127\.0\.0\.1|localhost):\d+$/);
}
const env=await initializeTestEnvironment({projectId,firestore:{rules:await readFile('firestore.rules','utf8')},storage:{rules:await readFile('storage.rules','utf8')}});
const app=initializeApp({projectId,apiKey:'demo-api-key',authDomain:'localhost',storageBucket:projectId+'.appspot.com'});
const auth=getAuth(app);connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
const db=getFirestore(app);const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');connectFirestoreEmulator(db,host,Number(port));
global.window=new EventTarget();window.BALI_FIREBASE_CONFIG=app.options;
await mkdir('.cache',{recursive:true});
const source=(await readFile('orders-firestore.js','utf8')).replace(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.14\.1\/firebase-(app|auth|firestore)\.js/g,(_,name)=>'firebase/'+name).replace('./bali-order-snapshots.js?v=20261021-1','../bali-order-snapshots.js?v=20261021-1');
await writeFile('.cache/orders-client.mjs',source);
await import('../.cache/orders-client.mjs');
const eventDate='2099-10-24';
const token={sub:'guest-emulator',email:'guest@example.test',email_verified:true,name:'Тестовый гость',aud:projectId,iss:'https://accounts.google.com',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600};
const jwt=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(token)).toString('base64url')+'.';
let orderId;
try{
 await test('Firebase: real client flow and enforced access rules',async t=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
   const seed=context.firestore();
   await setDoc(doc(seed,'events',eventDate),{date:eventDate,title:'Тестовое событие',preorderEnabled:true,closesAt:Timestamp.fromDate(new Date('2099-10-24T20:00:00Z'))});
   await setDoc(doc(seed,'events',eventDate+'__2'),{date:eventDate,title:'Вторая вечеринка',preorderEnabled:true,closesAt:Timestamp.fromDate(new Date('2099-10-24T20:00:00Z'))});
   await setDoc(doc(seed,'menu','1'),{id:1,name:'Тестовое блюдо',price:25,available:true});
   await setDoc(doc(seed,'admins','admin-emulator'),{active:true});
  });
  await t.test('Google credential in Auth Emulator and profile creation',async()=>{
   const result=await signInWithCredential(auth,GoogleAuthProvider.credential(jwt));
   assert.equal(result.user.emailVerified,true);
   const uid=result.user.uid;
   window.BaliAuth={getProfile:()=>({uid,name:'Тестовый гость',phone:'+375291234567'})};
   await assertSucceeds(setDoc(doc(db,'users',uid),{uid,email:result.user.email,name:'Тестовый гость',phone:'+375291234567',createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  });
  const payload={event_date:eventDate,table_number:'12',booking_id:'',notes:'Тест',items:[{id:1,quantity:2,price:0}]};
  await t.test('real orders-firestore save validates price and assigns a sequence',async()=>{
   const saved=await window.BaliOrders.save(payload);orderId=saved.order_id;
   assert.equal(saved.total,50);assert.equal(saved.order_number,1);
   const order=await window.BaliOrders.getOrderWithItems(orderId);
   assert.equal(order.items[0].unitPrice,25);
   assert.equal(order.eventTitle,'Тестовое событие');
   assert.equal(order.eventId,eventDate);
  });
  await t.test('two parties on one date retain distinct IDs and verified titles',async()=>{
   const second=await window.BaliOrders.save({...payload,event_id:eventDate+'__2'});
   const order=await window.BaliOrders.getOrderWithItems(second.order_id);
   assert.equal(order.eventId,eventDate+'__2');
   assert.equal(order.eventDate,eventDate);
   assert.equal(order.eventTitle,'Вторая вечеринка');
   assert.equal(second.order_number,1,"Вторая вечеринка должна начинать свою нумерацию с №1");
   const third=await window.BaliOrders.save({...payload,event_id:eventDate+'__2',table_number:'13'});
   assert.equal(third.order_number,2,"Номера внутри одного мероприятия должны возрастать");
   await assertFails(updateDoc(doc(db,'orders',second.order_id),
     {eventTitle:'Поддельное название',updatedAt:serverTimestamp()}));
   await window.BaliOrders.save({...payload,event_id:eventDate,table_number:'15'},second.order_id);
   const moved=await window.BaliOrders.getOrderWithItems(second.order_id);
   assert.equal(moved.eventId,eventDate);
   assert.equal(moved.orderNumber,2,"Смена мероприятия в ту же дату выдаёт новый номер");
  });
  const uid=auth.currentUser.uid;
  const stranger=env.authenticatedContext('stranger',{email:'stranger@example.test',email_verified:true}).firestore();
  const unverified=env.authenticatedContext(uid,{email:'guest@example.test',email_verified:false}).firestore();
  const staff=env.authenticatedContext('admin-emulator',{email:'admin@example.test',email_verified:true}).firestore();
  await t.test('privacy receipts are verified, private, immutable and use server time',async()=>{
   const consent=doc(db,'users',uid,'privacyConsents','2026-10-21');
   const valid={version:'2026-10-21',processing:true,international:true,acceptedAt:serverTimestamp()};
   await assertFails(setDoc(consent,{...valid,processing:false}));
   await assertFails(setDoc(consent,{...valid,international:false}));
   await assertFails(setDoc(consent,{...valid,acceptedAt:Timestamp.fromMillis(1)}));
   await assertFails(setDoc(consent,{...valid,email:'extra@example.test'}));
   await assertFails(setDoc(doc(stranger,'users',uid,'privacyConsents','2026-10-21'),valid));
   await assertFails(setDoc(doc(unverified,'users',uid,'privacyConsents','2026-10-21'),valid));
   await assertSucceeds(setDoc(consent,valid));
   assert.equal((await getDoc(consent)).data().processing,true);
   await assertSucceeds(getDoc(doc(staff,'users',uid,'privacyConsents','2026-10-21')));
   for(const client of [stranger,unverified,env.unauthenticatedContext().firestore()]){
    await assertFails(getDoc(doc(client,'users',uid,'privacyConsents','2026-10-21')));
   }
   await assertFails(updateDoc(consent,{acceptedAt:serverTimestamp()}));
   await assertFails(setDoc(doc(db,'users',uid,'privacyConsents','unknown'),{...valid,version:'unknown'}));
  });
  await t.test('withdrawal requires own consent, remains private and cannot be overwritten',async()=>{
   const ref=doc(db,'users',uid,'privacyWithdrawals','2026-10-21');
   const valid={version:'2026-10-21',requestedAt:serverTimestamp()};
   await assertFails(setDoc(doc(stranger,'users','stranger','privacyWithdrawals','2026-10-21'),valid));
   await assertFails(setDoc(doc(stranger,'users',uid,'privacyWithdrawals','2026-10-21'),valid));
   await assertFails(setDoc(ref,{...valid,requestedAt:Timestamp.fromMillis(1)}));
   await assertSucceeds(setDoc(ref,valid));
   await assertFails(updateDoc(ref,{requestedAt:serverTimestamp()}));
   await assertFails(getDoc(doc(stranger,'users',uid,'privacyWithdrawals','2026-10-21')));
   await assertSucceeds(getDoc(doc(staff,'users',uid,'privacyWithdrawals','2026-10-21')));
  });
  await t.test('other users and unverified accounts cannot read private data',async()=>{
   for(const client of [stranger,unverified,env.unauthenticatedContext().firestore()]){
    await assertFails(getDoc(doc(client,'users',uid)));
    await assertFails(getDoc(doc(client,'orders',orderId)));
    await assertFails(getDocs(collection(client,'orders',orderId,'items')));
    await assertFails(getDoc(doc(client,'guestWallets',uid)));
   }
   await assertFails(getDocs(collection(db,'orders')));
   await assertSucceeds(getDocs(query(collection(db,'orders'),where('ownerUid','==',uid))));
  });
  await t.test('roles, wallet writes, prices and ownership cannot be forged',async()=>{
   await assertFails(setDoc(doc(db,'admins',uid),{active:true}));
   await assertFails(setDoc(doc(db,'staffRoles',uid),{role:'director',active:true}));
   await assertFails(setDoc(doc(db,'guestWallets',uid),{uid,grants:[]}));
   await assertFails(updateDoc(doc(db,'users',uid),{role:'admin',updatedAt:serverTimestamp()}));
   await assertFails(updateDoc(doc(db,'orders',orderId),{ownerUid:'stranger',updatedAt:serverTimestamp()}));
   await assertFails(updateDoc(doc(db,'orders',orderId,'items','1'),{unitPrice:1}));
   await assertFails(setDoc(doc(db,'orderCounters',eventDate),{date:eventDate,count:500,lastOrderId:orderId,updatedAt:serverTimestamp()}));
  });
  await t.test('catalog details are optional, bounded and editable only by verified admins',async()=>{
   for(const name of ['bar_menu','hookah_menu','tea_menu']){
    const ref=doc(staff,name,'details-test');
    const base={name:'Тестовая позиция',category:'Категория',volume1:'Порция',price1:25,volume2:'',price2:0,sort:1,updatedAt:serverTimestamp()};
    await assertSucceeds(setDoc(ref,base));
    await assertSucceeds(setDoc(ref,{...base,description:'Подробное описание',ingredients:'Подробный состав'}));
    const publicCopy=await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),name,'details-test')));
    assert.equal(publicCopy.data().description,'Подробное описание');
    for(const client of [db,stranger,unverified,env.unauthenticatedContext().firestore()]){
     await assertFails(setDoc(doc(client,name,'details-test'),{...base,description:'Подмена описания'}));
    }
    await assertFails(setDoc(ref,{...base,description:'x'.repeat(2401)}));
    await assertFails(setDoc(ref,{...base,ingredients:42}));
    await assertFails(setDoc(ref,{...base,description:'Текст',unknownField:true}));
    await assertSucceeds(setDoc(ref,base));
    assert.equal((await getDoc(ref)).data().description,undefined);
   }
  });
  await t.test('published seasonal image removal and styled CTA survive actual Firestore admin write',async()=>{
   const ref=doc(staff,'promotions','bali-new-year-2026');
   const base={
    title:'НОВАЯ АФИША',description:'',
    imageUrl:'',imageTabletUrl:'',imageMobileUrl:'',imageRemoved:true,
    destination:'contact-modal',buttonText:'Забронировать',
    contactTitle:'Свяжитесь с нами',
    contactLinks:{phone:'',telegram:'',instagram:'',whatsapp:'',viber:''},
    contactEnabled:{phone:true,telegram:true,instagram:true,whatsapp:true,viber:true},
    contactHotspot:{enabled:true,left:4,top:69,width:30,height:17},
    overlay:{enabled:true,fontSize:42,textColor:'#ffffff',
     buttonBackground:'#b9ff51',buttonColor:'#101810',buttonRadius:16,align:'center'},
    sort:0,published:true,updatedAt:serverTimestamp()
   };
   await assertSucceeds(setDoc(ref,base));
   const published=await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),'promotions','bali-new-year-2026')));
   assert.equal(published.data().imageRemoved,true);
   assert.equal(published.data().overlay.buttonRadius,16);
   const newArtwork='data:image/webp;base64,AAAA';
   await assertSucceeds(setDoc(ref,{...base,imageUrl:newArtwork,imageRemoved:false,updatedAt:serverTimestamp()}));
   assert.equal((await getDoc(ref)).data().imageUrl,newArtwork);
   await assertFails(setDoc(doc(stranger,'promotions','bali-new-year-2026'),base));
   await assertFails(setDoc(ref,{...base,overlay:{...base.overlay,buttonRadius:100},updatedAt:serverTimestamp()}));
  });
  await t.test('pending edits, admin confirmation and post-confirmation denial',async()=>{
   await window.BaliOrders.save({...payload,table_number:'14',items:[{id:1,quantity:3}]},orderId);
   assert.equal((await window.BaliOrders.getOrderWithItems(orderId)).tableNumber,'14');
   await assertSucceeds(updateDoc(doc(staff,'orders',orderId),{status:'confirmed',updatedAt:serverTimestamp()}));
   await assert.rejects(window.BaliOrders.save(payload,orderId));
   await assertFails(updateDoc(doc(db,'orders',orderId,'items','1'),{quantity:4}));
   await assertFails(updateDoc(doc(db,'orders',orderId),{status:'pending',updatedAt:serverTimestamp()}));
   await assertSucceeds(updateDoc(doc(staff,'orders',orderId),{status:'completed',updatedAt:serverTimestamp()}));
  });
  await t.test('owner may cancel pending order and other users cannot cancel it',async()=>{
   const saved=await window.BaliOrders.save(payload);
   await assertFails(updateDoc(doc(stranger,'orders',saved.order_id),{status:'cancelled',updatedAt:serverTimestamp()}));
   await window.BaliOrders.cancel(saved.order_id);
   assert.equal((await getDoc(doc(db,'orders',saved.order_id))).data().status,'cancelled');
  });
  await t.test('Storage accepts bounded admin WebP uploads and denies guest/oversized writes',async()=>{
   const adminStorage=env.authenticatedContext('admin-emulator',{email:'admin@example.test',email_verified:true}).storage('gs://demo-bali-menu.appspot.com');
   const guestStorage=env.authenticatedContext(uid,{email:'guest@example.test',email_verified:true}).storage('gs://demo-bali-menu.appspot.com');
   const path='public/admin-emulator/product/'+('a'.repeat(64))+'.webp';
   await assertSucceeds(adminStorage.ref(path).put(new Uint8Array(100),{contentType:'image/webp'}));
   await assertFails(guestStorage.ref('public/'+uid+'/product/'+('b'.repeat(64))+'.webp').put(new Uint8Array(100),{contentType:'image/webp'}));
   await assertFails(adminStorage.ref('public/admin-emulator/product/'+('c'.repeat(64))+'.webp').put(new Uint8Array(180001),{contentType:'image/webp'}));
   await assertFails(adminStorage.ref('public/admin-emulator/product/'+('d'.repeat(64))+'.webp').put(new Uint8Array(100),{contentType:'text/html'}));
  });
  await t.test('server-only checkout gate blocks direct guest writes but keeps cancellation and staff actions',async()=>{
   const flag=doc(staff,'settings','preorderSecurity');
   await assertFails(setDoc(doc(db,'settings','preorderSecurity'),{backendRequired:true,updatedAt:serverTimestamp()}));
   await assertFails(setDoc(flag,{backendRequired:true,unexpected:'x',updatedAt:serverTimestamp()}));
   await assertSucceeds(setDoc(flag,{backendRequired:true,updatedAt:serverTimestamp()}));
   const publicFlag=doc(env.unauthenticatedContext().firestore(),'settings','preorderSecurity');
   assert.equal((await assertSucceeds(getDoc(publicFlag))).data().backendRequired,true);
   await assertFails(setDoc(doc(db,'orders','malicious-order'),{
      ownerUid:uid,email:'guest@example.test',customerName:'Тестовый гость',
      customerPhone:'+375291234567',eventDate,eventId:eventDate,eventTitle:'Тестовое событие',
      orderNumber:82,tableNumber:'5',bookingId:'',notes:'',status:'pending',
      createdAt:serverTimestamp(),updatedAt:serverTimestamp()
   }));
   await env.withSecurityRulesDisabled(async context=>{
    const seed=context.firestore();
    await setDoc(doc(seed,'orders','server-gate-pending'),{
      ownerUid:uid,email:'guest@example.test',customerName:'Тестовый гость',
      customerPhone:'+375291234567',eventDate,eventId:eventDate,eventTitle:'Тестовое событие',
      orderNumber:81,tableNumber:'5',bookingId:'',notes:'',status:'pending',
      createdAt:Timestamp.now(),updatedAt:Timestamp.now()
    });
   });
   const editable=doc(db,'orders','server-gate-pending');
   await assertFails(updateDoc(editable,{tableNumber:'22',updatedAt:serverTimestamp()}));
   await assertFails(setDoc(doc(db,'orders','server-gate-pending','items','1'),
    {id:1,name:'Тестовое блюдо',unitPrice:25,quantity:1}));
   await assertSucceeds(updateDoc(editable,{status:'cancelled',updatedAt:serverTimestamp()}));
   await assertFails(setDoc(doc(db,'orders','malicious-order'),{ownerUid:uid}));
   await assertSucceeds(updateDoc(doc(staff,'orders',orderId),{notes:'Staff note',updatedAt:serverTimestamp()}));
   await assertSucceeds(setDoc(flag,{backendRequired:false,updatedAt:serverTimestamp()}));
  });
  await t.test('logout stops access through the real order client',async()=>{
   await signOut(auth);await assert.rejects(window.BaliOrders.getOrderWithItems(orderId));
  });
 });
}finally{await signOut(auth);await terminate(db);await deleteApp(app);await env.cleanup();}
