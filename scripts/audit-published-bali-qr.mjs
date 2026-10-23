/* Read-only production source verification. No function invokes/deploys.
 * Credentials, signed URLs, source archives and runtime env are never logged.
 */
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const project='bali-menu-5a48b',region='europe-west1';
if(process.env.FIREBASE_PROJECT_ID!==project)throw Error('Firebase project mismatch');
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const credential=admin.credential.applicationDefault();
const {access_token:token}=await credential.getAccessToken();
const root='https://cloudfunctions.googleapis.com/v2/projects/'+project+'/locations/'+region+'/functions/';
const temporary=mkdtempSync(join(tmpdir(),'bali-published-source-'));
const expected=createHash('sha256').update(readFileSync('functions/bonus-qr.js')).digest('hex');
const archiveCache=new Map();
const report=[];
const request=async(path,method='GET')=>fetch(root+path,{method,
 headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
try{
 for(const id of ['applyBaliBonusQR','listBaliQrCodes','createBaliQrBatch']){
  const response=await request(id);
  if(response.status===404){report.push({id,deployed:false});continue;}
  if(!response.ok){report.push({id,metadataAvailable:false,httpStatus:response.status});continue;}
  const fn=await response.json();
  const row={id,deployed:true,state:fn.state,updatedAt:fn.updateTime,
   runtime:fn.buildConfig?.runtime,revision:fn.serviceConfig?.revision,
   maxInstances:fn.serviceConfig?.maxInstanceCount,
   concurrency:fn.serviceConfig?.maxInstanceRequestConcurrency,
   expectedQrSourceSha256:expected,qrSourceMatches:false};
  const source=fn.buildConfig?.sourceProvenance?.resolvedStorageSource||fn.buildConfig?.source?.storageSource;
  const sourceKey=source?JSON.stringify([source.bucket,source.object,source.generation]):id;
  if(!archiveCache.has(sourceKey)){
   const signed=await request(id+':generateDownloadUrl','POST');
   if(!signed.ok){row.sourceDownloadStatus=signed.status;report.push(row);continue;}
   const {downloadUrl}=await signed.json();
   const url=new URL(downloadUrl);
   if(url.protocol!=='https:'||!(url.hostname==='storage.googleapis.com'||url.hostname.endsWith('.storage.googleapis.com')))
    throw Error('Unexpected source download host');
   const downloaded=await fetch(downloadUrl,{signal:AbortSignal.timeout(45000)});
   if(!downloaded.ok)throw Error('Source download unavailable');
   const data=Buffer.from(await downloaded.arrayBuffer());
   if(data.length>150*1024*1024)throw Error('Source archive exceeds audit bound');
   const path=join(temporary,'source-'+archiveCache.size+'.archive');
   writeFileSync(path,data,{mode:0o600});
   const python=spawnSync('python3',['-c',[
    'import sys,zipfile,tarfile,hashlib,json',
    'path=sys.argv[1]; hashes={}',
    'if zipfile.is_zipfile(path):',
    ' with zipfile.ZipFile(path) as archive:',
    '  for item in archive.infolist():',
    '   if item.filename.strip("./")=="bonus-qr.js" and item.file_size<2097152:',
    '    hashes["bonus-qr.js"]=hashlib.sha256(archive.read(item)).hexdigest()',
    'else:',
    ' with tarfile.open(path,"r:*") as archive:',
    '  for item in archive:',
    '   if item.name.strip("./")=="bonus-qr.js" and item.isfile() and item.size<2097152:',
    '    hashes["bonus-qr.js"]=hashlib.sha256(archive.extractfile(item).read()).hexdigest()',
    'print(json.dumps(hashes))'
   ].join('\n'),path],{encoding:'utf8',timeout:30000,maxBuffer:4096});
   if(python.status!==0)throw Error('Source archive could not be inspected');
   archiveCache.set(sourceKey,JSON.parse(python.stdout));
  }
  row.publishedQrSourceSha256=archiveCache.get(sourceKey)['bonus-qr.js']||null;
  row.qrSourceMatches=row.publishedQrSourceSha256===expected;
  report.push(row);
 }
 const verified=report.length===3&&report.every(r=>r.deployed&&r.state==='ACTIVE'&&r.qrSourceMatches);
 console.log(JSON.stringify({project,mode:'read-only',functions:report,allQrSourcesVerified:verified}));
 if(!verified)process.exitCode=2;
}catch{
 console.log(JSON.stringify({project,mode:'read-only',sourceAudit:'unavailable',functions:report,
  allQrSourcesVerified:false}));
 process.exitCode=1;
}finally{rmSync(temporary,{recursive:true,force:true});}
