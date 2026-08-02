const path = require('node:path');
const { fork } = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');

class AdminTaskRunner {
  constructor({ database = null, realtime = null, workerPath = path.join(__dirname, 'admin-task-worker.js') } = {}) {
    this.db = database;
    this.realtime = realtime;
    this.workerPath = workerPath;
    this.worker = null;
    this.tasks = new Map();
    this.closed = false;
    this.restartTimer = null;
    this.start();
  }

  start() {
    if (this.closed || this.worker) return;
    const worker = fork(this.workerPath, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: { ...process.env, HUB_ADMIN_WORKER: '1' } });
    this.worker = worker;
    try { os.setPriority(worker.pid, 10); } catch {}
    worker.on('message', message => this.handleMessage(message));
    worker.once('exit', (code, signal) => {
      if (this.worker === worker) this.worker = null;
      const error = new Error(`Processo administrativo encerrado${code !== null ? ` com código ${code}` : signal ? ` por ${signal}` : ''}.`);
      for (const [taskId, task] of this.tasks) {
        clearTimeout(task.timer);
        this.db?.updateAdminTaskRun?.(task.runId, { state: 'failed', error: error.message, finished: true });
        task.reject(error);
        this.tasks.delete(taskId);
      }
      this.realtime?.publish?.('admin-worker', { state: 'stopped', error: error.message });
      if (!this.closed) {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => this.start(), 1500);
        this.restartTimer.unref?.();
      }
    });
    this.realtime?.publish?.('admin-worker', { state: 'ready', pid: worker.pid });
  }

  handleMessage(message) {
    const task = this.tasks.get(message?.taskId);
    if (!task) return;
    if (message.kind === 'progress') {
      this.db?.updateAdminTaskRun?.(task.runId, { state: 'running', progress: message.progress });
      this.realtime?.publish?.('admin-task-progress', { taskId: message.taskId, type: task.type, progress: message.progress, message: message.message || '' });
      return;
    }
    clearTimeout(task.timer);
    this.tasks.delete(message.taskId);
    if (message.kind === 'result') {
      this.db?.updateAdminTaskRun?.(task.runId, { state: 'completed', progress: 100, result: message.result, finished: true });
      this.realtime?.publish?.('admin-task-completed', { taskId: message.taskId, type: task.type });
      task.resolve(message.result);
      return;
    }
    const error = new Error(String(message.error || 'Falha na tarefa administrativa.').split('\n')[0]);
    this.db?.updateAdminTaskRun?.(task.runId, { state: 'failed', error: error.message, finished: true });
    this.realtime?.publish?.('admin-task-failed', { taskId: message.taskId, type: task.type, error: error.message });
    task.reject(error);
  }

  run(type, payload = {}, { timeoutMs = 15 * 60 * 1000 } = {}) {
    if (this.closed) return Promise.reject(new Error('Executor administrativo encerrado.'));
    this.start();
    if (!this.worker?.connected) return Promise.reject(new Error('Processo administrativo ainda não está disponível.'));
    const taskId = crypto.randomUUID();
    const runId = this.db?.createAdminTaskRun?.(type) || 0;
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      const fail = error => {
        const task = this.tasks.get(taskId);
        if (!task) return;
        this.tasks.delete(taskId); clearTimeout(task.timer);
        this.db?.updateAdminTaskRun?.(runId, { state: 'failed', error: error.message, finished: true });
        reject(error);
      };
      const timer = setTimeout(() => {
        fail(new Error('A tarefa administrativa excedeu o tempo limite.'));
        // Uma tarefa de CPU/arquivo que excedeu o limite não deve continuar
        // ocupando o processo auxiliar indefinidamente. O worker é encerrado
        // e recriado; o núcleo do WhatsApp permanece intacto.
        try { worker?.kill?.('SIGKILL'); } catch {}
      }, Math.max(1000, Number(timeoutMs || 0)));
      timer.unref?.();
      this.tasks.set(taskId, { type, runId, resolve, reject, timer });
      this.db?.updateAdminTaskRun?.(runId, { state: 'running', progress: 1 });
      try {
        worker.send({ kind: 'task', taskId, type, payload }, error => {
          if (error) fail(new Error(`Não foi possível iniciar a tarefa administrativa: ${error.message}`));
        });
      } catch (error) { fail(new Error(`Não foi possível iniciar a tarefa administrativa: ${error.message}`)); }
    });
  }

  status() {
    return { running: this.tasks.size, workerPid: this.worker?.pid || 0, connected: Boolean(this.worker?.connected), recent: this.db?.listAdminTaskRuns?.(10) || [] };
  }

  async close() {
    this.closed = true;
    clearTimeout(this.restartTimer);
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 1500);
      worker.once('exit', () => { clearTimeout(timer); resolve(); });
      try { worker.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
    });
  }
}

module.exports = { AdminTaskRunner };
