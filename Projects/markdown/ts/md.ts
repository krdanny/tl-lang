import fs from 'node:fs';

const SPECIAL = /^(```|#{1,6} |---$|> |>$|- |\d+\. )/;

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string): string {
  return escape(s).split(/`([^`]*)`/).map((part, i) => (i % 2
    ? `<code>${part}</code>`
    : part.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>'))).join('');
}

function convert(text: string): string {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const blocks: string[] = [];
  let i = 0;
  const takeWhile = (test: (line: string) => boolean): string[] => {
    const out: string[] = [];
    while (i < lines.length && test(lines[i])) out.push(lines[i++]);
    return out;
  };
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) {
      i++;
      const code = takeWhile((x) => !x.startsWith('```')).map(escape);
      i++;
      blocks.push(`<pre><code>${code.join('\n')}</code></pre>`);
    } else if (/^#{1,6} /.test(l)) {
      const n = l.indexOf(' ');
      blocks.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`);
      i++;
    } else if (l === '---') {
      blocks.push('<hr>');
      i++;
    } else if (l.startsWith('> ') || l === '>') {
      const q = takeWhile((x) => x.startsWith('> ') || x === '>').map((x) => x.slice(2)).filter(Boolean);
      blocks.push(`<blockquote><p>${inline(q.join(' '))}</p></blockquote>`);
    } else if (l.startsWith('- ')) {
      const items = takeWhile((x) => x.startsWith('- ')).map((x) => `<li>${inline(x.slice(2))}</li>`);
      blocks.push(`<ul>${items.join('')}</ul>`);
    } else if (/^\d+\. /.test(l)) {
      const items = takeWhile((x) => /^\d+\. /.test(x)).map((x) => `<li>${inline(x.replace(/^\d+\. /, ''))}</li>`);
      blocks.push(`<ol>${items.join('')}</ol>`);
    } else if (l.trim() === '') {
      i++;
    } else {
      const para = takeWhile((x) => x.trim() !== '' && !SPECIAL.test(x));
      blocks.push(`<p>${inline(para.join(' '))}</p>`);
    }
  }
  return blocks.join('\n') + '\n';
}

process.stdout.write(convert(fs.readFileSync(process.argv[2], 'utf8')));
