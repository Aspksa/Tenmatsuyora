import assert from "node:assert/strict";
import {center,points,fit,slots,drift,normalizePreferences} from "../static/geometry.js";
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
