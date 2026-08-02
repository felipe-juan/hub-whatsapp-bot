// O bot responde em grupos e também em conversas privadas.
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const content = $('#content');
const modal = $('#modal');
const DEFAULT_DASHBOARD_CARDS = ['connection','messages','queue','last_reply','top_rules','errors','memory'];
const state = {
  dashboardRenderedAt: 0,
  view: 'dashboard', status: null, messages: [], synonyms: [], sectors: [], calculators: [], groups: [], settings: {},
  logs: [], diagnostics: [], conflicts: { count: 0, conflicts: [] }, analytics: null, backups: null,
  diagnosticStream: null, realtimeStream: null, selectedMessages: new Set(), diagnosticMode: localStorage.getItem('hub-diagnostic-mode') || 'simple',
  messageVisibleLimit: 30, messageLoadToken: 0, conflictOnly: false, messageObserver: null,
  messagePage: {total:0,nextCursor:'',loading:false,queryKey:'',limit:60},
  messageVirtual: {start:0,end:0,rowHeight:380,overscanRows:2,scrollHandler:null},
  messageViewMode: ['cards','list'].includes(localStorage.getItem('hub-message-view'))?localStorage.getItem('hub-message-view'):'cards',
  messageColumns: ['auto','1','2','3','4'].includes(localStorage.getItem('hub-message-columns'))?localStorage.getItem('hub-message-columns'):'auto',
  teacherImportPreview: null
};
const titles = {
  dashboard: 'Visão geral', messages: 'Mensagens automáticas', diagnostics: 'Diagnóstico em tempo real',
  calculators: 'Calculadoras', groups: 'Grupos', analytics: 'Estatísticas anônimas', settings: 'Configurações', logs: 'Registros'
};

function esc(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }
function bool(value) { return ['1','true','yes','sim','on'].includes(String(value).toLowerCase()); }
function normalizeSearch(value=''){return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function list(value) { return String(value || '').split(/[\n,;|]+/).map(item => item.trim()).filter(Boolean); }
function fmtDate(value) { if (!value) return '—'; try { return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)); } catch { return value; } }
function fmtBytes(value) { const n=Number(value||0); if(!n)return'0 B'; const u=['B','KiB','MiB','GiB']; const i=Math.min(u.length-1,Math.floor(Math.log(n)/Math.log(1024))); return `${(n/1024**i).toFixed(i?1:0)} ${u[i]}`; }
function fmtDuration(seconds) { let n=Math.max(0,Number(seconds||0)); const d=Math.floor(n/86400); n%=86400; const h=Math.floor(n/3600); n%=3600; const m=Math.floor(n/60); return [d?`${d}d`:'',h?`${h}h`:'',`${m}min`].filter(Boolean).join(' '); }
function relativeTime(value) { if(!value)return'nenhuma ainda'; const seconds=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/1000)); if(seconds<60)return`há ${seconds}s`; if(seconds<3600)return`há ${Math.floor(seconds/60)}min`; if(seconds<86400)return`há ${Math.floor(seconds/3600)}h`; return`há ${Math.floor(seconds/86400)}d`; }
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.className=`toast${error?' error':''}`;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.hidden=true;},4500);}
function badge(text,kind=''){return`<span class="badge ${kind}">${esc(text)}</span>`;}
function statCard(label,value,detail=''){return`<div class="card stat"><small>${esc(label)}</small><strong>${esc(value)}</strong>${detail?`<span class="muted">${esc(detail)}</span>`:''}</div>`;}
function downloadBlob(name, payload, type='application/json'){const blob=new Blob([payload],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

async function api(path, options={}) {
  const headers={...(options.headers||{})}; if(options.body!==undefined&&!headers['Content-Type'])headers['Content-Type']='application/json';
  const controller=new AbortController();const timeoutMs=Number(options.timeoutMs||8000);const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers,signal:options.signal||controller.signal});let payload=null;try{payload=await response.json();}catch{}
    if(response.status===401){showLogin(payload?.error||'Sessão encerrada.');throw new Error(payload?.error||'Sessão encerrada.');}
    if(!response.ok)throw new Error(payload?.error||`Erro HTTP ${response.status}`);return payload;
  }catch(error){if(error?.name==='AbortError')throw new Error('O painel local demorou para responder. Tente novamente.');throw error;}finally{clearTimeout(timer);}
}
function loginFeedback(message='',kind='error'){const box=$('#login-feedback');box.textContent=message;box.className=`login-feedback ${kind}`;box.hidden=!message;}
function showLogin(message=''){closeDiagnosticStream();closeRealtimeStream();$('#app').hidden=true;$('#login-screen').hidden=false;document.body.classList.add('login-only');history.replaceState({},'','/login');if(message)loginFeedback(message,'error');setTimeout(()=>$('#login-password').focus(),0);}
function showApp(){$('#login-screen').hidden=true;$('#app').hidden=false;document.body.classList.remove('login-only');history.replaceState({},'','/painel');}

$('#login-form').onsubmit=async event=>{event.preventDefault();const button=$('#login-submit');loginFeedback();button.disabled=true;button.textContent='⏳ Verificando…';try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('#login-password').value})});loginFeedback('✅ Senha correta. Abrindo o painel…','success');$('#login-password').value='';await loadAll();showApp();}catch(error){loginFeedback(`❌ ${error.message}`,'error');$('#login-password').select();}finally{button.disabled=false;button.textContent='🔐 Entrar';}};
$('#logout-admin').onclick=async()=>{try{await api('/api/logout',{method:'POST',body:'{}'});}catch{}showLogin('Sessão encerrada.');};
$('#nav').onclick=event=>{const button=event.target.closest('[data-view]');if(!button)return;if(state.view==='diagnostics'&&button.dataset.view!=='diagnostics')closeDiagnosticStream();state.view=button.dataset.view;$$('#nav button').forEach(item=>item.classList.toggle('active',item===button));render();};

let statusRefreshPromise=null;
async function loadAll(){const[status]=await Promise.all([api('/api/status')]);state.status=status;renderStatus();await render();openRealtimeStream();}
async function refreshStatus(){if(statusRefreshPromise)return statusRefreshPromise;statusRefreshPromise=(async()=>{try{const next=await api('/api/status',{timeoutMs:5000});state.status=next;renderStatus();if(state.view==='dashboard'&&Date.now()-state.dashboardRenderedAt>45000)renderDashboard();}catch(error){console.warn(error.message);}finally{statusRefreshPromise=null;}})();return statusRefreshPromise;}
let realtimeRefreshTimer=null;
function closeRealtimeStream(){if(state.realtimeStream){state.realtimeStream.close();state.realtimeStream=null;}clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=null;}
function scheduleRealtimeRefresh({rerender=false}={}){clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=setTimeout(async()=>{await refreshStatus();if(rerender&&['messages','dashboard','groups','analytics'].includes(state.view))render().catch(error=>console.warn(error.message));},120);}
function openRealtimeStream(){
  closeRealtimeStream();
  const stream=new EventSource('/api/events');
  const refreshOnlyTypes=new Set(['whatsapp-status','admin-task-progress','admin-task-completed','admin-task-failed','backup-created','links-checked','database-maintenance']);
  const refreshDataTypes=new Set(['database-change','data-changed','settings-changed']);
  const dispatchType=type=>{if(refreshDataTypes.has(type))scheduleRealtimeRefresh({rerender:true});else if(refreshOnlyTypes.has(type))scheduleRealtimeRefresh();};
  for(const type of refreshOnlyTypes)stream.addEventListener(type,()=>dispatchType(type));
  for(const type of refreshDataTypes)stream.addEventListener(type,()=>dispatchType(type));
  stream.addEventListener('realtime-batch',event=>{try{const payload=JSON.parse(event.data||'{}');const types=new Set((payload.events||[]).map(item=>item.type));scheduleRealtimeRefresh({rerender:[...types].some(type=>refreshDataTypes.has(type))});}catch{scheduleRealtimeRefresh();}});
  stream.onerror=()=>{};
  state.realtimeStream=stream;
}
function healthChip(icon,label,detail,kind='good'){return`<div class="health-chip ${kind}"><span>${icon}</span><div><strong>${esc(label)}</strong><small>${esc(detail)}</small></div></div>`;}
function renderStatus(){
  const wa=state.status?.whatsapp||{};const health=state.status?.health||{};const engine=health.engine||{};const stats=state.status?.stats||{};
  const ready=wa.state==='ready';const pending=['starting','connecting','authenticated','recovering','qr','resetting'].includes(wa.state);
  $('#top-status').textContent=ready?'WhatsApp conectado':pending?(wa.state==='qr'?'Aguardando QR code':'WhatsApp iniciando'):'WhatsApp desconectado';
  $('#top-status').className=`status-pill ${ready?'ready':pending?'pending':'offline'}`;$('#side-status').className=`status-dot ${ready?'ready':''}`;$('#side-status-text').textContent=ready?'Conectado':pending?'Iniciando':'Desconectado';$('#side-version').textContent=`v${state.status?.version||'0.9.8'} · local`;
  const staleMinutes=Math.max(10,Number(state.settings.dashboard_stale_minutes||120));const lastMs=engine.lastMessageAt?new Date(engine.lastMessageAt).getTime():0;const stale=ready&&((lastMs&&Date.now()-lastMs>staleMinutes*60000)||(!lastMs&&Number(health.process?.uptimeSeconds||0)>staleMinutes*60));
  const queueDepth=Number(wa.conversationQueueDepth||wa.outboundQueueDepth||0);const activeConversations=Number(wa.activeConversationCount||0);const trackedConversations=Number(wa.trackedConversationCount||activeConversations);const pausedUntil=wa.outboundPausedUntil?new Date(wa.outboundPausedUntil).getTime():0;
  const uncertainCount=Number(wa.persistentDeliveries?.uncertain||0);const pendingLate=Number(wa.pendingLateSendCount||0);
  const chips=[
    healthChip(ready?'🟢':pending?'🟡':'🔴',ready?'WhatsApp conectado':pending?'WhatsApp iniciando':'WhatsApp desconectado',wa.message||wa.state,ready?'good':pending?'warn':'bad'),
    healthChip(stale?'🔴':engine.lastMessageAt?'🟢':'🟡',stale?'WhatsApp conectado, mas sem mensagens':engine.lastMessageAt?'Recebendo mensagens':'Aguardando mensagem',engine.lastMessageAt?`Última ${relativeTime(engine.lastMessageAt)}`:'Nenhuma recebida nesta execução',stale?'bad':engine.lastMessageAt?'good':'warn'),
    healthChip(pausedUntil>Date.now()?'🔴':'🟢',pausedUntil>Date.now()?'Envios temporariamente pausados':'Respostas sem atraso artificial',`${activeConversations} conversa(s) ativa(s) · ${queueDepth} aguardando`,pausedUntil>Date.now()?'bad':'good'),
    healthChip('🟢',`${stats.messageCount||0} mensagens ativas`,`${stats.inactiveMessageCount||0} inativas · ${stats.archivedMessageCount||0} arquivadas`,'good'),
    healthChip(engine.lastReplyAt?'🟢':'🟡','Última resposta',engine.lastReplyAt?relativeTime(engine.lastReplyAt):'Nenhuma nesta execução',engine.lastReplyAt?'good':'warn'),
    ...(uncertainCount?[healthChip('🟠',`${uncertainCount} envio(s) com resultado desconhecido`,pendingLate?`${pendingLate} ainda em reconciliação`:'Revisão manual necessária','warn')]:[])
  ];
  const bar=$('#global-health');if(bar)bar.innerHTML=chips.join('');
}
function cleanupMessageVirtualization(){if(state.messageVirtual.scrollHandler){window.removeEventListener('resize',state.messageVirtual.scrollHandler);state.messageVirtual.scrollHandler=null;}}
async function render(){
  cleanupMessageVirtualization();
  $('#page-title').textContent=titles[state.view]||'HUB Bot';content.innerHTML='<div class="card empty">Carregando…</div>';
  const fn={dashboard:renderDashboard,messages:renderMessages,diagnostics:renderDiagnostics,calculators:renderCalculators,groups:renderGroups,analytics:renderAnalytics,settings:renderSettings,logs:renderLogs}[state.view];
  try{await fn();}catch(error){content.innerHTML=`<div class="card"><h3>Não foi possível carregar esta área</h3><p class="form-error">${esc(error.message)}</p></div>`;}
}

function selectedDashboardCards(){const raw=String(state.settings.dashboard_cards||'').split(',').map(x=>x.trim()).filter(Boolean);return raw.length?raw:DEFAULT_DASHBOARD_CARDS;}
async function renderDashboard(){state.dashboardRenderedAt=Date.now();
  const s=state.status||await api('/api/status');state.settings=await api('/api/settings');renderStatus();const stats=s.stats||{};const wa=s.whatsapp||{};const health=s.health||{};const cards=selectedDashboardCards();
  let diagnostics=[];if(cards.includes('errors'))diagnostics=await api('/api/diagnostics?limit=100');const errors=diagnostics.filter(x=>x.outcome==='error');
  const examples=stats.exampleCount?`<div class="example-banner"><div><h3>🧪 Modelos de demonstração ativos</h3><p>Você pode editar ou excluir esses modelos depois do primeiro teste.</p></div><button class="button danger" id="remove-examples">🗑️ Excluir modelos</button></div>`:'';
  const uncertainCount=Number(wa.persistentDeliveries?.uncertain||0);const pendingLate=Number(wa.pendingLateSendCount||0);
  const uncertainBanner=uncertainCount?`<div class="example-banner uncertain-banner"><div><h3>⚠️ ${uncertainCount} envio(s) precisam de revisão</h3><p>${pendingLate?`${pendingLate} ainda estão aguardando confirmação tardia do WhatsApp. `:''}Os demais não serão reenviados automaticamente para evitar mensagens duplicadas.</p></div><button class="button danger" id="review-uncertain">🔎 Revisar envios</button></div>`:'';
  const blocks=[];
  if(cards.includes('messages'))blocks.push(`<div class="grid stats">${statCard('Mensagens ativas',stats.messageCount||0)}${statCard('Inativas',stats.inactiveMessageCount||0)}${statCard('Arquivadas',stats.archivedMessageCount||0)}${statCard('Respostas hoje',stats.todayLogs||0)}</div>`);
  if(cards.includes('connection'))blocks.push(`<div class="card"><div class="toolbar"><div><h2>📱 Conexão do WhatsApp</h2><p class="muted">${esc(wa.message||'')}</p></div><div class="actions"><button class="button" id="restart-wa">🔄 Reiniciar</button><button class="button danger" id="logout-wa">🗑️ Remover sessão</button></div></div>${wa.qrDataUrl?`<div class="qr-box"><img src="${esc(wa.qrDataUrl)}" alt="QR code do WhatsApp"></div><p class="notice">📷 WhatsApp → Dispositivos conectados → Conectar um dispositivo.</p>`:`<div class="connection-line">${badge(wa.state||'desconhecido',wa.state==='ready'?'active':'warning')}<strong>${esc(wa.accountName||wa.accountNumber||'Conta ainda não conectada')}</strong></div>${wa.lastError?`<p class="form-error">⚠️ ${esc(wa.lastError)}</p>`:''}`}${wa.state==='ready'?`<p class="notice">✅ ${Number(wa.syncedGroupCount||0)} grupo(s) sincronizado(s) automaticamente.</p>`:''}</div>`);
  if(cards.includes('queue')){const guard=health.engine?.outboundGuard||{};blocks.push(`<div class="card"><h2>📤 Filas por conversa</h2><div class="health-grid"><div class="health-item"><small>Conversas ativas</small><strong>${Number(wa.activeConversationCount||0)}</strong></div><div class="health-item"><small>Mensagens aguardando</small><strong>${Number(wa.conversationQueueDepth||0)}</strong></div><div class="health-item"><small>Conversas acompanhadas</small><strong>${Number(wa.trackedConversationCount||0)}</strong></div><div class="health-item"><small>Bloqueadas pelo WhatsApp</small><strong>${Number(guard.blockedCount||0)}</strong></div></div><p class="muted">A ordem é preservada dentro de cada conversa; grupos e privados diferentes são processados em paralelo.</p></div>`);}
  if(cards.includes('last_reply'))blocks.push(`<div class="card"><h2>💬 Atividade recente</h2><div class="status-stack"><div class="status-row"><span>Última mensagem recebida</span><strong>${esc(fmtDate(health.engine?.lastMessageAt))}</strong></div><div class="status-row"><span>Última resposta enviada</span><strong>${esc(fmtDate(health.engine?.lastReplyAt))}</strong></div><div class="status-row"><span>Respostas desde o início</span><strong>${Number(health.engine?.totalReplies||0)}</strong></div></div></div>`);
  if(cards.includes('top_rules')){const top=(s.analytics?.top||[]).slice(0,6);blocks.push(`<div class="card"><h2>📈 Regras mais usadas — 30 dias</h2>${top.length?`<div class="topic-list">${top.map(x=>`<div><span>${esc(x.topic)}</span><strong>${Number(x.count)}</strong></div>`).join('')}</div>`:'<p class="muted">Ainda não há uso registrado.</p>'}</div>`);}
  if(cards.includes('errors'))blocks.push(`<div class="card"><h2>🚨 Erros recentes</h2>${errors.length?`<div class="stack compact">${errors.slice(-5).reverse().map(x=>`<div class="status-row"><span>${esc(x.summary||'Erro')}</span><small>${relativeTime(x.createdAt)}</small></div>`).join('')}</div>`:'<p class="notice">✅ Nenhum erro entre os diagnósticos mantidos em memória.</p>'}</div>`);
  if(cards.includes('memory')){const perf=health.engine?.performance?.series||{};const trigger=perf.trigger_evaluation_ms||{};const handle=perf.message_handle_ms||{};const send=perf.reply_send_ms||{};blocks.push(`<div class="card"><h2>🧠 Recursos e latência</h2><div class="health-grid"><div class="health-item"><small>Memória</small><strong>${fmtBytes(health.process?.rssBytes)}</strong></div><div class="health-item"><small>Heap usado</small><strong>${fmtBytes(health.process?.heapUsedBytes)}</strong></div><div class="health-item"><small>Tempo ativo</small><strong>${fmtDuration(health.process?.uptimeSeconds)}</strong></div><div class="health-item"><small>Banco</small><strong>${health.database?.ok?'✅ Íntegro':'⚠️ Verificar'}</strong></div><div class="health-item"><small>Gatilho p95</small><strong>${Number(trigger.p95||0).toFixed(1)} ms</strong></div><div class="health-item"><small>Processamento p95</small><strong>${Number(handle.p95||0).toFixed(1)} ms</strong></div><div class="health-item"><small>Envio p95</small><strong>${Number(send.p95||0).toFixed(1)} ms</strong></div><div class="health-item"><small>Event loop p99</small><strong>${Number(wa.watchdog?.latest?.eventLoopP99Ms||0).toFixed(1)} ms</strong></div></div><div class="actions top-gap"><button class="button small" id="checkpoint-wal">Otimizar banco agora</button></div></div>`);}
  content.innerHTML=`${uncertainBanner}${examples}<div class="dashboard-layout">${blocks.join('')}</div>`;
  if($('#review-uncertain'))$('#review-uncertain').onclick=reviewUncertainDeliveries;
  if($('#restart-wa'))$('#restart-wa').onclick=async()=>{await api('/api/whatsapp/restart',{method:'POST',body:'{}'});toast('🔄 Reinicialização iniciada.');};
  if($('#logout-wa'))$('#logout-wa').onclick=async()=>{if(!confirm('Remover a sessão e gerar um novo QR code?'))return;await api('/api/whatsapp/logout',{method:'POST',body:'{}'});toast('🗑️ Sessão removida.');};
  if($('#remove-examples'))$('#remove-examples').onclick=async()=>{if(!confirm('Excluir apenas os modelos de demonstração?'))return;await api('/api/examples',{method:'DELETE'});toast('🗑️ Modelos excluídos.');await loadAll();};
  if($('#checkpoint-wal'))$('#checkpoint-wal').onclick=async()=>{const result=await api('/api/database/checkpoint',{method:'POST',body:'{}'});toast(result.error?`Falha: ${result.error}`:`Banco otimizado (${result.mode||'checkpoint'}).`,Boolean(result.error));await refreshStatus();};
}


async function reviewUncertainDeliveries(){
  const payload=await api('/api/outbound/uncertain?limit=100');const items=payload.items||[];
  if(!items.length){toast('✅ Não há envios pendentes de revisão.');await refreshStatus();if(state.view==='dashboard')await renderDashboard();return;}
  const body=`<div class="notice"><strong>Evite duplicatas</strong><p>Um resultado desconhecido significa que o WhatsApp pode ter aceitado a mensagem sem devolver a confirmação ao bot. Reenvie somente depois de conferir a conversa.</p></div><div class="conflict-list uncertain-list">${items.map(item=>{const text=item.content?.content?.text||item.content?.metadata?.kind||'Mensagem ou anexo';return`<article class="conflict-item"><div class="toolbar"><div><span class="badge warning">Entrega #${Number(item.id)}</span><h3>${esc(item.conversation_id||'Conversa')}</h3></div><small>${fmtDate(item.updated_at)}</small></div><p class="message-snippet">${esc(String(text).slice(0,500))}</p><p class="muted">Tentativas: ${Number(item.attempts||0)}${item.last_error?` · ${esc(item.last_error)}`:''}</p><div class="actions">${item.reconciling?'<button class="button small" disabled>⏳ Reconciliação em andamento</button>':`<button class="button small danger retry-uncertain" data-id="${Number(item.id)}">↻ Reenviar manualmente</button>`}</div></article>`;}).join('')}</div>`;
  openInfoModal('Envios com resultado desconhecido',body);
  $$('.retry-uncertain').forEach(button=>button.onclick=async()=>{
    const id=Number(button.dataset.id);if(!confirm(`Reenviar a entrega #${id}?\n\nFaça isso somente após conferir que ela não chegou ao WhatsApp. O reenvio pode produzir uma mensagem duplicada.`))return;
    button.disabled=true;button.textContent='⏳ Preparando reenvio…';
    try{await api(`/api/outbound/${id}/retry`,{method:'POST',body:'{}'});toast(`↻ Entrega #${id} recolocada na fila.`);closeModal();await refreshStatus();if(state.view==='dashboard')await renderDashboard();}
    catch(error){button.disabled=false;button.textContent='↻ Reenviar manualmente';toast(error.message,true);}
  });
}

async function renderCalculators(){state.calculators=await api('/api/calculators');content.innerHTML=`<div class="grid cards-3">${state.calculators.map(item=>`<article class="card"><div class="toolbar"><div>${badge(item.enabled?'Ativa':'Inativa',item.enabled?'active':'inactive')}<h3>${esc(item.label)}</h3></div><button class="button small edit-calc" data-key="${esc(item.key)}">✏️ Editar</button></div><code class="command-code">${esc(item.command)}</code><p class="muted">${esc(item.description)}</p></article>`).join('')}</div>`;$$('.edit-calc').forEach(btn=>btn.onclick=()=>calculatorModal(state.calculators.find(x=>x.key===btn.dataset.key)));}
function calculatorModal(item){openModal('Configurar calculadora',`<div class="form-grid"><label class="full">Nome<input name="label" value="${esc(item.label)}" required></label><label class="full">Comando e aliases separados por |<input name="command" value="${esc(item.command)}" required></label><label class="full">Descrição<textarea name="description">${esc(item.description)}</textarea></label><label class="check"><input name="enabled" type="checkbox" ${item.enabled?'checked':''}> Calculadora ativa</label></div>`,async form=>{await api(`/api/calculators/${encodeURIComponent(item.key)}`,{method:'PUT',body:JSON.stringify({label:form.label.value,command:form.command.value,description:form.description.value,enabled:form.enabled.checked,config:item.config})});closeModal();toast('🧮 Calculadora atualizada.');await renderCalculators();});}
async function renderGroups(){state.groups=await api('/api/groups');content.innerHTML=`<div class="toolbar"><p class="muted">A sincronização é automática após conectar.</p><button class="button primary" id="sync-groups">🔄 Sincronizar agora</button></div><div id="groups-box"></div>`;drawGroups();$('#sync-groups').onclick=async()=>{const r=await api('/api/groups/sync',{method:'POST',body:'{}'});toast(`✅ ${r.synced} grupo(s) sincronizado(s).`);await renderGroups();};}
function toggleCell(group,field,label){return`<label class="permission-check"><input class="group-permission" data-id="${esc(group.whatsapp_id)}" data-field="${field}" type="checkbox" ${group[field]?'checked':''}><span>${esc(label)}</span></label>`;}
function drawGroups(){const box=$('#groups-box');if(!state.groups.length){box.innerHTML='<div class="card empty">Conecte o WhatsApp para detectar os grupos.</div>';return;}box.innerHTML=`<div class="table-wrap"><table class="permissions-table"><thead><tr><th>Grupo</th><th>Atendido</th><th>Ajuda</th><th>Mensagens</th><th>Calculadoras</th><th>Última detecção</th></tr></thead><tbody>${state.groups.map(g=>`<tr><td><strong>${esc(g.name||'Grupo sem nome')}</strong><br><small>${esc(g.whatsapp_id)}</small></td><td>${toggleCell(g,'enabled','Atendido')}</td><td>${toggleCell(g,'allow_help','Ajuda')}</td><td>${toggleCell(g,'allow_messages','Mensagens')}</td><td>${toggleCell(g,'allow_calculator','Calculadoras')}</td><td>${fmtDate(g.last_seen_at)}</td></tr>`).join('')}</tbody></table></div>`;box.querySelectorAll('.group-permission').forEach(input=>input.onchange=async()=>{const group=state.groups.find(g=>g.whatsapp_id===input.dataset.id);group[input.dataset.field]=input.checked;try{Object.assign(group,await api(`/api/groups/${encodeURIComponent(group.whatsapp_id)}`,{method:'PUT',body:JSON.stringify(group)}));toast('✅ Permissões atualizadas.');}catch(e){input.checked=!input.checked;toast(e.message,true);}});}
async function renderAnalytics(days=30){state.analytics=await api(`/api/analytics?days=${days}`);const a=state.analytics;const max=Math.max(1,...(a.top||[]).map(i=>Number(i.count)));content.innerHTML=`<div class="toolbar"><p class="muted">Somente contagens por tópico.</p><div class="actions"><select id="analytics-days"><option value="7">7 dias</option><option value="30" ${days===30?'selected':''}>30 dias</option><option value="90">90 dias</option><option value="365">1 ano</option></select><button class="button danger" id="clear-analytics">🗑️ Zerar</button></div></div><div class="grid stats">${statCard('Interações',a.total||0)}${statCard('Tópicos',a.top?.length||0)}${statCard('Desde',a.since)}${statCard('Período',`${a.days} dias`)}</div><div class="card"><h3>Mensagens mais usadas</h3>${a.top?.length?`<div class="analytics-bars">${a.top.map(i=>`<div class="analytics-row"><div><strong>${esc(i.topic)}</strong><small>${esc(i.match_type)}</small></div><div class="bar-track"><span style="width:${Math.max(3,Number(i.count)/max*100)}%"></span></div><b>${i.count}</b></div>`).join('')}</div>`:'<div class="empty">Sem dados.</div>'}</div>`;$('#analytics-days').onchange=e=>renderAnalytics(Number(e.target.value));$('#clear-analytics').onclick=async()=>{if(!confirm('Apagar as estatísticas?'))return;await api('/api/analytics',{method:'DELETE'});await renderAnalytics(days);};}

function openModal(title,body,onSubmit,options={}){const editable=options.editableTitle;const heading=editable?`<div class="modal-editable-title"><p class="eyebrow">NOME INTERNO</p><input class="modal-title-input" name="title" form="modal-form" value="${esc(editable.value||'')}" placeholder="${esc(editable.placeholder||'Nome da mensagem')}" required aria-label="Nome interno da mensagem"><small>Clique no título para editar.</small></div>`:`<div><p class="eyebrow">EDIÇÃO</p><h2>${esc(title)}</h2></div>`;$('#modal-content').innerHTML=`<div class="modal-head">${heading}<div class="actions">${options.fullscreen?'<button type="button" class="icon-button" id="expand-modal" title="Tela cheia">⛶</button>':''}<button type="button" class="icon-button" id="close-modal">✖️</button></div></div><form id="modal-form">${body}<div class="modal-actions"><button type="button" class="button" id="cancel-modal">↩️ Cancelar</button><button type="submit" class="button primary">${esc(options.saveLabel||'💾 Salvar')}</button></div></form>`;modal.classList.toggle('wide-modal',Boolean(options.wide));modal.showModal();$('#close-modal').onclick=closeModal;$('#cancel-modal').onclick=closeModal;if($('#expand-modal'))$('#expand-modal').onclick=()=>{modal.classList.toggle('fullscreen-modal');$('#expand-modal').textContent=modal.classList.contains('fullscreen-modal')?'🗗':'⛶';};$('#modal-form').onsubmit=async e=>{e.preventDefault();try{await onSubmit(e.target);}catch(error){toast(error.message,true);}};}
function openInfoModal(title,body){$('#modal-content').innerHTML=`<div class="modal-head"><div><p class="eyebrow">RESULTADO</p><h2>${esc(title)}</h2></div><button type="button" class="icon-button" id="close-modal">✖️</button></div>${body}<div class="modal-actions"><button class="button primary" id="cancel-modal">✅ Fechar</button></div>`;modal.classList.remove('wide-modal','fullscreen-modal');modal.showModal();$('#close-modal').onclick=closeModal;$('#cancel-modal').onclick=closeModal;}
function closeModal(){modal.close();modal.classList.remove('wide-modal','fullscreen-modal');}
modal.onclick=e=>{if(e.target===modal)closeModal();};

(async()=>{try{const[settings,status]=await Promise.all([api('/api/settings'),api('/api/status')]);state.settings=settings;state.status=status;renderStatus();await render();showApp();}catch{showLogin();}})();
// SSE entrega alterações imediatamente. O polling lento é apenas contingência.
setInterval(()=>{if(!document.hidden)refreshStatus();},60000);
const resumePanel=()=>{if(document.hidden)return;renderStatus();refreshStatus();};
document.addEventListener('visibilitychange',resumePanel);window.addEventListener('pageshow',resumePanel);window.addEventListener('online',resumePanel);
