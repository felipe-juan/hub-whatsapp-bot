'use strict';

async function renderAcademicData(){
  const period=state.settings.current_academic_period||'2026.2';
  const [entries,teachers,events,status]=await Promise.all([
    api(`/api/professor-schedule-entries?period=${encodeURIComponent(period)}`),api('/api/teachers'),
    api('/api/academic-calendar?all=1'),api('/api/quality/academic')
  ]);
  const disciplines=[...new Set(entries.map(item=>item.discipline_name).filter(Boolean))];
  const semesters=[...new Set(entries.map(item=>Number(item.semester_number)).filter(Boolean))].sort((a,b)=>a-b);
  content.innerHTML=`<div class="toolbar"><div><h2>Base acadêmica estruturada</h2><p class="muted">Uma única base alimenta consultas de professor, disciplina, sala, horário, dia e semestre.</p></div><div class="actions"><button class="button primary" id="academic-import">Importar quadro</button><button class="button" id="academic-teachers">Professores</button></div></div>
  <div class="grid stats">${statCard('Período',period)}${statCard('Ofertas',entries.length)}${statCard('Disciplinas',disciplines.length)}${statCard('Professores',teachers.length)}${statCard('Semestres',semesters.join(', ')||'—')}${statCard('Exceções',events.filter(item=>item.active).length)}</div>
  <div class="card"><h2>Fonte e validade</h2><p><strong>Fonte:</strong> ${esc(status.latest?.source_title||'Não registrada')}</p><p><strong>Data:</strong> ${esc(status.latest?.source_date||status.latest?.imported_at||'—')}</p>${status.stale?'<p class="notice warn">Os dados precisam de revisão.</p>':'<p class="notice">Dados dentro da validade configurada.</p>'}</div>
  <div class="card"><div class="toolbar"><h2>Horários, salas e professores</h2><span class="badge">${entries.length} registros</span></div><div class="table-wrap"><table><thead><tr><th>Disciplina</th><th>Professor</th><th>Semestre</th><th>Dia</th><th>Horário</th><th>Sala</th></tr></thead><tbody>${entries.slice(0,300).map(item=>`<tr><td><strong>${esc([item.discipline_code,item.discipline_name].filter(Boolean).join(' — '))}</strong></td><td>${esc(item.professor_name)}</td><td>${Number(item.semester_number)}º</td><td>${esc(item.day_label)}</td><td>${esc(item.hours_label)}</td><td>${esc(item.room||'não cadastrada')}</td></tr>`).join('')}</tbody></table></div>${entries.length>300?'<p class="muted">Mostrando os primeiros 300 registros.</p>':''}</div>
  <div class="card"><h2>Exceções temporárias</h2><p class="muted">Mudanças de sala, suspensões, reposições e avisos têm validade e prioridade sobre o horário comum.</p>${events.length?events.slice(0,50).map(item=>`<article class="conflict-item"><strong>${esc(item.title)}</strong><p>${esc(item.start_date)} a ${esc(item.end_date)} · ${esc(item.event_type)}</p><small>${esc(item.description||'')}</small></article>`).join(''):'<p class="muted">Nenhuma exceção cadastrada.</p>'}</div>`;
  $('#academic-import').onclick=professorScheduleImportModal;
  $('#academic-teachers').onclick=openTeacherDirectory;
}
