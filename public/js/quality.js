'use strict';

async function renderQuality(){
  const [runtime,migrations,academic,observations,falsePositives,policies,recovery]=await Promise.all([
    api('/api/quality/runtime'),api('/api/quality/migrations'),api('/api/quality/academic'),
    api('/api/quality/observations'),api('/api/quality/false-positives'),api('/api/quality/trigger-policies'),api('/api/quality/recovery?days=30')
  ]);
  content.innerHTML=`
    <div class="grid stats">
      ${statCard('Node instalado',runtime.installed,runtime.supported?'Compatibilidade confirmada':'Fora da faixa testada')}
      ${statCard('Migrações versionadas',migrations.length,migrations.at(-1)?.migration_id||'Nenhuma')}
      ${statCard('Período acadêmico',academic.academic_period||'—',academic.stale?'Dados precisam de revisão':'Dados dentro da validade')}
      ${statCard('Possíveis falsos positivos',falsePositives.length,'Pendentes de revisão')}
      ${statCard('Recuperações resolvidas',`${Math.round(Number(recovery.resolution_rate||0)*100)}%`,`${Number(recovery.resolved||0)} de ${Number(recovery.total||0)}`)}
      ${statCard('Mensagens até resolver',Number(recovery.average_messages||0).toFixed(1),'média dos últimos 30 dias')}
    </div>
    <div class="card"><h2>Recuperação de conversa</h2><div class="grid stats"><div><strong>${Math.round(Number(recovery.breakdown?.direct?.rate||0)*100)}%</strong><span>Resolvido diretamente</span></div><div><strong>${Math.round(Number(recovery.breakdown?.clarification?.rate||0)*100)}%</strong><span>Após pergunta complementar</span></div><div><strong>${Math.round(Number(recovery.breakdown?.suggestion?.rate||0)*100)}%</strong><span>Por sugestões</span></div><div><strong>${Math.round(Number(recovery.breakdown?.menu?.rate||0)*100)}%</strong><span>Pelo menu</span></div><div><strong>${Math.round(Number(recovery.breakdown?.abandonment?.rate||0)*100)}%</strong><span>Abandono</span></div></div><p><strong>Rejeições de sugestões:</strong> ${Number(recovery.suggestions_rejected||0)} · <strong>Média até resolver:</strong> ${Number(recovery.average_messages||0).toFixed(1)} mensagem(ns)</p><p class="muted">O painel mede quantas tentativas foram necessárias, quais perguntas complementares funcionaram e quando “nenhuma dessas” foi escolhida.</p>${recovery.top_clarifications?.length?`<div class="table-wrap"><table><thead><tr><th>Intenção</th><th>Ocorrências</th></tr></thead><tbody>${recovery.top_clarifications.map(item=>`<tr><td>${esc(item.intent||'não classificada')}</td><td>${Number(item.count||0)}</td></tr>`).join('')}</tbody></table></div>`:''}</div>
    <div class="card"><h2>Validade acadêmica</h2><p><strong>Última fonte:</strong> ${esc(academic.latest?.source_title||'Não registrada')}</p><p><strong>Data da fonte:</strong> ${esc(academic.latest?.source_date||academic.latest?.imported_at||'—')}</p><p><strong>Registros:</strong> ${Number(academic.latest?.entry_count||0)} · <strong>idade:</strong> ${academic.age_days===null?'desconhecida':`${academic.age_days} dia(s)`}</p>${academic.stale?'<p class="notice">O quadro pode estar desatualizado. Importe ou confirme a fonte atual.</p>':''}</div>
    <div class="card"><h2>Política central de gatilhos</h2><div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Uso</th></tr></thead><tbody>${Object.entries(policies||{}).map(([key,value])=>`<tr><td><code>${esc(key)}</code></td><td>${esc(value.description||value)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h2>Modo de observação</h2>${observations.length?observations.map(item=>`<article class="conflict-item"><strong>${esc(item.message_excerpt)}</strong><p class="muted">${esc(item.normalized_message)} · ${Number(item.occurrences||1)} ocorrência(s)</p><button class="button small review-observation" data-id="${Number(item.id)}">Marcar como revisado</button></article>`).join(''):'<p class="muted">Nenhuma ocorrência pendente.</p>'}</div>
    <div class="card"><h2>Respostas possivelmente incorretas</h2>${falsePositives.length?falsePositives.map(item=>`<article class="conflict-item"><strong>${esc(item.original_message)}</strong><p class="muted">Card: ${esc(item.matched_title||'não identificado')} · feedback: ${esc(item.feedback_text)}</p><button class="button small review-fp" data-id="${Number(item.id)}">Marcar como revisado</button></article>`).join(''):'<p class="muted">Nenhum relato pendente.</p>'}</div>`;
  $$('.review-observation').forEach(button=>button.onclick=async()=>{await api(`/api/quality/observations/${button.dataset.id}`,{method:'PATCH',body:JSON.stringify({state:'reviewed'})});await renderQuality();});
  $$('.review-fp').forEach(button=>button.onclick=async()=>{await api(`/api/quality/false-positives/${button.dataset.id}`,{method:'PATCH',body:JSON.stringify({state:'reviewed'})});await renderQuality();});
}
