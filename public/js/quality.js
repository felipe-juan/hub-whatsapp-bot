'use strict';

async function runConversationSimulator(){
  const text=$('#conversation-script')?.value||''; if(!text.trim()){toast('Informe ao menos uma mensagem.',true);return;}
  const button=$('#run-conversation-simulator'); button.disabled=true; button.textContent='⏳ Simulando…';
  try{
    const result=await api('/api/simulator/conversation',{method:'POST',body:JSON.stringify({text,save:$('#save-conversation')?.checked,save_as_test:$('#save-conversation-test')?.checked,title:$('#conversation-title')?.value||''})});
    $('#conversation-result').innerHTML=`<div class="stack">${result.results.map(step=>`<article class="conflict-item"><strong>${step.step}. Usuário</strong><blockquote>${esc(step.input)}</blockquote><strong>Bot</strong>${step.replies?.length?step.replies.map(reply=>`<div class="whatsapp-preview">${renderWhatsAppMarkup(reply.text)}</div>`).join(''):'<p class="muted">Nenhuma resposta.</p>'}${step.quoted_message_id?`<small>Reply explícito: ${esc(step.quoted_message_id)}</small>`:''}</article>`).join('')}</div>`;
    toast('✅ Conversa simulada sem enviar mensagens ao WhatsApp.');
  }catch(error){toast(error.message,true);}finally{button.disabled=false;button.textContent='▶ Simular conversa';}
}

async function renderQuality(){
  const [runtime,migrations,academic,observations,falsePositives,policies,recovery,intentMetrics,simulations]=await Promise.all([
    api('/api/quality/runtime'),api('/api/quality/migrations'),api('/api/quality/academic'),
    api('/api/quality/observations'),api('/api/quality/false-positives'),api('/api/quality/trigger-policies'),api('/api/quality/recovery?days=30'),
    api('/api/quality/intent-metrics?days=30'),api('/api/simulator/conversations?limit=10')
  ]);
  const intents=[...new Set(intentMetrics.map(item=>item.intent||'não classificada'))];
  content.innerHTML=`
    <div class="grid stats">
      ${statCard('Node instalado',runtime.installed,runtime.supported?'Compatibilidade confirmada':'Fora da faixa testada')}
      ${statCard('Migrações versionadas',migrations.length,migrations.at(-1)?.migration_id||'Nenhuma')}
      ${statCard('Período acadêmico',academic.academic_period||'—',academic.stale?'Dados precisam de revisão':'Dados dentro da validade')}
      ${statCard('Possíveis falsos positivos',falsePositives.length,'Pendentes de revisão')}
      ${statCard('Recuperações resolvidas',`${Math.round(Number(recovery.resolution_rate||0)*100)}%`,`${Number(recovery.resolved||0)} de ${Number(recovery.total||0)}`)}
      ${statCard('Intenções medidas',intents.length,'últimos 30 dias')}
    </div>
    <div class="card"><h2>Simulador de conversa completa</h2><p class="muted">Uma mensagem por linha. O simulador mantém contexto, perguntas pendentes e correções entre as etapas.</p><div class="form-grid"><label class="full">Nome do cenário<input id="conversation-title" placeholder="Sala — erro — AP"></label><label class="full">Conversa<textarea id="conversation-script" rows="8" placeholder="sala\nqualquer coisa\nAP\ne o professor?\nnão, quero o contato"></textarea></label><label class="check"><input id="save-conversation" type="checkbox"> Salvar simulação</label><label class="check"><input id="save-conversation-test" type="checkbox"> Converter etapas em regressões</label></div><div class="actions"><button class="button primary" id="run-conversation-simulator">▶ Simular conversa</button></div><div id="conversation-result" class="top-gap"></div>${simulations.length?`<details><summary>Simulações salvas (${simulations.length})</summary>${simulations.map(item=>`<p><strong>${esc(item.title||`Simulação #${item.id}`)}</strong> · ${item.messages.length} etapa(s) · ${fmtDate(item.created_at)}</p>`).join('')}</details>`:''}</div>
    <div class="card"><h2>Métricas por intenção</h2>${intentMetrics.length?`<div class="table-wrap"><table><thead><tr><th>Intenção</th><th>Resultado</th><th>Campo ausente</th><th>Ocorrências</th><th>Tentativas</th></tr></thead><tbody>${intentMetrics.map(item=>`<tr><td>${esc(item.intent||'não classificada')}</td><td>${esc(item.outcome||'—')}</td><td>${esc(item.missing_field||'—')}</td><td>${Number(item.count||0)}</td><td>${Number(item.avg_attempts||0).toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Ainda não há eventos suficientes.</p>'}</div>
    <div class="card"><h2>Recuperação de conversa</h2><div class="grid stats"><div><strong>${Math.round(Number(recovery.breakdown?.direct?.rate||0)*100)}%</strong><span>Direta</span></div><div><strong>${Math.round(Number(recovery.breakdown?.clarification?.rate||0)*100)}%</strong><span>Esclarecimento</span></div><div><strong>${Math.round(Number(recovery.breakdown?.suggestion?.rate||0)*100)}%</strong><span>Sugestões</span></div><div><strong>${Math.round(Number(recovery.breakdown?.menu?.rate||0)*100)}%</strong><span>Menu</span></div><div><strong>${Math.round(Number(recovery.breakdown?.abandonment?.rate||0)*100)}%</strong><span>Abandono</span></div></div></div>
    <div class="card"><h2>Validade acadêmica</h2><p><strong>Última fonte:</strong> ${esc(academic.latest?.source_title||'Não registrada')}</p><p><strong>Data:</strong> ${esc(academic.latest?.source_date||academic.latest?.imported_at||'—')}</p><p><strong>Registros:</strong> ${Number(academic.latest?.entry_count||0)}</p>${academic.stale?'<p class="notice">O quadro pode estar desatualizado.</p>':''}</div>
    <div class="card"><h2>Política central de gatilhos</h2><div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Uso</th></tr></thead><tbody>${Object.entries(policies||{}).map(([key,value])=>`<tr><td><code>${esc(key)}</code></td><td>${esc(value.description||value)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h2>Modo de observação</h2>${observations.length?observations.map(item=>`<article class="conflict-item"><strong>${esc(item.message_excerpt)}</strong><p class="muted">${esc(item.normalized_message)} · ${Number(item.occurrences||1)} ocorrência(s)</p><button class="button small review-observation" data-id="${Number(item.id)}">Marcar como revisado</button></article>`).join(''):'<p class="muted">Nenhuma ocorrência pendente.</p>'}</div>
    <div class="card"><h2>Respostas possivelmente incorretas</h2>${falsePositives.length?falsePositives.map(item=>`<article class="conflict-item"><strong>${esc(item.original_message)}</strong><p class="muted">Card: ${esc(item.matched_title||'não identificado')} · feedback: ${esc(item.feedback_text)}</p><button class="button small review-fp" data-id="${Number(item.id)}">Marcar como revisado</button></article>`).join(''):'<p class="muted">Nenhum relato pendente.</p>'}</div>`;
  $('#run-conversation-simulator').onclick=runConversationSimulator;
  $$('.review-observation').forEach(button=>button.onclick=async()=>{await api(`/api/quality/observations/${button.dataset.id}`,{method:'PATCH',body:JSON.stringify({state:'reviewed'})});await renderQuality();});
  $$('.review-fp').forEach(button=>button.onclick=async()=>{await api(`/api/quality/false-positives/${button.dataset.id}`,{method:'PATCH',body:JSON.stringify({state:'reviewed'})});await renderQuality();});
}
