#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { loadCorpus, runCorpus } = require('../src/corpus-runner');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-corpus-'));
const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
const engine = new BotEngine(db);
const user = '5577999999999@s.whatsapp.net';
function message(body, replies) { return { fromMe:false,from:user,author:user,body,senderName:'Corpus',timestampMs:Date.now(),quotedFromMe:false,mentionedMe:false,
  async getChat(){return {isGroup:false,id:{_serialized:user},name:'Corpus'};}, async sendResponse(payload){replies.push(String(payload?.text||'')); return {key:{id:`corpus-${replies.length}`}};} }; }
async function evaluate(text) { const replies=[]; await engine.handle(message(text,replies)); const type=engine.metrics.lastMatchType||''; const fallback=['private_unknown','unknown_mention'].includes(type); return { matched:replies.length>0&&!fallback, text:fallback?'':(replies.at(-1)||''), type }; }
(async()=>{try{const report=await runCorpus({corpus:loadCorpus(),evaluate});console.log(JSON.stringify({...report,results:report.results.map(r=>({message:r.message,expected:r.expected_respond,actual:r.actual_respond,intent:r.actual_intent,ms:r.elapsed_ms,ok:r.response_correct}))},null,2));if(report.failed)process.exitCode=1;}finally{engine.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exit(1);});
