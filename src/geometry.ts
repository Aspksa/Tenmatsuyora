export type Point={x:number,y:number};
export type Group={page:number,count:number,mask?:number};
export const SPACING=350;
export function center(page:number):Point{
 // Stable hexagonal rings; old coordinates do not change when new groups arrive.
 let ring=1,index=page;
 while(index>=6*ring){index-=6*ring;ring++;}
 let q=0,r=-ring;
 const directions=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
 for(let i=0;i<index;i++){const [dq,dr]=directions[Math.floor(i/ring)];q+=dq;r+=dr;}
 // Irregular, deterministic offsets preserve clearance between group centers.
 const a=page*2.39996323;
 return {x:SPACING*(q+r/2)+26*Math.cos(a),y:SPACING*Math.sqrt(3)/2*r+26*Math.sin(a)};

}
export function points(ids:number[],active:boolean):Point[]{
 const a=ids.map(id=>{const s=(id-1)%30,theta=s*2.39996323+Math.sin(id*9.17)*.23,r=24+Math.sqrt(s+1)*(active?16:8)+Math.sin(id*4.73)*5;return {x:Math.cos(theta)*r,y:Math.sin(theta)*r};});
 // Bounded attraction to the initial target plus short-range mutual repulsion.
 const p=a.map(v=>({...v})),gap=active?17:10;
 for(let k=0;k<12;k++){
 for(let i=0;i<p.length;i++){
 for(let j=i+1;j<p.length;j++){
 const dx=p[j].x-p[i].x,dy=p[j].y-p[i].y,d=Math.hypot(dx,dy);
 if(d>0&&d<gap){const push=(gap-d)*.5/d;p[i].x-=dx*push;p[i].y-=dy*push;p[j].x+=dx*push;p[j].y+=dy*push;}
 }
 p[i].x+=(a[i].x-p[i].x)*.1;p[i].y+=(a[i].y-p[i].y)*.1;
 }}
 return p;
}
export function fit(groups:Group[]):{x:number,y:number,k:number}{
 const p=[{x:0,y:0},...groups.map(g=>center(g.page))];
 const left=Math.min(...p.map(v=>v.x))-145,right=Math.max(...p.map(v=>v.x))+145,top=Math.min(...p.map(v=>v.y))-145,bottom=Math.max(...p.map(v=>v.y))+145;
 return {x:(left+right)/2,y:(top+bottom)/2,k:Math.min(1.45,800/(right-left),690/(bottom-top))};
}

export function slots(group:Group):number[]{
 const mask=group.mask??0;
 return Array.from({length:30},(_,i)=>i).filter(i=>(mask&(1<<i))!==0).map(i=>group.page*30+i+1);
}
export function drift(id:number,time:number,amplitude:number):Point{
 return {x:Math.sin(time*.00063+id*2.13)*amplitude,y:Math.cos(time*.00051+id*1.79)*amplitude};
}
export function normalizePreferences(value:unknown){
 const d=typeof value==="object"&&value!==null?value as Record<string,unknown>:{};
 const num=(v:unknown,lo:number,hi:number,fallback:number)=>typeof v==="number"&&Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):fallback;
 const c=typeof d.camera==="object"&&d.camera!==null?d.camera as Record<string,unknown>:null;
 return {glow:num(d.glow,.25,1.5,1),speed:num(d.speed,0,2,1),quality:d.quality==="low"?"low":"high",camera:c?{x:num(c.x,-100000,100000,0),y:num(c.y,-100000,100000,0),k:num(c.k,.035,3,1)}:null,auto:d.auto!==false};
}
