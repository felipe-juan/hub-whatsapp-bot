const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const dataDir = path.join(root, 'data');

fs.mkdirSync(dataDir, { recursive: true });

if (fs.existsSync(envPath)) {
  console.log('O arquivo .env já existe. Nada foi sobrescrito.');
  process.exit(0);
}

const password = crypto.randomBytes(12).toString('base64url');
const content = `# Gerado por npm run setup\nADMIN_PASSWORD="${password}"\nADMIN_HOST="127.0.0.1"\nADMIN_PORT="3210"\nSESSION_HOURS="12"\nGROUP_TOUCH_INTERVAL_SECONDS="600"\nTRAY_POLL_SECONDS="10"\nDATA_DIR="./data"\n`;

fs.writeFileSync(envPath, content, { mode: 0o600 });

console.log('Configuração inicial criada em .env');
console.log('Painel: http://127.0.0.1:3210');
console.log(`Senha inicial: ${password}`);
console.log('Guarde essa senha. Você pode alterá-la diretamente no arquivo .env.');
