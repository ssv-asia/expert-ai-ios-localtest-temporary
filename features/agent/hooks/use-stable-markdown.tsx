import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type JSX,
} from "react";
import { lexer, type Token } from "marked";
import type { useMarkdownHookOptions } from "react-native-marked";
import { Renderer } from "react-native-marked";
import type { ReactNode } from "react";
import { Text, type TextStyle, type ViewStyle } from "react-native";
import { CodePreview } from "../components/message-list/code-preview";

interface ParserLike {
  parse(tokens?: Token[]): ReactNode[];
}

// The base Renderer sizes tables off Dimensions.get("window").width (the full device
// width), but a chat message bubble is narrower — it sits inside a 16px-padded container
// (see assistant-message.tsx's `container` style). Left uncorrected, every table's column
// widths are computed against the full screen and guaranteed to overflow the bubble,
// no matter what CSS constraints are applied to the table View itself.
const MESSAGE_HORIZONTAL_PADDING = 32; // 16px container padding * 2 sides

class StableRenderer extends Renderer {
  constructor(
    private readonly blockCodeTextStyle: TextStyle | undefined,
    private readonly isDark: boolean,
  ) {
    super();
    // `windowWidth` is typed `private` in the base class's .d.ts (TS-only — it's a plain
    // runtime property), so it must be reassigned through an `any` cast to bypass the check.
    const self = this as unknown as { windowWidth: number };
    self.windowWidth = Math.max(200, self.windowWidth - MESSAGE_HORIZONTAL_PADDING);
  }

  override code(
    text: string,
    language?: string,
    containerStyle?: ViewStyle,
  ): ReactNode {
    return (
      <CodePreview
        key={`code-${language ?? "plain"}-${text.length}`}
        code={text}
        language={language}
        isDark={this.isDark}
      />
    );
  }

  // The base `table()` has two bugs that guarantee horizontal overflow past the message
  // bubble: (1) getTableWidthArr() gives EVERY column windowWidth*(1.3/3) regardless of
  // column count — 3 columns alone sum to 130% of the available width by construction,
  // not a proportional division; (2) it never forwards `tableStyle` to <MDTable>, only
  // pulls borderWidth/borderColor out of it, so maxWidth/overflow constraints on the table
  // style are silently dropped. Rebuilding the width math and the table style forward here.
  override table(
    header: ReactNode[][],
    rows: ReactNode[][][],
    tableStyle?: ViewStyle,
    rowStyle?: ViewStyle,
    cellStyle?: ViewStyle,
  ): ReactNode {
    const numCols = Math.max(1, header.length);
    const available = (this as unknown as { windowWidth: number }).windowWidth;
    const MIN_COL_WIDTH = 90;
    const fitWidth = Math.floor(available / numCols);
    const colWidth = Math.max(MIN_COL_WIDTH, fitWidth);
    const widthArr = Array(numCols).fill(colWidth);
    const borderWidth = (tableStyle as { borderWidth?: number } | undefined)?.borderWidth;
    const borderColor = (tableStyle as { borderColor?: string } | undefined)?.borderColor;

    return (
      <MDTableComponent
        key={`table-${header.length}-${rows.length}`}
        header={header}
        rows={rows}
        widthArr={widthArr}
        rowStyle={rowStyle}
        cellStyle={cellStyle}
        tableStyle={tableStyle}
        borderColor={borderColor}
        borderWidth={borderWidth}
      />
    );
  }
}

interface MDTableProps {
  header: ReactNode[][];
  rows: ReactNode[][][];
  widthArr: number[];
  rowStyle?: ViewStyle;
  cellStyle?: ViewStyle;
  tableStyle?: ViewStyle;
  borderColor?: string;
  borderWidth?: number;
}

let CachedMDTable: ComponentType<MDTableProps> | null = null;
function getMDTable(): ComponentType<MDTableProps> {
  if (!CachedMDTable) {
    // Not re-exported from the public API — load from dist, same pattern as getParserClass().
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-marked/dist/commonjs/components/MDTable");
    CachedMDTable = (mod.default ?? mod) as ComponentType<MDTableProps>;
  }
  return CachedMDTable;
}
const MDTableComponent: ComponentType<MDTableProps> = (props) => {
  const MDTable = getMDTable();
  return <MDTable {...props} />;
};

interface ParserConstructor {
  new (options: {
    styles: Record<string, unknown>;
    baseUrl?: string;
    renderer: Renderer;
  }): ParserLike;
}

let CachedParserClass: ParserConstructor | null = null;

function getParserClass(): ParserConstructor {
  if (!CachedParserClass) {
    // Parser is not re-exported from the public API — load from dist.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-marked/dist/commonjs/lib/Parser");
    CachedParserClass = (mod.default ?? mod) as ParserConstructor;
  }
  return CachedParserClass;
}

// Mirrors react-native-marked's internal style builder so we avoid importing
// private module paths for styles.
import { StyleSheet } from "react-native";

const THEME_COLORS = {
  light: {
    background: "#ffffff",
    code: "#f6f8fa",
    link: "#0366d6",
    text: "#000000",
    border: "#e1e4e8",
  },
  dark: {
    background: "#0d1117",
    code: "#161b22",
    link: "#58a6ff",
    text: "#c9d1d9",
    border: "#30363d",
  },
} as const;

const DEFAULT_SPACING = { xs: 2, s: 4, m: 8, l: 12 } as const;

function buildStyles(
  userStyles: useMarkdownHookOptions["styles"],
  colorScheme: useMarkdownHookOptions["colorScheme"],
  userTheme: useMarkdownHookOptions["theme"],
): Record<string, unknown> {
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const mdColors = { ...THEME_COLORS[scheme], ...userTheme?.colors };
  const mdSpacing = { ...DEFAULT_SPACING, ...userTheme?.spacing };

  const fontRegular = { fontSize: 16, lineHeight: 24, color: mdColors.text };
  const fontHeading = { fontWeight: "500" as const, color: mdColors.text };

  return StyleSheet.create({
    em: StyleSheet.flatten([fontRegular, { fontStyle: "italic" as const }, userStyles?.em]) ?? {},
    strong: StyleSheet.flatten([fontRegular, { fontWeight: "600" as const }, userStyles?.strong]) ?? {},
    strikethrough: StyleSheet.flatten([
      fontRegular,
      { textDecorationLine: "line-through" as const, textDecorationStyle: "solid" as const },
      userStyles?.strikethrough,
    ]) ?? {},
    text: StyleSheet.flatten([fontRegular, userStyles?.text]) ?? {},
    paragraph: StyleSheet.flatten([{ paddingVertical: mdSpacing.m }, userStyles?.paragraph]) ?? {},
    link: StyleSheet.flatten([
      fontRegular,
      { fontStyle: "italic" as const, color: mdColors.link },
      userStyles?.link,
    ]) ?? {},
    blockquote: StyleSheet.flatten([
      {
        borderLeftColor: mdColors.border,
        paddingLeft: mdSpacing.l,
        borderLeftWidth: mdSpacing.s,
        opacity: 0.8,
      },
      userStyles?.blockquote,
    ]) ?? {},
    h1: StyleSheet.flatten([
      fontHeading,
      {
        fontSize: 32, lineHeight: 40, fontWeight: "600" as const,
        marginVertical: mdSpacing.m, letterSpacing: 0,
        paddingBottom: mdSpacing.s, borderBottomColor: mdColors.border, borderBottomWidth: 1,
      },
      userStyles?.h1,
    ]) ?? {},
    h2: StyleSheet.flatten([
      fontHeading,
      {
        fontSize: 28, lineHeight: 36, marginVertical: mdSpacing.m,
        paddingBottom: mdSpacing.s, borderBottomColor: mdColors.border, borderBottomWidth: 1,
      },
      userStyles?.h2,
    ]) ?? {},
    h3: StyleSheet.flatten([
      fontHeading,
      { fontSize: 24, lineHeight: 32, marginVertical: mdSpacing.s },
      userStyles?.h3,
    ]) ?? {},
    h4: StyleSheet.flatten([
      fontHeading,
      { fontSize: 22, lineHeight: 28, marginVertical: mdSpacing.s },
      userStyles?.h4,
    ]) ?? {},
    h5: StyleSheet.flatten([fontRegular, fontHeading, { marginVertical: mdSpacing.xs }, userStyles?.h5]) ?? {},
    h6: StyleSheet.flatten([
      fontHeading,
      { fontSize: 14, lineHeight: 20, marginVertical: mdSpacing.xs },
      userStyles?.h6,
    ]) ?? {},
    codespan: StyleSheet.flatten([
      fontRegular,
      { fontStyle: "italic" as const, backgroundColor: mdColors.code, fontWeight: "300" as const },
      userStyles?.codespan,
    ]) ?? {},
    code: StyleSheet.flatten([
      { padding: mdSpacing.l, backgroundColor: mdColors.code, minWidth: "100%" as const },
      userStyles?.code,
    ]) ?? {},
    hr: StyleSheet.flatten([
      { borderBottomWidth: 1, borderBottomColor: mdColors.border, marginVertical: mdSpacing.s },
      userStyles?.hr,
    ]) ?? {},
    list: StyleSheet.flatten([userStyles?.list]) ?? {},
    li: StyleSheet.flatten([fontRegular, { flexShrink: 1 }, userStyles?.li]) ?? {},
    image: StyleSheet.flatten([{ resizeMode: "cover" as const }, userStyles?.image]) ?? {},
    table: StyleSheet.flatten([
      {
        borderWidth: 1,
        borderColor: mdColors.border,
        maxWidth: "100%" as const,
        overflow: "hidden" as const,
      },
      userStyles?.table
    ]) ?? {},
    tableRow: StyleSheet.flatten([{ flexDirection: "row" as const, flex: 1 }, userStyles?.tableRow]) ?? {},
    tableCell: StyleSheet.flatten([
      {
        padding: mdSpacing.s,
        flex: 1,
        flexWrap: "wrap" as const,
        overflow: "hidden" as const,
      },
      userStyles?.tableCell
    ]) ?? {},
  });
}

const STREAMING_THROTTLE_MS = 100;

/**
 * A drop-in replacement for `useMarkdown` from react-native-marked that:
 *
 * 1. **Resets the Renderer's internal slugger before every parse** so React
 *    keys are deterministic across re-renders (the stock hook lets the slugger
 *    accumulate, producing new keys on every parse → full unmount/remount).
 *
 * 2. **Throttles text updates while streaming** so the expensive markdown
 *    lexer + parser only runs at most once every STREAMING_THROTTLE_MS
 *    instead of on every single text delta (10-50 per second).
 */
export function useStableMarkdown(
  text: string,
  options: useMarkdownHookOptions,
  isStreaming?: boolean,
): JSX.Element[] {
  const textRef = useRef(text);
  textRef.current = text;

  const [throttledText, setThrottledText] = useState(text);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateThrottledText = useCallback((nextText: string, urgent = false) => {
    if (urgent) {
      setThrottledText(nextText);
      return;
    }
    startTransition(() => {
      setThrottledText(nextText);
    });
  }, []);

  useEffect(() => {
    if (!isStreaming) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = false;
      updateThrottledText(text, true);
      return;
    }

    if (timerRef.current) {
      pendingRef.current = true;
      return;
    }

    updateThrottledText(text);

    timerRef.current = setTimeout(function tick() {
      timerRef.current = null;
      if (pendingRef.current) {
        pendingRef.current = false;
        updateThrottledText(textRef.current);
        timerRef.current = setTimeout(tick, STREAMING_THROTTLE_MS);
      }
    }, STREAMING_THROTTLE_MS);
  }, [text, isStreaming, updateThrottledText]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // --- Markdown parsing with stable keys ------------------------------------
  const styles = useMemo(
    () => buildStyles(options.styles, options.colorScheme, options.theme),
    [options.styles, options.colorScheme, options.theme],
  );
  const deferredText = useDeferredValue(throttledText);
  const markdownSource = isStreaming ? deferredText : throttledText;

  const Parser = getParserClass();

  const elements = useMemo(() => {
    try {
      const blockCodeTextStyle = StyleSheet.flatten([
        styles.text,
        styles.codespan,
        {
          fontStyle: "normal" as const,
          fontWeight: "400" as const,
          padding: 0,
          backgroundColor: "transparent",
        },
      ]) as TextStyle;
      const renderer = new StableRenderer(blockCodeTextStyle, options.colorScheme === "dark");
      const parser = new Parser({ styles, baseUrl: options.baseUrl, renderer });
      const tokens = lexer(markdownSource, {
        gfm: true,
        tokenizer: options.tokenizer,
      });
      return parser.parse(tokens) as JSX.Element[];
    } catch (error) {
      // A lexer/parser edge case (malformed table, unbalanced fence, etc.) should
      // never take down the whole message — fall back to the raw text as a single
      // plain element rather than throwing out of this hook.
      console.warn("[useStableMarkdown] parse failed, falling back to plain text:", error);
      return [<Text key="fallback" style={styles.text as TextStyle}>{markdownSource}</Text>] as unknown as JSX.Element[];
    }
  }, [markdownSource, styles, options.baseUrl, options.tokenizer, Parser]);

  return elements;
}
