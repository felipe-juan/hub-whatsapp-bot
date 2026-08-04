'use strict';
const { normalizeText } = require('./text');
const WORDS={primeiro:1,segundo:2,terceiro:3,quarto:4,quinto:5,sexto:6,setimo:7,sétimo:7,oitavo:8};
const ROMANS={i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8};
function parseOverviewSemester(text=''){
  const n=normalizeText(text);let m=n.match(/\b([1-8])(?:o|º)?\s*semestre\b|\bsemestre\s*([1-8])\b/u);if(m)return Number(m[1]||m[2]);
  m=n.match(/\bsemestre\s+(viii|vii|vi|iv|v|iii|ii|i)\b|\b(viii|vii|vi|iv|v|iii|ii|i)\s+semestre\b/u);if(m)return ROMANS[m[1]||m[2]]||0;
  for(const [word,num] of Object.entries(WORDS))if(new RegExp(`\\b${normalizeText(word)}\\s+semestre\\b`,'u').test(n))return num;return 0;
}
function isSemesterOverviewRequest(text=''){
  const n=normalizeText(text).replace(/\?+$/u,'').trim();const semester=parseOverviewSemester(n);if(!semester)return null;
  // Consultas temporais pertencem ao manipulador de grade diária.
  if(/\b(?:hoje|amanha|agora|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/u.test(n))return null;
  if(/^(?:semestre\s*(?:[1-8]|viii|vii|vi|iv|v|iii|ii|i)|(?:[1-8](?:o)?|viii|vii|vi|iv|v|iii|ii|i)\s*semestre|(?:primeiro|segundo|terceiro|quarto|quinto|sexto|setimo|oitavo)\s*semestre)$/u.test(n))return semester;
  return /\b(?:aulas|horarios|salas|grade|quadro|materias|disciplinas)\b/u.test(n)?semester:null;
}
module.exports={parseOverviewSemester,isSemesterOverviewRequest};
