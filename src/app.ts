import {center,points,fit,slots,drift,normalizePreferences,type Point,type Group} from "./geometry.js";
type Message={id:number,role:"user"|"assistant",content:string};
type State={messages:Message[],count:number,groups:Group[],preferences:unknown,configured:boolean,model:string};
const byId=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const svg=document.getElementById("sky") as unknown as SVGSVGElement;
const stars=document.getElementById("stars")!;
const links=document.getElementById("links")!;
const nodes=document.getElementById("nodes")!;
const ns="http://www.w3.org/2000/svg";
function element(tag:string,attrs:Record<string,string|number>,parent:Element){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));parent.append(el);return el;}
function rand(i:number){const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);}
const reduced=matchMedia("(prefers-reduced-motion: reduce)");



const defs=svg.querySelector("defs")!;
const palette=["#f5d477","#eea565","#f16f94","#d66ac4","#eab9ed"];
palette.forEach((c,i)=>{
 const gradient=element("radialGradient",{id:"nebula"+i},defs);
 [[0,".95"],[.07,".66"],[.2,".29"],[.44,".075"],[.76,".015"],[1,"0"]].forEach(([offset,opacity])=>element("stop",{offset:String(offset),"stop-color":c,"stop-opacity":String(opacity)},gradient));
});
for(let i=0;i<1200;i++){
 const r=.15+rand(i+2400)*.85;
 const star=element("circle",{cx:rand(i)*1000,cy:rand(i+1200)*900,r,fill:i%9===0?"#d3b3ff":"#f1dfbd",opacity:.04+rand(i+3600)*.3},stars);
 if(i%3===0)star.classList.add("far-star");
 if(i%53===0){star.classList.add("twinkle");(star as SVGElement).style.animationDelay="-"+(i%11)+"s";}
}
function line(parent:Element,x1:number,y1:number,x2:number,y2:number,color:string,opacity:number,klass=""){
 return element("line",{x1,y1,x2,y2,stroke:color,opacity,"stroke-width":.8,class:klass},parent);
}
function flare(parent:Element,x:number,y:number,r:number,color:string){
 const g=element("g",{class:"flare"},parent);
 for(let i=0;i<4;i++){const a=i*Math.PI/4;const length=i%2?r*.42:r;line(g,x-Math.cos(a)*length,y-Math.sin(a)*length,x+Math.cos(a)*length,y+Math.sin(a)*length,color,i%2?.28:.65);}
 return g;
}
function ring(parent:Element,x:number,y:number,r:number,c:string,klass="orbit"){
 return element("circle",{cx:x,cy:y,r,fill:"none",stroke:c,"stroke-width":.7,class:klass},parent);
}
function textAt(parent:Element,x:number,y:number,value:string,c:string,size=12){
 const t=element("text",{x,y,fill:c,"text-anchor":"middle","font-size":size,class:"graph-label"},parent);t.textContent=value;return t;
}

type Cam={x:number,y:number,k:number};
type LiveStar={id:number,base:Point,p:Point,node:SVGGElement};
type LiveEdge={el:SVGLineElement,a:number,b:number};
type Scene={page:number,count:number,hub:SVGGElement,detail:SVGGElement,mini:SVGGElement,edge:SVGLineElement,p:Point,scale:number,targetScale:number,signature:string,active:boolean,miniSignature:string,stars:LiveStar[],edges:LiveEdge[],inView:boolean};
const world=element("g",{},svg);
world.append(links,nodes);
const core=element("g",{class:"core"},nodes);
element("circle",{cx:0,cy:0,r:85,fill:"url(#coreHalo)"},core);
[18,34,52].forEach(r=>ring(core,0,0,r,"#fff2d6"));
ring(core,0,0,30,"#fff0c8","core-echo");
ring(core,0,0,42,"#fff0c8","core-echo second");
flare(core,0,0,37,"#fff9e9");
element("circle",{cx:0,cy:0,r:7.5,fill:"#fffef7"},core);
textAt(core,0,56,"Ядро","#eee3cf",12);
const scenes=new Map<number,Scene>();
let groups:Group[]=[],active=-1,focused=-1,selected:number|null=null;
let latest:Message[]=[],archive:Message[]=[],archivePage=-1,requestId=0;
let cam:Cam={x:0,y:0,k:1},target={...cam},auto=true,ready=false,frame=0,last=0,dirty=true;
let busy=false;
let visibleDetail=0;
let returningUntil=0;
let prefs=normalizePreferences({}),prefsLoaded=false,saveTimer=0,saveChain=Promise.resolve();
let time=0,corePosition={x:0,y:0};
let latestId=0,highlightUntil=0;
function savePrefs(){
 if(!prefsLoaded)return;
 clearTimeout(saveTimer);
 saveTimer=window.setTimeout(()=>{
 const snapshot={...prefs,camera:target,auto};
 saveChain=saveChain.then(async()=>{const r=await fetch("/api/preferences",{method:"POST",headers:{"Content-Type":"application/json","X-Tenma":"1"},body:JSON.stringify(snapshot)});if(!r.ok)throw Error("Не удалось сохранить настройки карты");}).catch(()=>{byId("map-save-status").textContent="Настройки не сохранены";});
 },220);
}
function applyPrefs(){
 svg.classList.toggle("low-quality",prefs.quality==="low");
 svg.classList.toggle("motion-off",prefs.speed===0);
 svg.style.setProperty("--glow",String(prefs.glow));
 svg.style.setProperty("--motion-time",String(prefs.speed?1/prefs.speed:1));
 byId<HTMLInputElement>("glow-setting").value=String(prefs.glow);
 byId<HTMLInputElement>("speed-setting").value=String(prefs.speed);
 byId<HTMLSelectElement>("quality-setting").value=prefs.quality;
 dirty=true;wake();
}
for(const id of ["glow-setting","speed-setting","quality-setting"]){
 byId(id).addEventListener("input",()=>{
 prefs=normalizePreferences({...prefs,glow:Number(byId<HTMLInputElement>("glow-setting").value),speed:Number(byId<HTMLInputElement>("speed-setting").value),quality:byId<HTMLSelectElement>("quality-setting").value});
 applyPrefs();savePrefs();
 });
}
byId("effects-toggle").addEventListener("click",()=>{const panel=byId("effects-panel");panel.hidden=!panel.hidden;byId("effects-toggle").setAttribute("aria-expanded",String(!panel.hidden));});

const recentPages=()=>new Set(groups.slice(-3).map(g=>g.page));
const beam=element("g",{class:"activity","aria-hidden":"true"},svg);
const beamPath=element("path",{d:"M1000 460 Q750 510 500 450",class:"activity-track",fill:"none",stroke:"#ffe5a0","stroke-width":1},beam) as SVGPathElement;
const packets=Array.from({length:5},(_,i)=>element("circle",{r:i===0?2.8:1.6,fill:"#fff1b7",class:"packet"},beam));
const flow=element("g",{class:"activity","aria-hidden":"true"},world);
const flowLine=element("path",{d:"M0 0 L0 0",class:"activity-track",fill:"none",stroke:"#ffd68d","stroke-width":1.2},flow) as SVGPathElement;
const flowDots=Array.from({length:3},()=>element("circle",{r:2,fill:"#ffeab9",class:"packet"},flow));
function wake(){if(!frame&&!document.hidden)frame=requestAnimationFrame(tick);}
function setCam(c:Cam){target={x:c.x,y:c.y,k:Math.max(.035,Math.min(3,c.k))};dirty=true;wake();savePrefs();}
function overview(){auto=true;focused=-1;requestId++;archive=[];archivePage=-1;refreshDetails();setCam(fit(groups));}
function focusCam(page:number){const p=center(page);setCam({x:p.x,y:p.y,k:1.55});}
function project(p:Point){return {x:500+(p.x-cam.x)*cam.k,y:450+(p.y-cam.y)*cam.k};}
function tick(t:number){
 frame=0;const dt=Math.min(50,last? t-last:16);last=t;
 const staticMotion=reduced.matches||prefs.speed===0;
 const ease=staticMotion?1:1-Math.exp(-dt/185);
 time+=staticMotion?0:dt*prefs.speed;
 const returning=t<returningUntil;svg.classList.toggle("returning",returning);
 let moving=false;
 for(const k of ["x","y","k"] as const){const diff=target[k]-cam[k];if(Math.abs(diff)>(k==="k"?.0005:.1)){cam[k]+=diff*ease;moving=true;}else if(diff){cam[k]=target[k];dirty=true;}}
 if(dirty||moving){
 world.setAttribute("transform","translate(500 450) scale("+cam.k+") translate("+(-cam.x)+" "+(-cam.y)+")");
 stars.setAttribute("transform","translate("+Math.max(-12,Math.min(12,-cam.x*.012))+" "+Math.max(-12,Math.min(12,-cam.y*.012))+")");
 const coreP=project(corePosition);
 beamPath.setAttribute("d","M1000 460 Q750 510 "+coreP.x+" "+coreP.y);
 for(const s of scenes.values()){
 const p=project(s.p),inView=p.x>-170&&p.x<1170&&p.y>-170&&p.y<1070;
 s.inView=inView;
 s.hub.classList.toggle("culled",!inView);
 s.hub.classList.toggle("tiny",cam.k<.48);
 s.hub.setAttribute("transform","translate("+s.p.x+" "+s.p.y+") scale("+Math.max(1,Math.min(3,.45/cam.k))+")");
 s.detail.classList.toggle("culled",!inView||cam.k<.48);
 s.mini.classList.toggle("culled",!inView||(cam.k>=.48&&s.stars.length>0));
 s.edge.classList.toggle("culled",!inView);
 }
 // Labels only appear when their estimated screen boxes do not overlap.
 const used:{x:number,y:number}[]=[];
 for(const s of [...scenes.values()].sort((a,b)=>Number(b.active)-Number(a.active)||Number(b.page===focused)-Number(a.page===focused))){
 const p=project(s.p),show=s.inView&&cam.k>=.48&&!used.some(q=>Math.abs(p.x-q.x)<105&&Math.abs(p.y-q.y)<44);
 s.hub.classList.toggle("label-hidden",!show);if(show)used.push(p);
 }
 dirty=false;
 }
 const current=scenes.get(active)?.p;
 const cp=current?{x:current.x*.08,y:current.y*.08}:{x:0,y:0};
 const norm=Math.max(1,Math.hypot(cp.x,cp.y)/55);
 corePosition.x+=(cp.x/norm-corePosition.x)*ease;corePosition.y+=(cp.y/norm-corePosition.y)*ease;
 core.setAttribute("transform","translate("+corePosition.x+" "+corePosition.y+")");
 const coreP=project(corePosition);
 if(busy||returning)beamPath.setAttribute("d","M1000 460 Q750 510 "+coreP.x+" "+coreP.y);
 for(const s of scenes.values()){
 s.edge.setAttribute("x1",String(corePosition.x));s.edge.setAttribute("y1",String(corePosition.y));
 const diff=s.targetScale-s.scale;
 if(Math.abs(diff)>.002){s.scale+=diff*ease;moving=true;s.detail.setAttribute("transform","translate("+s.p.x+" "+s.p.y+") scale("+s.scale+")");}
 else if(diff!==0){s.scale=s.targetScale;s.detail.setAttribute("transform","translate("+s.p.x+" "+s.p.y+") scale("+s.scale+")");}
 if(!s.inView||cam.k<.48||!s.stars.length)continue;
 const detailed=s.page===active||s.page===focused;
 const amplitude=staticMotion?0:detailed?4:1.2;
 for(const n of s.stars){
 const d=drift(n.id,time,amplitude);
 const tx=n.base.x+d.x,ty=n.base.y+d.y;
 n.p.x+=(tx-n.p.x)*ease;n.p.y+=(ty-n.p.y)*ease;
 n.node.setAttribute("transform","translate("+n.p.x+" "+n.p.y+")");
 n.node.classList.toggle("last-born",n.id===latestId&&t<highlightUntil&&detailed);
 }
 for(const e of s.edges){
 const a=e.a<0?{x:0,y:0}:s.stars[e.a].p,b=s.stars[e.b].p;
 e.el.setAttribute("x1",String(a.x));e.el.setAttribute("y1",String(a.y));e.el.setAttribute("x2",String(b.x));e.el.setAttribute("y2",String(b.y));
 }
 }
 if((busy||returning)&&!staticMotion){
 const length=beamPath.getTotalLength();
 packets.forEach((p,i)=>{const a=((time/1450+i/5)%1),v=beamPath.getPointAtLength(length*(returning?1-a:a));p.setAttribute("cx",String(v.x));p.setAttribute("cy",String(v.y));});
 const destination=scenes.get(active)?.p;
 if(destination){
 flow.setAttribute("visibility","visible");flowLine.setAttribute("d","M"+corePosition.x+" "+corePosition.y+" L"+destination.x+" "+destination.y);
 flowDots.forEach((p,i)=>{const a=((time/1650+i/3)%1),q=returning?1-a:a;p.setAttribute("cx",String(corePosition.x+(destination.x-corePosition.x)*q));p.setAttribute("cy",String(corePosition.y+(destination.y-corePosition.y)*q));});
 }else flow.setAttribute("visibility","hidden");
 }
 if(moving||(!staticMotion&&(busy||returning||[...scenes.values()].some(s=>s.inView&&s.stars.length>0&&cam.k>=.48)))||t<highlightUntil)wake();else last=0;
}
document.addEventListener("visibilitychange",()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}else{dirty=true;wake();}});
reduced.addEventListener("change",()=>{dirty=true;wake();});
function accessible(el:Element,label:string,action:()=>void){el.setAttribute("tabindex","0");el.setAttribute("role","button");el.setAttribute("aria-label",label);el.addEventListener("click",action);el.addEventListener("keydown",ev=>{const e=ev as KeyboardEvent;if(e.key==="Enter"||e.key===" "){e.preventDefault();action();}});}
async function choose(page:number){
 auto=false;focused=page;archive=[];archivePage=-1;const ticket=++requestId;
 focusCam(page);refreshDetails();
 if(recentPages().has(page)&&latest.filter(m=>Math.floor((m.id-1)/30)===page).length===scenes.get(page)?.count)return;
 try{const r=await fetch("/api/cluster/"+page);if(!r.ok)throw Error("Не удалось открыть созвездие");const d=await r.json() as {messages:Message[]};if(ticket!==requestId)return;archive=d.messages;archivePage=page;refreshDetails();}
 catch(e){if(ticket===requestId)byId("node-info").textContent=e instanceof Error?e.message:"Ошибка";}
}
function createScene(g:Group):Scene{
 const p=center(g.page),j=g.page%palette.length,c=palette[j];
 const edge=line(links,0,0,p.x,p.y,c,.23) as SVGLineElement;
 const hub=element("g",{class:"cluster-control",transform:"translate("+p.x+" "+p.y+")"},nodes) as SVGGElement;
 element("circle",{r:66,fill:"url(#nebula"+j+")",opacity:.78},hub);
 ring(hub,0,0,18,c);ring(hub,0,0,30,c,"orbit spin-ring");
 flare(hub,0,0,23,c);element("circle",{r:6,fill:c},hub);element("circle",{r:2,fill:"#fff9df"},hub);
 const tag=textAt(hub,0,-39,"",c,12);tag.classList.add("cluster-tag");
 const n=textAt(hub,0,43,"",c,13);n.classList.add("cluster-number");
 element("circle",{r:16,fill:"transparent",class:"hit"},hub);
 accessible(hub,"Открыть созвездие "+(g.page+1),()=>{void choose(g.page);});
 const mini=element("g",{class:"mini-cluster",transform:"translate("+p.x+" "+p.y+")","pointer-events":"none"},nodes) as SVGGElement;
 const detail=element("g",{class:"cluster-detail",transform:"translate("+p.x+" "+p.y+") scale(.55)"},nodes) as SVGGElement;
 return {page:g.page,count:g.count,hub,detail,mini,edge,p,scale:.55,targetScale:.55,signature:"",active:false,miniSignature:"",stars:[],edges:[],inView:true};
}
function drawMini(s:Scene,g:Group){
 const ids=slots(g),signature=ids.join(",");
 if(s.miniSignature===signature)return;
 s.miniSignature=signature;s.mini.replaceChildren();
 const p=points(ids,false),c=palette[s.page%palette.length];
 const linkPath=p.map((v,i)=>{const a=i?p[i-1]:{x:0,y:0};return "M"+a.x.toFixed(2)+" "+a.y.toFixed(2)+"L"+v.x.toFixed(2)+" "+v.y.toFixed(2);}).join(" ");
 element("path",{d:linkPath,stroke:c,fill:"none","stroke-width":.6,opacity:.32},s.mini);
 // One path for all recorded stars; no fabricated placeholders.
 const dots=p.map(v=>"M"+v.x.toFixed(2)+" "+v.y.toFixed(2)+"h.01").join(" ");
 element("path",{d:dots,stroke:c,fill:"none","stroke-width":3.4,"stroke-linecap":"round",class:"mini-dots"},s.mini);
}
function refreshDetails(){
 visibleDetail=0;
 const recent=recentPages();
 const index=new Map<number,Message[]>();
 for(const m of latest){const p=Math.floor((m.id-1)/30);const list=index.get(p)||[];list.push(m);index.set(p,list);}
 for(const s of scenes.values()){
 const data=s.page===focused&&archivePage===s.page?archive:recent.has(s.page)?index.get(s.page)||[]:[];
 const signature=data.map(m=>m.id).join(",");
 s.targetScale=s.page===active?1:.52;
 if(s.page===focused)s.targetScale=1;
 visibleDetail+=data.length;
 if(signature===s.signature)continue;
 const old=new Map(s.stars.map(n=>[n.id,n]));
 s.stars=[];s.edges=[];
 s.signature=signature;s.detail.replaceChildren();
 const c=palette[s.page%palette.length],j=s.page%palette.length;
 const ps=points(data.map(m=>m.id),true);
 const edges=element("g",{},s.detail);
 data.forEach((m,i)=>{
 const {x,y}=ps[i];
 s.edges.push({el:line(edges,0,0,x,y,c,.24) as SVGLineElement,a:-1,b:i});
 ps.slice(0,i).map((p,k)=>({p,k,d:Math.hypot(x-p.x,y-p.y)})).sort((a,b)=>a.d-b.d).slice(0,2).filter(v=>v.d<85).forEach(({p,k})=>s.edges.push({el:line(edges,x,y,p.x,p.y,c,.2) as SVGLineElement,a:i,b:k}));
 const existing=old.get(m.id);
 const n=existing?.node||element("g",{class:"star-node",transform:"translate("+x+" "+y+")"},s.detail) as SVGGElement;
 n.dataset.x=String(x);n.dataset.y=String(y);
 s.stars.push({id:m.id,base:{x,y},p:existing?{...existing.p}:ready?{x:x*.25,y:y*.25}:{x,y},node:n});
 if(existing){s.detail.append(n);}
 else{
 n.dataset.id=String(m.id);
 const visual=element("g",{class:ready?"newborn":""},n);
 if(ready){(visual as SVGElement).style.animationDelay=Math.min(i*45,500)+"ms";}
 const size=(m.role==="user"?2.6:3.7)+rand(m.id)*1.5;
 element("circle",{r:30+rand(m.id+18)*9,fill:"url(#nebula"+j+")",class:"star-glow"},visual);
 element("circle",{r:13,fill:"url(#nebula"+j+")",class:"star-glow inner"},visual);
 element("circle",{r:10,fill:"transparent"},visual);
 element("circle",{r:size,fill:c,class:"orb"},visual);
 element("circle",{r:1.3,fill:"#fffaf0"},visual);
 if(m.role==="assistant")ring(visual,0,0,8,c);
 ring(visual,0,0,15,c,"focus-ring");ring(visual,0,0,24,c,"birth-wave");ring(visual,0,0,34,c,"birth-wave second");
 const label=element("g",{class:"node-tag","pointer-events":"none"},visual);
 element("rect",{x:12,y:-12,width:75,height:21,rx:3,fill:"#120e0c",stroke:c,"stroke-width":.6},label);
 const t=element("text",{x:18,y:2,fill:c,"font-size":10},label);t.textContent="#"+m.id+" · "+(m.role==="user"?"Вы":"ИИ");
 accessible(n,(m.role==="user"?"Вы: ":"ИИ: ")+m.content.slice(0,100),()=>{selected=m.id;nodes.querySelectorAll(".selected").forEach(el=>el.classList.remove("selected"));n.classList.add("selected");byId("node-info").textContent=m.content.slice(0,180);document.getElementById("msg-"+m.id)?.scrollIntoView({block:"nearest"});auto=false;setCam({x:s.p.x+Number(n.dataset.x)*s.scale,y:s.p.y+Number(n.dataset.y)*s.scale,k:2.1});});
 }
 n.classList.toggle("selected",selected===m.id);
 });
 }
 dirty=true;wake();
}
function draw(data:Message[],summary:Group[]){
 const newest=data.at(-1)?.id??0;if(ready&&newest>latestId){highlightUntil=performance.now()+2400;}latestId=newest;
 latest=data;groups=summary;const previous=active;active=summary.at(-1)?.page??-1;
 const valid=new Set(summary.map(g=>g.page));
 for(const [id,s] of scenes){if(!valid.has(id)){s.hub.remove();s.detail.remove();s.mini.remove();s.edge.remove();scenes.delete(id);}}
 for(const g of summary){
 let s=scenes.get(g.page);if(!s){s=createScene(g);scenes.set(g.page,s);}
 s.count=g.count;s.active=g.page===active;drawMini(s,g);
 s.hub.classList.toggle("active-cluster",s.active);
 s.hub.querySelector(".cluster-tag")!.textContent="Диалог "+(g.page+1);
 s.hub.querySelector(".cluster-number")!.textContent=String(g.count);
 }
 refreshDetails();
 byId("graph-count").textContent=summary.reduce((n,g)=>n+g.count,0)+" записей · "+summary.length+" созвездий";
 if(!ready){setCam(prefs.camera??fit(groups));cam={...target};}
 else if(auto&&active!==previous&&active>=0){
 const f=fit(groups);if(f.k>=.55)setCam(f);else focusCam(active);
 }
 ready=true;dirty=true;wake();
}
function svgPoint(e:PointerEvent|WheelEvent){const m=svg.getScreenCTM();return m?new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse()):new DOMPoint(500,450);}
svg.addEventListener("wheel",e=>{e.preventDefault();auto=false;const p=svgPoint(e),k=Math.max(.035,Math.min(3,target.k*Math.exp(-e.deltaY*.0015)));setCam({x:target.x+(p.x-500)*(1/target.k-1/k),y:target.y+(p.y-450)*(1/target.k-1/k),k});},{passive:false});
let drag:{id:number,p:Point,c:Cam}|null=null;
svg.addEventListener("pointerdown",e=>{if(e.button!==0||(e.target as Element).closest("[role=button]"))return;auto=false;drag={id:e.pointerId,p:svgPoint(e),c:{...target}};svg.setPointerCapture(e.pointerId);svg.classList.add("dragging");});
svg.addEventListener("pointermove",e=>{if(!drag||drag.id!==e.pointerId)return;const p=svgPoint(e);setCam({x:drag.c.x-(p.x-drag.p.x)/drag.c.k,y:drag.c.y-(p.y-drag.p.y)/drag.c.k,k:drag.c.k});});
function endDrag(){drag=null;svg.classList.remove("dragging");}
svg.addEventListener("pointerup",endDrag);svg.addEventListener("pointercancel",endDrag);svg.addEventListener("lostpointercapture",endDrag);
byId("overview").addEventListener("click",overview);
byId("active-view").addEventListener("click",()=>{if(active>=0)void choose(active);});
byId("zoom-in").addEventListener("click",()=>{auto=false;setCam({...target,k:target.k*1.25});});
byId("zoom-out").addEventListener("click",()=>{auto=false;setCam({...target,k:target.k/1.25});});
function render(s:State){if(!prefsLoaded){prefs=normalizePreferences(s.preferences);auto=prefs.auto;applyPrefs();prefsLoaded=true;}byId("state").textContent=s.configured?"Cloud.ru • настроено":"Локальный режим";byId("model").textContent=s.model||"Без модели";byId("count").textContent="Сообщений: "+s.count;
 const list=byId("messages");list.replaceChildren();for(const m of s.messages){const article=document.createElement("article");article.className="message";article.id="msg-"+m.id;const role=document.createElement("span");role.className="role";role.textContent=m.role==="user"?"Вы":"Tenmatsuyora";const body=document.createElement("div");body.className="content";body.textContent=m.content;article.append(role,body);list.append(article);}list.scrollTop=list.scrollHeight;draw(s.messages,s.groups);}
async function refresh(){const r=await fetch("/api/state");if(!r.ok)throw Error("Сервер недоступен");render(await r.json() as State);}

const form=byId<HTMLFormElement>("composer"),input=byId<HTMLTextAreaElement>("message"),send=byId<HTMLButtonElement>("send");
form.addEventListener("submit",async e=>{e.preventDefault();const content=input.value.trim();if(!content||busy)return;busy=true;send.disabled=true;input.disabled=true;svg.classList.add("busy");wake();byId("notice").textContent="Обработка…";
 try{const r=await fetch("/api/message",{method:"POST",headers:{"Content-Type":"application/json","X-Tenma":"1"},body:JSON.stringify({content})});const result=await r.json();if(!r.ok)throw Error(result.error||"Ошибка сервера");input.value="";byId("notice").textContent=result.notice||"";await refresh();if(!result.notice&&!reduced.matches&&prefs.speed>0){returningUntil=performance.now()+1650;wake();}}
 catch(err){byId("notice").textContent=err instanceof Error?err.message:"Ошибка";}finally{busy=false;send.disabled=false;input.disabled=false;svg.classList.remove("busy");wake();input.focus();}
});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
refresh().catch(e=>{byId("state").textContent="Нет соединения";byId("notice").textContent=e.message;});
