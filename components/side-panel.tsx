// Canvas/Artifacts-style side panel: documents (PDF/Markdown/text exports)
// and an infinite mind-map canvas, both live alongside the chat without
// interrupting it. Single source of truth for open/closed (`visible` prop
// owned by the parent) — this component never manages its own open state,
// which is what keeps "is it open or not" unambiguous and bug-free.
//
// Rendering strategy chosen deliberately for safety: stays mounted at all
// times once first opened (never unmounts/remounts on toggle), slides fully
// off-screen via translateX when closed, and `pointerEvents` is switched to
// "none" while closed so it can never eat touches meant for the chat behind
// it. No Modal is used (Modals + this app's manual keyboard handling have
// caused bugs before — see CLAUDE.md) — this is a plain absolutely
// positioned overlay.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts } from '@/constants/theme';
import { deleteDocument, listDocuments, saveDocument, makeDocumentId, type StoredDocument } from '@/lib/documents-store';
import { exportAsMarkdown, exportAsPdf, exportAsText, type PdfTemplate } from '@/lib/document-export';
import { clearProjectFromAllConversations, type Conversation } from '@/lib/chat-history';
import { createProject, deleteProject, listProjects, type Project } from '@/lib/projects-store';
import type { Archive } from '@/lib/archives-store';
import { GithubPanel } from '@/components/github-panel';

type PanelTab = 'github' | 'projects' | 'documents';
// Archive first (it's what the toolbar's archive icon implies opening into),
// then Projects, then Documents — left-to-right per the intended thumb flow.
const TAB_ORDER: PanelTab[] = ['github', 'projects', 'documents'];

interface Colors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  tint: string;
  /** Text/icon color for content drawn on top of `tint` — theme-specific, not always white. */
  onTint: string;
}

export function SidePanel({
  visible,
  onClose,
  conversationId,
  colors,
  refreshKey,
  conversations,
  onOpenConversation,
  onNewChatInProject,
  onOpenArchiveFile,
}: {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  colors: Colors;
  /** Bump this from the parent whenever a new document is created elsewhere
   *  (e.g. "Export as PDF" on a message) so the list picks it up. */
  refreshKey: number;
  /** Full chat history, so a Project can list the chats linked to it. */
  conversations: Conversation[];
  onOpenConversation: (id: string) => void;
  onNewChatInProject: (projectId: string) => void;
  /** A file was picked in the GitHub/Archives tab — parent loads it into chat. */
  onOpenArchiveFile: (archive: Archive, path: string) => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Bottom sheet, not a side drawer: everything reachable with a thumb
  // without moving the hand up the phone. Covers most of the screen so it
  // reads as a real workspace, not a small popover, but always leaves a
  // strip of the chat visible above so it's clear this is an overlay.
  const panelHeight = Math.round(height * 0.86);
  const translateY = useSharedValue(panelHeight);
  const [tab, setTab] = useState<PanelTab>('github');
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mountedRef = useRef(false);
  // PDF gets its own options step (template + branding) instead of exporting
  // immediately — the other formats are plain text, nothing to configure.
  const [pdfOptionsDocId, setPdfOptionsDocId] = useState<string | null>(null);
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>('classic');
  const [pdfBranding, setPdfBranding] = useState(true);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocBody, setNewDocBody] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');

  // Drive the slide purely off the `visible` prop — one direction of truth,
  // no local "isOpen" state that could drift from what the parent thinks.
  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : panelHeight, { duration: 240 });
  }, [visible, panelHeight, translateY]);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  // Android hardware/gesture back should close this sheet, not exit the app
  // (or fall through to whatever's behind it) while it's open.
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // Documents are shown across the WHOLE app now, not just this conversation
  // — the old per-chat scoping is exactly why "the other documents aren't
  // there" when starting a new chat. Which chat/project a document came from
  // is still shown per-row, it's just no longer a hard filter.
  const refresh = useCallback(() => {
    listDocuments()
      .then(setDocuments)
      .catch(() => setDocuments([]));
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh, refreshKey]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleExport = useCallback(async (doc: StoredDocument, format: 'pdf' | 'md' | 'txt') => {
    if (format === 'pdf') {
      // Open the inline options row instead of exporting straight away —
      // toggling it again on the same doc closes it.
      setPdfOptionsDocId((cur) => (cur === doc.id ? null : doc.id));
      return;
    }
    setBusyId(doc.id);
    try {
      if (format === 'md') await exportAsMarkdown(doc.title, doc.content);
      else await exportAsText(doc.title, doc.content);
    } catch {
      Alert.alert('Export failed', 'Could not create the file. Please try again.');
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleGeneratePdf = useCallback(async (doc: StoredDocument) => {
    setBusyId(doc.id);
    try {
      await exportAsPdf(doc.title, doc.content, { template: pdfTemplate, branding: pdfBranding });
      setPdfOptionsDocId(null);
    } catch {
      Alert.alert('Export failed', 'Could not create the PDF. Please try again.');
    } finally {
      setBusyId(null);
    }
  }, [pdfTemplate, pdfBranding]);

  const handleCreateDocument = useCallback(async () => {
    const title = newDocTitle.trim() || 'Untitled note';
    if (!newDocBody.trim()) return;
    await saveDocument({
      id: makeDocumentId(),
      title,
      kind: 'markdown',
      content: newDocBody,
      conversationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setNewDocTitle('');
    setNewDocBody('');
    setNewDocOpen(false);
    refresh();
  }, [newDocTitle, newDocBody, conversationId, refresh]);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;
    await createProject(newProjectName);
    setNewProjectName('');
    refresh();
  }, [newProjectName, refresh]);

  const handleDeleteProject = useCallback(
    (project: Project) => {
      Alert.alert('Delete project', `Remove "${project.name}"? Chats and documents stay, just un-grouped.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteProject(project.id);
            // Reads fresh from disk rather than the `conversations` prop —
            // that snapshot only refreshes when this panel opens, so it can
            // be stale relative to an assignment made moments ago from the
            // separate Chat History sheet's own "move to project" picker.
            await clearProjectFromAllConversations(project.id);
            if (selectedProjectId === project.id) setSelectedProjectId(null);
            refresh();
          },
        },
      ]);
    },
    [selectedProjectId, refresh],
  );

  const handleDelete = useCallback(
    (doc: StoredDocument) => {
      Alert.alert('Delete document', `Remove "${doc.title}"? This can't be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDocument(doc.id);
            refresh();
          },
        },
      ]);
    },
    [refresh],
  );

  return (
    <View
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, zIndex: 50, elevation: 50 }}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', opacity: visible ? 1 : 0 }}
        onPress={onClose}
        accessibilityLabel="Close workspace"
      />
      <Animated.View
        style={[
          animatedStyle,
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: panelHeight,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: insets.bottom,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -2 },
          },
        ]}
      >
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 17, color: colors.text }}>Workspace</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close panel">
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
          {TAB_ORDER.map((t) => (
            <Pressable
              key={t}
              onPress={() => { setTab(t); setSelectedProjectId(null); }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 16,
                backgroundColor: tab === t ? colors.tint : 'transparent',
                borderWidth: tab === t ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: tab === t ? colors.onTint : colors.textSecondary }}>
                {t === 'documents' ? 'Documents' : t === 'projects' ? 'Projects' : 'Archive'}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'documents' ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
            {newDocOpen ? (
              <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
                <TextInput
                  value={newDocTitle}
                  onChangeText={setNewDocTitle}
                  placeholder="Title"
                  placeholderTextColor={colors.textSecondary}
                  style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text, padding: 0 }}
                />
                <TextInput
                  value={newDocBody}
                  onChangeText={setNewDocBody}
                  placeholder="Write your note… (Markdown supported)"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.text, minHeight: 80, textAlignVertical: 'top', padding: 0 }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => { setNewDocOpen(false); setNewDocTitle(''); setNewDocBody(''); }}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
                  >
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCreateDocument}
                    disabled={!newDocBody.trim()}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: colors.tint, opacity: newDocBody.trim() ? 1 : 0.5 }}
                  >
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.onTint }}>Save</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setNewDocOpen(true)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}
              >
                <Ionicons name="add" size={18} color={colors.tint} />
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.tint }}>New document</Text>
              </Pressable>
            )}
            {documents.length === 0 ? (
              <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, marginTop: 24, textAlign: 'center' }}>
                Documents you save or export — PDF, Markdown, or text, from any chat — show up here.
              </Text>
            ) : (
              documents.map((doc) => (
                <View
                  key={doc.id}
                  style={{ backgroundColor: colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 8 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons
                      name={doc.kind === 'pdf' ? 'document-text-outline' : doc.kind === 'canvas' ? 'grid-outline' : 'document-outline'}
                      size={18}
                      color={colors.tint}
                    />
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text, flex: 1 }} numberOfLines={1}>
                      {doc.title}
                    </Text>
                    <Pressable onPress={() => handleDelete(doc)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }} numberOfLines={3}>
                    {doc.content.replace(/[#*`]/g, '').slice(0, 160)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['pdf', 'md', 'txt'] as const).map((fmt) => (
                      <Pressable
                        key={fmt}
                        disabled={busyId === doc.id}
                        onPress={() => handleExport(doc, fmt)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: colors.border,
                          opacity: busyId === doc.id ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 11, color: colors.text }}>{fmt.toUpperCase()}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {pdfOptionsDocId === doc.id ? (
                    <View style={{ gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 2 }}>
                      <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        PDF style
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {(['classic', 'modern'] as PdfTemplate[]).map((t) => (
                          <Pressable
                            key={t}
                            onPress={() => setPdfTemplate(t)}
                            style={{
                              flex: 1,
                              paddingVertical: 8,
                              borderRadius: 8,
                              alignItems: 'center',
                              backgroundColor: pdfTemplate === t ? colors.tint : 'transparent',
                              borderWidth: pdfTemplate === t ? 0 : 1,
                              borderColor: colors.border,
                            }}
                          >
                            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: pdfTemplate === t ? colors.onTint : colors.text }}>
                              {t === 'classic' ? 'Classic serif' : 'Modern'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Pressable
                        onPress={() => setPdfBranding((v) => !v)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
                      >
                        <Ionicons name={pdfBranding ? 'checkbox' : 'square-outline'} size={18} color={pdfBranding ? colors.tint : colors.textSecondary} />
                        <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.text, flex: 1 }}>
                          Include &ldquo;Crafted with Expert AI&rdquo; footer
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={busyId === doc.id}
                        onPress={() => handleGeneratePdf(doc)}
                        style={{
                          backgroundColor: colors.tint,
                          borderRadius: 8,
                          paddingVertical: 10,
                          alignItems: 'center',
                          opacity: busyId === doc.id ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.onTint }}>
                          {busyId === doc.id ? 'Generating…' : 'Generate & share PDF'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        ) : tab === 'github' ? (
          <GithubPanel colors={colors} onOpenFile={onOpenArchiveFile} />
        ) : selectedProjectId ? (
          (() => {
            const project = projects.find((p) => p.id === selectedProjectId);
            const projectChats = conversations.filter((c) => c.projectId === selectedProjectId);
            return (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
                <Pressable onPress={() => setSelectedProjectId(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.textSecondary }}>All projects</Text>
                </Pressable>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 18, color: colors.text }}>{project?.name ?? 'Project'}</Text>

                <Pressable
                  onPress={() => onNewChatInProject(selectedProjectId)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.tint }}
                >
                  <Ionicons name="add" size={18} color={colors.onTint} />
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.onTint }}>New chat in this project</Text>
                </Pressable>

                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 10 }}>
                  Chats ({projectChats.length})
                </Text>
                {projectChats.length === 0 ? (
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>
                    No chats yet. Start one above, or assign an existing chat to this project from Chat History.
                  </Text>
                ) : (
                  projectChats.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => onOpenConversation(c.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}
                    >
                      <Ionicons name="chatbubble-outline" size={16} color={colors.tint} />
                      <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.text, flex: 1 }} numberOfLines={1}>{c.title}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                    </Pressable>
                  ))
                )}

                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 10 }}>
                  Documents
                </Text>
                {(() => {
                  const chatIds = new Set(projectChats.map((c) => c.id));
                  const projectDocs = documents.filter((d) => chatIds.has(d.conversationId));
                  return projectDocs.length === 0 ? (
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>
                      Documents saved from this project&apos;s chats will show up here.
                    </Text>
                  ) : (
                    projectDocs.map((d) => (
                      <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}>
                        <Ionicons name="document-outline" size={16} color={colors.tint} />
                        <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.text, flex: 1 }} numberOfLines={1}>{d.title}</Text>
                      </View>
                    ))
                  );
                })()}

                <Pressable onPress={() => handleDeleteProject(project ?? { id: selectedProjectId, name: 'Project', createdAt: 0, updatedAt: 0 })} style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Delete project</Text>
                </Pressable>
              </ScrollView>
            );
          })()
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.background, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: colors.border }}>
              <TextInput
                value={newProjectName}
                onChangeText={setNewProjectName}
                placeholder="Name a new project…"
                placeholderTextColor={colors.textSecondary}
                style={{ flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: colors.text, paddingHorizontal: 8 }}
                onSubmitEditing={handleCreateProject}
              />
              <Pressable
                onPress={handleCreateProject}
                disabled={!newProjectName.trim()}
                style={{ paddingHorizontal: 12, justifyContent: 'center', borderRadius: 8, backgroundColor: colors.tint, opacity: newProjectName.trim() ? 1 : 0.5 }}
              >
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.onTint }}>Create</Text>
              </Pressable>
            </View>

            {projects.length === 0 ? (
              <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, marginTop: 24, textAlign: 'center' }}>
                Name a project to group related chats and documents together — e.g. by topic or client.
              </Text>
            ) : (
              projects.map((p) => {
                const chatCount = conversations.filter((c) => c.projectId === p.id).length;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedProjectId(p.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}
                  >
                    <Ionicons name="folder-outline" size={20} color={colors.tint} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textSecondary }}>
                        {chatCount} {chatCount === 1 ? 'chat' : 'chats'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}
