
const params = new URLSearchParams(location.search);
const name = params.get('name') || 'Jugador';
const role = params.get('role') || 'Tripulante';
const topic = params.get('topic') || '—';

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

document.getElementById('nombre').textContent = name;
const rolEl = document.getElementById('rol');
rolEl.textContent = role; rolEl.classList.add(role==='Impostor' ? 'danger' : 'success');
document.getElementById('tema').textContent = topic;
