'use strict';

const { parseDelimited } = require('./professor-schedule-import');
const { normalizeText } = require('./text');

const TYPE_ALIASES = new Map([
  ['sem aulas','no_classes'],['suspensao','no_classes'],['suspensao total','no_classes'],['no_classes','no_classes'],
  ['recesso','recess'],['recess','recess'],['suspensao parcial','partial_no_classes'],['partial_no_classes','partial_no_classes'],
  ['aviso','warning'],['warning','warning'],['dia letivo de reposicao','replacement_day'],['replacement_day','replacement_day'],
  ['mudanca de sala','room_change'],['mudanca temporaria de sala','room_change'],['room_change','room_change'],
  ['reposicao de aula','class_replacement'],['class_replacement','class_replacement']
]);
const DAY_ALIASES = new Map([
  ['domingo',0],['dom',0],['segunda',1],['segunda feira',1],['seg',1],['terca',2],['terca feira',2],['ter',2],
  ['quarta',3],['quarta feira',3],['qua',3],['quinta',4],['quinta feira',4],['qui',4],['sexta',5],['sexta feira',5],['sex',5],['sabado',6],['sab',6]
]);
function key(value) { return normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function parseDate(value) {
  const raw=String(value||'').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:'';
}
function parseMinutes(value) { const m=String(value||'').trim().match(/^(\d{1,2})(?::|h)(\d{2})$/i); return m?Number(m[1])*60+Number(m[2]):null; }
function parseNumbers(value) { return [...new Set(String(value||'').split(/[,;|\s]+/).map(v=>Number(String(v).replace(/\D/g,''))).filter(v=>v>=1&&v<=8))]; }
function parseWeekdays(value) { return [...new Set(String(value||'').split(/[,;|]+/).map(v=>DAY_ALIASES.get(normalizeText(v).replace(/-/g,' '))).filter(v=>Number.isInteger(v)))].sort((a,b)=>a-b); }
function bool(value, fallback=true){const n=normalizeText(value);if(!n)return fallback;return ['1','true','sim','yes','ativo','ativa'].includes(n);}

function parseAcademicCalendarCsv(text) {
  const rows=parseDelimited(text);
  if(rows.length<2)throw new Error('O CSV precisa de cabeçalho e ao menos uma linha.');
  const aliases={tipo:'event_type',event_type:'event_type',data_inicial:'start_date',inicio:'start_date',start_date:'start_date',data_final:'end_date',fim:'end_date',end_date:'end_date',titulo:'title',title:'title',descricao:'description',description:'description',curso:'course',semestres:'semester_numbers',semestre:'semester_numbers',disciplina:'discipline_code',sigla:'discipline_code',professor:'professor_name',sala_anterior:'old_room',nova_sala:'new_room',dia_de_reposicao:'replacement_day_of_week',usar_horario_de:'replacement_day_of_week',hora_inicial:'start_minutes',hora_final:'end_minutes',recorrencia:'recurrence_type',dias_da_semana:'recurrence_weekdays',intervalo_semanas:'recurrence_interval',url_fonte:'source_url',fonte:'source_title',responsavel:'responsible',responsável:'responsible',verificada_em:'verified_at',ativo:'active'};
  const headers=rows[0].map(v=>aliases[key(v)]||key(v));
  const events=[];const errors=[];
  rows.slice(1).forEach((values,index)=>{
    const line=index+2;const data=Object.fromEntries(headers.map((h,i)=>[h,String(values[i]||'').trim()]));
    const type=TYPE_ALIASES.get(normalizeText(data.event_type))||data.event_type;
    const start=parseDate(data.start_date);const end=parseDate(data.end_date||data.start_date);
    if(!type||!start||!end||!data.title){errors.push({line,error:'Tipo, data inicial, data final e título são obrigatórios.'});return;}
    const replacement=DAY_ALIASES.get(normalizeText(data.replacement_day_of_week).replace(/-/g,' '));
    const weekdays=parseWeekdays(data.recurrence_weekdays);
    const recurrence=weekdays.length||normalizeText(data.recurrence_type)==='semanal'||normalizeText(data.recurrence_type)==='weekly'?'weekly':'none';
    events.push({event_type:type,start_date:start,end_date:end,title:data.title,description:data.description||'',course:data.course||'bsi',semester_numbers:parseNumbers(data.semester_numbers),discipline_code:data.discipline_code||'',professor_name:data.professor_name||'',old_room:data.old_room||'',new_room:data.new_room||'',replacement_day_of_week:Number.isInteger(replacement)?replacement:null,start_minutes:parseMinutes(data.start_minutes),end_minutes:parseMinutes(data.end_minutes),recurrence_type:recurrence,recurrence_weekdays:weekdays,recurrence_interval:Math.max(1,Number(data.recurrence_interval||1)),source_url:data.source_url||'',source_title:data.source_title||'',responsible:data.responsible||'',verified_at:parseDate(data.verified_at),active:bool(data.active,true),source_line:line});
  });
  return {events,errors,sourceRows:rows.length-1};
}
module.exports={parseAcademicCalendarCsv,parseDate,parseWeekdays};
