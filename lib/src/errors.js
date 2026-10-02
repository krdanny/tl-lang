// Structured diagnostics in the compact form of spec §59:  E214@api:c142 message fixes a|b

export class TLError extends Error {
  /**
   * @param {string} code  diagnostic code, e.g. "E114"
   * @param {string} msg   short message
   * @param {string} file  module name or path
   * @param {number} col   0-based byte column in the one-line file
   * @param {string[]} fixes named fix suggestions
   */
  constructor(code, msg, file, col, fixes = []) {
    super(msg);
    this.code = code;
    this.file = file;
    this.col = col;
    this.fixes = fixes;
  }

  compact() {
    const f = this.fixes.length ? ` fixes ${this.fixes.join('|')}` : '';
    return `${this.code}@${this.file}:c${this.col} ${this.message}${f}`;
  }

  /** Human form: compact line plus a caret under the offending column. */
  pretty(src) {
    let out = this.compact();
    if (typeof src === 'string' && this.col >= 0) {
      const from = Math.max(0, this.col - 40);
      const to = Math.min(src.length, this.col + 40);
      const snippet = (from > 0 ? '…' : '') + src.slice(from, to) + (to < src.length ? '…' : '');
      const caret = ' '.repeat(this.col - from + (from > 0 ? 1 : 0)) + '^';
      out += `\n  ${snippet}\n  ${caret}`;
    }
    return out;
  }
}
