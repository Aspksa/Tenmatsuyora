import assert from "node:assert/strict";
import {center,points,fit,slots,drift,normalizePreferences,evolutionCenter,evolutionScale,neighbours} from "../static/geometry.js";
const groups=Array.from({length:334},(_,page)=>({page,count:30}));
const coords=groups.map(g=>center(g.page));
assert.equal(new Set(coords.map(p=>p.x.toFixed(5)+","+p.y.toFixed(5))).size,334);
for(let i=0;i<coords.length;i++)for(let j=i+1;j<coords.length;j++)assert.ok(Math.hypot(coords[i].x-coords[j].x,coords[i].y-coords[j].y)>250);
const c=fit(groups);assert.ok(c.k>0&&c.k<1);
for(const p of coords){assert.ok(Math.abs((p.x-c.x)*c.k)<500);assert.ok(Math.abs((p.y-c.y)*c.k)<450);}
const ids=Array.from({length:30},(_,i)=>i+1),p=points(ids,true);
assert.deepEqual(p,points(ids,true));
assert.ok(p.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Math.hypot(v.x,v.y)<130));
console.log("Geometry: 334 distinct clusters, stable positions, bounded layout and camera");

assert.deepEqual(slots({page:2,count:3,mask:1|4|(1<<29)}),[61,63,90]);
assert.equal(drift(1,123,0).x,0);
assert.ok(Math.abs(drift(1,123,4).y)<=4);
assert.equal(normalizePreferences({glow:99,speed:-1}).glow,1.5);
assert.equal(normalizePreferences({glow:99,speed:-1}).speed,0);

assert.ok(evolutionScale(30,true)>evolutionScale(30,false));
assert.ok(evolutionScale(30,true)>evolutionScale(1,true));
for(let active=0;active<12;active++){
 const v=Array.from({length:12},(_,i)=>evolutionCenter(i,active));
 for(let i=0;i<v.length;i++)for(let j=i+1;j<v.length;j++)assert.ok(Math.hypot(v[i].x-v[j].x,v[i].y-v[j].y)>220);
}
for(let i=1;i<p.length;i++){const n=neighbours(p,i);assert.ok(n.length>=1&&n.length<=3);assert.ok(n.every(k=>k<i));}

const {makePhysics,ENGINE}=await import("../static/physics.js");
assert.equal(ENGINE,"d3-force@3.0.0");
const goal=Array.from({length:30},(_,i)=>({x:Math.cos(i*2.4)*65,y:Math.sin(i*2.4)*65}));
const sim=makePhysics(goal,goal.map(()=>({x:0,y:0})),goal.slice(1).map((_,i)=>({a:i,b:i+1})));
assert.ok(sim.running());
const early=sim.step(1),final=sim.step(120);
assert.notDeepEqual(early,final);
assert.ok(final.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Math.hypot(v.x,v.y)<=124.001));
assert.ok(!sim.running());
for(let i=0;i<final.length;i++)for(let j=i+1;j<final.length;j++)assert.ok(Math.hypot(final[i].x-final[j].x,final[i].y-final[j].y)>10);
sim.dispose();
console.log("D3 physical simulation: repulsion, collision, springs, cooling and bounded positions");
