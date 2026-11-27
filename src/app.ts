import {center,points,fit,slots,drift,normalizePreferences,evolutionCenter,evolutionScale,neighbours,type Point,type Group} from "./geometry.js";
type Message={id:number,role:"user"|"assistant",content:string};
type CatalogItem={id:string,category:string};
type CloudStatus={verified:boolean,has_key:boolean,catalog:CatalogItem[],embedding:string,secure_storage:boolean};
type State={cloud:CloudStatus,context_links:{answer_id:number,source_id:number}[],messages:Message[],count:number,groups:Group[],preferences:unknown,configured:boolean,model:string};
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
const palette=["#ffe184","#ffad73","#f66c95","#d966b8","#bb91e6"];
palette.forEach((c,i)=>{
 const gradient=element("radialGradient",{id:"nebula"+i},defs);
 [[0,"1"],[.075,".79"],[.19,".33"],[.42,".09"],[.75,".012"],[1,"0"]].forEach(([offset,opacity])=>element("stop",{offset:String(offset),"stop-color":c,"stop-opacity":String(opacity)},gradient));
});
for(let i=0;i<420;i++){
 const r=.15+rand(i+2400)*.85;
 const star=element("circle",{cx:rand(i)*1000,cy:rand(i+1200)*900,r,fill:i%9===0?"#d3b3ff":"#f1dfbd",opacity:.04+rand(i+3600)*.3},stars);
 if(i%3===0)star.classList.add("far-star");
 if(i%53===0){star.classList.add("twinkle");(star as SVGElement).style.animationDelay="-"+(i%11)+"s";}
}
function line(parent:Element,x1:number,y1:number,x2:number,y2:number,color:string,opacity:number,klass=""){
 return element("line",{x1,y1,x2,y2,stroke:color,opacity,"stroke-width":.8,class:klass},parent);
}
function curveD(a:Point,b:Point,bend=.15){
 const dx=b.x-a.x,dy=b.y-a.y;
 return "M"+a.x+" "+a.y+" Q"+(a.x+dx*.5-dy*bend)+" "+(a.y+dy*.5+dx*bend)+" "+b.x+" "+b.y;
}
function curve(parent:Element,a:Point,b:Point,c:string,opacity:number,klass=""){
 return element("path",{d:curveD(a,b),fill:"none",stroke:c,opacity,"stroke-width":.8,class:klass},parent) as SVGPathElement;
}
function sparkle(parent:Element,x:number,y:number,r:number,c:string){
 element("path",{d:"M"+x+" "+(y-r)+" Q"+(x+r*.15)+" "+(y-r*.15)+" "+(x+r)+" "+y+" Q"+(x+r*.15)+" "+(y+r*.15)+" "+x+" "+(y+r)+" Q"+(x-r*.15)+" "+(y+r*.15)+" "+(x-r)+" "+y+" Q"+(x-r*.15)+" "+(y-r*.15)+" "+x+" "+(y-r)+"Z",fill:c,class:"sparkle"},parent);
}
const background=document.getElementById("celestial-background")!;
for(let i=0;i<1000;i++){
 const x=rand(i+9800)*1600,y=rand(i+12800)*900,r=.16+rand(i+15800)*.72;
 const c=i%13===0?"#c8d6ed":i%3===0?"#f5c27c":"#eee5d3";
 element("circle",{cx:x,cy:y,r,fill:c,opacity:.07+rand(i+18800)*.29},background);
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
type LiveStar={id:number,base:Point,p:Point,node:SVGGElement,born:number,delay:number};
type LiveEdge={el:SVGPathElement,a:number,b:number};
type Scene={anchor:Point,page:number,count:number,hub:SVGGElement,detail:SVGGElement,mini:SVGGElement,edge:SVGPathElement,p:Point,scale:number,targetScale:number,signature:string,active:boolean,miniSignature:string,stars:LiveStar[],edges:LiveEdge[],inView:boolean};
const world=element("g",{},svg);
world.append(links,nodes);
const core=element("g",{class:"core"},nodes);
element("circle",{cx:0,cy:0,r:70,fill:"url(#coreHalo)",class:"core-atmosphere"},core);
element("circle",{r:27,fill:"url(#coreHalo)"},core);
[13,24,39].forEach(r=>ring(core,0,0,r,"#fff2d6"));
ring(core,0,0,17,"#fff0c8","core-echo");
ring(core,0,0,24,"#fff0c8","core-echo second");
flare(core,0,0,28,"#fff9e9");sparkle(core,0,0,19,"#fff9ee");
element("circle",{cx:0,cy:0,r:6,fill:"#fffef7"},core);
textAt(core,0,48,"Ядро","#eee3cf",11);
const scenes=new Map<number,Scene>();
const contextLayer=element("g",{class:"context-links","pointer-events":"none"},world);
const workflowLayer=element("g",{class:"workflow-layer","aria-hidden":"true","pointer-events":"none"},svg);
const cloudPoint={x:870,y:795},memoryPoint={x:105,y:795},storagePoint={x:215,y:795};
const infrastructure=element("g",{class:"infrastructure","aria-label":"Рабочие подсистемы, не записи памяти"},svg);
const infrastructurePaths=[memoryPoint,storagePoint,cloudPoint].map(p=>curve(infrastructure,{x:500,y:520},p,"#dcb272",.32,"service-link"));
function service(p:Point,label:string,description:string,color:string){
 const g=element("g",{class:"service-hub",transform:"translate("+p.x+" "+p.y+") scale(.62)"},infrastructure);
 element("circle",{r:65,fill:"url(#nebula0)",opacity:.75},g);
 element("circle",{r:24,fill:"url(#nebula0)"},g);
 [17,33,49].forEach(r=>ring(g,0,0,r,color));
 flare(g,0,0,22,color);element("circle",{r:7,fill:"#fff1c8"},g);
 textAt(g,0,64,label,color,15);
 element("circle",{r:27,fill:"transparent"},g);
 accessible(g,label,()=>{byId("node-info").textContent=description;});
 return g;
}
const memoryHub=service(memoryPoint,"Контекст","Поиск по истории диалога и, при подключении, эмбеддингам.","#f4cf85");
const storageHub=service(storagePoint,"SQLite","Локальная история и сохранение связей. Число записей указано на карте.","#efba71");
const cloudStar=element("g",{class:"cloud-star",transform:"translate("+cloudPoint.x+" "+cloudPoint.y+") scale(.7)"},svg);
element("circle",{r:75,fill:"url(#nebula1)",opacity:.9},cloudStar);
element("circle",{r:34,fill:"url(#nebula0)"},cloudStar);
[20,37,53].forEach(r=>ring(cloudStar,0,0,r,"#edbe74"));flare(cloudStar,0,0,28,"#ffd699");element("path",{d:"M-7 0a5 5 0 0 1 5-6 7 7 0 0 1 12 3 4 4 0 0 1-3 7H-5a4 4 0 0 1-2-4Z",fill:"none",stroke:"#fff0ca","stroke-width":1.5},cloudStar);
textAt(cloudStar,0,70,"Cloud.ru","#ffdb99",16);element("circle",{r:28,fill:"transparent"},cloudStar);
accessible(cloudStar,"Настройки Cloud.ru",()=>{byId("cloud-toggle").click();});
const modelStars=element("g",{class:"cloud-model-stars","pointer-events":"none"},cloudStar);
type WorkEvent={kind:string,ids?:number[],older_ids?:number[],id?:number,role?:string};
let contextEdges:State["context_links"]=[],memoryIds=new Set<number>(),workflowKind="",workflowTime=0;
const workRoutes=Array.from({length:6},()=>element("path",{class:"work-route",fill:"none",pathLength:100,stroke:"#ffd391","stroke-width":1.4},workflowLayer) as SVGPathElement);
const workPackets=Array.from({length:6},()=>element("path",{class:"work-packet",fill:"none",pathLength:100,stroke:"#fff4d8","stroke-width":2.4},workflowLayer) as SVGPathElement);
const stageLabels:Record<string,string>={cloud_stream:"Cloud.ru · поступает ответ",embedding_start:"Смысловой поиск · эмбеддинги",embedding_ready:"Векторы получены",semantic_found:"Найдены смысловые совпадения",embedding_failed:"Эмбеддинги недоступны · текстовый поиск",chat_received:"Запрос получен",sqlite_start:"Запись в SQLite",sqlite_saved:"Сохранено в SQLite",memory_start:"Поиск контекста",memory_found:"Контекст подготовлен",cloud_start:"Cloud.ru · ожидание ответа",cloud_received:"Ответ модели получен",response_ready:"Подготовка ответа",links_saved:"Связи контекста сохранены",response_delivered:"Ответ готов",local_only:"Локальный режим",failed:"Ошибка операции",finished:""};
function showEvent(ev:WorkEvent){
 workflowKind=ev.kind;workflowTime=performance.now();
 if(ev.kind==="memory_found"){memoryIds=new Set(ev.ids||[]);}
 if(ev.kind==="chat_received")memoryIds.clear();
 svg.dataset.work=ev.kind;
 byId("work-stage").textContent=stageLabels[ev.kind]||"";
 byId("work-light").classList.toggle("error",ev.kind==="failed");
 if(ev.kind==="finished")byId("work-light").classList.remove("active");else byId("work-light").classList.add("active");
 dirty=true;wake();
}
function updateWorkflow(){
 const core=project(corePosition),chat={x:1000,y:460},cloud=cloudPoint;
 infrastructurePaths.forEach((p,i)=>p.setAttribute("d",curveD(core,[memoryPoint,storagePoint,cloudPoint][i])));
 memoryHub.classList.toggle("service-active",["memory_start","memory_found","embedding_start","embedding_ready","semantic_found"].includes(workflowKind));
 storageHub.classList.toggle("service-active",["sqlite_start","sqlite_saved","links_saved"].includes(workflowKind));
 const store=storagePoint;
 const routes:{a:Point,b:Point,c:string}[]=[];
 const add=(a:Point,b:Point,c="#ffd391")=>routes.push({a,b,c});
 if(workflowKind==="chat_received")add(chat,core);
 if(workflowKind==="sqlite_start"||workflowKind==="sqlite_saved"||workflowKind==="links_saved")add(core,store,"#a8e3b2");
 if(workflowKind==="cloud_start")add(core,cloud,"#ffd18a");
 if(workflowKind==="cloud_stream"){add(cloud,core,"#ffd18a");add(core,chat,"#ffd391");}
 if(workflowKind==="embedding_start"||workflowKind==="embedding_ready"||workflowKind==="semantic_found")add(core,cloud,"#ffb66c");
 if(workflowKind==="cloud_received"||workflowKind==="response_ready")add(cloud,core,"#ffd18a");
 if(workflowKind==="response_delivered")add(core,chat);
 if(workflowKind==="memory_start"||workflowKind==="memory_found"){
 add(core,memoryPoint,"#edcb79");
 const pages=[...new Set([...memoryIds].map(id=>Math.floor((id-1)/30)))].slice(0,5);
 for(const page of pages){const scene=scenes.get(page);if(scene)add(core,project(scene.p),"#edcb79");}
 }
 workRoutes.forEach((p,i)=>{const r=routes[i],packet=workPackets[i];if(!r){p.setAttribute("visibility","hidden");packet.setAttribute("visibility","hidden");return;}const d="M"+r.a.x+" "+r.a.y+" Q"+((r.a.x+r.b.x)/2)+" "+((r.a.y+r.b.y)/2-20)+" "+r.b.x+" "+r.b.y;for(const el of [p,packet]){el.setAttribute("d",d);el.setAttribute("stroke",r.c);el.setAttribute("visibility","visible");}});
 cloudStar.classList.toggle("cloud-error",workflowKind==="failed"||workflowKind==="embedding_failed");
 cloudStar.classList.toggle("cloud-active",workflowKind==="cloud_start"||workflowKind==="cloud_received"||workflowKind==="cloud_stream"||workflowKind==="embedding_start");
 for(const s of scenes.values()){
 const used=[...memoryIds].some(id=>Math.floor((id-1)/30)===s.page);
 s.hub.classList.toggle("memory-used",used);s.detail.classList.toggle("memory-group",used);
 for(const n of s.stars)n.node.classList.toggle("memory-used",memoryIds.has(n.id));
 }
 contextLayer.replaceChildren();
 // Persisted provenance links, bounded to visible detailed nodes.
 const positions=new Map<number,Point>();
 for(const s of scenes.values())if(s.inView&&cam.k>=.48)for(const n of s.stars)positions.set(n.id,{x:s.p.x+n.p.x*s.scale,y:s.p.y+n.p.y*s.scale});
 const relevant=contextEdges.filter(e=>e.answer_id===selected||e.answer_id===latestId).slice(0,25);
 for(const e of relevant){const a=positions.get(e.source_id),b=positions.get(e.answer_id);if(a&&b)line(contextLayer,a.x,a.y,b.x,b.y,"#a9d8bd",.45,"provenance-edge");}
}

let groups:Group[]=[],active=-1,focused=-1,selected:number|null=null;
let latest:Message[]=[],archive:Message[]=[],archivePage=-1,requestId=0;
let cam:Cam={x:0,y:0,k:1},target={...cam},auto=true,ready=false,frame=0,last=0,dirty=true;
let busy=false;
let visibleDetail=0;
let returningUntil=0;
let prefs=normalizePreferences({}),prefsLoaded=false,saveTimer=0,saveChain=Promise.resolve();
let time=0,corePosition={x:0,y:0},slowFrames=0,fastFrames=0,adaptiveLow=false;
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
function focusCam(page:number){const p=scenes.get(page)?.anchor??center(page);setCam({x:p.x,y:p.y,k:1.55});}
function project(p:Point){return {x:500+(p.x-cam.x)*cam.k,y:450+(p.y-cam.y)*cam.k};}
function tick(t:number){
 frame=0;const dt=Math.min(50,last? t-last:16);last=t;
 const staticMotion=reduced.matches||prefs.speed===0;
 if(last&&dt>33){slowFrames++;fastFrames=0;}else{fastFrames++;slowFrames=Math.max(0,slowFrames-1);}
 if(slowFrames>30)adaptiveLow=true;else if(fastFrames>120)adaptiveLow=false;
 svg.classList.toggle("adaptive-low",adaptiveLow);
 const ease=staticMotion?1:1-Math.exp(-dt/(busy?185:260));
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
 const p=project(s.p),show=s.inView&&cam.k>=.48&&!used.some(q=>Math.abs(p.x-q.x)<125&&Math.abs(p.y-q.y)<55)&&![memoryPoint,storagePoint,cloudPoint].some(q=>Math.hypot(p.x-q.x,p.y-q.y)<100);
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
 if(s.inView)s.edge.setAttribute("d",curveD(corePosition,s.p));
 const expanding=s.page===active||s.page===focused;
 const relocating=Math.hypot(s.p.x-s.anchor.x,s.p.y-s.anchor.y)>.1;
 if(relocating){moving=true;dirty=true;}
 if(relocating||(s.inView&&expanding)){
 const shift=drift(s.page+33,time,staticMotion||!expanding?0:9);
 const targetX=s.anchor.x+shift.x,targetY=s.anchor.y+shift.y;
 s.p.x+=(targetX-s.p.x)*ease;s.p.y+=(targetY-s.p.y)*ease;
 const translation="translate("+s.p.x+" "+s.p.y+")";
 s.hub.setAttribute("transform",translation+" scale("+Math.max(1,Math.min(3,.45/cam.k))+")");
 s.mini.setAttribute("transform",translation+" scale(.7)");
 s.edge.setAttribute("d",curveD(corePosition,s.p));
 s.detail.setAttribute("transform",translation+" scale("+s.scale+")");
 }
 const diff=s.targetScale-s.scale;
 if(Math.abs(diff)>.002){s.scale+=diff*ease;moving=true;s.detail.setAttribute("transform","translate("+s.p.x+" "+s.p.y+") scale("+s.scale+")");}
 else if(diff!==0){s.scale=s.targetScale;s.detail.setAttribute("transform","translate("+s.p.x+" "+s.p.y+") scale("+s.scale+")");}
 if(!s.inView||cam.k<.48||!s.stars.length)continue;
 const detailed=s.page===active||s.page===focused;
 const amplitude=staticMotion?0:detailed?4:(adaptiveLow||prefs.quality==="low")?0:1.2;
 for(const n of s.stars){
 const d=drift(n.id,time,amplitude);
 const pending=!staticMotion&&n.born>0&&time<n.born+n.delay;
 n.node.classList.toggle("awaiting-birth",pending);if(pending){moving=true;continue;}
 const tx=n.base.x+d.x,ty=n.base.y+d.y;
 n.p.x+=(tx-n.p.x)*ease;n.p.y+=(ty-n.p.y)*ease;
 n.node.setAttribute("transform","translate("+n.p.x+" "+n.p.y+")");
 n.node.classList.toggle("last-born",n.id===latestId&&t<highlightUntil&&detailed&&(selected===null||selected===n.id));
 }
 for(const e of s.edges){
 const a=e.a<0?{x:0,y:0}:s.stars[e.a].p,b=s.stars[e.b].p;
 e.el.setAttribute("d",curveD(a,b,.045));
 e.el.classList.toggle("awaiting-birth",s.stars[e.b].node.classList.contains("awaiting-birth")||(e.a>=0&&s.stars[e.a].node.classList.contains("awaiting-birth")));
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
 updateWorkflow();
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
 const p=evolutionCenter(g.page,active),j=g.page%palette.length,c=palette[j];
 const edge=curve(links,{x:0,y:0},p,c,.26,"constellation-link");
 const hub=element("g",{class:"cluster-control",transform:"translate("+p.x+" "+p.y+")"},nodes) as SVGGElement;
 element("circle",{r:65,fill:"url(#nebula"+j+")",opacity:.65,class:"hub-glow"},hub);element("circle",{r:29,fill:"url(#nebula"+j+")"},hub);
 ring(hub,0,0,13,c);ring(hub,0,0,24,c,"orbit spin-ring");ring(hub,0,0,36,c);
 flare(hub,0,0,19,c);element("circle",{r:5,fill:c},hub);element("circle",{r:2,fill:"#fff9df"},hub);
 const tag=textAt(hub,0,-44,"",c,12);tag.classList.add("cluster-tag");
 const n=textAt(hub,0,43,"",c,13);n.classList.add("cluster-number");
 element("circle",{r:16,fill:"transparent",class:"hit"},hub);
 accessible(hub,"Открыть созвездие "+(g.page+1),()=>{void choose(g.page);});
 const mini=element("g",{class:"mini-cluster",transform:"translate("+p.x+" "+p.y+") scale(.7)","pointer-events":"none"},nodes) as SVGGElement;
 const detail=element("g",{class:"cluster-detail",transform:"translate("+p.x+" "+p.y+") scale(.55)"},nodes) as SVGGElement;
 return {anchor:{...p},page:g.page,count:g.count,hub,detail,mini,edge,p,scale:.55,targetScale:.55,signature:"",active:false,miniSignature:"",stars:[],edges:[],inView:true};
}
function drawMini(s:Scene,g:Group){
 const ids=slots(g),signature=ids.join(",");
 if(s.miniSignature===signature)return;
 s.miniSignature=signature;s.mini.replaceChildren();
 const p=points(ids,false),c=palette[s.page%palette.length];
 const linkPath=p.flatMap((v,i)=>i===0?[curveD({x:0,y:0},v,.04)]:neighbours(p,i).map(k=>curveD(p[k],v,.04))).join(" ");
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
 s.targetScale=evolutionScale(s.count,s.page===active);
 if(s.page===focused)s.targetScale=1;
 visibleDetail+=data.length;
 if(signature===s.signature)continue;
 const old=new Map(s.stars.map(n=>[n.id,n]));
 s.stars=[];s.edges=[];
 s.signature=signature;s.detail.replaceChildren();
 const c=palette[s.page%palette.length],j=s.page%palette.length;
 const ps=points(data.map(m=>m.id),true);
 const edges=element("g",{},s.detail);
 let birthIndex=0;
 data.forEach((m,i)=>{
 const {x,y}=ps[i];
 if(i===0||i%7===0)s.edges.push({el:curve(edges,{x:0,y:0},{x,y},c,.24,"local-link"),a:-1,b:i});
 neighbours(ps,i).forEach(k=>s.edges.push({el:curve(edges,{x,y},ps[k],c,.35,"local-link"),a:i,b:k}));
 const existing=old.get(m.id);
 const n=existing?.node||element("g",{class:"star-node",transform:"translate("+x+" "+y+")"},s.detail) as SVGGElement;
 n.dataset.x=String(x);n.dataset.y=String(y);
 const fresh=ready&&!existing&&m.id>lastDrawnId&&!reduced.matches&&prefs.speed>0;
 const delay=fresh?birthIndex++*180:0;
 const source=i?s.stars[i-1]?.p:{x:0,y:0};
 s.stars.push({id:m.id,base:{x,y},p:existing?{...existing.p}:fresh?{...(source??{x:0,y:0})}:{x,y},node:n,born:existing?.born??(fresh?Math.max(1,time):0),delay:existing?.delay??delay});
 if(existing){s.detail.append(n);}
 else{
 n.dataset.id=String(m.id);
 const visual=element("g",{class:fresh?"newborn":""},n);
 if(fresh){n.classList.add("awaiting-birth");(visual as SVGElement).style.animationDelay=(delay/Math.max(.1,prefs.speed))+"ms";}
 const size=(m.role==="user"?2.2:3.1)+rand(m.id)*1.5;
 element("circle",{r:24+rand(m.id+18)*10,fill:"url(#nebula"+j+")",class:"star-glow"},visual);
 element("circle",{r:13,fill:"url(#nebula"+j+")",class:"star-glow inner"},visual);
 element("circle",{r:10,fill:"transparent"},visual);
 if(m.role==="assistant")element("path",{d:"M0 "+(-size-1)+"L"+size+" 0 0 "+(size+1)+" "+(-size)+" 0Z",fill:c,class:"orb"},visual);else element("circle",{r:size,fill:c,class:"orb"},visual);
 element("circle",{r:1.3,fill:"#fffaf0"},visual);
 if(m.role==="assistant")ring(visual,0,0,8,c);
 ring(visual,0,0,15,c,"focus-ring");ring(visual,0,0,24,c,"birth-wave");ring(visual,0,0,34,c,"birth-wave second");
 const label=element("g",{class:"node-tag","pointer-events":"none"},visual);
 
 element("rect",{x:13,y:-10,width:64,height:19,rx:2,fill:c,class:"active-tag-bg"},label);
 const t=element("text",{x:18,y:3,fill:"#120b08","font-size":10,class:"free-label"},label);t.textContent="#"+m.id+" · "+(m.role==="user"?"Вы":"ИИ");
 accessible(n,(m.role==="user"?"Вы: ":"ИИ: ")+m.content.slice(0,100),()=>{selected=m.id;nodes.querySelectorAll(".selected").forEach(el=>el.classList.remove("selected"));n.classList.add("selected");byId("node-info").textContent=m.content.slice(0,180);document.getElementById("msg-"+m.id)?.scrollIntoView({block:"nearest"});auto=false;setCam({x:s.p.x+Number(n.dataset.x)*s.scale,y:s.p.y+Number(n.dataset.y)*s.scale,k:2.1});});
 }
 n.classList.toggle("selected",selected===m.id);
 });
 }
 dirty=true;wake();
}
let lastDrawnId=0;
function draw(data:Message[],summary:Group[]){
 const newest=data.at(-1)?.id??0;if(ready&&newest>latestId){highlightUntil=performance.now()+2400;}latestId=newest;
 latest=data;groups=summary;const previous=active;active=summary.at(-1)?.page??-1;
 const valid=new Set(summary.map(g=>g.page));
 for(const [id,s] of scenes){if(!valid.has(id)){s.hub.remove();s.detail.remove();s.mini.remove();s.edge.remove();scenes.delete(id);}}
 for(const g of summary){
 let s=scenes.get(g.page);if(!s){s=createScene(g);scenes.set(g.page,s);}
 s.count=g.count;s.active=g.page===active;s.anchor=evolutionCenter(g.page,active);drawMini(s,g);
 s.hub.classList.toggle("active-cluster",s.active);
 s.hub.querySelector(".cluster-tag")!.textContent="Диалог "+(g.page+1);
 s.hub.querySelector(".cluster-number")!.textContent=String(g.count);
 }
 refreshDetails();
 byId("graph-count").textContent=summary.reduce((n,g)=>n+g.count,0)+" записей · "+summary.length+" созвездий";
 if(!ready){setCam(auto?fit(groups):prefs.camera??fit(groups));cam={...target};}
 else if(auto&&active!==previous&&active>=0){
 const f=fit(groups);if(f.k>=.55)setCam(f);else focusCam(active);
 }
 lastDrawnId=newest;ready=true;svg.dataset.ready="true";dirty=true;wake();
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
let renderedIds=new Set<number>();
let mapRevision=0;
async function refreshMap(revision:number){try{const r=await fetch("/api/state");if(!r.ok)return;const s=await r.json() as State;if(revision!==mapRevision)return;contextEdges=s.context_links||[];draw(s.messages,s.groups);}catch{}}
function render(s:State){contextEdges=s.context_links||[];cloudStar.classList.toggle("configured",s.configured);renderCatalog(s.cloud,s.model);if(!prefsLoaded){prefs=normalizePreferences(s.preferences);auto=prefs.auto;applyPrefs();prefsLoaded=true;}byId("state").textContent=s.configured?(s.cloud.verified?"Cloud.ru • проверено":"Cloud.ru • не проверено"):s.cloud.has_key?"Cloud.ru • выберите модель":"Локальный режим";byId("model").textContent=s.model||"Без модели";byId("count").textContent="Сообщений: "+s.count;
 const list=byId("messages");list.replaceChildren();for(const m of s.messages){const article=document.createElement("article");article.className="message"+(m.role==="assistant"&&ready&&!renderedIds.has(m.id)?" reveal-answer":"");article.id="msg-"+m.id;const role=document.createElement("span");role.className="role";role.textContent=m.role==="user"?"Вы":"Tenmatsuyora";const body=document.createElement("div");body.className="content";body.textContent=m.content;article.append(role,body);list.append(article);}renderedIds=new Set(s.messages.map(m=>m.id));list.scrollTop=list.scrollHeight;draw(s.messages,s.groups);}
async function refresh(){mapRevision++;const r=await fetch("/api/state");if(!r.ok)throw Error("Сервер недоступен");render(await r.json() as State);}

const form=byId<HTMLFormElement>("composer"),input=byId<HTMLTextAreaElement>("message"),send=byId<HTMLButtonElement>("send");
// Poll real operation events; replay short stages in order without fabricating model reasoning.
let eventQueue:WorkEvent[]=[],eventCursor=0,eventPlaying=false,eventTimer=0;
function playEvents(){
 if(eventPlaying)return;
 const ev=eventQueue.shift();if(!ev)return;
 eventPlaying=true;showEvent(ev);
 eventTimer=window.setTimeout(()=>{eventPlaying=false;playEvents();},reduced.matches?0:ev.kind==="cloud_start"?350:220);
}
function appendEvents(events:WorkEvent[]){for(const ev of events.slice(eventCursor))eventQueue.push(ev);eventCursor=Math.max(eventCursor,events.length);playEvents();}
form.addEventListener("submit",async e=>{
 e.preventDefault();const content=input.value.trim();if(!content||busy)return;
 busy=true;send.disabled=true;input.disabled=true;svg.classList.add("busy");document.body.classList.add("working");wake();byId("notice").textContent="";
 clearTimeout(eventTimer);eventQueue=[];eventPlaying=false;eventCursor=0;
 const operation=crypto.randomUUID().replaceAll("-","");let polling=true,pollTimer=0,mapUpdated=false;
 const preview=document.createElement("article");preview.className="message stream-preview";preview.hidden=true;const previewRole=document.createElement("span");previewRole.className="role";previewRole.textContent="Tenmatsuyora";const previewBody=document.createElement("div");previewBody.className="content";preview.append(previewRole,previewBody);byId("messages").append(preview);
 const poll=async()=>{try{const r=await fetch("/api/operation/"+operation);if(r.ok&&polling){const d=await r.json() as {events:WorkEvent[],text?:string};if(polling){const saved=d.events.some(ev=>ev.kind==="sqlite_saved"&&ev.role==="user");if(saved&&!mapUpdated){mapUpdated=true;void refreshMap(++mapRevision);}appendEvents(d.events);if(d.text){preview.hidden=false;previewBody.textContent=d.text;byId("messages").scrollTop=byId("messages").scrollHeight;}}}}catch{}finally{if(polling)pollTimer=window.setTimeout(poll,180);}};
 void poll();
 try{
 const r=await fetch("/api/message",{method:"POST",headers:{"Content-Type":"application/json","X-Tenma":"1"},body:JSON.stringify({content,operation})});
 const result=await r.json();if(!r.ok)throw Error(result.error||"Ошибка сервера");
 appendEvents(result.events||[]);input.value="";byId("notice").textContent=result.notice||"";await refresh();
 }catch(err){appendEvents([...Array.from({length:eventCursor},()=>({kind:""})),{kind:"failed"},{kind:"finished"}]);byId("notice").textContent=err instanceof Error?err.message:"Ошибка";}
 finally{polling=false;clearTimeout(pollTimer);preview.remove();busy=false;send.disabled=false;input.disabled=false;svg.classList.remove("busy");document.body.classList.remove("working");wake();input.focus();}
});
const cloudPanel=byId<HTMLFormElement>("cloud-panel");
let cloudCatalog:CatalogItem[]=[],currentCloud:CloudStatus|undefined;
function option(select:HTMLSelectElement,value:string,label:string){const o=document.createElement("option");o.value=value;o.textContent=label;select.append(o);}
function renderCatalog(status:CloudStatus,model:string){
 currentCloud=status;cloudCatalog=status.catalog||[];
 const models=byId<HTMLSelectElement>("cloud-model"),emb=byId<HTMLSelectElement>("cloud-embedding");
 models.replaceChildren();emb.replaceChildren();option(models,"","Выберите модель");option(emb,"","Выключены");
 for(const m of cloudCatalog){if(m.category==="embedding")option(emb,m.id,m.id);else if(m.category==="llm"||m.category==="unknown")option(models,m.id,m.id);}
 if(model&&!Array.from(models.options).some(o=>o.value===model))option(models,model,model+" (не проверено)");
 models.value=model||"";if(status.embedding&&!Array.from(emb.options).some(o=>o.value===status.embedding))option(emb,status.embedding,status.embedding+" (не проверено)");
 emb.value=status.embedding||"";byId<HTMLInputElement>("cloud-consent").checked=!!status.embedding;byId<HTMLInputElement>("cloud-remember").disabled=!status.secure_storage;
 modelStars.replaceChildren();
 const selected=[model,status.embedding].filter(Boolean);
 selected.forEach((id,i)=>{const x=i?41:-41,y=8;line(modelStars,0,0,x,y,i?"#ffb66c":"#edbe74",.5);element("circle",{cx:x,cy:y,r:12,fill:"url(#coreHalo)",opacity:.4},modelStars);element("circle",{cx:x,cy:y,r:3,fill:i?"#ffc680":"#ffe2a5"},modelStars);const title=element("title",{},modelStars);title.textContent=id;});
 renderCatalogList();
}
function renderCatalogList(){
 const box=byId("cloud-catalog"),category=byId<HTMLSelectElement>("cloud-category").value;
 box.replaceChildren();for(const m of cloudCatalog.filter(m=>category==="all"||m.category===category||(category==="llm"&&m.category==="unknown"))){const item=document.createElement("div");item.setAttribute("role","listitem");item.textContent=m.id+" · "+m.category;box.append(item);}
}
byId("cloud-category").addEventListener("change",renderCatalogList);
byId("cloud-toggle").addEventListener("click",()=>{cloudPanel.hidden=!cloudPanel.hidden;byId("cloud-toggle").setAttribute("aria-expanded",String(!cloudPanel.hidden));});
async function updateCloud(clear=false){
 if(busy){byId("cloud-status").textContent="Дождитесь завершения запроса";return;}
 const key=byId<HTMLInputElement>("cloud-key"),model=byId<HTMLSelectElement>("cloud-model"),embedding=byId<HTMLSelectElement>("cloud-embedding");
 if(!clear&&!key.value.trim()&&!currentCloud?.has_key){byId("cloud-status").textContent="Введите ключ";return;}
 const submit=cloudPanel.querySelector<HTMLButtonElement>("[type=submit]")!;submit.disabled=true;
 byId("cloud-status").textContent="Проверка каталога…";
 try{const r=await fetch("/api/cloud",{method:"POST",headers:{"Content-Type":"application/json","X-Tenma":"1"},body:JSON.stringify({key:key.value,model:model.value,embedding:embedding.value,remember:byId<HTMLInputElement>("cloud-remember").checked,semantic_consent:byId<HTMLInputElement>("cloud-consent").checked,clear})});const d=await r.json();if(!r.ok)throw Error(d.error||"Настройки не приняты");key.value="";await refresh();byId("cloud-status").textContent=clear?"Отключено":d.model?"Ключ проверен, модель выбрана":"Ключ проверен. Выберите модель и примените."; }catch(e){byId("cloud-status").textContent=e instanceof Error?e.message:"Ошибка";cloudStar.classList.add("cloud-error");}finally{submit.disabled=false;}
}
cloudPanel.addEventListener("submit",e=>{e.preventDefault();void updateCloud();});
byId("cloud-clear").addEventListener("click",()=>void updateCloud(true));
byId("fullscreen").addEventListener("click",()=>{const el=document.querySelector<HTMLElement>(".universe")!;if(document.fullscreenElement){void document.exitFullscreen().catch(()=>{});}else if(el.requestFullscreen){void el.requestFullscreen().catch(()=>{el.classList.toggle("map-expanded");});}else el.classList.toggle("map-expanded");});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){document.querySelector(".universe")?.classList.remove("map-expanded");cloudPanel.hidden=true;byId("cloud-toggle").setAttribute("aria-expanded","false");}});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
refresh().catch(e=>{byId("state").textContent="Нет соединения";byId("notice").textContent=e.message;});
