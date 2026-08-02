let RE2JS = null;
try {
  ({ RE2JS } = require('re2js'));
} catch {}

const ALLOWED_FLAGS = new Set(['i', 'm', 'u']);

function normalizeFlags(flags = 'i') {
  return [...new Set(String(flags || 'i').split('').filter(flag => ALLOWED_FLAGS.has(flag)))].join('') || 'i';
}

function hasNestedQuantifier(value) {
  // Bloqueia grupos quantificados que já contêm quantificadores. Além de ser
  // desnecessário para os gatilhos do painel, esse formato é a causa clássica
  // de backtracking catastrófico em engines nativas: (.*)+, (a+)+, (x{1,3})*.
  return /\((?:[^()\\]|\\.)*(?:[+*]|\{\d+(?:,\d*)?\})(?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+(?:,\d*)?\})/.test(value);
}

function assertSafeSyntax(pattern, flags = 'i') {
  const value = String(pattern || '').trim();
  if (!value) return { pattern: '', flags: normalizeFlags(flags) };
  if (value.length > 300) throw new Error('A expressão regular deve ter no máximo 300 caracteres.');
  if (/[^imu]/.test(String(flags || ''))) throw new Error('Use somente as opções i, m e u na expressão regular.');
  if (hasNestedQuantifier(value)) throw new Error('Expressão regular recusada por risco de processamento excessivo. Evite quantificadores aninhados.');
  if (/\\[1-9]/.test(value) || /\(\?<([=!])/.test(value) || /\(\?<[A-Za-z][A-Za-z0-9_]*>/.test(value)) {
    throw new Error('A expressão usa recurso incompatível com o mecanismo seguro RE2.');
  }
  if (/\(\?>/.test(value) || /\(\?\(/.test(value)) throw new Error('A expressão usa grupo avançado incompatível com RE2.');
  return { pattern: value, flags: normalizeFlags(flags) };
}

function re2Options(flags) {
  if (!RE2JS) return 0;
  let options = 0;
  if (flags.includes('i')) options |= Number(RE2JS.CASE_INSENSITIVE || 0);
  if (flags.includes('m')) options |= Number(RE2JS.MULTILINE || 0);
  // RE2JS trabalha com Unicode por padrão. A opção `u` é aceita no painel para
  // compatibilidade com a sintaxe anterior, sem precisar de uma flag extra.
  return options;
}

function compileSafeRegex(pattern, flags = 'i') {
  const checked = assertSafeSyntax(pattern, flags);
  if (!checked.pattern) return null;
  if (RE2JS?.compile) {
    try {
      const compiled = RE2JS.compile(checked.pattern, re2Options(checked.flags));
      return Object.freeze({
        engine: 're2js', pattern: checked.pattern, flags: checked.flags,
        test(value) {
          const matcher = compiled.matcher(String(value || ''));
          return matcher.find();
        }
      });
    } catch (error) {
      throw new Error(`Expressão regular incompatível com RE2: ${error.message}`);
    }
  }
  // Fallback restrito somente para desenvolvimento/testes antes do npm install.
  // A instalação oficial inclui re2js e nunca depende desta engine em produção.
  if (process.env.NODE_ENV === 'production') throw new Error('Mecanismo seguro RE2JS indisponível. Reinstale as dependências do bot.');
  let regex;
  try { regex = new RegExp(checked.pattern, checked.flags); }
  catch (error) { throw new Error(`Expressão regular inválida: ${error.message}`); }
  return Object.freeze({
    engine: 'native-restricted', pattern: checked.pattern, flags: checked.flags,
    test(value) { regex.lastIndex = 0; return regex.test(String(value || '')); }
  });
}

function safeRegexEngineName() { return RE2JS?.compile ? 're2js' : 'native-restricted'; }

module.exports = { compileSafeRegex, assertSafeSyntax, normalizeFlags, safeRegexEngineName, hasNestedQuantifier };
