'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { classifyProfessorLocationRequest, findTeacherMatches } = require('../src/professor-location');
const { runConsistencyCheck } = require('../src/consistency-checker');
const { encryptFile } = require('../src/external-backup-manager');

function holder(seed = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0130-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: seed });
  db.setSettings({ cooldown_seconds: '0', contextual_followup_seconds: '300', private_context_without_reply: 'true' });
  return { dir, db, close(){db.close();fs.rmSync(dir,{recursive:true,force:true});} };
}

test('contexto curto sem reply funciona no privado e continua exigindo reply em grupos', () => {
  const h=holder();
  try {
    const engine=new BotEngine(h.db);
    const privateMessage={from:'user@s.whatsapp.net',author:'user@s.whatsapp.net',quotedFromMe:false,timestampMs:Date.UTC(2026,7,3,15)};
    const key=engine.conversationKey(privateMessage);
    engine.conversationContexts.set(key,{kind:'semester_schedule',title:'BSI — Aulas por semestre e dia',targetDate:'2026-08-03',dayIndex:1,semester:3,expiresAt:Date.now()+60000});
    const privateResult=engine.contextualFollowUpEvaluation(privateMessage,'e sexta?',h.db.getSettings());
    assert.equal(privateResult?.matched,true);
    assert.equal(privateResult.contextSubject.semester,3);
    assert.match(privateResult.text,/Sexta-Feira/u);
    const groupMessage={from:'grupo@g.us',author:'user@s.whatsapp.net',isGroup:true,quotedFromMe:false,timestampMs:privateMessage.timestampMs};
    engine.conversationContexts.set(engine.conversationKey(groupMessage),{kind:'semester_schedule',targetDate:'2026-08-03',dayIndex:1,semester:3,expiresAt:Date.now()+60000});
    assert.equal(engine.contextualFollowUpEvaluation(groupMessage,'e sexta?',h.db.getSettings()),null);
    groupMessage.quotedFromMe=true;
    assert.equal(engine.contextualFollowUpEvaluation(groupMessage,'e sexta?',h.db.getSettings())?.matched,true);
    engine.close();
  } finally {h.close();}
});

test('gatilhos curtos de contato da coordenação retornam o card completo do CSI', () => {
  const h=holder();
  try {
    const engine=new BotEngine(h.db);
    for (const phrase of ['contato coordenador','contato coordenação','qual é o contato do coordenador']) {
      const result=engine.evaluate(phrase,{isGroup:false,ignorePermissions:true});
      assert.equal(result?.matched,true,phrase);
      assert.equal(result.matchedItem,'BSI — Contato da coordenação');
      assert.match(result.text,/csi\.vdc@ifba\.edu\.br/u);
    }
    engine.close();
  } finally {h.close();}
});

test('qual sala de professor abre o card docente e Pablo não é confundido com Paulo', () => {
  const teachers=[
    {id:1,name:'Pablo Freire Matos',aliases:['pablo'],active:true},
    {id:2,name:'Paulo Santos',aliases:['paulo'],active:true},
    {id:3,name:'Vivyane Lima',aliases:['vivyane'],active:true},
    {id:4,name:'Viviane Souza',aliases:['viviane'],active:true},
    {id:5,name:'João Silva',aliases:['joao'],active:true},
    {id:6,name:'João Souza',aliases:['joao'],active:true}
  ];
  const request=classifyProfessorLocationRequest('qual sala de pablo',teachers);
  assert.equal(request.matched,false);
  assert.equal(request.reason,'handled-by-professor-card');
  const pablo=findTeacherMatches('qual sala de pablo',teachers);
  assert.equal(pablo.length,1);
  assert.equal(pablo[0].teacher.name,'Pablo Freire Matos');
  const viv=findTeacherMatches('qual sala da professora viviane',teachers);
  assert.equal(viv.length,1); // correspondência exata tem precedência
  const sameFirstName=findTeacherMatches('qual sala do professor joao',teachers);
  assert.equal(sameFirstName.length,2); // primeiro nome realmente idêntico permanece ambíguo
});

test('consistência detecta e-mail, sigla, sala, sobreposições, anexo e exceção inválidos', () => {
  const h=holder(false);const attachments=path.join(h.dir,'attachments');fs.mkdirSync(attachments);
  try {
    h.db.saveTeacher({name:'Professor Sem Email',email:'',active:true});
    const common={academic_period:'2026.2',semester_number:3,day_of_week:1,start_minutes:1110,end_minutes:1210,active:true};
    h.db.saveProfessorScheduleEntry({...common,professor_name:'Professor Sem Email',discipline_name:'Disciplina A',discipline_code:'',room:''});
    h.db.saveTeacher({name:'Outro Professor',email:'outro@ifba.edu.br',active:true});
    h.db.saveProfessorScheduleEntry({...common,professor_name:'Outro Professor',professor_email:'outro@ifba.edu.br',discipline_name:'Disciplina B',discipline_code:'DB',room:'H100'});
    h.db.saveTeacher({name:'Terceiro Professor',email:'terceiro@ifba.edu.br',active:true});
    h.db.saveProfessorScheduleEntry({...common,professor_name:'Terceiro Professor',professor_email:'terceiro@ifba.edu.br',discipline_name:'Disciplina C',discipline_code:'DC',room:'H100',semester_number:4});
    const card=h.db.saveAutomaticMessage({title:'Card com anexo ausente',response_text:'Teste',active:true,trigger:{sentences:['teste anexo']},attachment:{kind:'image',stored_name:'faltando.png',file_name:'faltando.png'}});
    assert.ok(card.id);
    h.db.saveAcademicCalendarEvent({event_type:'room_change',start_date:'2026-08-10',end_date:'2026-08-10',title:'Mudança desconhecida',discipline_code:'XYZ',new_room:'H999',active:true});
    const report=runConsistencyCheck(h.db,{attachmentsDir:attachments});
    const types=new Set(report.items.map(i=>i.type));
    for(const type of ['professor_email','discipline_code','room','room_overlap','semester_overlap','missing_attachment','unknown_exception_discipline']) assert.equal(types.has(type),true,type);
  } finally {h.close();}
});

test('editor estruturado atualiza card docente, registra histórico e permite reversão', () => {
  const h=holder();
  try {
    const entry=h.db.listProfessorScheduleEntries({academicPeriod:'2026.2'}).find(item=>item.room);
    assert.ok(entry);
    const originalRoom=entry.room;
    const changed=h.db.saveProfessorScheduleEntry({...entry,room:'H999'},entry.id);
    assert.equal(changed.room,'H999');
    const card=h.db.listAutomaticMessages().find(item=>item.title===`Professor — ${entry.professor_name}`);
    assert.match(card.response_text,/H999/u);
    const history=h.db.listChangeHistory({entityType:'schedule_entry',entityId:String(entry.id)});
    assert.ok(history.length);
    h.db.revertChangeHistory(history[0].id);
    assert.equal(h.db.getProfessorScheduleEntry(entry.id).room,originalRoom);
  } finally {h.close();}
});

test('backup externo usa contêiner criptografado e painel expõe gestão completa', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hub-encrypt-'));const source=path.join(dir,'plain.zip');const target=path.join(dir,'plain.zip.enc');
  try {
    fs.writeFileSync(source,Buffer.from('conteúdo sensível'));
    await encryptFile(source,target,'uma-frase-secreta-bastante-longa');
    const encrypted=fs.readFileSync(target);
    assert.equal(encrypted.subarray(0,7).toString(),'HUBENC1');
    assert.equal(encrypted.includes(Buffer.from('conteúdo sensível')),false);
    const root=path.join(__dirname,'..');
    const index=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
    const ui=fs.readFileSync(path.join(root,'public','js','management.js'),'utf8');
    const server=fs.readFileSync(path.join(root,'src','admin-server.js'),'utf8');
    const updater=fs.readFileSync(path.join(root,'src','update-manager.js'),'utf8');
    assert.match(index,/data-view="management"/u);
    for(const fragment of ['/api/consistency','/api/system/restart','/api/system/test-send','/api/change-history','/api/external-backups','/api/update/remote']) assert.match(server,new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'u'));
    assert.match(ui,/Editor estruturado/u);
    assert.match(updater,/rollback/u);
    assert.match(updater,/hub-whatsapp-bot-control/u);
    assert.doesNotMatch(updater,/else service_is_active/u);
    const externalManager=fs.readFileSync(path.join(root,'src','external-backup-manager.js'),'utf8');
    assert.match(externalManager,/finally\{this\.schedule\(\);\}/u);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
