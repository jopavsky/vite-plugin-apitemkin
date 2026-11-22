// Conservative CSS minifier for the overlay's inlined stylesheet.
// Drops comments, collapses whitespace, and removes whitespace around
// `{ } : ; , >`. Strings and url(...) contents pass through verbatim.
// Selector context is tracked, so a descendant pseudo-class (`.a :hover`)
// keeps its space; inside declaration blocks `prop : value` is tightened.

const TIGHT = new Set(['{', '}', ':', ';', ',', '>']);

export function minifyCss(src: string): string {
  let out = '';
  let pendingSpace = false;
  let i = 0;
  // Block stack: 'rules' (top level, @media/@supports/@keyframes bodies) or
  // 'decls' (a style rule's body). `prelude` is the text since the last { } ;
  const stack: ('rules' | 'decls')[] = [];
  let prelude = '';
  const inSelector = (): boolean => stack[stack.length - 1] !== 'decls';

  const emit = (chunk: string): void => {
    if (pendingSpace) {
      const prev = out[out.length - 1];
      if (out.length > 0 && !TIGHT.has(prev!) && !TIGHT.has(chunk[0]!)) out += ' ';
      pendingSpace = false;
    }
    out += chunk;
  };

  while (i < src.length) {
    const ch = src[i]!;

    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      pendingSpace = true;
      continue;
    }

    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) j += src[j] === '\\' ? 2 : 1;
      emit(src.slice(i, j + 1));
      i = j + 1;
      continue;
    }

    if (src.startsWith('url(', i)) {
      const end = src.indexOf(')', i);
      const j = end === -1 ? src.length : end + 1;
      emit(src.slice(i, j));
      i = j;
      continue;
    }

    if (/\s/.test(ch)) {
      pendingSpace = true;
      i++;
      continue;
    }

    if (ch === '}' && out.endsWith(';')) out = out.slice(0, -1);
    if (ch === ':' && inSelector() && pendingSpace && out && !TIGHT.has(out[out.length - 1]!)) {
      out += ' ';
    }
    if (ch === '{') stack.push(prelude.trim().startsWith('@') ? 'rules' : 'decls');
    if (ch === '}') stack.pop();
    prelude = ch === '{' || ch === '}' || ch === ';' ? '' : prelude + ch;
    if (TIGHT.has(ch)) pendingSpace = false;
    emit(ch);
    i++;
  }

  // [data-x="ident"] → [data-x=ident]: quotes are only needed for non-identifiers.
  return out.trim().replace(/\[([\w-]+[$^*~|]?=)"([\w-]+)"\]/g, '[$1$2]');
}
