import {forceSimulation,forceX,forceY,forceManyBody,forceCollide,forceLink,type SimulationNodeDatum,type SimulationLinkDatum} from "d3-force";

export type XY={x:number,y:number};
type Particle=SimulationNodeDatum&{id:number,x:number,y:number,vx:number,vy:number,goal:XY};
type Spring=SimulationLinkDatum<Particle>&{distance:number};
export const ENGINE="d3-force@3.0.0";
export type Pair={a:number,b:number};
export function makePhysics(goals:XY[],initial:XY[],pairs:Pair[],active=true){
 const limit=active?124:85;
 const particles:Particle[]=goals.map((goal,id)=>({id,goal:{...goal},x:initial[id]?.x??goal.x,y:initial[id]?.y??goal.y,vx:0,vy:0}));
 const edges:Spring[]=pairs.filter(({a,b})=>a>=0&&b>=0&&a<particles.length&&b<particles.length&&a!==b).map(({a,b})=>({source:a,target:b,distance:Math.max(active?15:10,Math.hypot(goals[a].x-goals[b].x,goals[a].y-goals[b].y))}));
 // The D3 timer is stopped. The application owns the only frame loop.
 const simulation=forceSimulation<Particle>(particles).stop()
 .alpha(1).alphaDecay(.055).alphaMin(.008).velocityDecay(.43)
 .force("anchor-x",forceX<Particle>(n=>n.goal.x).strength(.24))
 .force("anchor-y",forceY<Particle>(n=>n.goal.y).strength(.24))
 .force("charge",forceManyBody<Particle>().strength(active?-13:-5).distanceMax(85))
 .force("collision",forceCollide<Particle>(active?8:5).strength(1).iterations(3))
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
 return {step,running:()=>particles.length>0&&simulation.alpha()>=simulation.alphaMin(),dispose:()=>simulation.stop()};
}
