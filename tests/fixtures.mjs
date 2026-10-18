import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {decodeMotionPng,encodeMotionPng} from '../src/motions.mjs';
export async function fixture(root, skins, {originals=true}={}) {
 await mkdir(join(root,'assets'),{recursive:true});
 await cp(new URL('../assets/generated',import.meta.url),join(root,'assets/generated'),{recursive:true});
 const pixels=Buffer.alloc(1536*2288*4);
 for(let row=0;row<11;row++){const k=row*208*1536*4;pixels[k]=row+20;pixels[k+1]=170;pixels[k+3]=255;}
 const bytes=encodeMotionPng({width:1536,height:2288,pixels});
 const meta={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const catalog=structuredClone(skins);for(const skin of catalog){skin.originalAsset=meta;if(originals)await writeFile(join(root,skin.spritesheetPath),bytes);}
 return {catalog,bytes,source:{repository:'heelee912/chiikawa-dots-pets',commit:'bb96582f525fbdf88a236b4703433ae92bfd5888',assets:catalog.map(s=>({id:s.id,...meta}))}};
}
export async function pluginFixture(root, skins, {originals=false}={}) {
 const result=await fixture(root,skins,{originals});
 await mkdir(join(root,'dap_chiikawa'),{recursive:true});
 let code=await readFile(new URL('../dap_chiikawa/plugin.mjs',import.meta.url),'utf8');
 code=code.replace(/^const SKINS = .*;$/m,'const SKINS = '+JSON.stringify(result.catalog)+';').replace(/^const SOURCE = .*;$/m,'const SOURCE = '+JSON.stringify(result.source)+';');
 await writeFile(join(root,'dap_chiikawa/plugin.mjs'),code);
 return result;
}
