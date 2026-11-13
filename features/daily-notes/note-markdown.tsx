import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Fonts } from '@/constants/theme';

/** Markdown palette derived from the active theme, with light-safe heading/code
 *  accents so note content remains readable in every preset. */
export interface NotePalette {
  text: string;
  dim: string;
  heading: string;
  check: string;
  checkEmpty: string;
  bullet: string;
  code: string;
  quote: string;
  quoteBar: string;
  inputBg: string;
  codeBg: string;
  border: string;
}

function isLightBackground(hex: string): boolean {
  const value = hex.replace('#', '');
  if (value.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150;
}

export function notePaletteFrom(c: {
  background: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  successColor: string;
  surface: string;
  border: string;
}): NotePalette {
  const light = isLightBackground(c.background);
  return {
    text: c.text,
    dim: c.textTertiary,
    heading: light ? '#7A4B00' : '#FFCB6B',
    check: c.successColor,
    checkEmpty: c.textTertiary,
    bullet: c.accent,
    code: light ? '#075985' : '#89DDFF',
    quote: c.textSecondary,
    quoteBar: c.accent,
    inputBg: c.surface,
    codeBg: c.surface,
    border: c.border,
  };
}

const TASK_RE = /^(\s*)[-*]\s*\[( |x|X)\]\s?(.*)$/;
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const NUM_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;
const H1_RE = /^#\s+(.*)$/;
const H2_RE = /^##\s+(.*)$/;
const H3_RE = /^#{3,}\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const HR_RE = /^\s*([-*_])\1{2,}\s*$/;
const FENCE_RE = /^```/;

export type NoteLine =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'task'; checked: boolean; text: string; index: number }
  | { kind: 'bullet'; text: string; indent: number }
  | { kind: 'number'; text: string; n: string; indent: number }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' }
  | { kind: 'code'; text: string }
  | { kind: 'blank' }
  | { kind: 'text'; text: string };

export function parseNote(body: string): NoteLine[] {
  const raw = body.split('\n');
  const out: NoteLine[] = [];
  let inFence = false;
  raw.forEach((line, i) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return; // don't render the fence markers themselves
    }
    if (inFence) {
      out.push({ kind: 'code', text: line });
      return;
    }
    const task = line.match(TASK_RE);
    if (task) {
      out.push({ kind: 'task', checked: task[2].toLowerCase() === 'x', text: task[3].trim(), index: i });
      return;
    }
    const h2 = line.match(H2_RE);
    if (h2) return out.push({ kind: 'h2', text: h2[1] });
    const h3 = line.match(H3_RE);
    if (h3) return out.push({ kind: 'h3', text: h3[1] });
    const h1 = line.match(H1_RE);
    if (h1) return out.push({ kind: 'h1', text: h1[1] });
    if (HR_RE.test(line)) return out.push({ kind: 'hr' });
    const quote = line.match(QUOTE_RE);
    if (quote) return out.push({ kind: 'quote', text: quote[1] });
    const num = line.match(NUM_RE);
    if (num) return out.push({ kind: 'number', text: num[3], n: num[2], indent: Math.min(2, Math.floor(num[1].length / 2)) });
    const bullet = line.match(BULLET_RE);
    if (bullet) return out.push({ kind: 'bullet', text: bullet[2], indent: Math.min(2, Math.floor(bullet[1].length / 2)) });
    if (line.trim() === '') return out.push({ kind: 'blank' });
    out.push({ kind: 'text', text: line });
  });
  return out;
}

/** Toggle the checkbox on source line `index` between [ ] and [x]. */
export function toggleTaskAt(body: string, index: number): string {
  const lines = body.split('\n');
  const line = lines[index];
  if (line === undefined) return body;
  const m = line.match(TASK_RE);
  if (!m) return body;
  const checked = m[2].toLowerCase() === 'x';
  lines[index] = line.replace(/\[( |x|X)\]/, checked ? '[ ]' : '[x]');
  return lines.join('\n');
}

export function wordCount(body: string): number {
  const m = body.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** When Enter is pressed at the end of a checklist/bullet/numbered line, continue
 *  the list automatically (or exit it if the item is empty). Detected by diffing
 *  the new value against the previous — reliable across Android keyboards where
 *  onKeyPress for Enter is flaky. Returns the adjusted text + new caret, or null. */
export function autoContinueList(
  prev: string,
  next: string,
): { text: string; caret: number } | null {
  if (next.length !== prev.length + 1) return null;
  let i = 0;
  while (i < prev.length && prev[i] === next[i]) i++;
  if (next[i] !== '\n') return null;

  const before = next.slice(0, i);
  const lineStart = before.lastIndexOf('\n') + 1;
  const currentLine = before.slice(lineStart);

  const task = currentLine.match(TASK_RE);
  if (task) {
    if (task[3].trim() === '') {
      const text = next.slice(0, lineStart) + next.slice(i);
      return { text, caret: lineStart };
    }
    const indent = task[1] ?? '';
    const insert = `${indent}- [ ] `;
    return { text: next.slice(0, i + 1) + insert + next.slice(i + 1), caret: i + 1 + insert.length };
  }

  const num = currentLine.match(NUM_RE);
  if (num) {
    if (num[3].trim() === '') {
      const text = next.slice(0, lineStart) + next.slice(i);
      return { text, caret: lineStart };
    }
    const indent = num[1] ?? '';
    const insert = `${indent}${Number(num[2]) + 1}. `;
    return { text: next.slice(0, i + 1) + insert + next.slice(i + 1), caret: i + 1 + insert.length };
  }

  const bullet = currentLine.match(BULLET_RE);
  if (bullet) {
    if (bullet[2].trim() === '') {
      const text = next.slice(0, lineStart) + next.slice(i);
      return { text, caret: lineStart };
    }
    const indent = bullet[1] ?? '';
    const insert = `${indent}- `;
    return { text: next.slice(0, i + 1) + insert + next.slice(i + 1), caret: i + 1 + insert.length };
  }
  return null;
}

/** Toggle a line-leading markdown prefix at caret position `pos`. Returns the new
 *  text and caret. Used by the writer's formatting toolbar. */
export function toggleLinePrefix(
  text: string,
  pos: number,
  kind: 'task' | 'heading' | 'bullet' | 'quote',
): { text: string; caret: number } {
  const start = text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
  let end = text.indexOf('\n', pos);
  if (end === -1) end = text.length;
  const line = text.slice(start, end);
  const indentMatch = line.match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : '';
  const rest = line.slice(indent.length);

  const prefixes: Record<typeof kind, string> = {
    task: '- [ ] ',
    heading: '## ',
    bullet: '- ',
    quote: '> ',
  };
  // Strip any existing leading marker so toggles swap cleanly.
  const stripped = rest
    .replace(/^[-*+]\s*\[( |x|X)\]\s?/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^>\s?/, '');

  const target = prefixes[kind];
  const already =
    (kind === 'task' && /^[-*+]\s*\[( |x|X)\]\s?/.test(rest)) ||
    (kind === 'heading' && /^#{1,6}\s+/.test(rest)) ||
    (kind === 'bullet' && /^[-*+]\s+/.test(rest) && !/^[-*+]\s*\[/.test(rest)) ||
    (kind === 'quote' && /^>\s?/.test(rest));

  const newLine = already ? indent + stripped : indent + target + stripped;
  const newText = text.slice(0, start) + newLine + text.slice(end);
  const delta = newLine.length - line.length;
  return { text: newText, caret: Math.max(start, pos + delta) };
}

const INLINE_RE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;

/** Render inline **bold**, *italic*, `code` spans within a line. */
function inline(text: string, palette: NotePalette, dim?: boolean) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) nodes.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    if (tok.startsWith('**') || tok.startsWith('__')) {
      nodes.push(
        <Text key={key++} style={{ fontFamily: Fonts.sansSemiBold }}>
          {tok.slice(2, -2)}
        </Text>,
      );
    } else if (tok.startsWith('`')) {
      nodes.push(
        <Text key={key++} style={{ fontFamily: Fonts.mono, color: dim ? palette.dim : palette.code }}>
          {tok.slice(1, -1)}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={key++} style={{ fontStyle: 'italic' }}>
          {tok.slice(1, -1)}
        </Text>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return nodes;
}

export function NoteMarkdown({
  body,
  palette,
  onToggleTask,
  fontScale = 1,
}: {
  body: string;
  palette: NotePalette;
  /** Called with the FULL updated body when a checkbox is tapped. */
  onToggleTask?: (nextBody: string) => void;
  fontScale?: number;
}) {
  const lines = parseNote(body);
  const s = fontScale;
  return (
    <View>
      {lines.map((ln, i) => {
        switch (ln.kind) {
          case 'blank':
            return <View key={i} style={{ height: 9 * s }} />;
          case 'hr':
            return <View key={i} style={[styles.hr, { borderColor: palette.border }]} />;
          case 'h1':
            return (
              <Text key={i} style={[styles.h1, { color: palette.heading, fontSize: 22 * s }]}>
                {inline(ln.text, palette)}
              </Text>
            );
          case 'h2':
            return (
              <Text key={i} style={[styles.h2, { color: palette.heading, fontSize: 17.5 * s }]}>
                {inline(ln.text, palette)}
              </Text>
            );
          case 'h3':
            return (
              <Text key={i} style={[styles.h3, { color: palette.heading, fontSize: 15.5 * s }]}>
                {inline(ln.text, palette)}
              </Text>
            );
          case 'code':
            return (
              <Text
                key={i}
                style={[styles.code, { color: palette.code, backgroundColor: palette.codeBg, fontSize: 13.5 * s }]}
              >
                {ln.text || ' '}
              </Text>
            );
          case 'quote':
            return (
              <View key={i} style={[styles.quoteRow, { borderColor: palette.quoteBar }]}>
                <Text style={[styles.quoteText, { color: palette.quote, fontSize: 15 * s }]}>
                  {inline(ln.text, palette, true)}
                </Text>
              </View>
            );
          case 'task':
            return (
              <Pressable
                key={i}
                onPress={onToggleTask ? () => onToggleTask(toggleTaskAt(body, ln.index)) : undefined}
                style={styles.taskRow}
                hitSlop={4}
              >
                <Ionicons
                  name={ln.checked ? 'checkbox' : 'square-outline'}
                  size={20 * s}
                  color={ln.checked ? palette.check : palette.checkEmpty}
                  style={{ marginTop: 1 }}
                />
                <Text
                  style={[
                    styles.body,
                    {
                      fontSize: 15.5 * s,
                      color: ln.checked ? palette.dim : palette.text,
                      textDecorationLine: ln.checked ? 'line-through' : 'none',
                    },
                  ]}
                >
                  {ln.text ? inline(ln.text, palette, ln.checked) : ' '}
                </Text>
              </Pressable>
            );
          case 'bullet':
            return (
              <View key={i} style={[styles.listRow, { paddingLeft: 2 + ln.indent * 16 }]}>
                <Text style={[styles.marker, { color: palette.bullet, fontSize: 15.5 * s }]}>•</Text>
                <Text style={[styles.body, { color: palette.text, fontSize: 15.5 * s }]}>
                  {inline(ln.text, palette)}
                </Text>
              </View>
            );
          case 'number':
            return (
              <View key={i} style={[styles.listRow, { paddingLeft: 2 + ln.indent * 16 }]}>
                <Text style={[styles.marker, { color: palette.bullet, fontSize: 15.5 * s }]}>{ln.n}.</Text>
                <Text style={[styles.body, { color: palette.text, fontSize: 15.5 * s }]}>
                  {inline(ln.text, palette)}
                </Text>
              </View>
            );
          default:
            return (
              <Text key={i} style={[styles.body, { color: palette.text, fontSize: 15.5 * s }]}>
                {inline(ln.text, palette)}
              </Text>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  h1: {
    fontFamily: Fonts.sansSemiBold,
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 30,
  },
  h2: {
    fontFamily: Fonts.sansSemiBold,
    marginTop: 12,
    marginBottom: 3,
    lineHeight: 24,
  },
  h3: {
    fontFamily: Fonts.sansSemiBold,
    marginTop: 10,
    marginBottom: 2,
    letterSpacing: 0.2,
    lineHeight: 22,
  },
  code: {
    fontFamily: Fonts.mono,
    paddingHorizontal: 10,
    paddingVertical: 2,
    lineHeight: 20,
  },
  quoteRow: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginVertical: 2,
  },
  quoteText: {
    fontFamily: Fonts.sans,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 5,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 3,
  },
  marker: {
    fontFamily: Fonts.sans,
    lineHeight: 23,
    minWidth: 14,
  },
  body: {
    flex: 1,
    fontFamily: Fonts.sans,
    lineHeight: 23,
  },
  hr: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
});
