import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './fixtures.mjs';
import {hasOriginalAssets,downloadOriginalAssets} from '../src/upstream.mjs';
const skins=JSON.parse(await readFile(new URL('../assets/catalog.json',import.meta.url),'utf8'));
test('upstream verification rejects altered downloads and does not leave partial files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dap-upstream-'));
 try{
 const {source,bytes}=await fixture(root,skins,{originals:false});
 const one={...source,assets:source.assets.slice(0,1)};
 assert.equal(await hasOriginalAssets(root,one),false);
 const invalid=Buffer.from(bytes);invalid[invalid.length-10]^=1;
 await assert.rejects(downloadOriginalAssets(root,one,{fetcher:async()=>new Response(invalid)}),/해시|크기/);
 await assert.rejects(stat(join(root,'assets/chiikawa.png')),{code:'ENOENT'});
 await assert.rejects(downloadOriginalAssets(root,one,{fetcher:async()=>new Response(Buffer.concat([bytes,Buffer.from('extra')]))}),/크기/);
 const aborted=new AbortController();aborted.abort();
 await assert.rejects(downloadOriginalAssets(root,one,{signal:aborted.signal,fetcher:async()=>{throw Error('Must not fetch');}}),{name:'AbortError'});
 }finally{await rm(root,{recursive:true,force:true});}
});
