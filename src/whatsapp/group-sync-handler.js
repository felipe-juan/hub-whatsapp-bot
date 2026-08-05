'use strict';

module.exports = function install(BotClass, deps) {
  const { fs, crypto, spawn, QRCode, asBool, RecentMessageTracker, ConversationQueue, ConcurrencyLimiter, CircuitBreaker, HealthWatchdog, fetchGroupRows, resolveIncomingActivation, applyIncomingActivation, FragmentBuffer, isLikelyFragment, delay, backgroundDelay, silentLogger, disconnectCode, cleanAccountNumber, createMessageAdapter } = deps;
  Object.assign(BotClass.prototype, {
    scheduleGroupSync(delayMs = 1500) {
      clearTimeout(this.groupSyncTimer);
      this.groupSyncTimer = setTimeout(() => {
        this.groupSyncTimer = null;
        if (this.status.state === 'ready') this.syncGroups().catch(error => this.update({ groupSyncError: error.message }));
      }, delayMs);
    },

    async syncGroupsWithRetry() {
      const delays = [0, 3000, 10000];
      let lastError = null;
      for (const wait of delays) {
        if (wait) await delay(wait);
        try { return await this.syncGroups(); } catch (error) { lastError = error; }
      }
      if (lastError) {
        this.update({ groupSyncError: lastError.message });
        console.warn('Não foi possível sincronizar grupos automaticamente:', lastError.message);
      }
      return 0;
    },

    async syncGroups() {
      if (!this.socket || this.status.state !== 'ready') throw new Error('WhatsApp ainda não está conectado.');
      const groups = await fetchGroupRows(this.socket);
      let count = 0;
      for (const item of groups) {
        const groupId = item.id;
        const name = item.name;
        // Guarde somente o necessário para o processamento de mensagens. Manter
        // a lista completa de participantes de todos os grupos aumenta o uso de
        // memória e o custo do GC sem ajudar na resposta do bot.
        this.groupMetadataCache.set(groupId, { id: groupId, subject: name });
        while (this.groupMetadataCache.size > 500) this.groupMetadataCache.delete(this.groupMetadataCache.keys().next().value);
        if (this.writeQueue?.upsertGroup) this.writeQueue.upsertGroup(groupId, name);
        else this.db.upsertGroup(groupId, name);
        count += 1;
      }
      this.update({ syncedGroupCount: count, lastGroupSyncAt: new Date().toISOString(), groupSyncError: '' });
      return count;
    }
  });
};
