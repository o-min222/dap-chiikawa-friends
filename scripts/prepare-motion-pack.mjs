import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeMotionPng,encodeMotionPng} from '../src/motions.mjs';
const root=new URL('../',import.meta.url), study=new URL('dist/chiikawa-motion-v3/',root);
const source=JSON.parse(await readFile(new URL('motions.json',study),'utf8'));
const aliases={'eat':'feed_munch','move-left':'running-left','move-right':'running-right','work':'running','work-book':'running','work-flyer':'working_v2'};
const pack=[];
await mkdir(new URL('assets/generated/',root),{recursive:true});
for(const motion of source.motions){
 if(motion.reviewStatus==='deferred'||motion.previewOnly)continue;
 const image=decodeMotionPng(await readFile(new URL(motion.alignedFile,study)));
 const pixels=Buffer.alloc(1536*208*4);
 if(image.height!==208||image.width!==motion.holdsMs.length*192)throw Error('Unexpected aligned strip dimensions');
 const frames=motion.runtimeFrames??motion.holdsMs.map((holdMs,index)=>({index,holdMs}));
 if(frames.length<1||frames.length>8||frames.some(f=>!Number.isInteger(f.index)||f.index<0||f.index>=motion.frames.length||!(f.holdMs>0))||frames.reduce((sum,f)=>sum+f.holdMs,0)!==motion.holdsMs.reduce((a,b)=>a+b,0))throw Error('Invalid runtime frame selection');
 for(let frame=0;frame<frames.length;frame++)for(let y=0;y<208;y++){
  const start=(y*image.width+frames[frame].index*192)*4;
  image.pixels.copy(pixels,(y*1536+frame*192)*4,start,start+192*4);
 }
 const bytes=encodeMotionPng({width:1536,height:208,pixels});
 const characterId=motion.characterId??'chiikawa', key=motion.id.replace(/^(chiikawa|hachiware|usagi|momonga)-/,'');
 const item={id:motion.id,characterId,motion:aliases[key]??key,file:`assets/generated/${motion.id}.png`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),holdsMs:frames.map(f=>f.holdMs)};
 if(motion.hops)item.hops=motion.hops;
 if(motion.reviewStatus)item.reviewStatus=motion.reviewStatus;
 await writeFile(new URL(item.file,root),bytes);pack.push(item);
}
await writeFile(new URL('assets/motions.json',root),JSON.stringify(pack,null,2)+'\n');
console.log(`Prepared ${pack.length} generated strips without original atlases`);
