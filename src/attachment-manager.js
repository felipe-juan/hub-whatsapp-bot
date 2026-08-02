const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_SIZE = 25 * 1024 * 1024;
const SAFE_MIME = /^(image\/(?:jpeg|png|gif|webp)|audio\/(?:mpeg|ogg|wav|mp4|aac|opus)|application\/(?:pdf|zip|msword|vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.oasis\.opendocument\.(?:text|spreadsheet|presentation))|text\/(?:plain|csv))$/i;
const EXT_BY_MIME = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/opus': '.opus',
  'application/pdf': '.pdf', 'application/zip': '.zip', 'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.oasis.opendocument.text': '.odt', 'application/vnd.oasis.opendocument.spreadsheet': '.ods',
  'application/vnd.oasis.opendocument.presentation': '.odp', 'text/plain': '.txt', 'text/csv': '.csv'
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime]));

function cleanFileName(value) {
  const base = path.basename(String(value || 'arquivo')).replace(/[\x00-\x1f\x7f]/g, '').trim();
  return (base || 'arquivo').slice(0, 180);
}
function normalizeMime(fileName, mimeType) {
  const declared = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared;
  return MIME_BY_EXT[path.extname(cleanFileName(fileName)).toLowerCase()] || declared;
}
function kindFor(mime) {
  if (String(mime).startsWith('image/')) return 'image';
  if (String(mime).startsWith('audio/')) return 'audio';
  return 'document';
}


function fileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { flags: fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) });
    stream.on('data', chunk => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}
function statSignature(stat) {
  return { dev: Number(stat.dev || 0), ino: Number(stat.ino || 0), sizeBytes: Number(stat.size || 0), mtimeMs: Number(stat.mtimeMs || 0), ctimeMs: Number(stat.ctimeMs || 0) };
}
function sameSignature(cached, stat) {
  return Number(cached?.dev || 0) === Number(stat.dev || 0) && Number(cached?.ino || 0) === Number(stat.ino || 0)
    && Number(cached?.sizeBytes || 0) === Number(stat.size || 0) && Number(cached?.mtimeMs || 0) === Number(stat.mtimeMs || 0)
    && Number(cached?.ctimeMs || 0) === Number(stat.ctimeMs || 0);
}

class AttachmentManager {
  constructor({ dir, maxSize = MAX_SIZE }) {
    this.dir = path.resolve(dir);
    this.maxSize = Math.max(1024, Math.min(100 * 1024 * 1024, Number(maxSize || MAX_SIZE)));
    this.metadataCache = new Map();
    this.maxMetadataEntries = 200;
    this.ready = fs.promises.mkdir(this.dir, { recursive: true, mode: 0o700 });
  }

  validate({ fileName, mimeType, size }) {
    const mime = normalizeMime(fileName, mimeType);
    if (!SAFE_MIME.test(mime)) throw new Error('Tipo de arquivo não permitido. Use imagem, áudio, PDF ou documento comum.');
    const bytes = Number(size || 0);
    if (!Number.isFinite(bytes) || bytes < 1) throw new Error('O anexo está vazio.');
    if (bytes > this.maxSize) throw new Error(`O anexo excede o limite de ${Math.floor(this.maxSize / 1024 / 1024)} MiB.`);
    return { fileName: cleanFileName(fileName), mimeType: mime, sizeBytes: bytes };
  }

  async save(buffer, info) {
    if (!Buffer.isBuffer(buffer)) throw new Error('Conteúdo do anexo inválido.');
    await this.ready;
    const validated = this.validate({ ...info, size: buffer.length });
    const sourceExt = path.extname(validated.fileName).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 10);
    const ext = (EXT_BY_MIME[validated.mimeType] || sourceExt || '').toLowerCase();
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const storedName = `${contentHash}${ext}`;
    const tempPath = path.join(this.dir, `.${storedName}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    const finalPath = path.join(this.dir, storedName);
    let existing = false;
    try {
      const stat = await fs.promises.lstat(finalPath);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size === buffer.length) existing = (await fileSha256(finalPath)) === contentHash;
    } catch {}
    if (!existing) {
      await fs.promises.writeFile(tempPath, buffer, { mode: 0o600, flag: 'wx' });
      try { await fs.promises.rename(tempPath, finalPath); }
      catch (error) {
        await fs.promises.rm(tempPath, { force: true }).catch(() => {});
        const raced = await fs.promises.lstat(finalPath).then(stat => stat.isFile() && !stat.isSymbolicLink() && stat.size === buffer.length).catch(() => false);
        if (!raced) throw error;
      }
    }
    const finalStat = await fs.promises.lstat(finalPath);
    this.metadataCache.set(storedName, { path: finalPath, ...statSignature(finalStat), modifiedAt: finalStat.mtime.toISOString(), cachedAt: Date.now(), contentHash });
    this.trimMetadataCache();
    return { stored_name: storedName, file_name: validated.fileName, mime_type: validated.mimeType, size_bytes: validated.sizeBytes, kind: kindFor(validated.mimeType), content_hash: contentHash, deduplicated: existing };
  }

  trimMetadataCache() {
    while (this.metadataCache.size > this.maxMetadataEntries) this.metadataCache.delete(this.metadataCache.keys().next().value);
  }

  cacheKey(attachment) { return path.basename(String(attachment?.stored_name || '')); }

  candidatePath(attachment) {
    const stored = path.basename(String(attachment?.stored_name || ''));
    if (!stored || stored !== String(attachment?.stored_name || '')) return null;
    return path.join(this.dir, stored);
  }

  async resolve(attachment) {
    const key = this.cacheKey(attachment);
    const filePath = this.candidatePath(attachment);
    if (!filePath) return null;
    const expectedHash = /^[a-f0-9]{64}$/i.test(String(attachment?.content_hash || ''))
      ? String(attachment.content_hash).toLowerCase()
      : (/^[a-f0-9]{64}/i.exec(key || '')?.[0] || '').toLowerCase();
    try {
      const stat = await fs.promises.lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) { this.metadataCache.delete(key); return null; }
      const cached = key ? this.metadataCache.get(key) : null;
      // Arquivos endereçados por conteúdo são verificados em cada resolução.
      // Alguns sistemas de arquivos preservam inode, tamanho e timestamps quando
      // uma substituição ocorre no mesmo instante; somente o hash detecta isso.
      if (!expectedHash && cached && sameSignature(cached, stat)) {
        this.metadataCache.delete(key); this.metadataCache.set(key, { ...cached, cachedAt: Date.now() });
        return filePath;
      }
      const actualHash = expectedHash ? await fileSha256(filePath) : '';
      if (expectedHash && actualHash !== expectedHash) { this.metadataCache.delete(key); return null; }
      this.metadataCache.set(key, { path: filePath, ...statSignature(stat), modifiedAt: stat.mtime.toISOString(), cachedAt: Date.now(), contentHash: actualHash || expectedHash });
      this.trimMetadataCache();
      return filePath;
    } catch { this.metadataCache.delete(key); return null; }
  }

  async metadata(attachment) {
    const key = this.cacheKey(attachment);
    const filePath = await this.resolve(attachment);
    if (!filePath) return null;
    const cached = this.metadataCache.get(key);
    if (cached) return { path: cached.path, sizeBytes: cached.sizeBytes, modifiedAt: cached.modifiedAt };
    const stat = await fs.promises.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return { path: filePath, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
  }

  async remove(attachment) {
    // O mesmo arquivo pode ser referenciado por vários cartões após a
    // deduplicação. A remoção imediata poderia quebrar outra resposta; o arquivo
    // fica órfão e é eliminado com segurança pelo cleanup após conferir todas as referências.
    const key = this.cacheKey(attachment);
    const exists = Boolean(await this.resolve(attachment));
    this.metadataCache.delete(key);
    return exists;
  }

  async cleanup(referencedNames = new Set(), { olderThanMs = 7 * 86400000 } = {}) {
    await this.ready;
    let deleted = 0;
    const entries = await fs.promises.readdir(this.dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.') || referencedNames.has(entry.name)) continue;
      const filePath = path.join(this.dir, entry.name);
      try {
        const stat = await fs.promises.lstat(filePath);
        if (!stat.isFile() || stat.isSymbolicLink()) continue;
        if (Date.now() - stat.mtimeMs < olderThanMs) continue;
        await fs.promises.rm(filePath, { force: true }); this.metadataCache.delete(entry.name); deleted += 1;
      } catch {}
    }
    return deleted;
  }
}

module.exports = { AttachmentManager, MAX_SIZE, SAFE_MIME, normalizeMime, fileSha256 };
