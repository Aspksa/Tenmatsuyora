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
for(let i=0;i<850;i++)element("circle",{cx:rand(i)*1000,cy:rand(i+1200)*900,r:.15+rand(i+2400)*.95,fill:"#f1dfbd",opacity:.06+rand(i+3600)*.35},stars);
function draw(data:Message[]){
 links.replaceChildren();nodes.replaceChildren();
 const cx=490,cy=480;
 const core=element("g",{class:"core"},nodes);
 element("circle",{cx,cy,r:94,fill:"url(#coreHalo)"},core);
 [24,42,62].forEach(r=>element("circle",{cx,cy,r,class:"orbit"},core));
 element("circle",{cx,cy,r:8,fill:"#fffdf2"},core);
 element("path",{d:"M490 448 L490 512 M458 480 L522 480",stroke:"#fff8e4",opacity:.6},core);
 const label=element("text",{x:cx,y:cy+80,fill:"#e3d2b2","text-anchor":"middle","font-size":13},core);label.textContent="Ядро";
 const groups=[{x:270,y:255,c:"#e6c46a"},{x:735,y:280,c:"#efab68"},{x:240,y:650,c:"#e7bb72"},{x:740,y:665,c:"#e2a56b"}];
 const visible=data.slice(-120);
 const buckets=groups.map((_,j)=>visible.filter(m=>m.id%4===j));
 groups.forEach((g,j)=>{
 const entries=buckets[j];if(!entries.length)return;
 element("line",{x1:cx,y1:cy,x2:g.x,y2:g.y,stroke:g.c,opacity:.35,class:"pulse"},links);
 element("circle",{cx:g.x,cy:g.y,r:48,fill:"url(#halo)"},nodes);
 element("circle",{cx:g.x,cy:g.y,r:4,fill:g.c},nodes);
 [28,46].forEach(r=>element("circle",{cx:g.x,cy:g.y,r,class:"orbit"},nodes));
 entries.forEach((m,i)=>{
 const a=i*2.399963, r=29+Math.sqrt(i)*19,x=g.x+Math.cos(a)*r,y=g.y+Math.sin(a)*r;
 element("line",{x1:g.x,y1:g.y,x2:x,y2:y,stroke:g.c,opacity:.28},links);
 const n=element("g",{class:"star-node",tabindex:0,role:"button","aria-label":(m.role==="user"?"Вы: ":"Tenmatsuyora: ")+m.content.slice(0,100)},nodes);
 element("circle",{cx:x,cy:y,r:18,fill:"url(#halo)"},n);
 element("circle",{cx:x,cy:y,r:m.role==="user"?3:4,fill:g.c,class:"orb"},n);
 const select=()=>{byId("node-info").textContent=m.content.slice(0,140);document.getElementById("msg-"+m.id)?.scrollIntoView({block:"nearest"});};
 n.addEventListener("click",select);n.addEventListener("keydown",e=>{if((e as KeyboardEvent).key==="Enter"||(e as KeyboardEvent).key===" "){e.preventDefault();select();}});
 });
 });
}
function render(s:State){byId("state").textContent=s.configured?"Cloud.ru • настроено":"Локальный режим";byId("model").textContent=s.model||"Без модели";byId("count").textContent="Сообщений: "+s.count;
 const list=byId("messages");list.replaceChildren();for(const m of s.messages){const article=document.createElement("article");article.className="message";article.id="msg-"+m.id;const role=document.createElement("span");role.className="role";role.textContent=m.role==="user"?"Вы":"Tenmatsuyora";const body=document.createElement("div");body.className="content";body.textContent=m.content;article.append(role,body);list.append(article);}list.scrollTop=list.scrollHeight;draw(s.messages);}
async function refresh(){const r=await fetch("/api/state");if(!r.ok)throw Error("Сервер недоступен");render(await r.json() as State);}
draw([]);
let busy=false;
const form=byId<HTMLFormElement>("composer"),input=byId<HTMLTextAreaElement>("message"),send=byId<HTMLButtonElement>("send");
form.addEventListener("submit",async e=>{e.preventDefault();const content=input.value.trim();if(!content||busy)return;busy=true;send.disabled=true;input.disabled=true;svg.classList.add("busy");byId("notice").textContent="Обработка…";
 try{const r=await fetch("/api/message",{method:"POST",headers:{"Content-Type":"application/json","X-Tenma":"1"},body:JSON.stringify({content})});const result=await r.json();if(!r.ok)throw Error(result.error||"Ошибка сервера");input.value="";byId("notice").textContent=result.notice||"";await refresh();}
 catch(err){byId("notice").textContent=err instanceof Error?err.message:"Ошибка";}finally{busy=false;send.disabled=false;input.disabled=false;svg.classList.remove("busy");input.focus();}
});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
refresh().catch(e=>{byId("state").textContent="Нет соединения";byId("notice").textContent=e.message;});
