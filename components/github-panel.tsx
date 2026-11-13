// "Archives" tab of the workspace panel — connect a GitHub repo (your own,
// or any public one shared by URL) and browse it like a notes vault. Opening
// a file hands off to the PARENT (simple-chat.tsx), which loads it straight
// into the chat screen as an editable, AI-editable document — this panel's
// job ends at "here's the file the user picked."
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Fonts } from '@/constants/theme';
import {
  GITHUB_CLIENT_ID,
  disconnectGithub,
  getGithubToken,
  pollForToken,
  requestDeviceCode,
  type DeviceCodeResponse,
} from '@/lib/github-auth';
import { checkRepoAccessible, createFolder, deleteFile, deleteFolder, getCommit, getFile, listCommits, listContents, listMyRepos, putFile, type GithubCommit, type GithubEntry, type GithubRepo } from '@/lib/github-client';
import { addArchive, listArchives, parseRepoFullName, removeArchive, type Archive } from '@/lib/archives-store';

interface Colors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  textTertiary?: string;
  border: string;
  tint: string;
  onTint: string;
}

type Screen =
  | { name: 'archives' }
  | { name: 'pick-repo' }
  | { name: 'browse'; archive: Archive; path: string }
  | { name: 'history'; archive: Archive };

function isEditableFile(name: string): boolean {
  return /\.(md|mdx|markdown|txt)$/i.test(name);
}

/** Publisher-curated public archives worth suggesting to every user — a
 *  one-tap "Join" instead of them needing to know a repo URL at all.
 *  Public suggested archives can be browsed without signing in. */
const SUGGESTED_ARCHIVES: { name: string; description: string; repoFullName: string | null }[] = [
  {
    name: 'github.com/ssv-asia/archive.expert.ai',
    description: 'Public starter archive — browse without sign-up',
    repoFullName: 'ssv-asia/archive.expert.ai',
  },
];

export function GithubPanel({
  colors,
  onOpenFile,
}: {
  colors: Colors;
  /** The user picked a file to open — parent loads it into the chat screen. */
  onOpenFile: (archive: Archive, path: string) => void;
}) {
  const [screen, setScreen] = useState<Screen>({ name: 'archives' });
  const [archives, setArchives] = useState<Archive[]>([]);
  const [connected, setConnected] = useState(false);

  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  const [device, setDevice] = useState<DeviceCodeResponse | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [myRepos, setMyRepos] = useState<GithubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);

  const [entries, setEntries] = useState<GithubEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseRefreshing, setBrowseRefreshing] = useState(false);
  const [commits, setCommits] = useState<GithubCommit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<GithubCommit | null>(null);
  const [newItemType, setNewItemType] = useState<'file' | 'folder' | null>(null);
  const [newItemPath, setNewItemPath] = useState('');
  const [itemBusy, setItemBusy] = useState(false);
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const refresh = useCallback(() => {
    listArchives().then(setArchives).catch(() => setArchives([]));
    getGithubToken().then((t) => setConnected(!!t));
  }, []);

  // Case-insensitive on purpose — matches archives-store's own dedupe check,
  // so a suggested archive already joined under a different letter-casing of
  // the same repo doesn't show up as both "already added" AND still "Suggested".
  const unjoinedSuggested = useMemo(
    () => SUGGESTED_ARCHIVES.filter((s) => !archives.some((a) => a.repoFullName.toLowerCase() === s.repoFullName?.toLowerCase())),
    [archives],
  );

  useEffect(() => { refresh(); }, [refresh]);

  const loadDir = useCallback(async (archive: Archive, path: string, force = false) => {
    setBrowseLoading(true);
    try {
      const contents = await listContents(archive.repoFullName, path, force);
      contents.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
      setEntries(contents);
    } catch (err) {
      Alert.alert('Could not open folder', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  const refreshBrowse = useCallback(async () => {
    if (screen.name !== 'browse') return;
    setBrowseRefreshing(true);
    try { await loadDir(screen.archive, screen.path, true); }
    finally { setBrowseRefreshing(false); }
  }, [loadDir, screen]);

  const loadHistory = useCallback(async (archive: Archive) => {
    setCommitsLoading(true);
    setSelectedCommit(null);
    try {
      setCommits(await listCommits(archive.repoFullName));
    } catch (err) {
      Alert.alert('Could not load commit history', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setCommitsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen.name === 'browse') loadDir(screen.archive, screen.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.name === 'browse' ? screen.archive.id : null, screen.name === 'browse' ? screen.path : null]);

  useEffect(() => {
    if (screen.name === 'history') loadHistory(screen.archive);
  }, [screen.name === 'history' ? screen.archive.id : null, loadHistory]);

  const handleAddByUrl = useCallback(async () => {
    const repoFullName = parseRepoFullName(urlInput);
    if (!repoFullName) {
      Alert.alert('Not a repo', 'Paste a GitHub URL (github.com/owner/repo) or just "owner/repo".');
      return;
    }
    setAddBusy(true);
    try {
      const ok = await checkRepoAccessible(repoFullName);
      if (!ok) {
        Alert.alert('Could not reach this repo', 'It may be private (connect your GitHub account first) or the name may be wrong.');
        return;
      }
      await addArchive(repoFullName.split('/')[1], repoFullName);
      setUrlInput('');
      setAddUrlOpen(false);
      refresh();
    } catch (err) {
      Alert.alert('Could not add archive', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setAddBusy(false);
    }
  }, [urlInput, refresh]);

  const handleConnect = useCallback(async () => {
    if (!GITHUB_CLIENT_ID) {
      Alert.alert(
        'GitHub isn’t set up yet',
        'This build has no GitHub OAuth App client ID configured (EXPO_PUBLIC_GITHUB_CLIENT_ID). Register one at github.com/settings/developers with Device Flow enabled, then set that env var.',
      );
      return;
    }
    setConnecting(true);
    setConnectError(null);
    try {
      const code = await requestDeviceCode();
      setDevice(code);
      const token = await pollForToken(code);
      if (token) {
        setDevice(null);
        setConnected(true);
        setScreen({ name: 'pick-repo' });
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'GitHub sign-in failed.');
      setDevice(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    Alert.alert('Disconnect GitHub?', 'Archives added by URL stay (they don’t need sign-in). Your own private repos will no longer be reachable.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => { await disconnectGithub(); setConnected(false); } },
    ]);
  }, []);

  const loadMyRepos = useCallback(async () => {
    setReposLoading(true);
    try {
      setMyRepos(await listMyRepos());
    } catch (err) {
      Alert.alert('Could not load repositories', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen.name === 'pick-repo') loadMyRepos();
  }, [screen.name, loadMyRepos]);

  const handlePickRepo = useCallback(async (repo: GithubRepo) => {
    try {
      await addArchive(repo.name, repo.full_name);
      setScreen({ name: 'archives' });
      refresh();
    } catch (err) {
      Alert.alert('Could not add archive', err instanceof Error ? err.message : 'Please try again.');
    }
  }, [refresh]);

  const handleJoinSuggested = useCallback(async (name: string, repoFullName: string) => {
    setAddBusy(true);
    try {
      const ok = await checkRepoAccessible(repoFullName);
      if (!ok) {
        Alert.alert('Not available yet', 'This archive isn’t published yet — check back soon.');
        return;
      }
      await addArchive(name, repoFullName);
      refresh();
    } catch (err) {
      Alert.alert('Could not add archive', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setAddBusy(false);
    }
  }, [refresh]);

  const handleRemoveArchive = useCallback((archive: Archive) => {
    Alert.alert('Remove archive', `Remove "${archive.name}"? The repo itself is untouched.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await removeArchive(archive.id); refresh(); } },
    ]);
  }, [refresh]);

  const handleCreateItem = useCallback(async () => {
    if (screen.name !== 'browse' || !newItemPath.trim()) return;
    const path = screen.path ? `${screen.path}/${newItemPath.trim()}` : newItemPath.trim();
    setItemBusy(true);
    try {
      if (newItemType === 'folder') await createFolder(screen.archive.repoFullName, path, `Create folder ${path} via Expert AI`);
      else await putFile(screen.archive.repoFullName, path.endsWith('.md') || path.endsWith('.txt') ? path : `${path}.md`, '# New note\n', `Create ${path} via Expert AI`);
      setNewItemPath(''); setNewItemType(null); await loadDir(screen.archive, screen.path, true);
    } catch (err) {
      Alert.alert('Could not create item', err instanceof Error ? err.message : 'Sign in with GitHub and confirm you have write access.');
    } finally { setItemBusy(false); }
  }, [loadDir, newItemPath, newItemType, screen]);

  const handleDeleteEntry = useCallback((entry: GithubEntry) => {
    if (screen.name !== 'browse') return;
    const isFolder = entry.type === 'dir';
    Alert.alert(isFolder ? 'Delete folder?' : 'Delete file?', isFolder
      ? `Delete ${entry.path} and everything inside it? This creates reversible commits in the repository history.`
      : `Delete ${entry.path} from GitHub? This creates a reversible commit in the repository history.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          if (isFolder) await deleteFolder(screen.archive.repoFullName, entry.path, `Delete ${entry.path} via Expert AI`);
          else { const file = await getFile(screen.archive.repoFullName, entry.path); await deleteFile(screen.archive.repoFullName, entry.path, file.sha, `Delete ${entry.path} via Expert AI`); }
          await loadDir(screen.archive, screen.path, true);
        } catch (err) { Alert.alert(isFolder ? 'Could not delete folder' : 'Could not delete file', err instanceof Error ? err.message : 'Sign in with GitHub and confirm write access.'); }
      } },
    ]);
  }, [loadDir, screen]);

  const handleRenameEntry = useCallback(async () => {
    if (screen.name !== 'browse' || !renamePath || !renameName.trim()) return;
    const nextPath = screen.path ? `${screen.path}/${renameName.trim()}` : renameName.trim();
    setItemBusy(true);
    try {
      const file = await getFile(screen.archive.repoFullName, renamePath);
      await putFile(screen.archive.repoFullName, nextPath, file.content, `Rename ${renamePath} via Expert AI`, undefined);
      await deleteFile(screen.archive.repoFullName, renamePath, file.sha, `Remove old name ${renamePath} via Expert AI`);
      setRenamePath(null); setRenameName(''); await loadDir(screen.archive, screen.path);
    } catch (err) { Alert.alert('Could not rename file', err instanceof Error ? err.message : 'Sign in with GitHub and confirm write access.'); }
    finally { setItemBusy(false); }
  }, [loadDir, renameName, renamePath, screen]);

  // --- Archives list (home) ------------------------------------------------
  if (screen.name === 'archives') {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>
          An Archive is a library of notes you can open right in chat — your own vault, or a curated collection
          someone shares with you. Open a file and it becomes editable in the chat itself: type normally to ask
          about it, or ask the AI to edit it for you.
        </Text>
        <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textTertiary ?? colors.textSecondary, lineHeight: 16 }}>
          Public archives can be read without sign-in. Editing is local until you commit; GitHub only accepts a commit when your account has write access to that repository.
        </Text>

        {device ? (
          <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 10, alignItems: 'center' }}>
            <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Enter this code at github.com/login/device</Text>
            <Pressable onPress={() => Clipboard.setStringAsync(device.user_code)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 26, letterSpacing: 4, color: colors.text }}>{device.user_code}</Text>
              <Ionicons name="copy-outline" size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={() => Linking.openURL(device.verification_uri)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.tint, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16 }}>
              <Ionicons name="open-outline" size={16} color={colors.onTint} />
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.onTint }}>Open GitHub to approve</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Waiting for approval…</Text>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={connected ? () => setScreen({ name: 'pick-repo' }) : handleConnect}
              disabled={connecting}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.tint, borderRadius: 10, paddingVertical: 11, opacity: connecting ? 0.6 : 1 }}
            >
              {connecting ? <ActivityIndicator size="small" color={colors.onTint} /> : <Ionicons name="logo-github" size={16} color={colors.onTint} />}
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.onTint }} numberOfLines={1} adjustsFontSizeToFit>
                {connected ? 'Add my archive' : 'Connect archive'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setAddUrlOpen((v) => !v)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 11, borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="link-outline" size={16} color={colors.text} />
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }} numberOfLines={1}>Join by link</Text>
            </Pressable>
          </View>
        )}

        {connectError ? <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: '#FF3B30' }}>{connectError}</Text> : null}

        {addUrlOpen ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="github.com/owner/repo"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: colors.text, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: colors.border }}
              onSubmitEditing={handleAddByUrl}
            />
            <Pressable
              onPress={handleAddByUrl}
              disabled={addBusy || !urlInput.trim()}
              style={{ paddingHorizontal: 14, justifyContent: 'center', borderRadius: 8, backgroundColor: colors.tint, opacity: urlInput.trim() ? 1 : 0.5 }}
            >
              {addBusy ? <ActivityIndicator size="small" color={colors.onTint} /> : <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.onTint }}>Add</Text>}
            </Pressable>
          </View>
        ) : null}

        {connected ? (
          <Pressable onPress={handleDisconnect} style={{ alignSelf: 'flex-start' }}>
            <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textSecondary }}>Disconnect GitHub account</Text>
          </Pressable>
        ) : null}

        {unjoinedSuggested.length > 0 ? (
          <>
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 8 }}>
              Suggested
            </Text>
            {unjoinedSuggested.map((s) => (
              <View
                key={s.name}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, opacity: s.repoFullName ? 1 : 0.6 }}
              >
                <Ionicons name="sparkles-outline" size={18} color={colors.tint} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>{s.name}</Text>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textSecondary }}>{s.description}</Text>
                </View>
                {s.repoFullName ? (
                  <Pressable
                    onPress={() => handleJoinSuggested(s.name, s.repoFullName!)}
                    disabled={addBusy}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.tint }}
                  >
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.onTint }}>Join</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </>
        ) : null}

        <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 8 }}>
          Your archives
        </Text>
        {archives.length === 0 ? (
          <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>
            No archives connected yet.
          </Text>
        ) : (
          archives.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => setScreen({ name: 'browse', archive: a, path: '' })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="library-outline" size={18} color={colors.tint} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }} numberOfLines={1}>{a.name}</Text>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textSecondary }} numberOfLines={1}>{a.repoFullName}</Text>
              </View>
              <Pressable onPress={() => handleRemoveArchive(a)} hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </Pressable>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  // --- Pick one of the signed-in account's repos to save as an archive ----
  if (screen.name === 'pick-repo') {
    return (
      <View style={{ flex: 1 }}>
        <Pressable onPress={() => setScreen({ name: 'archives' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingTop: 8 }}>
          <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.textSecondary }}>Archives</Text>
        </Pressable>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {reposLoading ? <ActivityIndicator color={colors.tint} style={{ marginTop: 20 }} /> : null}
          {myRepos.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => handlePickRepo(r)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name={r.private ? 'lock-closed-outline' : 'book-outline'} size={18} color={colors.tint} />
              <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.text, flex: 1 }} numberOfLines={1}>{r.full_name}</Text>
              <Ionicons name="add-circle-outline" size={18} color={colors.tint} />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (screen.name === 'history') {
    return (
      <View style={{ flex: 1 }}>
        <Pressable onPress={() => setScreen({ name: 'browse', archive: screen.archive, path: '' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingTop: 8 }}>
          <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.textSecondary }}>Browse files</Text>
        </Pressable>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text }}>Commit history</Text>
          <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textSecondary, lineHeight: 16 }}>
            See who changed the archive, when it changed, and the exact file diff. Your account needs repository write access to commit changes.
          </Text>
          {commitsLoading ? <ActivityIndicator color={colors.tint} style={{ marginTop: 16 }} /> : null}
          {commits.map((commit) => (
            <View key={commit.sha} style={{ backgroundColor: colors.background, borderRadius: 10, padding: 11, borderWidth: 1, borderColor: colors.border, gap: 7 }}>
              <Pressable onPress={async () => { try { setSelectedCommit(await getCommit(screen.archive.repoFullName, commit.sha)); } catch (err) { Alert.alert('Could not load diff', err instanceof Error ? err.message : 'Please try again.'); } }}>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }} numberOfLines={2}>{commit.message || 'Untitled commit'}</Text>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
                  {commit.author?.login ?? 'Unknown author'} · {commit.date ? new Date(commit.date).toLocaleString() : 'Unknown date'} · {commit.sha.slice(0, 7)}
                </Text>
              </Pressable>
              {selectedCommit?.sha === commit.sha ? (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 6 }}>
                  {selectedCommit.files?.map((file) => (
                    <View key={file.filename} style={{ gap: 3 }}>
                      <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: colors.text }}>{file.filename}</Text>
                      <Text style={{ fontFamily: Fonts.sans, fontSize: 10, color: colors.textSecondary }}>{file.status} · +{file.additions} / -{file.deletions}</Text>
                      {file.patch ? <Text selectable style={{ fontFamily: Fonts.mono, fontSize: 10, color: colors.textSecondary, lineHeight: 14 }}>{file.patch}</Text> : null}
                    </View>
                  ))}
                  <Pressable onPress={() => Linking.openURL(selectedCommit.html_url)}>
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 11, color: colors.tint }}>Open commit on GitHub</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
          {!commitsLoading && commits.length === 0 ? <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>No commits found.</Text> : null}
        </ScrollView>
      </View>
    );
  }

  // --- Browse an archive's files -------------------------------------------
  const crumbs = screen.path ? screen.path.split('/') : [];
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Pressable onPress={() => setScreen({ name: 'archives' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.textSecondary }}>Archives</Text>
        </Pressable>
        <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 15, color: colors.text }} numberOfLines={1}>
          {screen.archive.name}{crumbs.length ? ` / ${crumbs.join(' / ')}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable onPress={() => setScreen({ name: 'history', archive: screen.archive })} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Ionicons name="git-branch-outline" size={15} color={colors.text} />
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 11, color: colors.text }}>History & diffs</Text>
          </Pressable>
          <Text style={{ flex: 1, alignSelf: 'center', fontFamily: Fonts.sans, fontSize: 10, color: colors.textSecondary }} numberOfLines={1}>Read-only until Commit</Text>
          <Pressable onPress={refreshBrowse} disabled={browseRefreshing} hitSlop={8} accessibilityRole="button" accessibilityLabel="Refresh archive folder">
            {browseRefreshing ? <ActivityIndicator size="small" color={colors.tint} /> : <Ionicons name="refresh-outline" size={17} color={colors.tint} />}
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {(['file', 'folder'] as const).map((type) => (
            <Pressable key={type} onPress={() => { setNewItemType(type); setNewItemPath(''); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 }}>
              <Ionicons name={type === 'file' ? 'document-outline' : 'folder-outline'} size={14} color={colors.tint} />
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 11, color: colors.text }}>New {type}</Text>
            </Pressable>
          ))}
        </View>
        {newItemType ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <TextInput value={newItemPath} onChangeText={setNewItemPath} placeholder={newItemType === 'file' ? 'filename.md' : 'folder name'} placeholderTextColor={colors.textSecondary} autoCapitalize="none" style={{ flex: 1, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, fontFamily: Fonts.sans, fontSize: 12 }} />
            <Pressable disabled={itemBusy || !newItemPath.trim()} onPress={handleCreateItem} style={{ justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.tint, opacity: newItemPath.trim() ? 1 : 0.5 }}><Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 11, color: colors.onTint }}>{itemBusy ? '…' : 'Create'}</Text></Pressable>
            <Pressable onPress={() => setNewItemType(null)} style={{ justifyContent: 'center', paddingHorizontal: 8 }}><Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textSecondary }}>Cancel</Text></Pressable>
          </View>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 6 }}
        refreshControl={<RefreshControl refreshing={browseRefreshing} onRefresh={refreshBrowse} tintColor={colors.tint} />}
      >
        {browseLoading ? <ActivityIndicator color={colors.tint} style={{ marginTop: 20 }} /> : null}
        {screen.path ? (
          <Pressable
            onPress={() => setScreen({ name: 'browse', archive: screen.archive, path: crumbs.slice(0, -1).join('/') })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
          >
            <Ionicons name="arrow-up-outline" size={16} color={colors.textSecondary} />
            <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>..</Text>
          </Pressable>
        ) : null}
        {!browseLoading && entries.length === 0 ? (
          <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, marginTop: 20, textAlign: 'center' }}>This folder is empty.</Text>
        ) : null}
        {entries.map((e) => {
          const editable = e.type === 'file' && isEditableFile(e.name);
          return (
            <Pressable
              key={e.path}
              disabled={e.type === 'file' && !editable}
              onPress={() => (e.type === 'dir' ? setScreen({ name: 'browse', archive: screen.archive, path: e.path }) : onOpenFile(screen.archive, e.path))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border, opacity: e.type === 'file' && !editable ? 0.5 : 1 }}
            >
              <Ionicons name={e.type === 'dir' ? 'folder-outline' : 'document-text-outline'} size={16} color={colors.tint} />
              <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.text, flex: 1 }} numberOfLines={1}>{e.name}</Text>
              {e.type === 'file' && !editable ? <Text style={{ fontFamily: Fonts.sans, fontSize: 10, color: colors.textSecondary }}>not text</Text> : null}
              {((e.type === 'file' && editable) || e.type === 'dir') ? (
                <View style={{ flexDirection: 'row', gap: 7 }}>
                  {e.type === 'file' ? <Pressable onPress={(event) => { event.stopPropagation(); setRenamePath(e.path); setRenameName(e.name); }} hitSlop={6}><Ionicons name="pencil-outline" size={15} color={colors.textSecondary} /></Pressable> : null}
                  <Pressable onPress={(event) => { event.stopPropagation(); handleDeleteEntry(e); }} hitSlop={6}><Ionicons name="trash-outline" size={15} color={colors.textSecondary} /></Pressable>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {renamePath ? (
          <View style={{ marginTop: 8, padding: 10, gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.background }}>
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>Rename file</Text>
            <TextInput value={renameName} onChangeText={setRenameName} autoCapitalize="none" style={{ color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, fontFamily: Fonts.sans, fontSize: 12 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}><Pressable onPress={() => setRenamePath(null)} style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}><Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 11, color: colors.text }}>Cancel</Text></Pressable><Pressable disabled={itemBusy || !renameName.trim()} onPress={handleRenameEntry} style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: colors.tint, opacity: renameName.trim() ? 1 : 0.5 }}><Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 11, color: colors.onTint }}>{itemBusy ? 'Saving…' : 'Rename'}</Text></Pressable></View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
