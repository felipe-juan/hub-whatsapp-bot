class BitSet {
  constructor(size = 0, words = null) {
    this.size = Math.max(0, Number(size || 0));
    this.words = words instanceof Uint32Array ? words : new Uint32Array(Math.ceil(this.size / 32));
  }

  static full(size) {
    const result = new BitSet(size);
    result.words.fill(0xffffffff);
    const remainder = size % 32;
    if (remainder && result.words.length) result.words[result.words.length - 1] = (2 ** remainder) - 1;
    return result;
  }

  clone() { return new BitSet(this.size, new Uint32Array(this.words)); }

  set(index) {
    const value = Number(index);
    if (!Number.isInteger(value) || value < 0 || value >= this.size) return this;
    this.words[value >>> 5] |= (1 << (value & 31)) >>> 0;
    return this;
  }

  has(index) {
    const value = Number(index);
    if (!Number.isInteger(value) || value < 0 || value >= this.size) return false;
    return Boolean(this.words[value >>> 5] & ((1 << (value & 31)) >>> 0));
  }

  or(other) {
    if (!other) return this;
    const length = Math.min(this.words.length, other.words.length);
    for (let index = 0; index < length; index += 1) this.words[index] = (this.words[index] | other.words[index]) >>> 0;
    return this;
  }

  and(other) {
    if (!other) { this.words.fill(0); return this; }
    const length = Math.min(this.words.length, other.words.length);
    for (let index = 0; index < length; index += 1) this.words[index] = (this.words[index] & other.words[index]) >>> 0;
    for (let index = length; index < this.words.length; index += 1) this.words[index] = 0;
    return this;
  }

  isEmpty() {
    for (const word of this.words) if (word !== 0) return false;
    return true;
  }

  count() {
    let total = 0;
    for (let word of this.words) {
      word >>>= 0;
      word -= (word >>> 1) & 0x55555555;
      word = (word & 0x33333333) + ((word >>> 2) & 0x33333333);
      total += (((word + (word >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    }
    return total;
  }

  toIndexes(limit = Infinity) {
    const result = [];
    for (let wordIndex = 0; wordIndex < this.words.length && result.length < limit; wordIndex += 1) {
      let word = this.words[wordIndex] >>> 0;
      while (word && result.length < limit) {
        const lowest = (word & -word) >>> 0;
        const bit = 31 - Math.clz32(lowest);
        const index = wordIndex * 32 + bit;
        if (index < this.size) result.push(index);
        word = (word & (word - 1)) >>> 0;
      }
    }
    return result;
  }
}

module.exports = { BitSet };
