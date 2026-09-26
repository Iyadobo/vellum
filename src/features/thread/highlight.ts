export type TokenKind =
  | "plain"
  | "comment"
  | "keyword"
  | "string"
  | "literal"
  | "variable"
  | "attribute"
  | "name";

export interface Token {
  text: string;
  kind: TokenKind;
}

type Lang = "ts" | "py" | "lua" | "plain";

function words(input: string): ReadonlySet<string> {
  return new Set(input.split(" "));
}

const KEYWORDS: Record<Lang, ReadonlySet<string>> = {
  ts: words(
    "abstract as async await break case catch class const continue declare default delete do else enum export extends finally for from function get if implements import in instanceof interface keyof let namespace new of private protected public readonly return satisfies set static super switch this throw try type typeof var void while with yield",
  ),
  py: words(
    "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield",
  ),
  lua: words("and break do else elseif end for function goto if in local not or repeat return then until while"),
  plain: new Set<string>(),
};

const LITERALS: Record<Lang, ReadonlySet<string>> = {
  ts: words("true false null undefined NaN Infinity"),
  py: words("True False None"),
  lua: words("true false nil"),
  plain: new Set<string>(),
};

const DECLARATIONS = words(
  "const let var function class def local interface type enum struct namespace abstract",
);

const IDENT_START = /[A-Za-z_$]/;
const IDENT = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;
const SPACE = /\s/;

export function normalizeLanguage(language: string): Lang {
  const value = language.trim().toLowerCase();
  if (
    value === "ts" ||
    value === "tsx" ||
    value === "typescript" ||
    value === "js" ||
    value === "jsx" ||
    value === "javascript" ||
    value === "mjs" ||
    value === "cjs" ||
    value === "json" ||
    value === "jsonc"
  ) {
    return "ts";
  }
  if (value === "py" || value === "python") return "py";
  if (value === "lua") return "lua";
  return "plain";
}

function isCallAhead(code: string, from: number): boolean {
  let index = from;
  while (index < code.length && SPACE.test(code[index])) index += 1;
  return code[index] === "(";
}

function isMemberBefore(code: string, from: number): boolean {
  let index = from - 1;
  while (index >= 0 && SPACE.test(code[index])) index -= 1;
  return code[index] === ".";
}

function readString(code: string, start: number, quote: string, lang: Lang): number {
  const length = code.length;
  if (lang === "py" && code.startsWith(quote + quote + quote, start)) {
    const close = quote + quote + quote;
    const end = code.indexOf(close, start + 3);
    return end === -1 ? length : end + 3;
  }
  let index = start + 1;
  while (index < length) {
    const char = code[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    if (char === "\n" && quote !== "`") return index;
    index += 1;
  }
  return length;
}

function readNumber(code: string, start: number): number {
  const length = code.length;
  let index = start;
  if (code[index] === "0" && index + 1 < length && /[xXoObB]/.test(code[index + 1])) {
    index += 2;
    while (index < length && /[0-9a-fA-F_]/.test(code[index])) index += 1;
    return index;
  }
  while (index < length && /[0-9_]/.test(code[index])) index += 1;
  if (code[index] === "." && DIGIT.test(code[index + 1])) {
    index += 1;
    while (index < length && /[0-9_]/.test(code[index])) index += 1;
  }
  if (code[index] === "e" || code[index] === "E") {
    let probe = index + 1;
    if (code[probe] === "+" || code[probe] === "-") probe += 1;
    if (DIGIT.test(code[probe])) {
      index = probe;
      while (index < length && /[0-9_]/.test(code[index])) index += 1;
    }
  }
  return index;
}

function scan(code: string, lang: Lang): Token[] {
  const tokens: Token[] = [];
  const length = code.length;
  const keywords = KEYWORDS[lang];
  const literals = LITERALS[lang];
  const lineComment = lang === "py" ? "#" : "//";
  const blockOpen = lang === "lua" ? "--[[" : "/*";
  const blockClose = lang === "lua" ? "]]" : "*/";
  let index = 0;
  let previous = "";

  while (index < length) {
    const char = code[index];

    if (char === " " || char === "\t" || char === "\r" || char === "\n") {
      let end = index + 1;
      while (end < length) {
        const next = code[end];
        if (next !== " " && next !== "\t" && next !== "\r" && next !== "\n") break;
        end += 1;
      }
      tokens.push({ text: code.slice(index, end), kind: "plain" });
      index = end;
      continue;
    }

    if (code.startsWith(blockOpen, index)) {
      const end = code.indexOf(blockClose, index + blockOpen.length);
      const stop = end === -1 ? length : end + blockClose.length;
      tokens.push({ text: code.slice(index, stop), kind: "comment" });
      index = stop;
      previous = "comment";
      continue;
    }

    if (code.startsWith(lineComment, index)) {
      let end = index;
      while (end < length && code[end] !== "\n") end += 1;
      tokens.push({ text: code.slice(index, end), kind: "comment" });
      index = end;
      previous = "comment";
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      const end = readString(code, index, char, lang);
      tokens.push({ text: code.slice(index, end), kind: "string" });
      index = end;
      previous = "string";
      continue;
    }

    if (DIGIT.test(char)) {
      const end = readNumber(code, index);
      tokens.push({ text: code.slice(index, end), kind: "literal" });
      index = end;
      previous = "number";
      continue;
    }

    if (IDENT_START.test(char)) {
      let end = index + 1;
      while (end < length && IDENT.test(code[end])) end += 1;
      const word = code.slice(index, end);
      let kind: TokenKind = "plain";
      if (keywords.has(word)) kind = "keyword";
      else if (literals.has(word)) kind = "literal";
      else if (DECLARATIONS.has(previous)) kind = "variable";
      else if (isCallAhead(code, end)) kind = "name";
      else if (isMemberBefore(code, index)) kind = "attribute";
      tokens.push({ text: word, kind });
      index = end;
      previous = kind === "keyword" ? word : "identifier";
      continue;
    }

    let end = index + 1;
    while (end < length) {
      if (code.startsWith(lineComment, end) || code.startsWith(blockOpen, end)) break;
      const next = code[end];
      if (next === " " || next === "\t" || next === "\r" || next === "\n") break;
      if (IDENT.test(next) || next === '"' || next === "'" || next === "`") break;
      end += 1;
    }
    tokens.push({ text: code.slice(index, end), kind: "plain" });
    previous = code.slice(index, end);
    index = end;
  }

  return tokens;
}

export function highlight(code: string, language: string): Token[] {
  const lang = normalizeLanguage(language);
  if (lang === "plain") return [{ text: code, kind: "plain" }];
  try {
    return scan(code, lang);
  } catch {
    return [{ text: code, kind: "plain" }];
  }
}
