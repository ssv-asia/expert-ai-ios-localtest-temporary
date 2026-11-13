import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, Clock3, File, Folder, HardDrive, House, Search, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/features/auth/store';
import { useWorkspaceStore } from '@/features/workspace/store';
import { usePiClient, type PathCompletion } from '@expertai/client';

const RECENT_PATHS_KEY = 'computer_browser_recent_paths_v1';
const RECENT_PATHS_LIMIT = 5;
const READABLE_EXTENSIONS = new Set([
  'adoc', 'bat', 'c', 'cc', 'cfg', 'conf', 'cpp', 'cs', 'css', 'csv', 'cxx', 'dart',
  'ex', 'exs', 'go', 'gradle', 'graphql', 'h', 'hpp', 'htm', 'html', 'ini', 'ipynb',
  'java', 'js', 'json', 'jsonc', 'jsx', 'kt', 'kts', 'less', 'log', 'lua', 'md',
  'mdx', 'mjs', 'cjs', 'mm', 'php', 'pl', 'properties', 'proto', 'ps1', 'py', 'rb',
  'rs', 'rst', 'sass', 'scala', 'scss', 'sh', 'sql', 'svelte', 'swift', 'tex', 'toml',
  'ts', 'tsx', 'txt', 'vue', 'xml', 'yaml', 'yml', 'zsh',
]);
const READABLE_NAMES = new Set([
  '.env', '.gitignore', '.dockerignore', '.editorconfig', 'dockerfile', 'makefile',
  'cargo.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
]);

function isAgentReadableFile(path: string) {
  const name = path.split(/[\\/]/).at(-1)?.toLowerCase() ?? '';
  if (READABLE_NAMES.has(name)) return true;
  const extension = name.includes('.') ? name.split('.').at(-1) : '';
  return !!extension && READABLE_EXTENSIONS.has(extension);
}

async function readRecentPaths(key: string): Promise<PathCompletion[]> {
  try {
    const raw = Platform.OS === 'web' ? localStorage.getItem(key) : await SecureStore.getItemAsync(key);
    const paths: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(paths)
      ? paths.filter((path): path is string => typeof path === 'string' && path.length > 0)
          .slice(0, RECENT_PATHS_LIMIT).map((path) => ({ path, is_dir: true }))
      : [];
  } catch {
    return [];
  }
}

async function writeRecentPaths(key: string, paths: PathCompletion[]) {
  try {
    const value = JSON.stringify(paths.slice(0, RECENT_PATHS_LIMIT).map(({ path }) => path));
    if (Platform.OS === 'web') localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Recent navigation remains usable in memory if device storage is unavailable.
  }
}

interface FileBrowserSheetProps {
  visible: boolean;
  onClose: () => void;
  onUsePath?: (path: string, isDirectory: boolean) => void;
  onChooseFolder?: (path: string) => void;
}

function parentPath(path: string) {
  const clean = path.replace(/[\\/]+$/, '');
  if (!clean || clean === '/') return '';
  if (/^[A-Za-z]:$/.test(clean)) return '';
  const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  if (index < 0) return '';
  if (/^[A-Za-z]:/.test(clean) && index === 2) return `${clean.slice(0, 3)}`;
  return clean.slice(0, index) || '/';
}

function pathName(path: string) {
  const clean = path.replace(/[\\/]+$/, '');
  if (/^[A-Za-z]:$/.test(clean)) return `Drive ${clean[0].toUpperCase()}`;
  if (clean === '/') return 'Computer';
  return clean.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function FileBrowserSheet({ visible, onClose, onUsePath, onChooseFolder }: FileBrowserSheetProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const accent = '#8B5CF6';
  const buttonBackground = colors.surfaceRaised;
  const errorColor = colors.destructive;
  const onTint = '#FFFFFF';
  const insets = useSafeAreaInsets();
  const { api } = usePiClient();
  const activeServerId = useAuthStore((state) => state.activeServerId);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const recentKey = `${RECENT_PATHS_KEY}:${activeServerId ?? 'default'}`;
  const [tab, setTab] = useState<'computer' | 'recent'>('computer');
  const [fileFilter, setFileFilter] = useState<'readable' | 'all'>('readable');
  const [search, setSearch] = useState('');
  const [directory, setDirectory] = useState('');
  const [entries, setEntries] = useState<PathCompletion[]>([]);
  const [selected, setSelected] = useState<PathCompletion | null>(null);
  const [recent, setRecent] = useState<PathCompletion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (path: string) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      // Root discovery returns home locations and mounted drives. Inside a
      // location, list the directory itself so large folders and dotfiles are
      // not lost to autocomplete's result cap or hidden-file filtering.
      const items = path
        ? (await api.fsList(path)).entries.map(({ path: itemPath, is_dir }) => ({ path: itemPath, is_dir }))
        : await api.fsComplete('');
      if (currentRequest === requestId.current) setEntries(items);
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setEntries([]);
        setError(cause instanceof Error ? cause.message : 'Could not browse this location.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!visible) return;
    setTab('computer');
    setFileFilter('readable');
    setSearch('');
    setDirectory('');
    setSelected(null);
    void load('');
    let active = true;
    void readRecentPaths(recentKey).then((paths) => { if (active) setRecent(paths); });
    return () => { active = false; };
  }, [visible, load, recentKey]);

  useEffect(() => () => { requestId.current += 1; }, []);

  const remember = useCallback((path: string) => {
    setRecent((current) => {
      const updated = [{ path, is_dir: true }, ...current.filter((item) => item.path !== path)].slice(0, RECENT_PATHS_LIMIT);
      void writeRecentPaths(recentKey, updated);
      return updated;
    });
  }, [recentKey]);

  const openDirectory = useCallback((path: string) => {
    setTab('computer');
    setDirectory(path);
    setSelected({ path, is_dir: true });
    remember(path);
    void load(path);
  }, [load, remember]);

  const recentItems = useMemo(() => {
    const saved = workspaces.map((workspace) => ({ path: workspace.path, is_dir: true }));
    return [...recent, ...saved.filter((workspace) => !recent.some((item) => item.path === workspace.path))];
  }, [recent, workspaces]);

  const useSelected = () => {
    if (!selected) return;
    onUsePath?.(selected.path, selected.is_dir);
    onClose();
  };

  const chooseWorkspace = () => {
    const folder = selected?.is_dir ? selected.path : tab === 'computer' ? directory : '';
    if (!folder) return;
    onChooseFolder?.(folder);
    onClose();
  };

  const showRows = useMemo(() => {
    const source = tab === 'computer' ? entries : recentItems;
    const query = search.trim().toLocaleLowerCase();
    return source.filter((item) => {
      if (item.is_dir) return !query || pathName(item.path).toLocaleLowerCase().includes(query) || item.path.toLocaleLowerCase().includes(query);
      if (tab === 'computer' && fileFilter === 'readable' && !isAgentReadableFile(item.path)) return false;
      return !query || pathName(item.path).toLocaleLowerCase().includes(query) || item.path.toLocaleLowerCase().includes(query);
    });
  }, [entries, fileFilter, recentItems, search, tab]);

  const handleBack = useCallback(() => {
    if (!directory) {
      onClose();
      return;
    }
    const parent = parentPath(directory);
    setDirectory(parent);
    setSelected(parent ? { path: parent, is_dir: true } : null);
    setSearch('');
    void load(parent);
  }, [directory, load, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleBack}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityLabel="Close computer browser" />
        <View style={[styles.sheet, { backgroundColor: colors.sheetBackground, paddingBottom: Math.max(insets.bottom, 18) + 12 }]}>
          <View style={[styles.handle, { backgroundColor: colors.sheetHandle }]} />
          <View style={styles.header}>
            {directory ? (
              <Pressable onPress={handleBack} style={styles.iconButton} accessibilityLabel="Go up one folder">
                <ArrowLeft size={19} color={colors.text} />
              </Pressable>
            ) : <View style={styles.iconButton}><HardDrive size={19} color={accent} /></View>}
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>Browse this computer</Text>
              <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textTertiary }]}>{directory || 'Drives and common folders'}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconButton} accessibilityLabel="Close browser"><X size={19} color={colors.text} /></Pressable>
          </View>
          <View style={styles.tabs}>
            <Pressable onPress={() => { setTab('computer'); setDirectory(''); setSelected(null); void load(''); }} style={[styles.tab, { borderColor: tab === 'computer' ? accent : colors.border, backgroundColor: tab === 'computer' ? buttonBackground : 'transparent' }]}>
              <House size={14} color={tab === 'computer' ? accent : colors.textTertiary} /><Text style={[styles.tabText, { color: colors.text }]}>Computer</Text>
            </Pressable>
            <Pressable onPress={() => { setTab('recent'); setSelected(null); }} style={[styles.tab, { borderColor: tab === 'recent' ? accent : colors.border, backgroundColor: tab === 'recent' ? buttonBackground : 'transparent' }]}>
              <Clock3 size={14} color={tab === 'recent' ? accent : colors.textTertiary} /><Text style={[styles.tabText, { color: colors.text }]}>Recent folders</Text>
            </Pressable>
          </View>
          <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: buttonBackground }]}>
            <Search size={15} color={colors.textTertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Filter this location"
              placeholderTextColor={colors.textTertiary}
              style={[styles.searchInput, { color: colors.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Filter current folder"
            />
            <Text style={[styles.count, { color: colors.textTertiary }]}>{showRows.length}</Text>
          </View>
          {tab === 'computer' ? (
            <View style={styles.filterTabs}>
              <Pressable onPress={() => { setFileFilter('readable'); setSelected(null); }} style={[styles.filterTab, { backgroundColor: fileFilter === 'readable' ? buttonBackground : 'transparent', borderColor: fileFilter === 'readable' ? accent : colors.border }]}>
                <Text style={[styles.filterText, { color: fileFilter === 'readable' ? accent : colors.textSecondary }]}>Agent-readable</Text>
              </Pressable>
              <Pressable onPress={() => { setFileFilter('all'); setSelected(null); }} style={[styles.filterTab, { backgroundColor: fileFilter === 'all' ? buttonBackground : 'transparent', borderColor: fileFilter === 'all' ? accent : colors.border }]}>
                <Text style={[styles.filterText, { color: fileFilter === 'all' ? accent : colors.textSecondary }]}>All files</Text>
              </Pressable>
            </View>
          ) : null}
          {directory ? (
            <View style={[styles.breadcrumb, { backgroundColor: buttonBackground, borderColor: colors.border }]}> 
              <Text numberOfLines={1} style={[styles.pathText, { color: colors.textSecondary }]}>{directory}</Text>
            </View>
          ) : null}
          {loading ? <View style={styles.loading}><ActivityIndicator color={accent} /><Text style={[styles.empty, { color: colors.textTertiary }]}>Loading items…</Text></View> : error ? (
            <View style={styles.loading}><Text style={[styles.empty, { color: errorColor }]}>{error}</Text><Pressable onPress={() => void load(directory)}><Text style={[styles.retry, { color: accent }]}>Try again</Text></Pressable></View>
          ) : showRows.length === 0 ? <View style={styles.loading}><Text style={[styles.empty, { color: colors.textTertiary }]}>{tab === 'recent' ? 'Folders you open will appear here.' : 'No folders were found.'}</Text></View> : (
            <FlatList
              data={showRows}
              keyExtractor={(item) => item.path}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              initialNumToRender={12}
              windowSize={7}
              renderItem={({ item, index }) => {
                const active = selected?.path === item.path;
                const label = tab === 'computer' && !directory && index === 0 ? 'Home' : pathName(item.path);
                return (
                  <Pressable
                    onPress={() => item.is_dir ? openDirectory(item.path) : setSelected(item)}
                    onLongPress={() => setSelected(item)}
                    style={[styles.row, { borderColor: colors.border, backgroundColor: active ? buttonBackground : 'transparent' }]}
                  >
                    {item.is_dir ? <Folder size={18} color={accent} /> : <File size={18} color={colors.textTertiary} />}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[styles.rowName, { color: colors.text }]}>{label}</Text>
                      <Text numberOfLines={1} style={[styles.pathText, { color: colors.textTertiary }]}>{item.path}</Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
          <View style={styles.footer}>
            {selected && onUsePath ? <Pressable onPress={useSelected} style={[styles.secondary, { borderColor: colors.border }]}><Text style={[styles.actionText, { color: colors.text }]}>Attach path to chat</Text></Pressable> : null}
            {onChooseFolder ? <Pressable onPress={chooseWorkspace} disabled={!selected?.is_dir && !(tab === 'computer' && directory)} style={[styles.primary, { backgroundColor: accent, opacity: (!selected?.is_dir && !(tab === 'computer' && directory)) ? 0.5 : 1 }]}><Text style={[styles.actionText, { color: onTint }]}>Use as workspace</Text></Pressable> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.52)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 8, maxHeight: '88%', minHeight: '56%' },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
  subtitle: { fontFamily: Fonts.sans, fontSize: 11, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38, flex: 1, borderWidth: 1, borderRadius: 10 },
  tabText: { fontFamily: Fonts.sansMedium, fontSize: 12 },
  searchBox: { minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 7, fontFamily: Fonts.sans, fontSize: 12 },
  count: { fontFamily: Fonts.mono, fontSize: 10 },
  filterTabs: { flexDirection: 'row', gap: 7, marginTop: 8, marginBottom: 4 },
  filterTab: { minHeight: 30, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 9 },
  filterText: { fontFamily: Fonts.sansMedium, fontSize: 10 },
  breadcrumb: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  pathText: { fontFamily: Fonts.mono, fontSize: 10 },
  list: { flexGrow: 0, flexShrink: 1, minHeight: 90 },
  row: { minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  rowName: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  loading: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 8 },
  empty: { fontFamily: Fonts.sans, fontSize: 12, textAlign: 'center' },
  retry: { fontFamily: Fonts.sansSemiBold, fontSize: 13, padding: 8 },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 12 },
  primary: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  secondary: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1 },
  actionText: { fontFamily: Fonts.sansSemiBold, fontSize: 12 },
});
