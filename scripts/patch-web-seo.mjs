import fs from 'node:fs';
import path from 'node:path';

const analytics = `
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-7CF63VSDMN"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-7CF63VSDMN');
    </script>
  `;

function htmlFiles(folder) {
  if (!fs.existsSync(folder)) return [];
  const files = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...htmlFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

for (const htmlPath of htmlFiles('dist')) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  const head = html.includes('G-7CF63VSDMN') ? '' : analytics + `
    <title>Expert AI Terminal</title>
    <meta name="description" content="Expert AI Terminal — an AI workspace for chat, research, voice input, tasks, and connected archives.">
    <link rel="canonical" href="https://app.ssv.asia/chat">
    <meta property="og:type" content="website">
    <meta property="og:title" content="Expert AI Terminal">
    <meta property="og:description" content="Use Expert AI Terminal in your browser for AI chat, research, voice input, tasks, and connected archives.">
    <meta property="og:url" content="https://app.ssv.asia/chat">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Expert AI Terminal">
    <meta name="twitter:description" content="Expert AI Terminal — AI chat and productivity tools in your browser.">
    <style id="expert-ai-boot-style">#expert-ai-boot{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#15121C;color:#F8F6FB;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}#expert-ai-boot img{width:112px;height:112px;object-fit:contain;margin-bottom:14px}#expert-ai-boot strong{font-size:22px;letter-spacing:-.5px}#expert-ai-boot em{font-style:normal;color:#C7B7FF;font-weight:400}</style>
  `;
  if (head) html = html.replace(/<head>/i, `<head>${head}`);
  if (!html.includes('id="expert-ai-boot"')) {
    html = html.replace(/<body([^>]*)>/i, `<body$1><div id="expert-ai-boot" aria-label="Loading Expert AI"><img src="/expert-ai-owl-splash.png" alt="Expert AI"><strong>expert <em>ai</em></strong></div>`);
  }
  fs.writeFileSync(htmlPath, html);
}
