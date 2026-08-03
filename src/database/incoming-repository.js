'use strict';

function nowIso() { return new Date().toISOString(); }

module.exports = function createIncomingRepositoryMixin() {
  return class {
    claimIncomingMessage(remoteJid, messageId) {
      const jid = String(remoteJid || '').trim();
      const id = String(messageId || '').trim();
      if (!jid || !id) return true;
      const now = nowIso();
      const inserted = this.db.prepare(`INSERT OR IGNORE INTO processed_incoming_messages
        (remote_jid,message_id,state,claimed_at,updated_at,last_error) VALUES (?,?,'processing',?,?,'')`)
        .run(jid, id, now, now);
      if (Number(inserted.changes || 0) > 0) return true;
      const current = this.db.prepare('SELECT state,updated_at FROM processed_incoming_messages WHERE remote_jid=? AND message_id=?').get(jid, id);
      if (!current) return true;
      // Registros em processamento também bloqueiam reentrega após uma
      // reinicialização. Reprocessar um claim antigo poderia duplicar uma
      // resposta que o WhatsApp recebeu pouco antes da queda do processo.
      // Somente falhas registradas explicitamente podem ser reclamadas.
      if (current.state === 'failed') {
        const result = this.db.prepare(`UPDATE processed_incoming_messages SET state='processing',claimed_at=?,updated_at=?,last_error=''
          WHERE remote_jid=? AND message_id=? AND state='failed'`)
          .run(now, now, jid, id);
        return Number(result.changes || 0) > 0;
      }
      return false;
    }

    completeIncomingMessage(remoteJid, messageId) {
      const jid = String(remoteJid || '').trim(); const id = String(messageId || '').trim();
      if (!jid || !id) return false;
      return Boolean(this.db.prepare("UPDATE processed_incoming_messages SET state='done',updated_at=?,last_error='' WHERE remote_jid=? AND message_id=?")
        .run(nowIso(), jid, id).changes);
    }

    failIncomingMessage(remoteJid, messageId, error = '') {
      const jid = String(remoteJid || '').trim(); const id = String(messageId || '').trim();
      if (!jid || !id) return false;
      return Boolean(this.db.prepare("UPDATE processed_incoming_messages SET state='failed',updated_at=?,last_error=? WHERE remote_jid=? AND message_id=?")
        .run(nowIso(), String(error?.message || error || '').slice(0, 1000), jid, id).changes);
    }

    pruneProcessedIncomingMessages(days = 7) {
      const cutoff = new Date(Date.now() - Math.max(1, Number(days || 7)) * 86400000).toISOString();
      return Number(this.db.prepare("DELETE FROM processed_incoming_messages WHERE updated_at<?").run(cutoff).changes || 0);
    }
  };
};
