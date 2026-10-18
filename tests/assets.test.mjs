import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyBundledAssets} from '../src/assets.mjs';

test('bundled verification works offline, rejects tampering, traversal and escaped symlinks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dap-bundled-')),outside=await mkdtemp(join(tmpdir(),'dap-outside-'));
 const bytes=Buffer.from('bundled artwork fixture');
 const asset={file:'assets/atlases/test.png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 try{
  await mkdir(join(root,'assets/atlases'),{recursive:true});await writeFile(join(root,asset.file),bytes);
  await verifyBundledAssets(root,[asset]);
  await writeFile(join(root,asset.file),'corrupted');await assert.rejects(verifyBundledAssets(root,[asset]),/integrity/);
  await assert.rejects(verifyBundledAssets(root,[{...asset,file:'../outside.png'}]),/path/);
  await rm(join(root,'assets/atlases'),{recursive:true});await writeFile(join(outside,'test.png'),bytes);
  await symlink(outside,join(root,'assets/atlases'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(verifyBundledAssets(root,[asset]),/Unsafe/);
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
