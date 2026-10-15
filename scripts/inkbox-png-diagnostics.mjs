// Read-only PNG diagnostics. Numbers describe the crop; they are not art gates.
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';

export function pngDiagnostics(file, palette) {
  const data=fs.readFileSync(file),idat=[];let width,height,channels;
  if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Not PNG');
  for(let p=8;p<data.length;){const n=data.readUInt32BE(p),type=data.toString('ascii',p+4,p+8),body=data.subarray(p+8,p+8+n);
    if(type==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);channels=body[9]===6?4:body[9]===2?3:0;
      if(body[8]!==8||!channels||body[12]!==0)throw new Error('Unsupported PNG format');}
    if(type==='IDAT')idat.push(body);p+=n+12;
  }
  const bytes=inflateSync(Buffer.concat(idat)),stride=width*channels,rows=Buffer.alloc(height*stride);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=bytes[y*(stride+1)];for(let x=0;x<stride;x++){
    const a=x>=channels?rows[y*stride+x-channels]:0,b=y?rows[(y-1)*stride+x]:0,c=y&&x>=channels?rows[(y-1)*stride+x-channels]:0;
    const delta=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];if(delta===undefined)throw new Error('PNG filter');
    rows[y*stride+x]=(bytes[y*(stride+1)+1+x]+delta)&255;
  }}
  // Fixed 1500x940 DPR1 browser: central product canvas, excluding sidebars.
  const crop={x:178,y:105,width:Math.min(1086,width-178),height:Math.min(744,height-105)};
  const swatches=palette.map(hex=>[1,3,5].map(p=>parseInt(hex.slice(p,p+2),16)));
  let count=0,sat=0,paper=0,mid=0,red=0,edges=0;const hist=Array(10).fill(0),occupancy=Array(palette.length).fill(0);
  const luminance=(x,y)=>{const p=y*stride+x*channels;return (.2126*rows[p]+.7152*rows[p+1]+.0722*rows[p+2])/255;};
  for(let y=crop.y;y<crop.y+crop.height;y+=3)for(let x=crop.x;x<crop.x+crop.width;x+=3){
    const p=y*stride+x*channels,r=rows[p],g=rows[p+1],b=rows[p+2],max=Math.max(r,g,b),min=Math.min(r,g,b),l=luminance(x,y);
    count++;sat+=max?(max-min)/max:0;paper+=l>.75&&max-min<45?1:0;mid+=l>=.25&&l<=.75?1:0;
    red+=r>g*1.35&&r>b*1.35&&r>80?1:0;hist[Math.min(9,Math.floor(l*10))]++;
    if(x+3<width&&y+3<height&&Math.max(Math.abs(l-luminance(x+3,y)),Math.abs(l-luminance(x,y+3)))>.08)edges++;
    let nearest=0,distance=Infinity;swatches.forEach((s,i)=>{const d=(r-s[0])**2+(g-s[1])**2+(b-s[2])**2;if(d<distance){distance=d;nearest=i;}});occupancy[nearest]++;
  }
  return {diagnosticOnly:true,width,height,crop,samples:count,nearPaperRatio:paper/count,meanSaturation:sat/count,midToneRatio:mid/count,
    luminanceDistribution:hist.map(n=>n/count),edgeDensity:edges/count,redAccentArea:red/count,
    nearestPaletteOccupancy:Object.fromEntries(palette.map((hex,i)=>[hex,occupancy[i]/count])),
    limitation:'Central canvas crop may retain HUD/selection overlays; nearest swatches do not prove semantic palette membership.'};
}
