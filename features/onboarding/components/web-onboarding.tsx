import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Fonts } from '@/constants/theme';

type TargetRect = { x: number; y: number; width: number; height: number };
type Props = { onCreateAccount: () => void; onSkip: () => void; targetRects?: Record<string, TargetRect> };

const intro = [
  { kicker: 'WELCOME TO EXPERT AI', title: 'A calmer way to get difficult work moving.', body: 'Ask, research, plan, and create in one focused workspace.', icon: 'sparkles-outline' as const, color: '#C7B7FF' },
  { kicker: 'WRITE LESS. FINISH MORE.', title: 'Start with a thought. Leave with something useful.', body: 'Drafts, explanations, plans, comparisons, and next steps — without wrestling with a blank page.', icon: 'chatbubble-ellipses-outline' as const, color: '#9EDBC9' },
  { kicker: 'BUILT FOR REAL WORK', title: 'Bring the context your answer needs.', body: 'Use files, images, voice, grounded research, tasks, and saved conversations when the work gets serious.', icon: 'layers-outline' as const, color: '#F4C98A' },
];

const tour = [
  ['Account & access', 'Sign in or create your free account', 'The top-right account control opens the secure email-code and Google sign-in flow. Your conversations and access live with your account.', 'person-circle-outline', 'account'],
  ['Message composer', 'Type what you want to accomplish', 'Write a question, paste a brief, or describe the outcome. You do not need technical wording.', 'create-outline', 'composer'],
  ['Images & files', 'Add visual context to your prompt', 'Attach screenshots or image files beside the message box. Expert AI analyzes the image privately on-device first, then you choose whether to send the extracted text or the image itself when your plan supports it.', 'image-outline', 'attach'],
  ['Voice input', 'Speak instead of typing', 'Tap the microphone beside the composer for ideas, notes, long prompts, or work on the move.', 'mic-outline', 'voice'],
  ['New chat', 'Start a clean thread', 'The pencil creates a new conversation so a new question does not inherit the previous thread context.', 'create-outline', 'newChat'],
  ['History', 'Return to work you already started', 'The clock opens saved conversations. Search, reopen, pin, share, branch, or move chats into a project.', 'time-outline', 'history'],
  ['Daily notes & tasks', 'Make recurring work repeatable', 'The alarm opens Daily Notes and Scheduled Tasks. Capture notes, extract tasks, and schedule follow-ups.', 'alarm-outline', 'planner'],
  ['Search this chat', 'Find a detail without rereading everything', 'The magnifier searches the current conversation and moves between matches.', 'search-outline', 'search'],
  ['Workspace panel', 'Connect GitHub and work on real files', 'The archive icon opens three connected areas: Archive for GitHub repositories, Projects for grouping related chats, and Documents for saved work. Connect GitHub or paste a public repository link, browse folders, and open a Markdown or text file directly in chat. Ask Expert AI to explain, rewrite, or patch the file; review the changes, then commit them back to GitHub when you have write access. Public repositories can be read without sign-in.', 'archive-outline', 'workspace'],
  ['Agent mode & QR pairing', 'Use your phone as the bridge to your computer', 'Download Expert AI Agent for Windows or macOS. On mobile, tap the QR icon to open the scanner and scan the desktop pairing code. The paired computer can read and write files, run Bash commands, inspect projects, and carry out multi-step work with you.', 'qr-code-outline', 'agent'],
  ['Slash workflows', 'Use focused modes when the task needs one', 'Type /task or /research for durable work, /verify or /critique for stronger scrutiny, /doc or /nodoc to control document context, /fresh or /recent 5 to control conversation context, and /memo, /table, /checklist, /study, /meeting, or /executive for structured output.', 'options-outline', 'composer'],
  ['Model routing', 'Choose the kind of help you need, turn by turn', 'Expert AI sends each message through its automatic Unlimited router, so you do not have to manage a model setting for every session. You can express a preference in your prompt — for example, “Use Sonnet for this” — while the router selects from the models available to your account. The served model is shown in the response details when available; a prompt preference is not currently a guaranteed hard switch.', 'git-branch-outline', 'composer'],
  ['Grounded output', 'Turn answers into usable work', 'Research can be grounded with citations; responses can be regenerated, verified, read aloud, saved to notes/documents, scheduled, or reported from the response actions.', 'shield-checkmark-outline', 'composer'],
] as const;

function spotlight(target: string, width: number, rect?: TargetRect) {
  if (rect) return { left: rect.x - 6, top: rect.y - 6, width: rect.width + 12, height: rect.height + 12 };
  const index: Record<string, number> = { newChat: 0, history: 1, planner: 2, search: 3, workspace: 4, agent: 5 };
  if (target === 'account') return { top: 6, right: 12, width: 124, height: 42 };
  if (target === 'composer') return { left: 16, right: Math.max(132, Math.min(250, width * 0.32)), bottom: 12, height: 52 };
  if (target === 'attach') return { right: 92, bottom: 17, width: 38, height: 42 };
  if (target === 'voice') return { right: 50, bottom: 17, width: 38, height: 42 };
  const cell = width / 6;
  return { left: cell * (index[target] ?? 0) + Math.max(2, (cell - 38) / 2), bottom: 70, width: 38, height: 38 };
}

export function WebOnboarding({ onCreateAccount, onSkip, targetRects = {} }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [introStep, setIntroStep] = useState(0);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [measuredRects, setMeasuredRects] = useState<Record<string, TargetRect>>({});
  const page = intro[introStep];

  useEffect(() => {
    if (Platform.OS !== 'web' || tourStep === null || typeof document === 'undefined') return;
    const labels: Record<string, string> = {
      account: 'Account access', composer: 'Message', attach: 'Attach image', voice: 'Voice input',
      newChat: 'New chat', history: 'Chat history', planner: 'Daily notes and scheduled tasks',
      search: 'Search this chat', workspace: 'Open workspace panel (documents & canvas)',
      agent: 'Switch to Agent mode (scan desktop QR)',
    };
    const measure = () => {
      const next: Record<string, TargetRect> = {};
      const overlay = document.querySelector<HTMLElement>('[aria-label="Expert AI feature tutorial"]');
      const overlayRect = overlay?.getBoundingClientRect();
      Object.entries(labels).forEach(([key, label]) => {
        const visible = Array.from(document.querySelectorAll<HTMLElement>(`[aria-label="${label}"]`)).find((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        });
        if (visible) {
          const rect = visible.getBoundingClientRect();
          next[key] = {
            x: rect.left - (overlayRect?.left ?? 0),
            y: rect.top - (overlayRect?.top ?? 0),
            width: rect.width,
            height: rect.height,
          };
        }
      });
      setMeasuredRects(next);
    };
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('resize', measure); };
  }, [tourStep, width]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflowX;
    const previousBodyOverflow = body.style.overflowX;
    html.style.overflowX = 'hidden';
    body.style.overflowX = 'hidden';
    return () => {
      html.style.overflowX = previousHtmlOverflow;
      body.style.overflowX = previousBodyOverflow;
    };
  }, []);

  if (tourStep !== null) {
    const item = tour[tourStep];
    return <View style={[styles.tourOverlay, styles.onboardingViewport]} accessibilityViewIsModal accessibilityLabel="Expert AI feature tutorial">
      <View style={[styles.tourTop, compact && styles.tourTopCompact]}><View style={styles.brandMark}><Ionicons name="sparkles" size={18} color="#17131D" /></View><Text style={styles.brand}>expert <Text style={styles.brandThin}>ai</Text></Text>{!compact && <Text style={styles.meta}>INTERACTIVE WALKTHROUGH</Text>}<Pressable onPress={onSkip} style={styles.close}><Text style={styles.closeText}>Skip tour</Text><Ionicons name="close" size={16} color="#B9B1C5" /></Pressable></View>
      <View style={[styles.spotlight, spotlight(item[4], width, measuredRects[item[4]] ?? targetRects[item[4]])]}><View style={styles.spotlightPulse} /></View>
      <ScrollView style={styles.tourScroll} contentContainerStyle={[styles.tourScrollContent, compact && styles.tourScrollContentCompact]} showsVerticalScrollIndicator={false}>
        <View style={[styles.tourPanel, compact && styles.tourPanelCompact]}><View style={styles.tourCounter}><Text style={styles.counterText}>{String(tourStep + 1).padStart(2, '0')}</Text><View style={styles.counterLine}><View style={[styles.counterFill, { width: `${((tourStep + 1) / tour.length) * 100}%` }]} /></View><Text style={styles.counterText}>{tour.length}</Text></View><View style={styles.pointer}><Ionicons name="arrow-down" size={19} color="#C7B7FF" /><Text style={styles.pointerText}>Highlighted in the real app behind this guide</Text></View><View style={styles.cardIcon}><Ionicons name={item[3]} size={24} color="#17131D" /></View><Text style={styles.tourName}>{item[0].toUpperCase()}</Text><Text style={styles.tourTitle}>{item[1]}</Text><Text style={styles.tourBody}>{item[2]}</Text><View style={styles.tourActions}><Pressable onPress={() => tourStep > 0 ? setTourStep(tourStep - 1) : setTourStep(null)} style={styles.back}><Ionicons name="arrow-back" size={16} color="#B9B1C5" /><Text style={styles.backText}>Back</Text></Pressable><View style={styles.dots}>{tour.map((_, i) => <View key={i} style={[styles.dot, i === tourStep && styles.dotActive]} />)}</View><Pressable onPress={() => tourStep === tour.length - 1 ? onCreateAccount() : setTourStep(tourStep + 1)} style={styles.next}><Text style={styles.nextText}>{tourStep === tour.length - 1 ? 'Create free account' : 'Next feature'}</Text><Ionicons name="arrow-forward" size={17} color="#17131D" /></Pressable></View></View>
      </ScrollView><Text style={styles.tourFooter}>You can skip at any time</Text>
    </View>;
  }

  return <View style={styles.introOverlay} accessibilityViewIsModal accessibilityLabel="Expert AI introduction"><View style={styles.glowOne} /><View style={styles.glowTwo} /><ScrollView style={styles.introScroll} contentContainerStyle={styles.introScrollContent} showsVerticalScrollIndicator={false}><View style={styles.introShell}><View style={[styles.header, compact && styles.headerCompact]}><View style={styles.brandMark}><Ionicons name="sparkles" size={18} color="#17131D" /></View><Text style={styles.brand}>expert <Text style={styles.brandThin}>ai</Text></Text>{!compact && <Text style={styles.meta}>YOUR WORK, AMPLIFIED</Text>}<Pressable onPress={onSkip} style={styles.close}><Text style={styles.closeText}>Skip introduction</Text><Ionicons name="arrow-forward" size={15} color="#B9B1C5" /></Pressable></View><View style={[styles.introContent, compact && styles.introContentCompact]}><View style={styles.copy}><View style={styles.progress}><View style={[styles.progressFill, { width: `${((introStep + 1) / intro.length) * 100}%`, backgroundColor: page.color }]} /></View><Text style={styles.counterText}>0{introStep + 1} / 0{intro.length}</Text><Text style={[styles.eyebrow, { color: page.color }]}>{page.kicker}</Text><Text style={[styles.introTitle, compact && styles.introTitleCompact]}>{page.title}</Text><Text style={styles.introBody}>{page.body}</Text><View style={styles.introActions}><Pressable onPress={() => introStep === intro.length - 1 ? setTourStep(0) : setIntroStep(introStep + 1)} style={[styles.next, { backgroundColor: page.color }]}><Text style={styles.nextText}>{introStep === intro.length - 1 ? 'Start the feature tour' : 'Continue'}</Text><Ionicons name="arrow-forward" size={18} color="#17131D" /></Pressable><Pressable onPress={onSkip} style={styles.explore}><Text style={styles.exploreText}>I&apos;ll explore on my own</Text></Pressable></View><View style={styles.dots}>{intro.map((_, i) => <View key={i} style={[styles.dot, i === introStep && { width: 22, backgroundColor: page.color }]} />)}</View></View><View style={[styles.visual, compact && styles.visualCompact]}><View style={[styles.visualHalo, { borderColor: `${page.color}66`, backgroundColor: `${page.color}18` }]}><Ionicons name={page.icon} size={43} color={page.color} /></View><View style={styles.visualCard}><View style={styles.visualBar}><View style={styles.winDot} /><View style={styles.winDot} /><View style={styles.winDot} /><Text style={styles.visualLabel}>EXPERT AI</Text><Text style={styles.visualReady}>READY</Text></View><View style={styles.visualMain}><View style={styles.fakeRail}><View style={[styles.fakeSquare, { backgroundColor: page.color }]}><Ionicons name="sparkles" size={14} color="#17131D" /></View><View style={styles.fakeLine} /><View style={styles.fakeLineShort} /><View style={styles.fakeLine} /></View><View style={styles.fakeChat}><Text style={styles.fakeKicker}>A FOCUSED WORKSPACE</Text><Text style={styles.fakeHeadline}>Make progress on the work that matters.</Text><View style={styles.fakeReply}><View style={styles.fakeAvatar}><Ionicons name="sparkles" size={12} color="#17131D" /></View><Text style={styles.fakeText}>Clear answers. Useful next steps.</Text></View><View style={styles.fakeInput}><Text style={styles.fakePlaceholder}>Ask anything</Text><Ionicons name="arrow-up-circle" size={20} color={page.color} /></View></View></View></View><View style={styles.badge}><Ionicons name="checkmark" size={14} color="#17131D" /><Text style={styles.badgeText}>Less busywork</Text></View></View></View><Text style={styles.footer}>Private by design · Start free · No credit card required</Text></View></ScrollView></View>;
}

const styles = StyleSheet.create({
  onboardingViewport: { width: '100%', maxWidth: '100%', overflow: 'hidden' },
  introOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, backgroundColor: '#15121C' }, tourOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, backgroundColor: 'rgba(14,12,20,0.52)', alignItems: 'center' }, glowOne: { position: 'absolute', width: 560, height: 560, borderRadius: 280, backgroundColor: '#594B8C', opacity: .18, top: -230, right: -130 }, glowTwo: { position: 'absolute', width: 420, height: 420, borderRadius: 210, backgroundColor: '#3B7568', opacity: .12, bottom: -180, left: -150 }, introScroll: { flex: 1 }, introScrollContent: { flexGrow: 1 }, introShell: { width: '100%', maxWidth: 1220, minHeight: '100%', paddingHorizontal: 38, paddingVertical: 28, justifyContent: 'space-between', alignSelf: 'center' }, header: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 }, headerCompact: { paddingTop: 42, paddingRight: 116 }, brandMark: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#C7B7FF', alignItems: 'center', justifyContent: 'center' }, brand: { fontFamily: Fonts.sansBold, fontSize: 19, color: '#F8F6FB' }, brandThin: { fontFamily: Fonts.sans, color: '#B8A1FF' }, meta: { fontFamily: Fonts.sansSemiBold, fontSize: 10, color: '#81798E', letterSpacing: 1.4, marginLeft: 10 }, close: { position: 'absolute', top: 0, right: 0, flexDirection: 'row', gap: 8, alignItems: 'center', padding: 8 }, closeText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: '#B9B1C5' }, introContent: { flexDirection: 'row', alignItems: 'center', gap: 55, flex: 1, paddingVertical: 25 }, introContentCompact: { flexDirection: 'column', gap: 24, justifyContent: 'flex-start', paddingTop: 32 }, copy: { flex: 1, maxWidth: 540, paddingLeft: 18 }, progress: { width: 170, height: 3, backgroundColor: '#302A3A', borderRadius: 2, overflow: 'hidden', marginBottom: 15 }, progressFill: { height: '100%' }, eyebrow: { fontFamily: Fonts.sansBold, fontSize: 11, letterSpacing: 1.7, marginTop: 16, marginBottom: 12 }, introTitle: { fontFamily: Fonts.sansBold, color: '#FBFAFD', fontSize: 54, lineHeight: 58, letterSpacing: -2.2 }, introTitleCompact: { fontSize: 36, lineHeight: 41, letterSpacing: -1 }, introBody: { fontFamily: Fonts.sans, color: '#ADA6B7', fontSize: 17, lineHeight: 27, marginTop: 18 }, introActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginTop: 28 }, next: { minHeight: 52, borderRadius: 15, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#C7B7FF' }, nextText: { fontFamily: Fonts.sansBold, fontSize: 14, color: '#17131D' }, explore: { paddingVertical: 12 }, exploreText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: '#AAA2B4', textDecorationLine: 'underline' }, dots: { flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 30 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#51495C' }, visual: { flex: 1, minHeight: 440, maxWidth: 580, alignItems: 'center', justifyContent: 'center', position: 'relative' }, visualCompact: { width: '100%', minHeight: 245, flex: 0 }, visualHalo: { position: 'absolute', top: 6, right: 26, width: 80, height: 80, borderRadius: 40, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, visualCard: { width: '100%', maxWidth: 530, borderRadius: 20, backgroundColor: '#24202D', borderWidth: 1, borderColor: '#3C3549', transform: [{ rotate: '-2deg' }] }, visualBar: { height: 38, borderBottomWidth: 1, borderBottomColor: '#393342', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 5 }, winDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#645C71' }, visualLabel: { fontFamily: Fonts.sansBold, color: '#9B92A8', fontSize: 9, letterSpacing: 1.5, marginLeft: 8 }, visualReady: { marginLeft: 'auto', fontFamily: Fonts.mono, color: '#7DCFB6', fontSize: 8 }, visualMain: { flexDirection: 'row', minHeight: 205, padding: 17 }, fakeRail: { width: 38, alignItems: 'center', gap: 12 }, fakeSquare: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, fakeLine: { width: 20, height: 5, borderRadius: 3, backgroundColor: '#3A3445' }, fakeLineShort: { width: 13, height: 5, borderRadius: 3, backgroundColor: '#3A3445' }, fakeChat: { flex: 1, paddingLeft: 15 }, fakeKicker: { fontFamily: Fonts.sansBold, fontSize: 8, color: '#756D81', letterSpacing: 1.2 }, fakeHeadline: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: '#F3F0F7', marginTop: 9 }, fakeReply: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 }, fakeAvatar: { width: 24, height: 24, borderRadius: 7, backgroundColor: '#9EDBC9', alignItems: 'center', justifyContent: 'center' }, fakeText: { fontFamily: Fonts.sansMedium, color: '#CEC8D7', fontSize: 11 }, fakeInput: { height: 40, borderRadius: 11, borderWidth: 1, borderColor: '#4A4257', marginTop: 27, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, fakePlaceholder: { fontFamily: Fonts.sans, color: '#7E758D', fontSize: 11 }, badge: { position: 'absolute', bottom: 13, left: -7, padding: 10, paddingRight: 16, borderRadius: 12, backgroundColor: '#F8F6FB', flexDirection: 'row', gap: 8, alignItems: 'center' }, badgeText: { fontFamily: Fonts.sansBold, color: '#211C28', fontSize: 11 }, footer: { textAlign: 'center', fontFamily: Fonts.sans, color: '#655E6D', fontSize: 11, paddingBottom: 2 },
  tourTop: { position: 'absolute', top: 28, left: 38, right: 38, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 2 }, tourTopCompact: { top: 18, left: 18, right: 18, paddingRight: 100 }, tourScroll: { width: '100%', flex: 1 }, tourScrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 105, paddingBottom: 55 }, tourScrollContentCompact: { paddingTop: 82, paddingBottom: 52 }, tourPanel: { width: '92%', maxWidth: 620, borderRadius: 20, padding: 28, backgroundColor: 'rgba(28,24,38,0.98)', borderWidth: 1, borderColor: '#6B5A94' }, tourPanelCompact: { padding: 20, borderRadius: 17 }, tourCounter: { flexDirection: 'row', alignItems: 'center', gap: 9 }, counterText: { fontFamily: Fonts.mono, color: '#9E92B5', fontSize: 11 }, counterLine: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#3A3249', overflow: 'hidden' }, counterFill: { height: '100%', backgroundColor: '#C7B7FF' }, pointer: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 20, marginBottom: 16 }, pointerText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: '#CFC7DC', flex: 1 }, cardIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#C7B7FF', alignItems: 'center', justifyContent: 'center' }, tourName: { fontFamily: Fonts.sansBold, color: '#C7B7FF', fontSize: 10, letterSpacing: 1.5, marginTop: 16 }, tourTitle: { fontFamily: Fonts.sansBold, color: '#FBFAFD', fontSize: 28, lineHeight: 33, marginTop: 8 }, tourBody: { fontFamily: Fonts.sans, color: '#B5ACBF', fontSize: 15, lineHeight: 23, marginTop: 12 }, tourActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24 }, back: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10 }, backText: { fontFamily: Fonts.sansMedium, color: '#B9B1C5', fontSize: 13 }, spotlight: { position: 'absolute', borderWidth: 2, borderColor: '#C7B7FF', borderRadius: 12, shadowColor: '#C7B7FF', shadowOpacity: .95, shadowRadius: 16, backgroundColor: 'rgba(199,183,255,0.08)', zIndex: 1 }, spotlightPulse: { ...StyleSheet.absoluteFillObject, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.38)' }, tourFooter: { position: 'absolute', bottom: 14, alignSelf: 'center', fontFamily: Fonts.sans, fontSize: 11, color: '#8C8399' },
  dotActive: { width: 20, backgroundColor: '#C7B7FF' },
});
