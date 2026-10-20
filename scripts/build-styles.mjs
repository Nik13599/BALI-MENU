import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import cssnano from 'cssnano';
const entries=JSON.parse(await readFile('styles/entries.json','utf8'));
const check=process.argv.includes('--check');
const stats={};
await mkdir('generated',{recursive:true});
for(const [page,files] of Object.entries(entries)){
  const root=postcss.root();
  let originalBytes=0;
  for(const reference of files){
    const file=reference.split('?')[0],css=await readFile(file,'utf8');
    originalBytes+=Buffer.byteLength(css);
    const parsed=postcss.parse(css,{from:file});
    // Bundle lives one directory below root. Leave absolute/data URLs intact.
    parsed.walkDecls(decl=>{decl.value=decl.value.replace(/url\(\s*(['"]?)([^'"()]+)\1\s*\)/g,(full,quote,url)=>
      /^(?:[a-z]+:|\/|#)/i.test(url)?full:`url(${quote}../${url}${quote})`);});
    root.append(postcss.comment({text:`source: ${file}`}));
    root.append(parsed.nodes);
  }
  const result=await postcss([cssnano({preset:['default',{
    // Retain cascade-sensitive geometry and owner-approved animation names.
    mergeLonghand:false,reduceIdents:false,discardUnused:false,mergeRules:false
  }]})]).process(root,{from:undefined,map:false});
  const name=page.split('.')[0],output=`generated/${name}.css`;
  const hash=createHash('sha256').update(result.css).digest('hex').slice(0,12);
  const html=await readFile(page,'utf8');
  const next=html.replace(new RegExp(`href="generated/${name}\\.css(?:\\?v=[a-f0-9]+)?"`),`href="generated/${name}.css?v=${hash}"`);
  if(check){
    if(await readFile(output,'utf8')!==result.css||html!==next)throw Error('Stale styles: run npm run build:styles');
  }else{await writeFile(output,result.css);await writeFile(page,next);}
  stats[page]={sources:files.length,originalBytes,bundleBytes:Buffer.byteLength(result.css),hash};
}
console.log(JSON.stringify(stats,null,2));
