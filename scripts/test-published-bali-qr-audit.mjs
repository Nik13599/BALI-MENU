import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=mkdtempSync(join(tmpdir(),'bali-qr-source-audit-'));
const preload=join(directory,'mock.cjs');
writeFileSync(preload,String.raw`
const Module=require('node:module'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const original=Module._load;
Module._load=function(name,...args){return name==='firebase-admin'?{
 credential:{applicationDefault:()=>({getAccessToken:async()=>({access_token:'fixture-oauth-secret'})})}
}:original.call(this,name,...args)};
const result=spawnSync('python3',['-c',
 'import sys,zipfile,io; out=io.BytesIO(); z=zipfile.ZipFile(out,"w"); z.writestr("bonus-qr.js",sys.stdin.buffer.read()); z.close(); sys.stdout.buffer.write(out.getvalue())'
],{input:process.env.BALI_AUDIT_CASE==='mismatch'?Buffer.from('old-version'):fs.readFileSync('functions/bonus-qr.js')});
if(result.status!==0)throw Error('fixture archive failed');
global.fetch=async(url,options)=>{
 if(String(url).startsWith('https://storage.googleapis.com/fixture-bali-source'))
  return new Response(result.stdout);
 if(!String(url).startsWith('https://cloudfunctions.googleapis.com/v2/projects/bali-menu-5a48b/locations/europe-west1/functions/'))
  throw Error('Unexpected network target');
 if(options.headers.Authorization!=='Bearer fixture-oauth-secret')throw Error('Missing real credential path');
 if(process.env.BALI_AUDIT_CASE==='denied')return new Response('{}',{status:403});
 if(process.env.BALI_AUDIT_CASE==='missing')return new Response('{}',{status:404});
 if(String(url).endsWith(':generateDownloadUrl'))return Response.json({
  downloadUrl:'https://storage.googleapis.com/fixture-bali-source?private-signature=never-log-this'
 });
 return Response.json({state:'ACTIVE',updateTime:'2026-10-23T00:00:00Z',buildConfig:{runtime:'nodejs20',
  sourceProvenance:{resolvedStorageSource:{bucket:'fixture-bali-source',object:'source.zip',generation:'1'}}},
  serviceConfig:{environmentVariables:{SECRET:'never-print-env'},revision:'fixture-revision',maxInstanceRequestConcurrency:80}
 });
};
`);
try{
 for(const scenario of ['matches','mismatch','missing','denied']){
  const run=spawnSync(process.execPath,['--require',preload,resolve('scripts/audit-published-bali-qr.mjs')],{
   encoding:'utf8',timeout:30000,env:{...process.env,FIREBASE_PROJECT_ID:'bali-menu-5a48b',BALI_AUDIT_CASE:scenario}
  });
  assert(!run.error,run.error?.message);
  assert.equal(run.status,scenario==='matches'?0:2,run.stderr);
  const report=JSON.parse(run.stdout);
  assert.equal(report.allQrSourcesVerified,scenario==='matches');
  assert.equal(report.functions.length,3);
  assert(!run.stdout.includes('fixture-oauth-secret'));
  assert(!run.stdout.includes('never-print-env'));
  assert(!run.stdout.includes('never-log-this'));
 }
 console.log('Published QR audit: real source bytes compared; old/missing/denied source never passes; OAuth, signed URLs and runtime secrets stay private PASS');
}finally{rmSync(directory,{recursive:true,force:true});}
