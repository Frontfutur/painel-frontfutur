/* ===========================================================
   LOGIN E PERMISSÃO — compartilhado por todas as páginas.

   Use assim, em qualquer módulo novo:

     FF.start("juridico", function(){
       // só roda se a pessoa entrou E tem acesso a este módulo
       FF.sb.from("tarefas").select("*") ...
     });

   Passe null no lugar do nome do módulo se a página for
   aberta para qualquer pessoa autorizada do painel.
   =========================================================== */
window.FF = (function(){
"use strict";

let sb=null, me="", pessoa=null, modulo=null, aoEntrar=null;
const $=s=>document.querySelector(s);

function gate(){return $("#gate");}
function aviso(html){
  const g=gate(); if(!g)return;
  const corpo=$("#gateBody"), form=$("#loginForm");
  if(corpo)corpo.innerHTML=html;
  if(form)form.hidden=true;
  g.hidden=false;
}
function pedirLogin(){
  const g=gate(); if(!g)return;
  const form=$("#loginForm"); if(form)form.hidden=false;
  g.hidden=false;
  const c=$("#gEmail"); if(c)c.focus();
}
function fechar(){const g=gate(); if(g)g.hidden=true;}

async function entrar(session){
  me=(session.user.email||"").toLowerCase();
  const {data,error}=await sb.from("pessoas").select("nome,modulos").eq("email",me).maybeSingle();

  if(error){
    aviso("<h1>Não deu para verificar seu acesso</h1><p>"+
      String(error.message).replace(/</g,"&lt;")+"</p><p>Recarregue a página. Se continuar, avise a Ana.</p>");
    return;
  }
  if(!data){
    aviso("<h1>Conta sem permissão</h1><p>O e-mail <b>"+me.replace(/</g,"&lt;")+
      "</b> entrou, mas ainda não está liberado no painel. Peça para incluírem você.</p>");
    return;
  }

  pessoa=data;
  me=data.nome||me;
  const mods=data.modulos||[];
  if(modulo && mods.indexOf(modulo)<0){
    aviso("<h1>Este módulo não é seu</h1><p>Você entrou como <b>"+
      String(me).replace(/</g,"&lt;")+"</b>, mas não tem acesso a esta página. "+
      '<a href="index.html">Voltar ao painel</a>.</p>');
    return;
  }

  fechar();
  const nome=$("#whoName"); if(nome)nome.textContent=me;
  if(typeof aoEntrar==="function")aoEntrar();
}

function ligarFormulario(){
  const form=$("#loginForm"); if(!form)return;
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const btn=$("#gBtn"), err=$("#gErr");
    err.hidden=true; btn.disabled=true; btn.textContent="Entrando…";
    const {data,error}=await sb.auth.signInWithPassword({
      email:$("#gEmail").value.trim().toLowerCase(),
      password:$("#gPass").value
    });
    btn.disabled=false; btn.textContent="Entrar";
    if(error){
      err.textContent=/invalid|credential/i.test(error.message)
        ? "E-mail ou senha não conferem."
        : error.message;
      err.hidden=false; return;
    }
    entrar(data.session);
  });
}

async function iniciar(nomeDoModulo,callback){
  modulo=nomeDoModulo||null;
  aoEntrar=callback;

  const cfg=window.FF_CONFIG||{};
  if(!/^https:\/\//.test(cfg.url||"")||String(cfg.anon||"").indexOf("COLE")===0){
    aviso("<h1>Falta configurar</h1><p>Abra o arquivo <code>config.js</code> e cole a "+
      "<b>Project URL</b> e a chave <b>anon public</b> do Supabase.</p>");
    return;
  }
  if(typeof window.supabase==="undefined"){
    aviso("<h1>Não carregou</h1><p>A biblioteca do Supabase não abriu. "+
      "Verifique a conexão e recarregue a página.</p>");
    return;
  }

  sb=window.supabase.createClient(cfg.url,cfg.anon);
  ligarFormulario();

  sb.auth.onAuthStateChange((evento)=>{ if(evento==="SIGNED_OUT")location.reload(); });

  const {data}=await sb.auth.getSession();
  if(data&&data.session) entrar(data.session);
  else pedirLogin();
}

return {
  start:iniciar,
  get sb(){return sb;},
  get me(){return me;},
  get pessoa(){return pessoa;},
  async signOut(){ if(sb)await sb.auth.signOut(); location.reload(); }
};
})();
