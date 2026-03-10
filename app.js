
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs={}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === 'class') node.className = v; else if (k === 'html') node.innerHTML = v; else node.setAttribute(k, v);
  });
  children.forEach(c => { if (typeof c === 'string') node.appendChild(document.createTextNode(c)); else if (c) node.appendChild(c); });
  return node;
};
const copyText = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch(e){ return false; } }
const randomPick = (arr) => arr[Math.floor(Math.random()*arr.length)];

// Temas
const TEMAS_TRIPULANTES = [
  'Forecast de demanda','Backlog','Inventarios de seguridad','Capacity planning','IBP / S&OP','Lead times','Shut-downs de plantas','Rolling forecast','Capex','Productividad en líneas críticas','Plan de mitigación','Ventas perdidas (lost sales)','Fill rate','Obsolescencias','Network optimization','Cost to Serve','Master data','Escenarios What‑If','Bottlenecks','Forecast bias','End-to-end visibility','Plan de contingencia','Nivel de servicio al cliente','Costos logísticos','Inventarios estacionales','Integración Ventas–Operaciones','Materiales críticos','SKU rationalization','OTIF','Paradas imprevistas de planta','Control Tower','Planificación a largo plazo','Vendor performance','Time Fence','Balanceo capacidad vs demanda','Dashboard mensual','Cadena end‑to‑end','Prioridades del mes','Supply risk'
];
const TEMAS_VAGOS_IMPOSTOR = [
  'Algo que se revisa siempre','Algo que cambia seguido','Algo relacionado a procesos','Algo importante… o tal vez no','Algo que depende de muchas áreas','Algo que se menciona en reuniones','Algo que genera debate','Algo que impacta resultados','Algo que aparece en reportes','Algo que influye en el tiempo'
];

// Estado
let state = { roomName:'', mode:'links', players:[], round:1, hostAssignments:null, votes:{}, scores:{} };
const save = () => localStorage.setItem('impostor-ibp-state', JSON.stringify(state));
const load = () => { try { return JSON.parse(localStorage.getItem('impostor-ibp-state')); } catch(e){ return null } };

// PWA Install
let deferredPrompt; window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault(); deferredPrompt=e; $('#btn-instalar')?.classList.remove('hidden');});
$('#btn-instalar')?.addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; $('#btn-instalar').classList.add('hidden'); });
if('serviceWorker' in navigator){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('service-worker.js').catch(()=>{}); }); }

// Branding
fetch('brand.json').then(r=>r.ok?r.json():null).then(brand=>{
  if(!brand) return; const root=document.documentElement;
  if(brand.primary) root.style.setProperty('--primary', brand.primary);
  if(brand.accent) root.style.setProperty('--accent', brand.accent);
  if(brand.bg) root.style.setProperty('--bg', brand.bg);
  if(brand.card) root.style.setProperty('--card', brand.card);
  const tmeta=document.querySelector('meta[name="theme-color"]'); if(tmeta && brand.primary) tmeta.setAttribute('content', brand.primary);
  const bn=document.getElementById('brand-name'); if(bn && brand.name) bn.textContent = brand.name;
  const headerImg=document.querySelector('header img'); if(headerImg && brand.logo) headerImg.src = brand.logo;
}).catch(()=>{});

// UI handlers
$('#btn-crear').addEventListener('click', ()=>{
  const roomName = ($('#roomName').value||'').trim() || `Sala-${Math.floor(Math.random()*1000)}`;
  const n = Math.max(3, Math.min(30, parseInt($('#numPlayers').value||'10')));
  const mode = $('#mode').value;
  const namesTxt = ($('#names').value||'').trim();
  const names = namesTxt ? namesTxt.split(/
|,/).map(s=>s.trim()).filter(Boolean) : Array.from({length:n}, (_,i)=>`Jugador ${i+1}`);
  const players = names.slice(0,n).map((name,i)=>({id:`p${i+1}`, name}));
  state = { roomName, mode, players, round:1, hostAssignments:null, votes:{}, scores:Object.fromEntries(players.map(p=>[p.id,0])) };
  save(); renderRoom();
});
$('#btn-restaurar').addEventListener('click', ()=>{ const s=load(); if(s && s.players?.length){ state=s; renderRoom(); } else alert('No hay una sala guardada.'); });
$('#btn-reset').addEventListener('click', ()=>{ if(confirm('¿Resetear configuración?')){ localStorage.removeItem('impostor-ibp-state'); location.reload(); } });

function renderRoom(){
  $('#panel-sala').classList.remove('hidden');
  $('#panel-ronda').classList.remove('hidden');
  $('#panel-puntajes').classList.remove('hidden');
  $('#sala').textContent = state.roomName; $('#ronda').textContent = String(state.round);
  renderPlayers(); renderScores(); renderLinks(); renderVotesTable();
}
function renderPlayers(){ const c=$('#lista-jugadores'); c.innerHTML=''; state.players.forEach(p=>{ c.appendChild(el('div',{class:'player'}, el('div',{}, el('strong',{},p.name),' ', el('span',{class:'muted small'},`(${p.id})`)))); }); }
function renderScores(){ const c=$('#tabla-puntajes'); c.innerHTML=''; Object.entries(state.scores).sort((a,b)=>b[1]-a[1]).forEach(([pid,pts],rank)=>{ const p=state.players.find(x=>x.id===pid); c.appendChild(el('div',{class:'player'}, el('div',{},`${rank+1}. ${p?.name||pid}`), el('div',{class: pts>0?'success':'muted'}, `${pts} pts`))); }); }

function generateAssignments(){
  const topicGroup = randomPick(TEMAS_TRIPULANTES);
  const impostor = randomPick(state.players);
  const links = state.players.map(p=>{
    const role = p.id===impostor.id ? 'Impostor' : 'Tripulante';
    const tema = p.id===impostor.id ? randomPick(TEMAS_VAGOS_IMPOSTOR) : topicGroup;
    const url = new URL(location.origin + location.pathname.replace('index.html','') + 'player.html');
    url.searchParams.set('room', state.roomName);
    url.searchParams.set('name', p.name);
    url.searchParams.set('role', role);
    url.searchParams.set('topic', tema);
    url.searchParams.set('r', String(state.round));
    return { id:p.id, name:p.name, url:url.toString(), role, tema };
  });
  state.hostAssignments = { topicGroup, impostorId: impostor.id, links };
  save(); $('#tema-actual').textContent = `Tema: ${topicGroup}`; renderLinks();
  alert(`Roles asignados. Tema del grupo: ${topicGroup}`);
}
$('#btn-asignar').addEventListener('click', generateAssignments);
$('#btn-nueva-ronda').addEventListener('click', ()=>{ state.round+=1; state.votes={}; state.hostAssignments=null; save(); renderRoom(); $('#tema-actual').textContent='Tema: —'; });

function renderLinks(){
  const c=$('#links-privados'); c.innerHTML='';
  if(state.mode!=='links'){ c.innerHTML='<p class="small muted">Modo un dispositivo: compartí pantalla. Para links privados, cambiá a "Links".</p>'; return; }
  if(!state.hostAssignments){ c.innerHTML='<p class="small warning">Primero asigná roles y tema para generar los links privados.</p>'; return; }
  state.hostAssignments.links.forEach((lk,i)=>{
    const row = el('div',{class:'player'}, el('div',{}, el('strong',{}, `${i+1}. ${lk.name}`),' ', el('span',{class:'pill'}, lk.role)), el('div',{}, el('button',{class:'secondary small', onclick:async()=>{ const ok=await copyText(lk.url); alert(ok?'Link copiado al portapapeles':lk.url); }}, 'Copiar link')) );
    c.appendChild(row);
  });
}
$('#btn-copiar-todos').addEventListener('click', async ()=>{ if(!state.hostAssignments) return alert('Primero asigná roles.'); const all=state.hostAssignments.links.map(l=>`${l.name}: ${l.url}`).join('
'); const ok=await copyText(all); alert(ok?'Links copiados al portapapeles':all); });

function renderVotesTable(){ const c=$('#tabla-votos'); if(!c) return; c.innerHTML=''; const options=state.players.map(p=>({value:p.id,label:p.name})); state.players.forEach(p=>{ const sel=el('select',{id:`vote-${p.id}`}, el('option',{value:''},'—')); options.forEach(o=> sel.appendChild(el('option',{value:o.value},o.label))); if(state.votes[p.id]) sel.value=state.votes[p.id]; sel.addEventListener('change',()=>{ state.votes[p.id]=sel.value; save(); }); c.appendChild(el('div',{class:'player'}, el('div',{},p.name), sel)); }); }
$('#btn-limpiar-votos').addEventListener('click', ()=>{ state.votes={}; save(); renderVotesTable(); $('#resultado').textContent=''; });
$('#btn-calcular').addEventListener('click', ()=>{
  const tally={}; Object.values(state.votes).forEach(t=>{ if(!t) return; tally[t]=(tally[t]||0)+1; });
  const maxVotes=Math.max(0,...Object.values(tally)); const candidates=Object.entries(tally).filter(([pid,v])=>v===maxVotes).map(([pid])=>pid);
  if(!maxVotes){ $('#resultado').textContent='Sin votos suficientes.'; return; }
  const accusedId = candidates[0]; const accused = state.players.find(p=>p.id===accusedId);
  const isImpostor = state.hostAssignments && accusedId===state.hostAssignments.impostorId;
  $('#resultado').innerHTML = isImpostor ? `🔎 Acusado: <b>${accused?.name}</b>. ¡Era el impostor! (+1 punto para todos menos el impostor)` : `🤷 Acusado: <b>${accused?.name}</b>. No era el impostor. (+2 puntos para el impostor)`;
  if(isImpostor){ const impId=state.hostAssignments.impostorId; state.players.forEach(p=>{ if(p.id!==impId) state.scores[p.id]=(state.scores[p.id]||0)+1; }); } else { const impId=state.hostAssignments.impostorId; state.scores[impId]=(state.scores[impId]||0)+2; }
  save(); renderScores();
});

// Timer
let timer=null, remaining=300; const fmt=(s)=>{ const m=Math.floor(s/60), ss=String(s%60).padStart(2,'0'); return `${String(m).padStart(2,'0')}:${ss}`; };
function updateTimer(){ $('#cron-resp').textContent=fmt(remaining); }
updateTimer();
$('#btn-timer-resp').addEventListener('click', ()=>{ if(timer){ clearInterval(timer); timer=null; $('#btn-timer-resp').textContent='▶ Iniciar (5:00)'; remaining=300; updateTimer(); return; } $('#btn-timer-resp').textContent='⏸ Pausar'; timer=setInterval(()=>{ remaining--; updateTimer(); if(remaining<=0){ clearInterval(timer); timer=null; alert('Fin del tiempo de respuestas'); $('#btn-timer-resp').textContent='▶ Iniciar (5:00)'; remaining=300; updateTimer(); } },1000); });

window.__state = state;
