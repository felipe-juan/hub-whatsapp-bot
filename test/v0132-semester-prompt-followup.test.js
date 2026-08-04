'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { createMessageAdapter } = require('../src/baileys-adapter');

function holder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0132-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', quote_replies: 'true', contextual_followup_seconds: '300' });
  return { dir, db, close(){ db.close(); fs.rmSync(dir,{recursive:true,force:true}); } };
}

function fakeMessage(body, {
  from='grupo@g.us', author='5511999999999@s.whatsapp.net', authorAliases=[],
  quotedFromMe=false, quotedMessageId='', sendId='bot-prompt-1', timestampMs=Date.UTC(2026,7,3,15)
}={}) {
  const replies=[];
  return { replies, message: {
    fromMe:false, from, author, authorAliases, body, timestampMs, senderName:'Pessoa',
    hasQuotedMessage:Boolean(quotedMessageId), quotedFromMe, quotedMessageId,
    async react(){}, async reply(text){ replies.push(String(text)); return {key:{id:sendId}}; },
    async sendResponse(payload){ replies.push(String(payload.text||'')); return {key:{id:sendId}}; },
    async getChat(){ return {isGroup:from.endsWith('@g.us'),name:'Grupo',id:{_serialized:from},async sendMessage(text){replies.push(String(text));return {key:{id:sendId}};}}; }
  }};
}

test('pedido de semestre aceita 5 semestre como a próxima mensagem da mesma usuária em grupo sem reply', async()=>{
  const h=holder();
  try {
    const engine=new BotEngine(h.db);
    const first=fakeMessage('.qual matéria tem hoje?',{author:'5511999999999@s.whatsapp.net',authorAliases:['123456789@lid','5511999999999@s.whatsapp.net']});
    await engine.handle(first.message);
    assert.match(first.replies[0],/Qual semestre/u);
    const second=fakeMessage('5 semestre',{author:'123456789@lid',authorAliases:['123456789@lid','5511999999999@s.whatsapp.net'],sendId:'bot-schedule-1'});
    await engine.handle(second.message);
    assert.equal(second.replies.length,1);
    assert.match(second.replies[0],/5º Semestre/u);
    assert.doesNotMatch(second.replies[0],/Qual semestre/u);
    engine.close();
  } finally { h.close(); }
});

test('reply ao pedido recupera contexto pelo ID mesmo se o identificador da autora mudar', async()=>{
  const h=holder();
  try {
    const engine=new BotEngine(h.db);
    const first=fakeMessage('.qual matéria tem amanhã?',{author:'5511999999999@s.whatsapp.net',authorAliases:['5511999999999@s.whatsapp.net'],sendId:'prompt-id-77'});
    await engine.handle(first.message);
    const second=fakeMessage('5º semestre',{author:'987654321@lid',authorAliases:['987654321@lid'],quotedFromMe:false,quotedMessageId:'prompt-id-77'});
    await engine.handle(second.message);
    assert.equal(second.replies.length,1);
    assert.match(second.replies[0],/5º Semestre/u);
    engine.close();
  } finally { h.close(); }
});

test('resposta inválida ao pedido não cai no fallback e explica formatos aceitos', async()=>{
  const h=holder();
  try {
    const engine=new BotEngine(h.db);
    const first=fakeMessage('qual matéria tem hoje?',{from:'5511999999999@s.whatsapp.net',author:'5511999999999@s.whatsapp.net'});
    await engine.handle(first.message);
    const second=fakeMessage('é o quinto mesmo',{from:'5511999999999@s.whatsapp.net',author:'5511999999999@s.whatsapp.net',sendId:'reprompt'});
    await engine.handle(second.message);
    assert.equal(second.replies.length,1);
    assert.match(second.replies[0],/Não consegui identificar o semestre/u);
    assert.match(second.replies[0],/`3`, `5` ou `8`/u);
    engine.close();
  } finally { h.close(); }
});

test('adaptador expõe aliases do autor e ID da mensagem citada',()=>{
  const raw={
    key:{remoteJid:'grupo@g.us',participantPn:'5511999999999@s.whatsapp.net',participant:'123456789@lid',id:'incoming'},
    messageTimestamp:1785769200,
    message:{extendedTextMessage:{text:'5 semestre',contextInfo:{stanzaId:'prompt-id',participant:'5511000000000@s.whatsapp.net',quotedMessage:{conversation:'Qual semestre?'}}}}
  };
  const adapter=createMessageAdapter({raw,socket:{user:{id:'5511000000000@s.whatsapp.net'},sendMessage(){}},metadataCache:new Map()});
  assert.deepEqual(adapter.authorAliases,['5511999999999@s.whatsapp.net','123456789@lid']);
  assert.equal(adapter.quotedMessageId,'prompt-id');
  assert.equal(adapter.quotedFromMe,true);
});
