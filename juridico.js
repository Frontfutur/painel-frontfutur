/* ===========================================================
   MÓDULO JURÍDICO — quadro de trabalho com a assessoria.
   Depende de auth.js (window.FF) e do supabase-js.
   =========================================================== */
(function(){
"use strict";

/* ---------------------------------------------------------------- modelo */
const FRENTES=[
 {id:"f1",code:"F1",name:"Contratos e modelos",color:"var(--f1)"},
 {id:"f2",code:"F2",name:"Base de prestadores",color:"var(--f2)"},
 {id:"f3",code:"F3",name:"Cliente",color:"var(--f3)"},
 {id:"f4",code:"F4",name:"Estrutura da empresa",color:"var(--f4)"},
 {id:"f5",code:"F5",name:"Time e remuneração",color:"var(--f5)"}
];
const STATUSES=[
 {id:"todo",label:"A fazer",raw:"#b1adc2"},
 {id:"doing",label:"Em andamento",raw:"#d9931f"},
 {id:"waiting",label:"Aguardando",raw:"#d2542f"},
 {id:"done",label:"Concluído",raw:"#2c8a5d"}
];
const F=Object.fromEntries(FRENTES.map(f=>[f.id,f]));
const S=Object.fromEntries(STATUSES.map(s=>[s.id,s]));
const MAX_FILE=45*1024*1024;

let sb=null, me="", ready=false, view="lista", openId=null, CODES={};
let tasks=new Map(), notes=[], files=[];
let filter={q:"",frentes:new Set(),blocked:false};

/* ---------------------------------------------------------------- utils */
const $=s=>document.querySelector(s);
const el=(t,c)=>{const n=document.createElement(t);if(c)n.className=c;return n;};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("on");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("on"),3000);}
function fmtDate(d){
  if(!d)return "";
  const p=String(d).slice(0,10).split("-");if(p.length!==3)return d;
  const M=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return p[2]+" "+M[Number(p[1])-1];
}
function isLate(t){return t.due && t.status!=="done" && t.due < new Date().toISOString().slice(0,10);}
function fmtSize(b){b=Number(b)||0;return b>=1048576?(b/1048576).toFixed(1)+" MB":Math.max(1,Math.round(b/1024))+" KB";}
function banner(msg){$("#bannerHost").innerHTML='<div class="banner">'+msg+"</div>";}

const ICON={
  clip:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M10.2 4.3 5.6 8.9a2.1 2.1 0 0 0 3 3l5-5a3.6 3.6 0 0 0-5.1-5.1L3.2 6.9"/></svg>',
  note:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"><path d="M2.6 3.2h10.8v7.3H6.8L4.1 12.8v-2.3H2.6z"/></svg>',
  cal:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25"><rect x="2.4" y="3.6" width="11.2" height="9.8" rx="1.3"/><path d="M2.4 6.6h11.2M5.6 2.2v2.4M10.4 2.2v2.4"/></svg>',
  link:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7l-.9.9"/><path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.6 8.7a2.6 2.6 0 0 0 3.7 3.7l.9-.9"/></svg>',
  file:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"><path d="M9 2.2H4.4v11.6h7.2V4.8z"/><path d="M9 2.2v2.6h2.6"/></svg>'
};

/* ------------------------------------------------- tradução banco <-> tela */
const COL={title:"titulo",detail:"contexto",frente:"frente",status:"status",
  owner:"responsavel",waitingOn:"depende_de",priority:"prioridade",due:"prazo",order:"ordem"};

function fromRow(r){
  return {id:r.id,title:r.titulo||"",detail:r.contexto||"",frente:r.frente||"f1",
    status:r.status||"todo",owner:r.responsavel||"",waitingOn:r.depende_de||"",
    priority:r.prioridade||"media",due:r.prazo?String(r.prazo).slice(0,10):"",
    order:Number(r.ordem)||0};
}
function toRow(p){
  const r={};
  Object.keys(p).forEach(k=>{
    if(!COL[k])return;
    r[COL[k]] = (k==="due") ? (p[k]||null) : p[k];
  });
  return r;
}

/* ---------------------------------------------------------------- leitura */
function taskList(){return [...tasks.values()].sort((a,b)=>(a.order||0)-(b.order||0));}
function visible(){
  const q=filter.q.trim().toLowerCase();
  return taskList().filter(t=>{
    if(filter.frentes.size && !filter.frentes.has(t.frente))return false;
    if(filter.blocked && !(t.waitingOn||"").trim())return false;
    if(q){
      const hay=(t.title+" "+(t.detail||"")+" "+(t.owner||"")+" "+(t.waitingOn||"")).toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });
}
function notesOf(id){return notes.filter(n=>n.taskId===id).sort((a,b)=>(a.at||"").localeCompare(b.at||""));}
function filesOf(id){return files.filter(f=>f.taskId===id).sort((a,b)=>(a.at||"").localeCompare(b.at||""));}

let reloadTimer=null;
function scheduleReload(){clearTimeout(reloadTimer);reloadTimer=setTimeout(reload,350);}

async function reload(){
  const [a,b,c]=await Promise.all([
    sb.from("tarefas").select("*"),
    sb.from("anotacoes").select("*"),
    sb.from("anexos").select("*")
  ]);
  if(a.error){
    banner("Não consegui ler as tarefas: "+esc(a.error.message)+". Recarregue a página.");
    ready=true; render(); return;
  }
  $("#bannerHost").innerHTML="";
  tasks=new Map((a.data||[]).map(r=>[r.id,fromRow(r)]));
  notes=(b.data||[]).map(r=>({id:r.id,taskId:r.tarefa_id,author:r.autor||"",text:r.texto||"",at:r.criado_em}));
  files=(c.data||[]).map(r=>({id:r.id,taskId:r.tarefa_id,kind:r.tipo==="link"?"link":"file",
    name:r.nome||"",url:r.url||"",path:r.caminho||"",size:r.tamanho||0,by:r.autor||"",at:r.criado_em}));
  ready=true; render(); renderDrawer();
}

/* ---------------------------------------------------------------- escrita */
async function saveTask(id,patch){
  const cur=tasks.get(id)||{};
  tasks.set(id,Object.assign({},cur,patch)); render();
  const row=toRow(patch); row.alterado_em=new Date().toISOString();
  const {error}=await sb.from("tarefas").update(row).eq("id",id);
  if(error){toast("Não salvou: "+error.message); reload();}
}
async function createTask(frente){
  const id=uid();
  const orders=taskList().map(t=>t.order||0);
  const doc={id,title:"Nova tarefa",detail:"",frente:frente||FRENTES[0].id,status:"todo",
    owner:"",waitingOn:"",priority:"media",due:"",
    order:(orders.length?Math.max.apply(null,orders):0)+100};
  tasks.set(id,doc); openId=id; render(); openDrawer(id);
  const row=toRow(doc); row.id=id;
  const {error}=await sb.from("tarefas").insert(row);
  if(error){toast("Não criou a tarefa: "+error.message); tasks.delete(id); closeDrawer(); render();}
}
async function removeTask(id){
  const anexos=filesOf(id).filter(f=>f.kind==="file"&&f.path);
  tasks.delete(id);
  if(openId===id){openId=null;closeDrawer();}
  render();
  if(anexos.length) await sb.storage.from("anexos").remove(anexos.map(f=>f.path));
  const {error}=await sb.from("tarefas").delete().eq("id",id);
  if(error){toast("Não excluiu: "+error.message); reload();}
}
async function addNote(taskId,text){
  const tmp={id:"tmp"+uid(),taskId,author:me,text,at:new Date().toISOString()};
  notes.push(tmp); renderDrawer(); render();
  const {error}=await sb.from("anotacoes").insert({tarefa_id:taskId,autor:me,texto:text});
  if(error){toast("Nota não salva: "+error.message);}
  reload();
}
async function removeNote(id){
  notes=notes.filter(n=>n.id!==id); renderDrawer(); render();
  const {error}=await sb.from("anotacoes").delete().eq("id",id);
  if(error){toast("Não apagou a nota"); reload();}
}
async function addLink(taskId,name,url){
  const {error}=await sb.from("anexos").insert({tarefa_id:taskId,tipo:"link",nome:name||url,url,autor:me});
  if(error){toast("Link não salvo: "+error.message);return;}
  await reload();
}
async function uploadFile(taskId,file){
  if(file.size>MAX_FILE){toast("Máximo 45 MB por arquivo — use um link para algo maior");return;}
  const safe=file.name.replace(/[^\w.\- ]+/g,"_");
  const path=taskId+"/"+uid()+"-"+safe;
  toast("Enviando "+file.name+"…");
  const up=await sb.storage.from("anexos").upload(path,file,{cacheControl:"3600",upsert:false});
  if(up.error){toast("Falha no upload: "+up.error.message);return;}
  const {error}=await sb.from("anexos").insert({tarefa_id:taskId,tipo:"arquivo",
    nome:file.name,caminho:path,tamanho:file.size,autor:me});
  if(error){toast("Arquivo subiu mas não registrou: "+error.message);return;}
  await reload();
  toast("Arquivo anexado");
}
async function downloadFile(f){
  const {data,error}=await sb.storage.from("anexos").createSignedUrl(f.path,120,{download:f.name});
  if(error||!data){toast("Não deu para baixar: "+(error?error.message:"link expirado"));return;}
  const a=document.createElement("a");
  a.href=data.signedUrl; a.rel="noopener"; a.style.display="none";
  document.body.appendChild(a); a.click(); a.remove();
}
async function deleteFile(f){
  files=files.filter(x=>x.id!==f.id); renderDrawer(); render();
  if(f.kind==="file"&&f.path) await sb.storage.from("anexos").remove([f.path]);
  const {error}=await sb.from("anexos").delete().eq("id",f.id);
  if(error){toast("Não removeu o anexo"); reload();}
}

/* ---------------------------------------------------------------- render */
function codeMap(){
  const m={};
  FRENTES.forEach(f=>{
    taskList().filter(t=>t.frente===f.id).forEach((t,i)=>{m[t.id]=f.code+"."+String(i+1).padStart(2,"0");});
  });
  return m;
}
function render(){
  renderStats();
  CODES=codeMap();
  const host=$("#view");
  if(!ready){host.innerHTML='<div class="loading">Carregando o quadro…</div>';return;}
  host.innerHTML="";
  host.appendChild(view==="quadro"?buildBoard():view==="frentes"?buildFrentes():buildLista());
}
function renderStats(){
  const all=taskList();
  const by={todo:0,doing:0,waiting:0,done:0};
  all.forEach(t=>{by[t.status]=(by[t.status]||0)+1;});
  $("#statTotal").innerHTML="<b>"+all.length+"</b>tarefas";
  const pct=all.length?Math.round(by.done/all.length*100):0;
  $("#statDone").innerHTML="<b>"+pct+"%</b>concluído";
  const m=$("#meter"); m.innerHTML="";
  STATUSES.forEach(s=>{
    if(!by[s.id])return;
    const i=el("i"); i.style.width=(by[s.id]/all.length*100)+"%"; i.style.background=s.raw;
    i.title=s.label+": "+by[s.id]; m.appendChild(i);
  });
}

function cardEl(t){
  const b=el("button","card");
  b.draggable=true; b.dataset.id=t.id;
  const f=F[t.frente]||FRENTES[0];
  const ns=notesOf(t.id).length, fs=filesOf(t.id).length;
  b.innerHTML=
    '<div class="card-top"><span class="fchip" style="--fc:'+f.color+'">'+(CODES[t.id]||f.code)+" · "+esc(f.name.split(" ")[0])+"</span>"+
    (t.priority==="alta"?'<span class="prio">Alta</span>':"")+"</div>"+
    "<h3>"+esc(t.title)+"</h3>"+
    ((t.waitingOn||"").trim()?'<div class="blocked"><div><span>Depende de</span>'+esc(t.waitingOn)+"</div></div>":"")+
    '<div class="card-meta">'+
      (t.owner?'<span class="owner">'+esc(t.owner)+"</span>":"")+
      (fs?'<span class="m">'+ICON.clip+fs+"</span>":"")+
      (ns?'<span class="m">'+ICON.note+ns+"</span>":"")+
      (t.due?'<span class="m'+(isLate(t)?" late":"")+'">'+ICON.cal+fmtDate(t.due)+"</span>":"")+
    "</div>";
  b.addEventListener("click",()=>openDrawer(t.id));
  b.addEventListener("dragstart",e=>{
    e.dataTransfer.setData("text/plain",t.id);
    e.dataTransfer.effectAllowed="move";
    b.classList.add("dragging");
  });
  b.addEventListener("dragend",()=>b.classList.remove("dragging"));
  return b;
}

function buildBoard(){
  const wrap=el("div","board");
  const list=visible();
  STATUSES.forEach(s=>{
    const col=el("div","col"); col.style.setProperty("--st",s.raw); col.dataset.status=s.id;
    const head=el("div","col-head");
    head.innerHTML='<span class="name">'+s.label+'</span><span class="count">'+list.filter(t=>t.status===s.id).length+"</span>";
    const body=el("div","col-body");
    const mine=list.filter(t=>t.status===s.id);
    if(!mine.length) body.innerHTML='<div class="col-empty">vazio</div>';
    mine.forEach(t=>body.appendChild(cardEl(t)));
    col.append(head,body);
    col.addEventListener("dragover",e=>{e.preventDefault();e.dataTransfer.dropEffect="move";col.classList.add("over");});
    col.addEventListener("dragleave",e=>{if(!col.contains(e.relatedTarget))col.classList.remove("over");});
    col.addEventListener("drop",e=>{
      e.preventDefault(); col.classList.remove("over");
      const id=e.dataTransfer.getData("text/plain"); if(!id||!tasks.has(id))return;
      dropInto(id,s.id,body,e.clientY);
    });
    wrap.appendChild(col);
  });
  return wrap;
}

function dropInto(id,status,body,y){
  const nodes=[...body.querySelectorAll(".card")].filter(c=>c.dataset.id!==id);
  const sibs=nodes.map(c=>tasks.get(c.dataset.id)).filter(Boolean);
  let idx=sibs.length;
  for(let i=0;i<nodes.length;i++){
    const r=nodes[i].getBoundingClientRect();
    if(y<r.top+r.height/2){idx=i;break;}
  }
  const before=idx>0?(sibs[idx-1].order||0):null;
  const after=idx<sibs.length?(sibs[idx].order||0):null;
  let order;
  if(before===null&&after===null)order=100;
  else if(before===null)order=after-50;
  else if(after===null)order=before+100;
  else order=(before+after)/2;
  saveTask(id,{status,order});
}

function buildFrentes(){
  const wrap=el("div","frentes");
  const list=visible();
  FRENTES.forEach(f=>{
    if(filter.frentes.size&&!filter.frentes.has(f.id))return;
    const mine=list.filter(t=>t.frente===f.id);
    const sec=el("section");
    const done=mine.filter(t=>t.status==="done").length;
    const open=mine.filter(t=>(t.waitingOn||"").trim()&&t.status!=="done").length;
    const head=el("div","fhead");
    head.innerHTML='<span class="code" style="--fc:'+f.color+'">'+f.code+"</span><h2>"+esc(f.name)+"</h2>"+
      '<div class="tally"><span class="n">'+done+"/"+mine.length+" concluídas</span>"+
      (open?'<span class="n" style="color:var(--coral)">'+open+" travada"+(open>1?"s":"")+"</span>":"")+
      '<div class="meter" style="width:110px"><i style="width:'+(mine.length?done/mine.length*100:0)+'%;background:var(--green)"></i></div></div>';
    sec.appendChild(head);
    if(!mine.length){
      const e2=el("div","col-empty"); e2.textContent="nenhuma tarefa nesta frente"; sec.appendChild(e2);
      wrap.appendChild(sec); return;
    }
    const rh=el("div","row-head");
    rh.innerHTML="<span>Status</span><span>Tarefa</span><span>Depende de</span><span>Prazo</span>";
    sec.appendChild(rh);
    const rows=el("div","rows");
    mine.slice().sort((a,b)=>STATUSES.findIndex(s=>s.id===a.status)-STATUSES.findIndex(s=>s.id===b.status)||(a.order||0)-(b.order||0))
    .forEach(t=>{
      const r=el("div","row");
      const sel=el("select","stsel");
      sel.style.setProperty("--st",S[t.status].raw);
      STATUSES.forEach(s=>{const o=el("option");o.value=s.id;o.textContent=s.label;if(s.id===t.status)o.selected=true;sel.appendChild(o);});
      sel.addEventListener("change",()=>saveTask(t.id,{status:sel.value}));
      const ttl=el("div","row-title");
      const nf=filesOf(t.id).length, nn=notesOf(t.id).length;
      ttl.innerHTML="<strong>"+esc(t.title)+"</strong>"+
        (t.detail?"<small>"+esc(t.detail)+"</small>":"")+
        (t.owner||nf||nn?
          '<div class="card-meta" style="margin-top:3px">'+
          (t.owner?'<span class="owner">'+esc(t.owner)+"</span>":"")+
          (nf?'<span class="m">'+ICON.clip+nf+"</span>":"")+
          (nn?'<span class="m">'+ICON.note+nn+"</span>":"")+
          "</div>":"");
      ttl.addEventListener("click",()=>openDrawer(t.id));
      const dep=el("div","dep"+((t.waitingOn||"").trim()&&t.status!=="done"?" on":""));
      dep.textContent=(t.waitingOn||"").trim()||"—";
      dep.title=t.waitingOn||"";
      const when=el("div","when"+(isLate(t)?" late":""));
      when.textContent=t.due?fmtDate(t.due):"—";
      r.append(sel,ttl,dep,when);
      rows.appendChild(r);
    });
    sec.appendChild(rows);
    wrap.appendChild(sec);
  });
  return wrap;
}

/* ---------------------------------------------------------------- lista geral */
function itemEl(t){
  const row=el("div","item"+(t.status==="done"?" done":""));
  const f=F[t.frente]||FRENTES[0], s=S[t.status]||STATUSES[0];
  const tick=el("button","tick");
  tick.setAttribute("aria-pressed",t.status==="done"?"true":"false");
  tick.setAttribute("aria-label",t.status==="done"?"Reabrir item":"Marcar como concluído");
  tick.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 8.4l2.9 2.9 5.9-6"/></svg>';
  tick.addEventListener("click",()=>saveTask(t.id,{status:t.status==="done"?"todo":"done"}));
  const main=el("div","item-main");
  const nf=filesOf(t.id).length, nn=notesOf(t.id).length;
  main.innerHTML="<h3>"+esc(t.title)+"</h3>"+
    (t.detail?"<p>"+esc(t.detail)+"</p>":"")+
    '<div class="item-meta">'+
      '<span class="num" style="color:'+f.color+'">'+(CODES[t.id]||f.code)+"</span>"+
      '<span class="tag-st"><i style="background:'+s.raw+'"></i>'+s.label+"</span>"+
      ((t.waitingOn||"").trim()&&t.status!=="done"?'<span class="tag-dep">depende de '+esc(t.waitingOn)+"</span>":"")+
      (t.priority==="alta"&&t.status!=="done"?'<span class="tag-hot">prioridade alta</span>':"")+
      (t.owner?"<span>"+esc(t.owner)+"</span>":"")+
      (t.due?'<span class="m'+(isLate(t)?" late":"")+'">'+ICON.cal+fmtDate(t.due)+"</span>":"")+
      (nf?'<span class="m">'+ICON.clip+nf+"</span>":"")+
      (nn?'<span class="m">'+ICON.note+nn+"</span>":"")+
    "</div>";
  main.querySelector("h3").addEventListener("click",()=>openDrawer(t.id));
  row.append(tick,main);
  return row;
}

function buildLista(){
  const wrap=el("div","doc");
  const list=visible();
  const by={todo:0,doing:0,waiting:0,done:0};
  list.forEach(t=>{by[t.status]=(by[t.status]||0)+1;});
  const blocked=list.filter(t=>(t.waitingOn||"").trim()&&t.status!=="done").length;

  const head=el("header","doc-head");
  head.innerHTML=
    '<p class="kicker">Frontfutur · pauta jurídica · '+
      new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"})+"</p>"+
    "<h1>O que tem que ser feito</h1>"+
    '<p class="lede"><b>'+list.length+" itens</b> em quatro frentes"+
      (by.done?", <b>"+by.done+"</b> já concluídos":"")+". "+
      "<b>"+by.doing+"</b> em andamento e <b>"+blocked+"</b> parados esperando alguém destravar. "+
      "Clique no título para abrir o contexto, anotar ou anexar arquivo; clique no círculo para dar como feito.</p>";
  wrap.appendChild(head);

  if(!list.length){
    const e0=el("div","col-empty"); e0.textContent="nenhum item com os filtros atuais";
    wrap.appendChild(e0); return wrap;
  }

  const hot=list.filter(t=>t.priority==="alta"&&t.status!=="done");
  if(hot.length){
    const box=el("section","hot");
    box.innerHTML="<h2>Comece por aqui — "+hot.length+" itens de prioridade alta</h2>";
    const ol=el("ol");
    hot.forEach(t=>{
      const li=el("li");
      li.innerHTML='<b style="color:'+(F[t.frente]||FRENTES[0]).color+'">'+(CODES[t.id]||"")+"</b><span>"+esc(t.title)+"</span>";
      li.addEventListener("click",()=>openDrawer(t.id));
      ol.appendChild(li);
    });
    box.appendChild(ol); wrap.appendChild(box);
  }

  FRENTES.forEach(f=>{
    const mine=list.filter(t=>t.frente===f.id);
    if(!mine.length)return;
    const sec=el("section","block");
    const h=el("div","block-head");
    h.innerHTML='<span class="code" style="--fc:'+f.color+'">'+f.code+"</span><h2>"+esc(f.name)+"</h2>"+
      '<span class="n">'+mine.filter(t=>t.status==="done").length+" de "+mine.length+" concluídos</span>";
    sec.appendChild(h);
    mine.forEach(t=>sec.appendChild(itemEl(t)));
    wrap.appendChild(sec);
  });
  return wrap;
}

/* ---------------------------------------------------------------- painel */
function openDrawer(id){openId=id;renderDrawer();$("#drawer").classList.add("on");$("#scrim").classList.add("on");$("#drawer").setAttribute("aria-hidden","false");}
function closeDrawer(){openId=null;$("#drawer").classList.remove("on");$("#scrim").classList.remove("on");$("#drawer").setAttribute("aria-hidden","true");}

function renderDrawer(){
  const d=$("#drawer");
  if(!openId||!tasks.has(openId)){d.innerHTML="";return;}
  if(d.contains(document.activeElement)&&d.dataset.id===openId)return;
  const t=tasks.get(openId); const f=F[t.frente]||FRENTES[0];
  d.dataset.id=openId;
  const ns=notesOf(t.id), fs=filesOf(t.id);

  d.innerHTML=
  '<div class="dr-head"><span class="fchip" style="--fc:'+f.color+'">'+(CODES[t.id]||f.code)+" · "+esc(f.name)+'</span><button class="dr-close" id="drClose">Fechar</button></div>'+
  '<div class="dr-body">'+
    '<input class="inp-title" id="fTitle" value="'+esc(t.title)+'" aria-label="Título">'+
    '<div class="grid2">'+
      '<div class="field"><label for="fStatus">Status</label><select class="inp" id="fStatus">'+
        STATUSES.map(s=>'<option value="'+s.id+'"'+(s.id===t.status?" selected":"")+">"+s.label+"</option>").join("")+"</select></div>"+
      '<div class="field"><label for="fFrente">Frente</label><select class="inp" id="fFrente">'+
        FRENTES.map(x=>'<option value="'+x.id+'"'+(x.id===t.frente?" selected":"")+">"+x.code+" · "+esc(x.name)+"</option>").join("")+"</select></div>"+
      '<div class="field"><label for="fOwner">Responsável</label><input class="inp" id="fOwner" value="'+esc(t.owner||"")+'" placeholder="Quem toca isso"></div>'+
      '<div class="field"><label for="fDue">Prazo</label><input class="inp" id="fDue" type="date" value="'+esc(t.due||"")+'"></div>'+
      '<div class="field"><label for="fPrio">Prioridade</label><select class="inp" id="fPrio">'+
        ["alta","media","baixa"].map(p=>'<option value="'+p+'"'+(p===t.priority?" selected":"")+">"+({alta:"Alta",media:"Média",baixa:"Baixa"})[p]+"</option>").join("")+"</select></div>"+
      '<div class="field"><label for="fWait">Depende de</label><input class="inp" id="fWait" value="'+esc(t.waitingOn||"")+'" placeholder="ex.: retorno do cliente"></div>'+
    "</div>"+
    '<div class="field"><label for="fDetail">Contexto</label><textarea class="inp" id="fDetail" placeholder="O que precisa ser feito, pontos já levantados…">'+esc(t.detail||"")+"</textarea></div>"+

    '<div class="dr-sec"><h4>Anexos <em>'+(fs.length||"")+"</em></h4>"+
      (fs.length?fs.map(x=>
        '<div class="att">'+(x.kind==="link"?ICON.link:ICON.file)+
        '<span class="nm" title="'+esc(x.name)+'">'+esc(x.name)+"</span>"+
        (x.kind==="file"?'<span class="sz">'+fmtSize(x.size)+"</span>":"")+
        (x.kind==="link"?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener">abrir</a>':'<button class="get" data-get="'+x.id+'">baixar</button>')+
        '<button class="del" data-delf="'+x.id+'" title="Remover">&#10005;</button></div>').join(""):'<p class="hint">Nenhum arquivo ainda.</p>')+
      '<div class="att-actions"><button class="btn-ghost" id="pickFile">Enviar arquivo</button>'+
      '<button class="btn-ghost" id="showLink">Adicionar link</button></div>'+
      '<div class="linkrow" id="linkRow" hidden><input class="inp" id="linkName" placeholder="Nome"><input class="inp" id="linkUrl" placeholder="https://…"><button class="btn-ghost" id="saveLink">OK</button></div>'+
      '<p class="hint">Arquivo até 45 MB. Acima disso, use um link do Drive.</p>'+
      '<input type="file" id="fileInput" hidden>'+
    "</div>"+

    '<div class="dr-sec"><h4>Andamento <em>'+(ns.length||"")+"</em></h4>"+
      (ns.length?ns.map(n=>
        '<div class="note"><div class="who-line"><b>'+esc(n.author)+"</b>"+
        new Date(n.at).toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})+
        '<button data-deln="'+n.id+'">apagar</button></div><p>'+esc(n.text)+"</p></div>").join(""):'<p class="hint">Sem anotações. Registre aqui o que travou, o que ficou combinado, o que voltou do escritório.</p>')+
      '<textarea class="inp" id="noteBox" placeholder="Escrever anotação… (Ctrl+Enter para salvar)"></textarea>'+
      '<button class="btn-ghost" id="addNote" style="align-self:flex-start">Anotar</button>'+
    "</div>"+

    '<div class="dr-sec"><button class="danger" id="delTask">Excluir tarefa</button></div>'+
  "</div>";

  const bind=(sel,ev,fn)=>{const n=d.querySelector(sel);if(n)n.addEventListener(ev,fn);};
  bind("#drClose","click",closeDrawer);
  bind("#fTitle","change",e=>saveTask(t.id,{title:e.target.value.trim()||"Sem título"}));
  bind("#fStatus","change",e=>saveTask(t.id,{status:e.target.value}));
  bind("#fFrente","change",e=>saveTask(t.id,{frente:e.target.value}));
  bind("#fOwner","change",e=>saveTask(t.id,{owner:e.target.value.trim()}));
  bind("#fDue","change",e=>saveTask(t.id,{due:e.target.value}));
  bind("#fPrio","change",e=>saveTask(t.id,{priority:e.target.value}));
  bind("#fWait","change",e=>saveTask(t.id,{waitingOn:e.target.value.trim()}));
  bind("#fDetail","change",e=>saveTask(t.id,{detail:e.target.value}));
  bind("#delTask","click",()=>{if(confirm("Excluir “"+t.title+"” e tudo que está anexado nela?"))removeTask(t.id);});
  bind("#pickFile","click",()=>d.querySelector("#fileInput").click());
  bind("#fileInput","change",e=>{const f2=e.target.files&&e.target.files[0];if(f2)uploadFile(t.id,f2);e.target.value="";});
  bind("#showLink","click",()=>{const r=d.querySelector("#linkRow");r.hidden=!r.hidden;if(!r.hidden)d.querySelector("#linkUrl").focus();});
  bind("#saveLink","click",()=>{
    const u=d.querySelector("#linkUrl").value.trim(); if(!u)return;
    addLink(t.id,d.querySelector("#linkName").value.trim(),/^https?:\/\//i.test(u)?u:"https://"+u);
  });
  const nb=d.querySelector("#noteBox");
  const post=()=>{const v=nb.value.trim();if(!v)return;nb.value="";addNote(t.id,v);};
  bind("#addNote","click",post);
  if(nb)nb.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))post();});
  d.querySelectorAll("[data-deln]").forEach(b=>b.addEventListener("click",()=>removeNote(b.dataset.deln)));
  d.querySelectorAll("[data-delf]").forEach(b=>b.addEventListener("click",()=>{
    const f2=files.find(x=>x.id===b.dataset.delf); if(f2&&confirm("Remover “"+f2.name+"”?"))deleteFile(f2);
  }));
  d.querySelectorAll("[data-get]").forEach(b=>b.addEventListener("click",()=>{
    const f2=files.find(x=>x.id===b.dataset.get); if(f2)downloadFile(f2);
  }));
}

/* ---------------------------------------------------------------- controles */
function buildChips(){
  const host=$("#chips"); host.innerHTML="";
  FRENTES.forEach(f=>{
    const b=el("button","chip");
    b.innerHTML='<span class="dot" style="background:'+f.color+'"></span>'+f.code+" "+esc(f.name);
    b.setAttribute("aria-pressed",filter.frentes.has(f.id)?"true":"false");
    b.addEventListener("click",()=>{
      if(filter.frentes.has(f.id))filter.frentes.delete(f.id);else filter.frentes.add(f.id);
      buildChips(); render();
    });
    host.appendChild(b);
  });
}
function setView(v){
  view=v;
  ["lista","quadro","frentes"].forEach(k=>$("#v-"+k).setAttribute("aria-pressed",v===k?"true":"false"));
  try{localStorage.setItem("ff_view",v);}catch(e){}
  render();
}

$("#v-lista").addEventListener("click",()=>setView("lista"));
$("#v-quadro").addEventListener("click",()=>setView("quadro"));
$("#v-frentes").addEventListener("click",()=>setView("frentes"));
$("#addBtn").addEventListener("click",()=>{
  const only=filter.frentes.size===1?[...filter.frentes][0]:null;
  createTask(only);
});
$("#whoBtn").addEventListener("click",()=>{
  if(confirm("Sair da conta?"))FF.signOut();
});
$("#q").addEventListener("input",e=>{filter.q=e.target.value;render();});
$("#onlyBlocked").addEventListener("click",e=>{
  filter.blocked=!filter.blocked;
  e.currentTarget.setAttribute("aria-pressed",filter.blocked?"true":"false");
  render();
});
$("#scrim").addEventListener("click",closeDrawer);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&openId)closeDrawer();});

buildChips();
let savedView=null;
try{savedView=localStorage.getItem("ff_view");}catch(e){}
setView(savedView==="quadro"||savedView==="frentes"?savedView:"lista");


/* ---------------------------------------------------------------- início */
FF.start("juridico", async function(){
  sb = FF.sb;
  me = FF.me;
  await reload();
  FF.sb.channel("juridico")
    .on("postgres_changes",{event:"*",schema:"public",table:"tarefas"},scheduleReload)
    .on("postgres_changes",{event:"*",schema:"public",table:"anotacoes"},scheduleReload)
    .on("postgres_changes",{event:"*",schema:"public",table:"anexos"},scheduleReload)
    .subscribe();
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)scheduleReload();});
});
})();
