'use strict';
function groupRowsFromMetadata(groups = {}) {
  return Object.entries(groups || {}).map(([jid, metadata]) => ({
    id: String(metadata?.id || jid || ''),
    name: String(metadata?.subject || 'Grupo sem nome'),
    metadata
  })).filter(item => item.id);
}
async function fetchGroupRows(socket) {
  if (!socket?.groupFetchAllParticipating) return [];
  return groupRowsFromMetadata(await socket.groupFetchAllParticipating());
}
module.exports = { groupRowsFromMetadata, fetchGroupRows };
