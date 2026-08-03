function managementProgress(label='Carregando…'){content.innerHTML=`<div class="card"><p class="muted">⏳ ${esc(label)}</p></div>`;}
function healthValue(value,total){return `${fmtBytes(value)} / ${fmtBytes(total)}`;}
function compactJson(value){try{return JSON.stringify(value,null,2);}catch{return String(value||'');}}
function minutesToClock(value){const n=Number(value);if(!Number.isFinite(n))return'';return`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function clockToMinutes(value){const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;}

async function renderManagement(){
  managementProgress('Lendo saúde, fila e histórico');
  const [status,consistency,external,history,outbound]=await Promise.all([
    api('/api/status'),api('/api/consistency'),api('/api/external-backups'),api('/api/change-history?limit=30'),api('/api/outbound?limit=20')
  ]);
  state.status=status;state.settings=await api('/api/settings');
  const h=status.health||{},sys=h.system||{},mem=sys.memory||{},disk=sys.disk||{},wa=status.whatsapp||{},queue=outbound.stats||{};
  const errors=Number(consistency.counts?.error||0),warnings=Number(consistency.counts?.warning||0);
  const externalLabel=external.configured?(external.settings?.enabled?'Ativo':'Configurado, desativado'):'Não configurado';
  content.innerHTML=`
    <div class="toolbar"><div><h2>🛠️ Sistema e manutenção</h2><p class="muted">Saúde da Oracle, atualização segura, backups, consistência, fila e histórico.</p></div><div class="actions"><button class="button" id="mg-refresh">🔄 Atualizar</button><button class="button danger" id="mg-restart">♻️ Reiniciar serviço</button></div></div>
    <div class="grid stats">
      ${statCard('WhatsApp',wa.state==='ready'?'Conectado':wa.state||'—',wa.accountName||wa.message||'')}
      ${statCard('Servidor ligado',fmtDuration(sys.uptimeSeconds||0),sys.hostname||'')}
      ${statCard('Memória',healthValue(mem.usedBytes,mem.totalBytes),`Disponível: ${fmtBytes(mem.availableBytes)}`)}
      ${statCard('Swap',healthValue(mem.swapUsedBytes,mem.swapTotalBytes))}
      ${statCard('Disco',healthValue(disk.usedBytes,disk.totalBytes),`Livre: ${fmtBytes(disk.availableBytes)}`)}
      ${statCard('Fila persistente',String((queue.pending||0)+(queue.retry||0)+(queue.sending||0)),`${queue.failed||0} falha(s) · ${queue.uncertain||0} incerta(s)`)}
      ${statCard('Última resposta',relativeTime(wa.lastSendCompletedAt||wa.lastReplyAt||''))}
      ${statCard('Backup externo',externalLabel,external.lastBackupAt?relativeTime(external.lastBackupAt):'nenhum')}
    </div>
    <div class="grid cards-2">
      <article class="card"><div class="toolbar"><div><h3>🩺 Verificações</h3><p class="muted">Banco, anexos e coerência do quadro.</p></div>${badge(consistency.ok?'OK':`${errors} erro(s)`,consistency.ok?'active':'danger')}</div><p>${errors} erro(s), ${warnings} aviso(s) e ${Number(consistency.counts?.info||0)} informação(ões).</p><div class="actions"><button class="button primary" id="mg-consistency">Ver relatório</button><button class="button" id="mg-verify">Verificar agora</button><button class="button" id="mg-test-send">Enviar teste</button><a class="button" href="/api/system/logs?limit=1000">Baixar logs</a></div></article>
      <article class="card"><div class="toolbar"><div><h3>⬆️ Atualização segura</h3><p class="muted">Backup completo, validação, testes, reinício e rollback automático.</p></div><span id="mg-update-badge">${badge(status.version||'—')}</span></div><div id="mg-update-info" class="muted">Clique para consultar o GitHub.</div><div class="actions"><button class="button" id="mg-update-check">Verificar atualização</button><button class="button primary" id="mg-update-apply" disabled>Criar backup e atualizar</button></div></article>
      <article class="card"><div class="toolbar"><div><h3>🔐 Backup externo criptografado</h3><p class="muted">Inclui banco, sessão, anexos, conteúdo privado e configurações.</p></div>${badge(externalLabel,external.configured?'active':'warning')}</div>
        <div class="form-grid"><label class="full">Destino <input id="mg-backup-remote" value="${esc(state.settings.external_backup_remote||'')}" placeholder="file:/mnt/backup ou remoto:rclone/pasta"></label><label>Intervalo (h)<input id="mg-backup-hours" type="number" min="1" max="168" value="${esc(state.settings.external_backup_interval_hours||24)}"></label><label class="check"><input id="mg-backup-enabled" type="checkbox" ${bool(state.settings.external_backups_enabled)?'checked':''}> Ativar automático</label><label>Diários<input id="mg-backup-daily" type="number" min="1" max="30" value="${esc(state.settings.external_backup_daily_keep||7)}"></label><label>Semanais<input id="mg-backup-weekly" type="number" min="1" max="24" value="${esc(state.settings.external_backup_weekly_keep||4)}"></label><label>Pré-atualização<input id="mg-backup-pre" type="number" min="1" max="10" value="${esc(state.settings.external_backup_preupdate_keep||3)}"></label></div><p class="muted">A chave deve existir no <code>.env</code> como <code>HUB_BACKUP_PASSPHRASE</code> (mínimo de 12 caracteres). Para nuvem, configure o rclone no servidor.</p><div class="actions"><button class="button primary" id="mg-backup-save">Salvar</button><button class="button" id="mg-backup-run" ${external.configured?'':'disabled'}>Executar agora</button></div></article>
      <article class="card"><div class="toolbar"><div><h3>👨‍🏫 Editor estruturado</h3><p class="muted">Professor, e-mail, disciplina, sigla, semestre, dia, horário e sala.</p></div></div><p>Alterações atualizam o card docente e todas as consultas estruturadas, preservando gatilhos e anexos.</p><div class="actions"><button class="button primary" id="mg-schedule">Abrir editor</button></div></article>
    </div>
    <article class="card"><div class="toolbar"><div><h3>📜 Histórico recente</h3><p class="muted">Alterações em docentes, horários, calendário e configurações.</p></div><button class="button" id="mg-history">Ver histórico completo</button></div>${history.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Item</th><th>Ação</th><th>Origem</th></tr></thead><tbody>${history.slice(0,8).map(item=>`<tr><td>${fmtDate(item.created_at)}</td><td>${esc(item.entity_label||item.entity_type)}</td><td>${esc(item.action)}</td><td>${esc(item.source)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Nenhuma alteração registrada.</p>'}</article>
    <article class="card"><div class="toolbar"><div><h3>📨 Entregas recentes</h3><p class="muted">A fila SQLite sobrevive a reinícios e controla tentativas e duplicidades.</p></div>${badge(`${outbound.items.length} exibida(s)`)}</div>${outbound.items.length?`<div class="table-wrap"><table><thead><tr><th>ID</th><th>Estado</th><th>Tentativas</th><th>Atualizada</th><th>Erro</th></tr></thead><tbody>${outbound.items.map(item=>`<tr><td>#${item.id}</td><td>${badge(item.state,item.state==='sent'?'active':item.state==='failed'?'danger':'warning')}</td><td>${item.attempts}</td><td>${fmtDate(item.updated_at)}</td><td>${esc(item.last_error||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Fila vazia.</p>'}</article>`;
  $('#mg-refresh').onclick=renderManagement;
  $('#mg-restart').onclick=async()=>{if(!confirm('Reiniciar o serviço da Oracle agora? O painel ficará indisponível por alguns segundos.'))return;await api('/api/system/restart',{method:'POST',body:'{}'});toast('♻️ Reinício agendado.');};
  $('#mg-consistency').onclick=()=>showConsistencyReport(consistency);
  $('#mg-verify').onclick=async()=>{try{const r=await api('/api/system/verify',{method:'POST',body:'{}',timeoutMs:120000});toast(r.ok?'✅ Banco e anexos verificados.':'⚠️ Foram encontradas inconsistências.',!r.ok);showConsistencyReport(r.consistency);}catch(e){toast(e.message,true);}};
  $('#mg-test-send').onclick=async()=>{try{await api('/api/system/test-send',{method:'POST',body:'{}',timeoutMs:30000});toast('✅ Mensagem de teste colocada na fila.');}catch(e){toast(e.message,true);}};
  $('#mg-update-check').onclick=checkRemoteUpdate;
  $('#mg-update-apply').onclick=applyRemoteUpdate;
  $('#mg-backup-save').onclick=saveExternalBackupSettings;
  $('#mg-backup-run').onclick=async()=>{try{const r=await api('/api/external-backups/run',{method:'POST',body:'{}',timeoutMs:30*60*1000});toast(`✅ Backup enviado: ${r.name}`);await renderManagement();}catch(e){toast(e.message,true);}};
  $('#mg-schedule').onclick=openStructuredScheduleEditor;
  $('#mg-history').onclick=openChangeHistory;
}

function showConsistencyReport(report){
  const items=report?.items||[];
  openInfoModal('Relatório de consistência',`<div class="toolbar"><p>${items.length?`${items.length} ocorrência(s)`:'Nenhuma inconsistência encontrada.'}</p>${badge(report?.ok?'OK':'Revisar',report?.ok?'active':'danger')}</div>${items.length?`<div class="conflict-list">${items.map(item=>`<article class="conflict-item"><div>${badge(item.severity,item.severity==='error'?'danger':item.severity==='warning'?'warning':'')} <strong>${esc(item.title)}</strong></div><p class="muted">${esc(item.details||'')}</p></article>`).join('')}</div>`:''}`);
}

async function checkRemoteUpdate(){
  const info=$('#mg-update-info'),apply=$('#mg-update-apply'),button=$('#mg-update-check');button.disabled=true;info.textContent='Consultando o GitHub…';
  try{const r=await api('/api/update/remote',{timeoutMs:30000});info.innerHTML=`Instalada: <strong>${esc(r.currentVersion)}</strong> · GitHub: <strong>${esc(r.remoteVersion)}</strong>${r.available?' · nova versão disponível':' · já atualizada'}`;apply.disabled=!r.available;apply.dataset.version=r.remoteVersion||'';}
  catch(e){info.textContent=e.message;apply.disabled=true;toast(e.message,true);}finally{button.disabled=false;}
}
async function applyRemoteUpdate(){
  const button=$('#mg-update-apply');if(!confirm(`Criar backup completo e instalar ${button.dataset.version||'a nova versão'}? O painel reiniciará e fará rollback se a validação falhar.`))return;
  button.disabled=true;button.textContent='⏳ Criando backup e preparando…';
  try{const r=await api('/api/update/remote/apply',{method:'POST',body:'{}',timeoutMs:30*60*1000});toast(`⬆️ Atualização ${r.targetVersion} aceita. Aguarde o painel voltar.`);setTimeout(()=>location.reload(),30000);}catch(e){button.disabled=false;button.textContent='Criar backup e atualizar';toast(e.message,true);}
}
async function saveExternalBackupSettings(){
  const payload={external_backups_enabled:$('#mg-backup-enabled').checked,external_backup_remote:$('#mg-backup-remote').value.trim(),external_backup_interval_hours:$('#mg-backup-hours').value,external_backup_daily_keep:$('#mg-backup-daily').value,external_backup_weekly_keep:$('#mg-backup-weekly').value,external_backup_preupdate_keep:$('#mg-backup-pre').value};
  try{state.settings=await api('/api/settings',{method:'PUT',body:JSON.stringify(payload)});toast('🔐 Configuração de backup salva.');await renderManagement();}catch(e){toast(e.message,true);}
}

async function openChangeHistory(){
  const items=await api('/api/change-history?limit=300');
  openInfoModal('Histórico e reversão',items.length?`<div class="conflict-list">${items.map(item=>`<article class="conflict-item"><div class="toolbar"><div>${badge(item.entity_type)} <strong>${esc(item.entity_label||item.entity_id)}</strong></div><small>${fmtDate(item.created_at)}</small></div><p class="muted">${esc(item.action)} · ${esc(item.source)}${item.reverted_at?' · já revertida':''}</p><details><summary>Ver antes e depois</summary><pre>${esc(compactJson({antes:item.before,depois:item.after}))}</pre></details>${!item.reverted_at&&['teacher','schedule_entry','academic_calendar','settings'].includes(item.entity_type)?`<button class="button small danger history-revert" data-id="${item.id}">↶ Restaurar estado anterior</button>`:''}</article>`).join('')}</div>`:'<p class="muted">Nenhuma alteração registrada.</p>');
  $$('.history-revert').forEach(btn=>btn.onclick=async()=>{if(!confirm('Restaurar o estado anterior desta alteração?'))return;try{await api(`/api/change-history/${btn.dataset.id}/revert`,{method:'POST',body:'{}'});toast('↶ Alteração revertida.');closeModal();await renderManagement();}catch(e){toast(e.message,true);}});
}

async function openStructuredScheduleEditor(){
  const [entries,teachers]=await Promise.all([api(`/api/professor-schedule-entries?period=${encodeURIComponent(state.settings.current_academic_period||'2026.2')}`),api('/api/teachers')]);
  const teacherOptions=teachers.map(t=>`<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
  openInfoModal('Editor estruturado de professores',`<div class="toolbar"><p class="muted">Período ${esc(state.settings.current_academic_period||'2026.2')} · ${entries.length} aula(s)</p><button class="button primary" id="schedule-add">➕ Nova aula</button></div><div class="table-wrap"><table><thead><tr><th>Professor</th><th>Disciplina</th><th>Sem.</th><th>Dia/horário</th><th>Sala</th><th></th></tr></thead><tbody>${entries.map(e=>`<tr><td>${esc(e.professor_name)}<br><small>${esc(e.professor_email||'sem e-mail')}</small></td><td><strong>${esc(e.discipline_code||'—')}</strong> — ${esc(e.discipline_name)}</td><td>${e.semester_number}º</td><td>${esc(e.day_label)}<br><small>${esc(e.hours_label)}</small></td><td>${esc(e.room||'—')}</td><td><div class="actions"><button class="button small schedule-edit" data-id="${e.id}">✏️</button><button class="button small danger schedule-delete" data-id="${e.id}">🗑️</button></div></td></tr>`).join('')}</tbody></table></div>`);
  const find=id=>entries.find(e=>Number(e.id)===Number(id));
  $('#schedule-add').onclick=()=>{closeModal();scheduleEntryModal(null,teacherOptions,teachers);};
  $$('.schedule-edit').forEach(btn=>btn.onclick=()=>{closeModal();scheduleEntryModal(find(btn.dataset.id),teacherOptions,teachers);});
  $$('.schedule-delete').forEach(btn=>btn.onclick=async()=>{if(!confirm('Excluir esta aula do quadro estruturado?'))return;try{await api(`/api/professor-schedule-entries/${btn.dataset.id}`,{method:'DELETE'});toast('Aula excluída e card docente atualizado.');closeModal();await openStructuredScheduleEditor();}catch(e){toast(e.message,true);}});
}
function scheduleEntryModal(item,teacherOptions,teachers){
  const selectedName=item?.professor_name||'';const day=Number(item?.day_of_week??1);
  openModal(item?'Editar aula estruturada':'Nova aula estruturada',`<div class="form-grid"><label class="full">Professor<select name="professor_name" required><option value="">Selecione</option>${teacherOptions}</select></label><label class="full">E-mail<input name="professor_email" type="email" value="${esc(item?.professor_email||'')}"></label><label>Sigla<input name="discipline_code" value="${esc(item?.discipline_code||'')}" placeholder="LPII"></label><label class="full">Nome da disciplina<input name="discipline_name" value="${esc(item?.discipline_name||'')}" required></label><label>Semestre<input name="semester_number" type="number" min="1" max="8" value="${esc(item?.semester_number||1)}" required></label><label>Dia<select name="day_of_week">${['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'].map((name,i)=>`<option value="${i}" ${day===i?'selected':''}>${name}</option>`).join('')}</select></label><label>Início<input name="start_time" type="time" value="${minutesToClock(item?.start_minutes)}" required></label><label>Fim<input name="end_time" type="time" value="${minutesToClock(item?.end_minutes)}" required></label><label>Sala<input name="room" value="${esc(item?.room||'')}"></label><label>Período<input name="academic_period" value="${esc(item?.academic_period||state.settings.current_academic_period||'2026.2')}" required></label><label class="check"><input name="active" type="checkbox" ${item?.active===false?'':'checked'}> Ativa</label></div>`,async form=>{const teacher=teachers.find(t=>t.name===form.professor_name.value);const body={professor_name:form.professor_name.value,professor_email:form.professor_email.value||teacher?.email||'',discipline_code:form.discipline_code.value,discipline_name:form.discipline_name.value,semester_number:Number(form.semester_number.value),day_of_week:Number(form.day_of_week.value),start_minutes:clockToMinutes(form.start_time.value),end_minutes:clockToMinutes(form.end_time.value),room:form.room.value,academic_period:form.academic_period.value,active:form.active.checked};await api(item?`/api/professor-schedule-entries/${item.id}`:'/api/professor-schedule-entries',{method:item?'PUT':'POST',body:JSON.stringify(body)});closeModal();toast('✅ Quadro e card docente atualizados.');await openStructuredScheduleEditor();},{wide:true});
  const select=$('#modal-form [name="professor_name"]');select.value=selectedName;select.onchange=()=>{const teacher=teachers.find(t=>t.name===select.value);if(teacher&&!$('#modal-form [name="professor_email"]').value)$('#modal-form [name="professor_email"]').value=teacher.email||'';};
}
