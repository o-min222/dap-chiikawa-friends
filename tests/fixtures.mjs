import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join} from 'node:path';
export async function fixture(root, skins) {
 await mkdir(join(root,'assets'),{recursive:true});
 await cp(new URL('../assets/generated',import.meta.url),join(root,'assets/generated'),{recursive:true});
 return {catalog:structuredClone(skins)};
}
export async function pluginFixture(root, skins) {
 const result=await fixture(root,skins);
 await mkdir(join(root,'dap_chiikawa'),{recursive:true});
 let code=await readFile(new URL('../dap_chiikawa/plugin.mjs',import.meta.url),'utf8');
 code=code.replace(/^const SKINS = .*;$/m,'const SKINS = '+JSON.stringify(result.catalog)+';');
 await writeFile(join(root,'dap_chiikawa/plugin.mjs'),code);
 return result;
}
