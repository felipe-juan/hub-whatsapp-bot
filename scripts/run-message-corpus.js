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
async function evaluate(text, context = {}) {
  // O corpus de mensagens mede identificação do domínio, não a camada de
  // conversa privada que oferece ajuda genérica para qualquer frase desconhecida.
  // Fluxos conversacionais são validados separadamente pelo corpus de diálogos.
  const evaluation = engine.evaluate(text, {
    isGroup: false,
    ignorePermissions: true,
    includeDrafts: false,
    now: Date.now(),
    sessionId: context.sessionId
  });
  return {
    matched: Boolean(evaluation?.matched),
    text: evaluation?.matched ? String(evaluation.text || evaluation.matchedItem || evaluation.type || 'correspondência') : '',
    type: String(evaluation?.type || ''),
    intent: String(evaluation?.detectedIntent || evaluation?.queryModel?.intents?.[0] || ''),
    sessionId: context.sessionId
  };
}
(async()=>{try{const report=await runCorpus({corpus:loadCorpus(),evaluate});console.log(JSON.stringify({...report,results:report.results.map(r=>({message:r.message,expected:r.expected_respond,actual:r.actual_respond,intent:r.actual_intent,ms:r.elapsed_ms,ok:r.response_correct}))},null,2));if(report.failed)process.exitCode=1;}finally{engine.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exit(1);});
