'use strict';
const { detectAmbiguousMatches } = require('../matcher');
function capCandidates(candidates = [], limit = 8) { return candidates.slice(0, Math.max(1, Number(limit || 8))); }
module.exports = { detectAmbiguousMatches, capCandidates };
