const { appendSourceMetadata } = require('./responses');
const CAPTION_SAFE_LIMIT = 900;
const CAPTION_HARD_LIMIT = 1024;
function captionAnalysis(input = {}) {
  const response = String(input.response_text || '').trim();
  const sourceBlock = appendSourceMetadata('', input).trim();
  const combined = appendSourceMetadata(response, input);
  const total = combined.length;
  return {
    responseCharacters: response.length,
    sourceCharacters: sourceBlock.length,
    totalCharacters: total,
    safeLimit: CAPTION_SAFE_LIMIT,
    hardLimit: CAPTION_HARD_LIMIT,
    hasAttachment: Boolean(input.attachment),
    status: total > CAPTION_HARD_LIMIT ? 'blocked' : total > CAPTION_SAFE_LIMIT ? 'warning' : 'safe',
    suggestion: total > CAPTION_SAFE_LIMIT ? 'Encurte a resposta principal ou remova o anexo.' : ''
  };
}
module.exports = { CAPTION_SAFE_LIMIT, CAPTION_HARD_LIMIT, captionAnalysis };
