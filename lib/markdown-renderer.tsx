// A react-native-marked Renderer subclass that handles images with tap-to-load,
// and code blocks with syntax highlighting and copy buttons.
import React, { useState } from 'react';
import type { ImageStyle } from 'react-native';
import { Renderer } from 'react-native-marked';
import { Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';

import { TapToLoadImage } from '@/components/tap-to-load-image';
import { Fonts } from '@/constants/theme';

const LANGUAGE_COLORS: Record<string, string> = {
  javascript: '#f7df1e',
  js: '#f7df1e',
  python: '#3776ab',
  py: '#3776ab',
  typescript: '#3178c6',
  ts: '#3178c6',
  tsx: '#3178c6',
  jsx: '#f7df1e',
  bash: '#000',
  sh: '#000',
  shell: '#000',
  json: '#292929',
  sql: '#336791',
  go: '#00add8',
  rust: '#ce422b',
  java: '#007396',
  cpp: '#00599c',
  c: '#00599c',
  csharp: '#239120',
  cs: '#239120',
  swift: '#fa7343',
  html: '#e34c26',
  css: '#563d7c',
  xml: '#0b7261',
  yaml: '#cb171e',
  yml: '#cb171e',
  markdown: '#083fa1',
  md: '#083fa1',
};

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const [copyFailed, setCopyFailed] = useState(false);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Surface the failure in the UI too — a console.warn alone is invisible
      // in a built APK, so a silent failure here looks identical to a working
      // button that just didn't do anything (the exact bug being fixed).
      console.warn('[Markdown] Failed to copy code:', err);
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2000);
    }
  };

  const languageLabel = language || 'code';
  const langColor = LANGUAGE_COLORS[language?.toLowerCase() || ''] || '#B8C1D1';

  return (
    <View
      style={{
        backgroundColor: '#1E1E1E',
        borderRadius: 8,
        marginVertical: 8,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: '#252525',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.1)',
        }}
      >
        <Text
          style={{
            fontFamily: Fonts.sansSemiBold,
            fontSize: 11,
            color: langColor,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {languageLabel}
        </Text>
        <Pressable onPress={handleCopy} hitSlop={12} accessibilityRole="button" accessibilityLabel="Copy code">
          <Text
            style={{
              fontFamily: Fonts.sans,
              fontSize: 11,
              color: copyFailed ? '#FF3B30' : copied ? '#34C759' : '#888',
              fontWeight: copied || copyFailed ? '600' : '400',
            }}
          >
            {copyFailed ? '✗ Failed — try again' : copied ? '✓ Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 400 }}
      >
        <Text
          selectable
          selectionColor="#0a84ff55"
          style={{
            fontFamily: Fonts.mono,
            fontSize: 12,
            color: '#E0E0E0',
            padding: 12,
            lineHeight: 17,
          }}
        >
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

class LowDataRenderer extends Renderer {
  constructor(private readonly textColor = '#1C1C1E') {
    super();
  }

  image(uri: string, alt?: string, _style?: ImageStyle, title?: string) {
    return <TapToLoadImage key={uri} uri={uri} alt={alt || title} />;
  }

  codespan(code: string) {
    // The base Renderer's default codespan/getTextNode sets `selectable` —
    // this override replaced it without re-adding that prop, which is why
    // inline `code` spans couldn't be long-press-selected or copied even
    // though ordinary paragraph text (still using the base implementation)
    // could.
    return (
      <Text
        key={code}
        selectable
        style={{
          fontFamily: Fonts.mono,
          fontSize: 11,
          backgroundColor: 'rgba(0,0,0,0.1)',
          paddingHorizontal: 4,
          paddingVertical: 2,
          borderRadius: 3,
          color: 'inherit',
        }}
      >
        {code}
      </Text>
    );
  }

  code(code: string, language?: string) {
    // Renderer methods are called directly by react-native-marked's Parser while it
    // walks the token tree — once per code fence in the message, as a plain function
    // call, NOT as a mounted React component. Calling a hook (useState) here used to
    // attach that hook to whichever component happened to be mid-render (AssistantMarkdown),
    // so the hook count for that render became "1 + number of code fences" — any time a
    // re-render had a different code-fence count than the last one, React threw "Rendered
    // more/fewer hooks than expected" and crashed the whole message list (Sentry
    // REACT-NATIVE-4 / REACT-NATIVE-6). All state now lives inside <CodeBlock>, a real
    // component, so this method itself makes zero hook calls no matter how many times
    // the parser invokes it.
    return <CodeBlock key={code} code={code} language={language} />;
  }

  // NOTE: react-native-marked's Parser calls renderer.table(header, rows, tableStyle,
  // rowStyle, cellStyle) with header/rows already pre-parsed into ReactNode arrays
  // (header: ReactNode[][] — one entry per column; rows: ReactNode[][][] — row, then
  // column). It never calls a separate `tablecell`/`tablerow` method, so the previous
  // version of this class (which defined `tablecell` expecting to be invoked per-cell,
  // and dumped raw `{header}{body}` into a plain View with no row/column structure at
  // all) never actually laid out a grid — there was no flexDirection:'row' anywhere,
  // no per-column width, nothing constraining cell content, which is why long/unbroken
  // text inside a table could force the whole message bubble to blow out sideways.
  //
  // This rebuilds a real grid: explicit row Views, explicit per-cell Views with a
  // computed proportional width so N columns divide the bubble's actual available
  // width instead of each demanding as much space as their content wants first.
  table(header: ReactNode[][], rows: ReactNode[][][]) {
    const numCols = Math.max(1, header.length);
    // Assistant replies now render bubble-less and full-width (see simple-chat.tsx),
    // so the only inset is the transcript ScrollView's content padding (16px each
    // side). A tiny extra margin keeps the right border off the screen edge.
    const screenWidth = Dimensions.get('window').width;
    const available = Math.max(120, screenWidth - 32 - 6);
    const MIN_COL_WIDTH = 76;
    const colWidth = Math.max(MIN_COL_WIDTH, Math.floor(available / numCols));
    const needsScroll = colWidth * numCols > available;

    const renderCell = (content: ReactNode, isHeader: boolean, colIndex: number) => (
      <View
        key={`cell-${colIndex}`}
        style={{
          width: colWidth,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRightWidth: colIndex < numCols - 1 ? 1 : 0,
          borderRightColor: 'rgba(0,0,0,0.1)',
          borderBottomWidth: isHeader ? 2 : 1,
          borderBottomColor: isHeader ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)',
          backgroundColor: isHeader ? 'rgba(0,0,0,0.05)' : 'transparent',
        }}
      >
        <Text
          selectable
          style={{
            fontFamily: Fonts.sans,
            fontSize: 12,
            fontWeight: isHeader ? '600' : '400',
            flexWrap: 'wrap',
            color: this.textColor,
          }}
        >
          {content}
        </Text>
      </View>
    );

    const grid = (
      <View style={{ borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)', borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row' }}>
          {header.map((cell, i) => renderCell(cell, true, i))}
        </View>
        {rows.map((row, r) => (
          <View key={`row-${r}`} style={{ flexDirection: 'row' }}>
            {row.map((cell, c) => renderCell(cell, false, c))}
          </View>
        ))}
      </View>
    );

    // Keep long tables usable inside the transcript instead of relying on the
    // parent chat scroller. Wide tables additionally get horizontal scrolling.
    const vertical = (
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: 360 }}>
        {grid}
      </ScrollView>
    );
    return needsScroll ? (
      <ScrollView key={`table-${header.length}-${rows.length}`} horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={{ marginVertical: 8 }}>
        {vertical}
      </ScrollView>
    ) : (
      <View key={`table-${header.length}-${rows.length}`} style={{ marginVertical: 8 }}>
        {vertical}
      </View>
    );
  }
}

export function createLowDataMarkdownRenderer(textColor = '#1C1C1E') {
  return new LowDataRenderer(textColor);
}

export const lowDataMarkdownRenderer = new LowDataRenderer();
