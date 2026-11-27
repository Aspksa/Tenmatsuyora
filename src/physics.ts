import {forceSimulation,forceX,forceY,forceManyBody,forceCollide,forceLink,type SimulationNodeDatum,type SimulationLinkDatum} from "d3-force";

export type XY={x:number,y:number};
type Particle=SimulationNodeDatum&{id:number,x:number,y:number,vx:number,vy:number,goal:XY,mass:number};
type Spring=SimulationLinkDatum<Particle>&{distance:number};
export const ENGINE="d3-force@3.0.0";
export type Pair={a:number,b:number};
export function makePhysics(goals:XY[],initial:XY[],pairs:Pair[],active=true,masses:number[]=[]){
 const limit=active?124:85;
 const particles:Particle[]=goals.map((goal,id)=>({id,goal:{...goal},x:initial[id]?.x??goal.x,y:initial[id]?.y??goal.y,vx:0,vy:0,mass:Math.min(3,Math.max(1,masses[id]??1))}));
 const edges:Spring[]=pairs.filter(({a,b})=>a>=0&&b>=0&&a<particles.length&&b<particles.length&&a!==b).map(({a,b})=>({source:a,target:b,distance:Math.max(active?15:10,Math.hypot(goals[a].x-goals[b].x,goals[a].y-goals[b].y))}));
 // The D3 timer is stopped. The application owns the only frame loop.
 const simulation=forceSimulation<Particle>(particles).stop()
 .alpha(1).alphaDecay(.055).alphaMin(.008).velocityDecay(.43)
 .force("anchor-x",forceX<Particle>(n=>n.goal.x).strength(n=>.24/Math.sqrt(n.mass)))
 .force("anchor-y",forceY<Particle>(n=>n.goal.y).strength(n=>.24/Math.sqrt(n.mass)))
 .force("charge",forceManyBody<Particle>().strength(n=>(active?-13:-5)*Math.sqrt(n.mass)).distanceMax(85))
 .force("collision",forceCollide<Particle>(n=>(active?8:5)*Math.pow(n.mass,.2)).strength(1).iterations(3))
 .force("links",forceLink<Particle,Spring>(edges).id(n=>n.id).distance(e=>e.distance).strength(.12));
 function step(iterations=1){
  for(let i=0;i<iterations;i++){
   simulation.tick();
   for(const p of particles){
    const r=Math.hypot(p.x,p.y);
    if(!Number.isFinite(r)){p.x=p.goal.x;p.y=p.goal.y;p.vx=p.vy=0;}
    else if(r>limit){p.x*=limit/r;p.y*=limit/r;p.vx=p.vy=0;}
   }
  }
  return particles.map(({x,y})=>({x,y}));
 }
 function release(i:number){const p=particles[i];if(p){p.fx=null;p.fy=null;simulation.alpha(Math.max(.45,simulation.alpha()));}}
 function hold(i:number){const p=particles[i];if(p){p.fx=p.x;p.fy=p.y;}}
 return {step,hold,release,running:()=>particles.length>0&&simulation.alpha()>=simulation.alphaMin(),dispose:()=>simulation.stop()};
}

export type GalaxySeed={page:number,count:number,active:boolean,goal:XY,position:XY};
export type GalaxyLink={a:number,b:number,weight:number};
type GalaxyNode=SimulationNodeDatum&{page:number,x:number,y:number,vx:number,vy:number,goal:XY,mass:number,radius:number};
type GalaxySpring=SimulationLinkDatum<GalaxyNode>&{distance:number,weight:number};
export function starMass(length:number){return 1+Math.min(2,Math.log2(1+Math.max(0,length)/100)/3);}
export function clusterMass(count:number){return 1+Math.sqrt(Math.max(0,count));}
export function clusterRadius(count:number,active:boolean){return active?124*(.88+Math.min(30,count)*.019)+18:85;}
export function massCenter(seeds:{position:XY,count:number}[]):XY{
 let x=0,y=0,m=0;for(const s of seeds){const w=clusterMass(s.count);x+=s.position.x*w;y+=s.position.y*w;m+=w;}
 return m?{x:x/m,y:y/m}:{x:0,y:0};
}
export function semanticPairs(rows:{query_id:number,source_id:number}[]):GalaxyLink[]{
 const map=new Map<string,GalaxyLink>();
 for(const e of rows){const a=Math.floor((e.query_id-1)/30),b=Math.floor((e.source_id-1)/30);if(a===b||a<0||b<0)continue;
 const left=Math.min(a,b),right=Math.max(a,b),key=left+":"+right;
 const previous=map.get(key);if(previous)previous.weight++;else map.set(key,{a:left,b:right,weight:1});}
 return [...map.values()].sort((a,b)=>b.weight-a.weight||a.a-b.a||a.b-b.b).slice(0,250);
}
export function makeGalaxy(seeds:GalaxySeed[],pairs:GalaxyLink[]){
 const particles:GalaxyNode[]=seeds.map(s=>({page:s.page,x:s.position.x,y:s.position.y,vx:0,vy:0,goal:{...s.goal},mass:clusterMass(s.count),radius:clusterRadius(s.count,s.active)}));
 const byPage=new Map(particles.map(n=>[n.page,n]));
 const springs:GalaxySpring[]=pairs.flatMap(e=>{
  const a=byPage.get(e.a),b=byPage.get(e.b);if(!a||!b||a===b)return [];
  const d=Math.hypot(a.goal.x-b.goal.x,a.goal.y-b.goal.y);
  return [{source:a,target:b,distance:Math.max(a.radius+b.radius+26,d*.86),weight:Math.max(1,Math.min(10,e.weight))}];
 });
 // A stable sector is a weak restoring force, not a fixed location.
 const simulation=forceSimulation<GalaxyNode>(particles).stop().alpha(1).alphaDecay(.042).alphaMin(.009).velocityDecay(.38)
 .force("sector-x",forceX<GalaxyNode>(n=>n.goal.x).strength(n=>.16/Math.sqrt(n.mass)))
 .force("sector-y",forceY<GalaxyNode>(n=>n.goal.y).strength(n=>.16/Math.sqrt(n.mass)))
 .force("gravity-x",forceX<GalaxyNode>(0).strength(.009))
 .force("gravity-y",forceY<GalaxyNode>(0).strength(.009))
 .force("repulsion",forceManyBody<GalaxyNode>().strength(n=>-75*n.mass).distanceMax(950))
 .force("orbits",forceCollide<GalaxyNode>(n=>n.radius+12).strength(1).iterations(3))
 .force("springs",forceLink<GalaxyNode,GalaxySpring>(springs).id(n=>n.page).distance(e=>e.distance).strength(e=>.04+.012*e.weight));
 function step(iterations=1){
  for(let i=0;i<iterations;i++){simulation.tick();for(const n of particles){
   if(!Number.isFinite(n.x)||!Number.isFinite(n.y)){n.x=n.goal.x;n.y=n.goal.y;n.vx=n.vy=0;}
   // Prevent distant semantic edges from dragging a sector arbitrarily far away.
   const dx=n.x-n.goal.x,dy=n.y-n.goal.y,r=Math.hypot(dx,dy);
   if(r>115){n.x=n.goal.x+dx*115/r;n.y=n.goal.y+dy*115/r;n.vx=n.vy=0;}
  }}
  return particles.map(n=>({page:n.page,x:n.x,y:n.y}));
 }
 return {step,running:()=>particles.length>0&&simulation.alpha()>=simulation.alphaMin(),dispose:()=>simulation.stop()};
}
/** Exact point on the same quadratic curve used by the SVG renderer. */
export function alongCurve(a:XY,b:XY,t:number,bend=.045):XY{
 const u=1-t,dx=b.x-a.x,dy=b.y-a.y,cx=a.x+dx*.5-dy*bend,cy=a.y+dy*.5+dx*bend;
 return {x:u*u*a.x+2*u*t*cx+t*t*b.x,y:u*u*a.y+2*u*t*cy+t*t*b.y};
}
