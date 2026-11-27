type Message={id:number,role:"user"|"assistant",content:string};
type State={messages:Message[],count:number,configured:boolean,model:string};
const byId=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const svg=document.getElementById("sky") as unknown as SVGSVGElement;
const stars=document.getElementById("stars")!;
const links=document.getElementById("links")!;
const nodes=document.getElementById("nodes")!;
const ns="http://www.w3.org/2000/svg";
function element(tag:string,attrs:Record<string,string|number>,parent:Element){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));parent.append(el);return el;}
function rand(i:number){const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);}
const reduced=matchMedia("(prefers-reduced-motion: reduce)");
const seen=new Set<number>();
let initialized=false;
let selected:number|null=null;
const defs=svg.querySelector("defs")!;
const palette=["#f5d477","#eea565","#f16f94","#d66ac4","#eab9ed"];
palette.forEach((c,i)=>{
 const gradient=element("radialGradient",{id:"nebula"+i},defs);
 [[0,".83"],[.12,".48"],[.38,".12"],[1,"0"]].forEach(([offset,opacity])=>element("stop",{offset:String(offset),"stop-color":c,"stop-opacity":String(opacity)},gradient));
});
for(let i=0;i<1200;i++){
 const r=.15+rand(i+2400)*.85;
 const star=element("circle",{cx:rand(i)*1000,cy:rand(i+1200)*900,r,fill:i%9===0?"#d3b3ff":"#f1dfbd",opacity:.04+rand(i+3600)*.3},stars);
 if(i%53===0){star.classList.add("twinkle");star.setAttribute("style","animation-delay:-"+(i%11)+"s");}
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
const cx=495,cy=495;
const centers=[{x:310,y:210},{x:765,y:335},{x:240,y:650},{x:720,y:725},{x:220,y:415}];
const activity=element("g",{class:"activity","aria-hidden":"true"},svg);
const beam="M 1000 495 Q 780 575 495 495";
element("path",{d:beam,class:"activity-track",fill:"none",stroke:"#ffe5a0","stroke-width":1},activity);
for(let i=0;i<4;i++)element("path",{d:beam,pathLength:100,fill:"none",stroke:"#fff0c8","stroke-width":2,class:"activity-packet",style:"animation-delay:-"+i*.36+"s"},activity);
function draw(data:Message[]){
 links.replaceChildren();nodes.replaceChildren();
 const core=element("g",{class:"core"},nodes);
 element("circle",{cx,cy,r:98,fill:"url(#coreHalo)"},core);
 [18,34,52].forEach(r=>ring(core,cx,cy,r,"#fff2d6"));
 const echo=ring(core,cx,cy,30,"#fff0c8","core-echo");
 echo.setAttribute("stroke-width","1.2");
 flare(core,cx,cy,37,"#fff9e9");
 element("circle",{cx,cy,r:7.5,fill:"#fffef7"},core);
 element("circle",{cx,cy,r:3,fill:"white"},core);
 textAt(core,cx,cy+56,"Ядро","#eee3cf",12);
 const visible=data.slice(-120);
 const buckets=new Map<number,Message[]>();
 for(const m of visible){const page=Math.floor((m.id-1)/30);const list=buckets.get(page)||[];list.push(m);buckets.set(page,list);}
 const ordered=[...buckets.entries()].sort((a,b)=>a[0]-b[0]);
 let previous:{x:number,y:number}|undefined;
 let births=0;
 for(const [page,entries] of ordered){
 const j=page%centers.length,g=centers[j],c=palette[j];
 line(links,cx,cy,g.x,g.y,c,.34);
 if(previous)line(links,previous.x,previous.y,g.x,g.y,c,.12);
 previous=g;
 const hub=element("g",{class:"cluster-hub"},nodes);
 element("circle",{cx:g.x,cy:g.y,r:62,fill:"url(#nebula"+j+")",opacity:.8},hub);
 ring(hub,g.x,g.y,20,c);ring(hub,g.x,g.y,37,c);
 flare(hub,g.x,g.y,23,c);
 element("circle",{cx:g.x,cy:g.y,r:5,fill:"#fff3d4"},hub);
 textAt(hub,g.x,g.y-118,"Диалог "+(page*30+1)+"–"+(page*30+30),c,11);
 const points=entries.map(m=>{
 const slot=(m.id-1)%30,a=slot*2.399963+j*.6,r=22+Math.sqrt(slot+1)*15;
 return {m,x:g.x+Math.cos(a)*r,y:g.y+Math.sin(a)*r};
 });
 points.forEach((p,i)=>{
 const {m,x,y}=p;
 const fresh=initialized&&!seen.has(m.id)&&!reduced.matches;
 const delay=fresh?Math.min(births++*110,1100):0;
 const edges=element("g",{class:fresh?"new-edge":"",style:"animation-delay:"+delay+"ms"},links);
 line(edges,g.x,g.y,x,y,c,.25);
 // Only spatial links, not semantic relationships.
 const nearest=points.slice(0,i).map(q=>({q,d:Math.hypot(x-q.x,y-q.y)})).sort((a,b)=>a.d-b.d).slice(0,2);
 nearest.filter(q=>q.d<85).forEach(({q})=>line(edges,x,y,q.x,q.y,c,.19));
 const n=element("g",{class:"star-node"+(fresh?" newborn":"")+(selected===m.id?" selected":""),tabindex:0,role:"button","aria-label":(m.role==="user"?"Вы: ":"Tenmatsuyora: ")+m.content.slice(0,100),style:"animation-delay:"+delay+"ms"},nodes);
 element("circle",{cx:x,cy:y,r:19+(m.role==="assistant"?5:0),fill:"url(#nebula"+j+")"},n);
 element("circle",{cx:x,cy:y,r:10,class:"hit",fill:"transparent"},n);
 element("circle",{cx:x,cy:y,r:m.role==="user"?2.7:3.6,fill:c,class:"orb"},n);
 element("circle",{cx:x,cy:y,r:1.3,fill:"#fff7e6"},n);
 if(m.role==="assistant")ring(n,x,y,8,c);
 ring(n,x,y,15,c,"focus-ring");
 ring(n,x,y,23,c,"birth-wave");
 const tag=element("g",{class:"node-tag","pointer-events":"none"},n);
 element("rect",{x:x+13,y:y-12,width:79,height:21,rx:3,fill:"#120e0c",stroke:c,"stroke-width":.6},tag);
 const t=element("text",{x:x+19,y:y+2,fill:c,"font-size":10},tag);t.textContent="#"+m.id+" · "+(m.role==="user"?"Вы":"ИИ");
 const select=()=>{
 selected=m.id;nodes.querySelectorAll(".selected").forEach(el=>el.classList.remove("selected"));n.classList.add("selected");
 byId("node-info").textContent=m.content.slice(0,140);document.getElementById("msg-"+m.id)?.scrollIntoView({block:"nearest"});
 };
 n.addEventListener("click",select);n.addEventListener("keydown",e=>{if((e as KeyboardEvent).key==="Enter"||(e as KeyboardEvent).key===" "){e.preventDefault();select();}});
 });
 }
 seen.clear();visible.forEach(m=>seen.add(m.id));initialized=true;
 byId("graph-count").textContent=visible.length+" звёзд · "+ordered.length+" созвездий";
}
function render(s:State){byId("state").textContent=s.configured?"Cloud.ru • настроено":"Локальный режим";byId("model").textContent=s.model||"Без модели";byId("count").textContent="Сообщений: "+s.count;
 const list=byId("messages");list.replaceChildren();for(const m of s.messages){const article=document.createElement("article");article.className="message";article.id="msg-"+m.id;const role=document.createElement("span");role.className="role";role.textContent=m.role==="user"?"Вы":"Tenmatsuyora";const body=document.createElement("div");body.className="content";body.textContent=m.content;article.append(role,body);list.append(article);}list.scrollTop=list.scrollHeight;draw(s.messages);}
async function refresh(){const r=await fetch("/api/state");if(!r.ok)throw Error("Сервер недоступен");render(await r.json() as State);}
draw([]);
initialized=false;
let busy=false;
const form=byId<HTMLFormElement>("composer"),input=byId<HTMLTextAreaElement>("message"),send=byId<HTMLButtonElement>("send");
form.addEventListener("submit",async e=>{e.preventDefault();const content=input.value.trim();if(!content||busy)return;busy=true;send.disabled=true;input.disabled=true;svg.classList.add("busy");byId("notice").textContent="Обработка…";
 try{const r=await fetch("/api/message",{method:"POST",headers:{"Content-Type":"application/json","X-Tenma":"1"},body:JSON.stringify({content})});const result=await r.json();if(!r.ok)throw Error(result.error||"Ошибка сервера");input.value="";byId("notice").textContent=result.notice||"";await refresh();}
 catch(err){byId("notice").textContent=err instanceof Error?err.message:"Ошибка";}finally{busy=false;send.disabled=false;input.disabled=false;svg.classList.remove("busy");input.focus();}
});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
refresh().catch(e=>{byId("state").textContent="Нет соединения";byId("notice").textContent=e.message;});
