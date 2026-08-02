const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const MAX_IPC_FRAME_BYTES = 1024 * 1024;
function encode(message) { return `${JSON.stringify(message)}\n`; }
function safeSocketWrite(socket, message) {
  if (!socket || socket.destroyed || !socket.writable) return false;
  let payload;
  try { payload = encode(message); } catch { return false; }
  const bytes = Buffer.byteLength(payload);
  if (bytes > MAX_IPC_FRAME_BYTES || Number(socket.writableLength || 0) + bytes > MAX_IPC_FRAME_BYTES) {
    try { socket.destroy(new Error('Quadro IPC excedeu o limite seguro.')); } catch {}
    return false;
  }
  try {
    socket.write(payload, error => { if (error) socket.destroy(); });
    return true;
  } catch { return false; }
}

async function socketPathIsActive(socketPath, timeoutMs = 400) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    const finish = (error, active) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error); else resolve(active);
    };
    const timer = setTimeout(() => finish(new Error('Não foi possível confirmar se o socket IPC existente está inativo.')), timeoutMs);
    timer.unref?.();
    socket.once('connect', () => finish(null, true));
    socket.once('error', error => {
      if (['ECONNREFUSED', 'ENOENT'].includes(error?.code)) finish(null, false);
      else finish(error);
    });
  });
}

async function prepareSocketPath(socketPath) {
  const stat = await fs.promises.lstat(socketPath).catch(error => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return;
  if (!stat.isSocket()) throw new Error('O caminho IPC já existe e não é um socket; ele não será removido automaticamente.');
  if (await socketPathIsActive(socketPath)) throw new Error('Já existe uma instância ativa do HUB WhatsApp Bot usando o socket IPC.');
  await fs.promises.rm(socketPath, { force: true });
}

class CoreIpcServer {
  constructor({ socketPath, handlers = {}, realtime = null } = {}) {
    this.socketPath = socketPath;
    this.handlers = handlers;
    this.realtime = realtime;
    this.server = null;
    this.clients = new Set();
    this.unsubscribeRealtime = null;
    this.ownsSocket = false;
    this.socketIdentity = null;
  }

  async start() {
    if (this.server?.listening) return;
    await fs.promises.mkdir(path.dirname(this.socketPath), { recursive: true, mode: 0o700 });
    await prepareSocketPath(this.socketPath);
    const server = net.createServer(socket => this.accept(socket));
    this.server = server;
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.socketPath, () => { server.off('error', reject); resolve(); });
      });
    } catch (error) {
      if (this.server === server) this.server = null;
      try { server.close(); } catch {}
      throw error;
    }
    this.ownsSocket = true;
    this.socketIdentity = await fs.promises.lstat(this.socketPath)
      .then(stat => ({ dev: stat.dev, ino: stat.ino })).catch(() => null);
    server.on('error', error => console.error('Falha no servidor IPC:', error.message));
    await fs.promises.chmod(this.socketPath, 0o600).catch(() => {});
    this.unsubscribeRealtime = this.realtime?.subscribe?.(event => this.broadcast({ kind: 'event', event })) || null;
  }

  accept(socket) {
    socket.setEncoding('utf8');
    socket.setNoDelay(true);
    this.clients.add(socket);
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_IPC_FRAME_BYTES) { socket.destroy(new Error('Quadro IPC excedeu o limite.')); return; }
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n');
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        this.handle(socket, message).catch(error => safeSocketWrite(socket, { kind: 'response', id: message?.id, error: error.message }));
      }
    });
    const close = () => this.clients.delete(socket);
    socket.on('close', close); socket.on('error', close);
    safeSocketWrite(socket, { kind: 'hello', pid: process.pid, at: new Date().toISOString() });
  }

  async handle(socket, message) {
    if (message?.kind !== 'request') return;
    const handler = this.handlers[message.type];
    if (typeof handler !== 'function') throw new Error(`Comando IPC desconhecido: ${message.type}`);
    const result = await handler(message.payload || {});
    if (!safeSocketWrite(socket, { kind: 'response', id: message.id, result })) {
      safeSocketWrite(socket, { kind: 'response', id: message.id, error: 'Resposta IPC grande demais ou conexão indisponível.' });
    }
  }

  broadcast(message) {
    for (const socket of this.clients) {
      if (!safeSocketWrite(socket, message)) { socket.destroy(); this.clients.delete(socket); }
    }
  }

  status() { return { socketPath: this.socketPath, clients: this.clients.size, listening: Boolean(this.server?.listening) }; }

  async close() {
    this.unsubscribeRealtime?.();
    this.unsubscribeRealtime = null;
    for (const socket of this.clients) socket.destroy();
    this.clients.clear();
    const server = this.server; this.server = null;
    const owned = this.ownsSocket; const identity = this.socketIdentity;
    this.ownsSocket = false; this.socketIdentity = null;
    if (server) await new Promise(resolve => server.close(resolve));
    if (owned) {
      const current = await fs.promises.lstat(this.socketPath).catch(() => null);
      if (current && (!identity || (current.dev === identity.dev && current.ino === identity.ino))) {
        await fs.promises.rm(this.socketPath, { force: true }).catch(() => {});
      }
    }
  }
}

class CoreIpcClient extends EventEmitter {
  constructor({ socketPath, reconnectMs = 1000 } = {}) {
    super();
    this.socketPath = socketPath;
    this.reconnectMs = reconnectMs;
    this.socket = null;
    this.pending = new Map();
    this.closed = false;
    this.reconnectTimer = null;
    this.latestEvent = null;
    this.connect();
  }

  connect() {
    if (this.closed || this.socket) return;
    const socket = net.createConnection(this.socketPath);
    this.socket = socket;
    socket.setEncoding('utf8'); socket.setNoDelay(true);
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_IPC_FRAME_BYTES) { socket.destroy(new Error('Quadro IPC excedeu o limite.')); return; }
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        try { this.handle(JSON.parse(line)); } catch {}
      }
    });
    let disconnectedHandled = false;
    const disconnected = () => {
      if (disconnectedHandled) return;
      disconnectedHandled = true;
      if (this.socket === socket) this.socket = null;
      for (const [id, request] of this.pending) { clearTimeout(request.timer); request.reject(new Error('Conexão IPC encerrada.')); this.pending.delete(id); }
      if (!this.closed) { clearTimeout(this.reconnectTimer); this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectMs); this.reconnectTimer.unref?.(); }
    };
    socket.once('error', disconnected); socket.once('close', disconnected);
  }

  handle(message) {
    if (message?.kind === 'response') {
      const request = this.pending.get(message.id); if (!request) return;
      this.pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
      return;
    }
    if (message?.kind === 'event') { this.latestEvent = message.event; this.emit('event', message.event); }
    if (message?.kind === 'hello') this.emit('ready', message);
  }

  request(type, payload = {}, timeoutMs = 10_000) {
    if (!this.socket?.writable) return Promise.reject(new Error('IPC do núcleo indisponível.'));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Tempo limite IPC: ${type}`)); }, timeoutMs);
      timer.unref?.(); this.pending.set(id, { resolve, reject, timer });
      if (!safeSocketWrite(this.socket, { kind: 'request', id, type, payload })) {
        this.pending.delete(id); clearTimeout(timer); reject(new Error(`Não foi possível enviar a solicitação IPC: ${type}`));
      }
    });
  }

  status() { return { connected: Boolean(this.socket?.writable), pending: this.pending.size, socketPath: this.socketPath, latestEventId: this.latestEvent?.id || 0 }; }
  close() { this.closed = true; clearTimeout(this.reconnectTimer); this.socket?.destroy(); this.socket = null; }
}

module.exports = { CoreIpcServer, CoreIpcClient, MAX_IPC_FRAME_BYTES, socketPathIsActive, prepareSocketPath, safeSocketWrite };
