'use strict';
const { normalizeText } = require('./text');
const DAY_ORDER = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function sourceFooter(entries=[]) {
  const first=entries.find(e=>e.source_title||e.source_date||e.source_version); if(!first)return '';
  const pieces=[first.source_title,first.source_version?`versão ${first.source_version}`:'',first.source_date?`publicado em ${first.source_date.split('-').reverse().join('/')}`:''].filter(Boolean);
  return pieces.length?`\n\nFonte: ${pieces.join(', ')}.`:'';
}
function groupClasses(entries=[]) {
  const groups=new Map();
  for(const e of entries){const key=`${e.discipline_code}|${e.discipline_name}|${e.semester_number}|${e.professor_name}`;if(!groups.has(key))groups.set(key,{code:e.discipline_code,name:e.discipline_name,semester:e.semester_number,professor:e.professor_name,rows:[]});groups.get(key).rows.push(e);}
  return [...groups.values()];
}
function formatClass(group,{showProfessor=false}={}){
  const label=[group.code,group.name].filter(Boolean).join(' - '); const lines=[`*${label}${group.semester?` — ${group.semester}º semestre`:''}*`];
  if(showProfessor)lines.push(`• *Professor:* ${group.professor}`);
  for(const e of group.rows.sort((a,b)=>Number(a.day_of_week)-Number(b.day_of_week)||Number(a.start_minutes)-Number(b.start_minutes))){
    lines.push(`• *Dia:* ${String(e.day_label||'').toLowerCase()}`); lines.push(`• *Horário:* ${e.hours_label||'não cadastrado'}`); lines.push(`• *Sala:* *${e.room||'não cadastrada'}*`);
  }
  return lines.join('\n');
}
function formatProfessorFullCard({teacher={},entries=[],academicPeriod=''}={}){
  const name=teacher.name||entries[0]?.professor_name||'Professor'; const email=teacher.email||entries[0]?.professor_email||'';
  const semesters=unique(entries.map(e=>`${e.semester_number}º semestre`));
  const lines=[`*${name}*`,'', '*Contato*', email||'E-mail ainda não cadastrado.','', '*Semestres*', semesters.length?semesters.join(', '):'Nenhum semestre cadastrado.','',`*Horários e salas — ${academicPeriod||entries[0]?.academic_period||'período atual'}*`,''];
  const classes=groupClasses(entries); lines.push(classes.length?classes.map(g=>formatClass(g)).join('\n\n'):'Nenhuma aula cadastrada para o período.');
  return lines.join('\n').trim()+sourceFooter(entries);
}
function formatSemesterOverviewCard({semester,entries=[],academicPeriod=''}={}){
  const lines=[`*${semester}º semestre — aulas, horários e salas*`,`Período: ${academicPeriod||entries[0]?.academic_period||'atual'}`,''];
  const byDay=new Map();for(const e of entries){const day=e.day_label||DAY_ORDER[e.day_of_week]||'Dia';if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(e);}
  const ordered=[...byDay.entries()].sort((a,b)=>Number(a[1][0]?.day_of_week)-Number(b[1][0]?.day_of_week));
  for(const [day,rows] of ordered){lines.push(`*${day}*`);for(const e of rows.sort((a,b)=>Number(a.start_minutes)-Number(b.start_minutes))){const d=[e.discipline_code,e.discipline_name].filter(Boolean).join(' - ');lines.push(`• *Disciplina:* ${d}`);lines.push(`  *Professor:* ${e.professor_name}`);lines.push(`  *Horário:* ${e.hours_label}`);lines.push(`  *Sala:* *${e.room||'não cadastrada'}*`);}lines.push('');}
  if(!entries.length)lines.push('Nenhuma aula cadastrada para este semestre.');
  return lines.join('\n').trim()+sourceFooter(entries);
}
function formatDisciplineFullCard({entries=[],academicPeriod=''}={}){
  if(!entries.length)return 'Não há informações estruturadas cadastradas para essa disciplina.';
  const first=entries[0]; const title=[first.discipline_code,first.discipline_name].filter(Boolean).join(' - ');
  const lines=[`*${title}*`,`Período: ${academicPeriod||first.academic_period}`,''];
  for(const g of groupClasses(entries))lines.push(formatClass(g,{showProfessor:true}),'');
  return lines.join('\n').trim()+sourceFooter(entries);
}
function isSameProfessor(entry,name){return normalizeText(entry.professor_name)===normalizeText(name);}
module.exports={formatProfessorFullCard,formatSemesterOverviewCard,formatDisciplineFullCard,isSameProfessor};
