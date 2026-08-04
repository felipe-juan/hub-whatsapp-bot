'use strict';

const SUPPORTED_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 13;

function runtimeCompatibility(version = process.versions.node) {
  const [major = 0, minor = 0, patch = 0] = String(version).split('.').map(Number);
  const supported = major === SUPPORTED_NODE_MAJOR && minor >= MIN_NODE_MINOR;
  return {
    installed: `${major}.${minor}.${patch}`,
    tested_family: '22.x',
    required_range: '>=22.13 <23',
    supported,
    status: supported ? 'confirmed' : 'unsupported',
    message: supported
      ? `Node.js ${major}.${minor}.${patch} compatível com a faixa testada 22.x.`
      : `Node.js ${major}.${minor}.${patch} fora da faixa testada >=22.13 <23.`
  };
}

module.exports = { runtimeCompatibility, SUPPORTED_NODE_MAJOR, MIN_NODE_MINOR };
