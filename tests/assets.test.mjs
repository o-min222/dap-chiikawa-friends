import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,readdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {downloadOriginalAssets,hasOriginalAssets} from '../dap_chiikawa/plugin.mjs';
// Synthetic PNG header fixture; the real host separately decodes the pinned originals.
const fixture=()=>{const bytes=Buffer.alloc(32);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(1536,16);bytes.writeUInt32BE(2288,20);return bytes;};
const sourceFor=(bytes)=>({repository:'heelee912/chiikawa-dots-pets',commit:'bb96582f525fbdf88a236b4703433ae92bfd5888',assets:[{id:'chiikawa',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]});
async function sandbox(fn){const root=await mkdtemp(join(tmpdir(),'dap-assets-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('downloads from one immutable source, verifies before publishing and reuses a valid cache',()=>sandbox(async root=>{
 const bytes=fixture(),source=sourceFor(bytes);let requests=0;
 assert.equal(await hasOriginalAssets(root,source),false);
 await downloadOriginalAssets(root,source,{fetcher:async(url,opts)=>{requests++;assert.match(url,/raw\.githubusercontent\.com\/heelee912\/chiikawa-dots-pets\/bb96582f525fbdf88a236b4703433ae92bfd5888\/pets\/chiikawa\/spritesheet\.png$/);assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');return new Response(bytes);}});
 assert.deepEqual(await readFile(join(root,'assets/chiikawa.png')),bytes);
 assert.equal(await hasOriginalAssets(root,source),true);
 await downloadOriginalAssets(root,source,{fetcher:()=>{throw Error('should use cache');}});
 assert.equal(requests,1);assert.deepEqual(await readdir(join(root,'assets')),['chiikawa.png']);
}));
test('checksum failure and oversized response never replace a previous file',()=>sandbox(async root=>{
 const bytes=fixture(),source=sourceFor(bytes);await mkdir(join(root,'assets'));await writeFile(join(root,'assets/chiikawa.png'),'previous');
 const bad=Buffer.from(bytes);bad[31]=1;
 await assert.rejects(downloadOriginalAssets(root,source,{fetcher:async()=>new Response(bad)}),/해시/);
 assert.equal(await readFile(join(root,'assets/chiikawa.png'),'utf8'),'previous');
 await assert.rejects(downloadOriginalAssets(root,source,{fetcher:async()=>new Response(Buffer.alloc(33))}),/크기/);
 assert.deepEqual(await readdir(join(root,'assets')),['chiikawa.png']);
}));
test('HTTP failure retries cleanly; cancellation never starts another request',()=>sandbox(async root=>{
 const bytes=fixture(),source=sourceFor(bytes);
 await assert.rejects(downloadOriginalAssets(root,source,{fetcher:async()=>new Response('missing',{status:404})}),/404/);
 await downloadOriginalAssets(root,source,{fetcher:async()=>new Response(bytes)});
 await rm(join(root,'assets/chiikawa.png'));
 const controller=new AbortController();controller.abort();
 await assert.rejects(downloadOriginalAssets(root,source,{signal:controller.signal,fetcher:()=>{throw Error('unexpected fetch');}}),{name:'AbortError'});
}));
test('rejects unsafe ids and sources before requesting data',()=>sandbox(async root=>{
 const bytes=fixture(),source=sourceFor(bytes),fetcher=()=>{throw Error('unexpected fetch');};
 await assert.rejects(downloadOriginalAssets(root,{...source,repository:'other/repo'},{fetcher}),/저장소/);
 await assert.rejects(downloadOriginalAssets(root,{...source,assets:[{...source.assets[0],id:'../outside'}]},{fetcher}),/정보/);
}));
test('rejects assets-directory symlinks/junctions and existing file symlinks',()=>sandbox(async root=>{
 const bytes=fixture(),source=sourceFor(bytes);const outside=await mkdtemp(join(tmpdir(),'dap-outside-'));
 try{await symlink(outside,join(root,'assets'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(downloadOriginalAssets(root,source),/폴더/);assert.deepEqual(await readdir(outside),[]);
 await rm(join(root,'assets'),{recursive:true,force:true});
 if(process.platform!=='win32'){
  await mkdir(join(root,'assets'));await writeFile(join(outside,'sheet.png'),'outside');await symlink(join(outside,'sheet.png'),join(root,'assets/chiikawa.png'));
  await assert.rejects(downloadOriginalAssets(root,source),/경로/);assert.equal(await readFile(join(outside,'sheet.png'),'utf8'),'outside');
 }
 }finally{await rm(outside,{recursive:true,force:true});}
}));

test('abort while a request is pending leaves no partial image',()=>sandbox(async root=>{
 const bytes=fixture(),source=sourceFor(bytes),controller=new AbortController();let started;
 const ready=new Promise(resolve=>{started=resolve;});
 const pending=downloadOriginalAssets(root,source,{signal:controller.signal,fetcher:async(_url,options)=>{
  started();return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
 }});
 await ready;controller.abort();await assert.rejects(pending,{name:'AbortError'});
 assert.deepEqual(await readdir(join(root,'assets')),[]);
}));
