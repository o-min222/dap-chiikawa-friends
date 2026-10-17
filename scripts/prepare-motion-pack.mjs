import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeMotionPng,encodeMotionPng} from '../src/motions.mjs';
const root=new URL('../',import.meta.url), study=new URL('dist/chiikawa-motion-v3/',root);
const source=JSON.parse(await readFile(new URL('motions.json',study),'utf8'));
const aliases={'eat':'feed_munch','move-left':'running-left','move-right':'running-right','work-book':'running','work-flyer':'working_v2'};
const pack=[];
await mkdir(new URL('assets/generated/',root),{recursive:true});
for(const motion of source.motions){
 const image=decodeMotionPng(await readFile(new URL(motion.alignedFile,study)));
 const pixels=Buffer.alloc(1536*208*4);
 if(image.height!==208||image.width!==motion.holdsMs.length*192)throw Error('Unexpected aligned strip dimensions');
 for(let y=0;y<208;y++)image.pixels.copy(pixels,y*1536*4,y*image.width*4,(y+1)*image.width*4);
 const bytes=encodeMotionPng({width:1536,height:208,pixels});
 const characterId=motion.characterId??'chiikawa', key=motion.id.replace(/^(momonga|hachiware)-/,'');
 const item={id:motion.id,characterId,motion:aliases[key]??key,file:`assets/generated/${motion.id}.png`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),holdsMs:motion.holdsMs};
 if(motion.hops)item.hops=motion.hops;
 await writeFile(new URL(item.file,root),bytes);pack.push(item);
}
await writeFile(new URL('assets/motions.json',root),JSON.stringify(pack,null,2)+'\n');
console.log(`Prepared ${pack.length} generated strips without original atlases`);
