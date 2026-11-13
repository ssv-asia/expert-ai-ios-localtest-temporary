import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import {
  NoteMarkdown,
  autoContinueList,
  notePaletteFrom,
  toggleLinePrefix,
  wordCount,
} from '@/features/daily-notes/note-markdown';

interface ThemeColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  background: string;
  sheetBackground: string;
  border: string;
  surface: string;
  surfaceRaised: string;
  accent: string;
  successColor: string;
}

export interface NoteWriterAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

interface NoteWriterProps {
  visible: boolean;
  colors: ThemeColors;
  isDark: boolean;
  title: string;
  streak: number;
  isViewingToday: boolean;
  /** Identifies the note in the editor; a change re-seeds the draft. */
  noteId: string | null;
  body: string;
  /** Debounced-persisted by the parent (mapped to the note id). */
  onChangeBody: (next: string) => void;
  onClose: () => void;
  onBackToToday: () => void;
  /** Extra actions surfaced in the overflow menu (AI insights, share, etc.). */
  actions: NoteWriterAction[];
}

export function NoteWriter({
  visible,
  colors,
  isDark,
  title,
  streak,
  isViewingToday,
  noteId,
  body,
  onChangeBody,
  onClose,
  onBackToToday,
  actions,
}: NoteWriterProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(body);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [mode, setMode] = useState<'write' | 'read'>('write');
  // `selection` always tracks the caret (via onSelectionChange). We only *control*
  // the TextInput's selection prop transiently — right after a programmatic caret
  // move — so normal typing stays uncontrolled and never fights the cursor.
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const selectionRef = useRef(selection);
  const [applySel, setApplySel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [saveState, setSaveState] = useState<'saved' | 'pending'>('saved');
  const [words, setWords] = useState(() => wordCount(body));
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastId = useRef<string | null>(null);

  const palette = useMemo(() => notePaletteFrom(colors), [colors]);

  // Re-seed the draft when the writer opens or the underlying note swaps (e.g.
  // the "Today" button, or opening an archived note straight into the writer).
  useEffect(() => {
    if (!visible) {
      lastId.current = null;
      return;
    }
    if (noteId !== lastId.current) {
      lastId.current = noteId;
      setDraft(body);
      setMode('write');
      setMenuOpen(false);
      setSaveState('saved');
    }
  }, [visible, noteId, body]);

  // Counting the whole note on every keystroke makes long journals feel
  // sticky while the native editor is scrolling. Update the small counter
  // after typing settles instead.
  useEffect(() => {
    const timer = setTimeout(() => setWords(wordCount(draft)), 250);
    return () => clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e?.endCoordinates?.height ?? 0));
    const h = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const scheduleSave = (next: string) => {
    setSaveState('pending');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChangeBody(next);
      setSaveState('saved');
      debounceRef.current = null;
    }, 500);
  };
  const persistNow = (next: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onChangeBody(next);
    setSaveState('saved');
  };

  const handleChange = (next: string) => {
    const cont = autoContinueList(draftRef.current, next);
    if (cont) {
      setDraft(cont.text);
      const nextSelection = { start: cont.caret, end: cont.caret };
      selectionRef.current = nextSelection;
      setSelection(nextSelection);
      setApplySel(true);
      scheduleSave(cont.text);
    } else {
      setDraft(next);
      scheduleSave(next);
    }
  };

  const applyPrefix = (kind: 'task' | 'heading' | 'bullet' | 'quote') => {
    const res = toggleLinePrefix(draftRef.current, selectionRef.current.start, kind);
    setDraft(res.text);
    const nextSelection = { start: res.caret, end: res.caret };
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setApplySel(true);
    scheduleSave(res.text);
    inputRef.current?.focus();
  };

  const close = () => {
    persistNow(draftRef.current);
    Keyboard.dismiss();
    onClose();
  };

  const bottomPad = keyboardHeight > 0 ? keyboardHeight : Math.max(insets.bottom, 8);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Top bar */}
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={close} hitSlop={8} style={styles.topIcon}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.sub, { color: colors.textTertiary }]}> 
              {words} {words === 1 ? 'word' : 'words'}
              {streak > 0 ? `  ·  🔥 ${streak}` : ''}
              {mode === 'write' ? `  ·  ${saveState === 'pending' ? 'Saving…' : 'Saved'}` : ''}
            </Text>
          </View>
          {!isViewingToday ? (
            <Pressable
              onPress={() => {
                persistNow(draftRef.current);
                onBackToToday();
              }}
              hitSlop={8}
              style={styles.topIcon}
            >
              <Ionicons name="today-outline" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              if (mode === 'write') {
                persistNow(draftRef.current);
                Keyboard.dismiss();
                setMode('read');
              } else {
                setMode('write');
                setTimeout(() => inputRef.current?.focus(), 60);
              }
            }}
            hitSlop={8}
            style={styles.topIcon}
          >
            <Ionicons name={mode === 'write' ? 'eye-outline' : 'create-outline'} size={22} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setMenuOpen((v) => !v)} hitSlop={8} style={styles.topIcon}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </Pressable>
        </View>

        {/* Overflow menu */}
        {menuOpen ? (
          <View style={[styles.menu, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => {
                  setMenuOpen(false);
                  persistNow(draftRef.current); // don't lose the last unsaved edits
                  a.onPress();
                }}
                style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons name={a.icon} size={18} color={colors.text} />
                <Text style={[styles.menuLabel, { color: colors.text }]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Body */}
        <KeyboardAvoidingView
          style={{ flex: 1, paddingBottom: bottomPad }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 48 : 0}
        >
          {mode === 'write' ? (
            <>
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={handleChange}
                onSelectionChange={(e) => {
                  // Track the caret without re-rendering the full writer on
                  // every selection/scroll event. Selection is only React
                  // state when applying a formatting command.
                  selectionRef.current = e.nativeEvent.selection;
                  if (applySel) setApplySel(false);
                }}
                selection={applySel ? selection : undefined}
                onBlur={() => persistNow(draftRef.current)}
                multiline
                autoFocus
                placeholder="Start writing…"
                placeholderTextColor={colors.textTertiary}
                style={[styles.editor, { color: colors.text }]}
                textAlignVertical="top"
                scrollEnabled
                autoCorrect
                keyboardAppearance={isDark ? 'dark' : 'default'}
              />
              {/* Formatting accessory bar — thin, icon-only, rides above keyboard */}
              <View style={[styles.toolbar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <ToolIcon icon="checkbox-outline" color={colors.text} onPress={() => applyPrefix('task')} />
                <ToolIcon icon="text-outline" color={colors.text} onPress={() => applyPrefix('heading')} />
                <ToolIcon icon="list-outline" color={colors.text} onPress={() => applyPrefix('bullet')} />
                <ToolIcon icon="chatbox-ellipses-outline" color={colors.text} onPress={() => applyPrefix('quote')} />
                <View style={{ flex: 1 }} />
                <ToolIcon icon="chevron-down" color={colors.textSecondary} onPress={() => Keyboard.dismiss()} />
              </View>
            </>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.readPad}
              keyboardShouldPersistTaps="handled"
            >
              {draft.trim() === '' ? (
                <Text style={{ color: colors.textTertiary, fontFamily: Fonts.sans, fontSize: 15.5 }}>
                  Nothing written yet.
                </Text>
              ) : (
                <NoteMarkdown
                  body={draft}
                  palette={palette}
                  fontScale={1.05}
                  onToggleTask={(next) => {
                    setDraft(next);
                    persistNow(next);
                  }}
                />
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ToolIcon({
  icon,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.toolIcon, { opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topIcon: {
    padding: 6,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15.5,
  },
  sub: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    marginTop: 1,
  },
  menu: {
    position: 'absolute',
    right: 10,
    top: 48,
    zIndex: 20,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    minWidth: 190,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  menuLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
  editor: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    borderRadius: 16,
    fontFamily: Fonts.sans,
    fontSize: 16.5,
    lineHeight: 26,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  toolIcon: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  readPad: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
});
