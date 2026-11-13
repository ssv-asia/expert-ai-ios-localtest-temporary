// Exports a document (markdown/text/PDF) to a real shareable file, entirely
// on-device via expo-print (HTML->PDF rendering) and the Android share sheet.
// No server involvement — this is pure local file generation.
//
// PDF quality is treated as a real feature, not an afterthought: a lot of
// this app's users share AI output over WhatsApp in India, where a
// good-looking PDF (vs. a wall of raw markdown) is the difference between
// "obviously AI slop" and something a person is proud to forward. See the
// two PDF_TEMPLATES below.
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Marked } from 'marked';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// A dedicated `Marked` instance (not the shared default export/singleton) —
// `marked` is also a transitive dependency of react-native-marked, which
// powers the LIVE chat markdown rendering (a previously fragile area per
// CLAUDE.md). Configuring the module-level singleton here would risk
// changing how markdown renders on-screen in chat too, since Metro dedupes
// node_modules and both would share the same mutated global instance. An
// isolated instance means this file's settings can never leak there.
//
// Renderer override: by default, an AI reply's bare "<Placeholder>" or
// "<Component>" text outside a fenced code block gets treated as literal
// raw HTML per the CommonMark spec — an unknown tag the PDF's rendering
// WebView then silently drops, along with any text inside it. Overriding
// `html()` to escape instead of pass through makes that text actually show
// up in the exported PDF instead of vanishing with no error.
const pdfMarked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
  },
});

function markdownToHtml(markdown: string): string {
  return pdfMarked.parse(markdown, { async: false }) as string;
}

const currentDate = () =>
  new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export type PdfTemplate = 'classic' | 'modern';

export interface PdfExportOptions {
  /** 'classic' = serif editorial report (Ivy-League-memo look).
   *  'modern' = sans headings + accent bar, clean consulting-deck look. */
  template?: PdfTemplate;
  /** Show the Expert AI / ssv.asia call-to-action block at the end of the
   *  document. Defaults on — this is a deliberate growth surface (a reader
   *  who receives a beautiful PDF over WhatsApp should be able to find their
   *  way back to the app that made it), but the user can turn it off. */
  branding?: boolean;
}

const FONT_STACKS = {
  classic: {
    heading: `'Noto Serif', Georgia, 'Times New Roman', serif`,
    body: `'Noto Serif', Georgia, 'Times New Roman', serif`,
    label: `'Noto Sans', -apple-system, Helvetica, Arial, sans-serif`,
  },
  modern: {
    heading: `'Noto Sans', -apple-system, Helvetica, Arial, sans-serif`,
    body: `'Noto Serif', Georgia, 'Times New Roman', serif`,
    label: `'Noto Sans', -apple-system, Helvetica, Arial, sans-serif`,
  },
};

const ACCENT = {
  classic: '#8a6d1f', // muted gold — restrained, editorial
  modern: '#5b3df5', // brand-purple accent bar — matches the Expert AI theme
};

function brandingBlock(template: PdfTemplate): string {
  const accent = ACCENT[template];
  return `
    <div class="cta">
      <div class="cta-title">Crafted with Expert AI</div>
      <div class="cta-body">
        Your own AI assistant, on your phone. Free to try.
      </div>
      <div class="cta-link" style="color:${accent}">ssv.asia</div>
    </div>`;
}

/** A print-quality document shell: real typography, real page margins, a
 *  title block, and (optionally) a closing brand CTA — the "someone made
 *  this carefully" look, not a browser's default stylesheet. */
function wrapHtml(title: string, bodyHtml: string, options: PdfExportOptions = {}): string {
  const template = options.template ?? 'classic';
  const branding = options.branding ?? true;
  const fonts = FONT_STACKS[template];
  const accent = ACCENT[template];
  const isModern = template === 'modern';

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: A4;
      margin: 26mm 22mm 24mm 22mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
    }
    body {
      font-family: ${fonts.body};
      color: #1a1a1a;
      font-size: 12pt;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }
    .doc-header {
      border-bottom: ${isModern ? `4px solid ${accent}` : '2px solid #1a1a1a'};
      padding-bottom: 14px;
      margin-bottom: 28px;
    }
    .doc-header h1 {
      font-family: ${fonts.heading};
      font-size: 24pt;
      font-weight: 700;
      margin: 0 0 6px 0;
      letter-spacing: -0.01em;
      color: #0a0a0a;
    }
    .doc-meta {
      font-family: ${fonts.label};
      font-size: 9pt;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #6b6b6b;
    }
    h1, h2, h3, h4 {
      font-family: ${fonts.heading};
      color: ${isModern ? accent : '#0a0a0a'};
      font-weight: 700;
      line-height: 1.3;
      page-break-after: avoid;
    }
    h1 { font-size: 18pt; margin: 1.6em 0 0.6em; }
    h2 { font-size: 15pt; margin: 1.5em 0 0.5em; }
    h3 { font-size: 13pt; margin: 1.3em 0 0.4em; }
    h4 { font-size: 12pt; margin: 1.2em 0 0.4em; }
    p { margin: 0 0 0.85em 0; text-align: justify; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    a { color: ${accent}; text-decoration: none; border-bottom: 1px solid currentColor; }
    ul, ol { margin: 0 0 0.9em 0; padding-left: 1.4em; }
    li { margin: 0.28em 0; }
    li > ul, li > ol { margin-top: 0.28em; }
    blockquote {
      margin: 1em 0;
      padding: 0.4em 1.1em;
      border-left: 3px solid ${accent};
      background: #faf8f3;
      color: #3a3a3a;
      font-style: italic;
      page-break-inside: avoid;
    }
    hr {
      border: none;
      border-top: 1px solid #d8d8d8;
      margin: 1.8em 0;
    }
    code {
      font-family: 'SFMono-Regular', Menlo, Consolas, monospace;
      background: #f0f0ef;
      padding: 0.1em 0.35em;
      border-radius: 4px;
      font-size: 10.5pt;
    }
    pre {
      background: #1e1e1e;
      color: #e8e8e8;
      padding: 14px 16px;
      border-radius: 8px;
      font-size: 10pt;
      line-height: 1.5;
      overflow-wrap: break-word;
      white-space: pre-wrap;
      page-break-inside: avoid;
    }
    pre code {
      background: transparent;
      padding: 0;
      color: inherit;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0 1.4em 0;
      font-family: ${fonts.label};
      font-size: 10.5pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #d8d8d8;
      padding: 7px 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: ${isModern ? accent : '#1a1a1a'};
      color: #fff;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    tr:nth-child(even) td { background: #f7f7f5; }
    img { max-width: 100%; }
    .cta {
      margin-top: 44px;
      padding: 18px 20px;
      border-radius: 10px;
      border: 1px solid #e2e2e2;
      background: #fafaf9;
      text-align: center;
      page-break-inside: avoid;
    }
    .cta-title {
      font-family: ${fonts.heading};
      font-size: 13pt;
      font-weight: 700;
      color: #0a0a0a;
      margin-bottom: 4px;
    }
    .cta-body {
      font-family: ${fonts.label};
      font-size: 9.5pt;
      color: #6b6b6b;
      margin-bottom: 8px;
    }
    .cta-link {
      font-family: ${fonts.label};
      font-size: 11pt;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .doc-footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #d8d8d8;
      font-family: ${fonts.label};
      font-size: 8.5pt;
      color: #9a9a9a;
      text-align: center;
    }
  </style>
  </head><body>
    <div class="doc-header">
      <h1>${escapeHtml(title)}</h1>
      <div class="doc-meta">Generated ${escapeHtml(currentDate())} · Expert AI</div>
    </div>
    ${bodyHtml}
    ${branding ? brandingBlock(template) : ''}
    <div class="doc-footer">Expert AI · ssv.asia</div>
  </body></html>`;
}

async function shareFile(uri: string, mimeType: string, dialogTitle: string): Promise<void> {
  if (Platform.OS === 'web') return; // no share sheet on web preview
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(uri, { mimeType, dialogTitle });
  }
}

/** Renders markdown content to a real PDF file and opens the share sheet.
 *  Returns the file path so the caller can remember where it was saved. */
export async function exportAsPdf(title: string, markdown: string, options?: PdfExportOptions): Promise<string> {
  const html = wrapHtml(title, markdownToHtml(markdown), options);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await shareFile(uri, 'application/pdf', `Share "${title}"`);
  return uri;
}

async function exportAsPlainFile(title: string, content: string, extension: string, mimeType: string): Promise<string> {
  const safeName = title.replace(/[^a-z0-9-_ ]/gi, '_').slice(0, 60) || 'document';
  // A short uniqueness suffix — two exports with the same title in quick
  // succession (or re-exporting the same doc while a prior share sheet is
  // still open) would otherwise reuse the exact same cache path, risking the
  // OS sharing whichever write happens to land first.
  const unique = Date.now().toString(36);
  const path = `${FileSystem.cacheDirectory}${safeName}-${unique}.${extension}`;
  await FileSystem.writeAsStringAsync(path, content);
  await shareFile(path, mimeType, `Share "${title}"`);
  return path;
}

export async function exportAsMarkdown(title: string, content: string): Promise<string> {
  return exportAsPlainFile(title, content, 'md', 'text/markdown');
}

export async function exportAsText(title: string, content: string): Promise<string> {
  return exportAsPlainFile(title, content, 'txt', 'text/plain');
}
