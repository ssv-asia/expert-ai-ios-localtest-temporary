// Infinite pan/zoom mind-map canvas (Obsidian-canvas-style), fully local —
// nodes are just draggable sticky notes, persisted as a StoredDocument.
// Wrapped in its own GestureHandlerRootView so it works regardless of what
// wraps the screen it's mounted in (defensive — nesting is harmless).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '@/constants/theme';
import {
  CANVAS_COLORS,
  emptyCanvasBoard,
  makeCanvasNodeId,
  parseCanvasBoard,
  type CanvasBoard,
  type CanvasNode,
} from '@/lib/canvas-types';
import { getDocument, saveDocument, type StoredDocument } from '@/lib/documents-store';

const BOARD_WIDTH = 3000;
const BOARD_HEIGHT = 3000;

function CanvasNodeView({
  node,
  boardTranslateX,
  boardTranslateY,
  boardScale,
  onChange,
  onDelete,
}: {
  node: CanvasNode;
  boardTranslateX: SharedValue<number>;
  boardTranslateY: SharedValue<number>;
  boardScale: SharedValue<number>;
  onChange: (id: string, patch: Partial<CanvasNode>) => void;
  onDelete: (id: string) => void;
}) {
  const x = useSharedValue(node.x);
  const y = useSharedValue(node.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(node.text);

  useEffect(() => {
    x.value = node.x;
    y.value = node.y;
  }, [node.x, node.y, x, y]);

  const commit = useCallback((nx: number, ny: number) => onChange(node.id, { x: nx, y: ny }), [node.id, onChange]);

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      // Divide by boardScale so drag distance matches finger movement regardless of zoom level.
      x.value = startX.value + e.translationX / boardScale.value;
      y.value = startY.value + e.translationY / boardScale.value;
    })
    .onEnd(() => {
      runOnJS(commit)(x.value, y.value);
    })
    .minDistance(2);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x.value,
    top: y.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          style,
          {
            width: node.width,
            height: node.height,
            backgroundColor: node.color,
            borderRadius: 10,
            padding: 10,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          },
        ]}
      >
        <Pressable
          onPress={() => setEditing(true)}
          onLongPress={() => onDelete(node.id)}
          style={{ flex: 1 }}
        >
          {editing ? (
            <TextInput
              autoFocus
              multiline
              value={text}
              onChangeText={setText}
              onBlur={() => {
                setEditing(false);
                onChange(node.id, { text });
              }}
              style={{ flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: '#1c1c1e' }}
            />
          ) : (
            <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: '#1c1c1e' }} numberOfLines={8}>
              {node.text || 'Tap to edit · long-press to delete'}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export function CanvasBoardView({ conversationId }: { conversationId: string }) {
  const [board, setBoard] = useState<CanvasBoard>(emptyCanvasBoard());
  const docIdRef = useRef<string>(`canvas_${conversationId}`);
  const loadedRef = useRef(false);
  const boardTranslateX = useSharedValue(0);
  const boardTranslateY = useSharedValue(0);
  const boardScale = useSharedValue(1);
  const startTX = useSharedValue(0);
  const startTY = useSharedValue(0);
  const startScale = useSharedValue(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await getDocument(docIdRef.current);
      if (!cancelled && existing) setBoard(parseCanvasBoard(existing.content));
      loadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    (next: CanvasBoard) => {
      const doc: StoredDocument = {
        id: docIdRef.current,
        title: 'Canvas',
        kind: 'canvas',
        content: JSON.stringify(next),
        conversationId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveDocument(doc).catch(() => {});
    },
    [conversationId],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<CanvasNode>) => {
      setBoard((prev) => {
        const next = { nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setBoard((prev) => {
        const next = { nodes: prev.nodes.filter((n) => n.id !== id) };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const addNode = useCallback(() => {
    setBoard((prev) => {
      const color = CANVAS_COLORS[prev.nodes.length % CANVAS_COLORS.length];
      const node: CanvasNode = {
        id: makeCanvasNodeId(),
        x: BOARD_WIDTH / 2 - boardTranslateX.value / boardScale.value - 80,
        y: BOARD_HEIGHT / 2 - boardTranslateY.value / boardScale.value - 50,
        width: 160,
        height: 100,
        text: '',
        color,
      };
      const next = { nodes: [...prev.nodes, node] };
      persist(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  const boardPan = Gesture.Pan()
    .onStart(() => {
      startTX.value = boardTranslateX.value;
      startTY.value = boardTranslateY.value;
    })
    .onUpdate((e) => {
      boardTranslateX.value = startTX.value + e.translationX;
      boardTranslateY.value = startTY.value + e.translationY;
    })
    .minPointers(1)
    .maxPointers(1);

  const boardPinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = boardScale.value;
    })
    .onUpdate((e) => {
      const next = startScale.value * e.scale;
      boardScale.value = Math.min(2.5, Math.max(0.4, next));
    });

  const composedGesture = Gesture.Simultaneous(boardPan, boardPinch);

  const boardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: boardTranslateX.value },
      { translateY: boardTranslateY.value },
      { scale: boardScale.value },
    ],
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0e0e10' }}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[{ width: BOARD_WIDTH, height: BOARD_HEIGHT }, boardStyle]}>
            {board.nodes.map((node) => (
              <CanvasNodeView
                key={node.id}
                node={node}
                boardTranslateX={boardTranslateX}
                boardTranslateY={boardTranslateY}
                boardScale={boardScale}
                onChange={updateNode}
                onDelete={deleteNode}
              />
            ))}
          </Animated.View>
        </GestureDetector>

        <Pressable
          onPress={addNode}
          style={{
            position: 'absolute',
            right: 16,
            bottom: 16,
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: '#0a84ff',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 6,
          }}
          accessibilityRole="button"
          accessibilityLabel="Add note"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>

        {board.nodes.length === 0 ? (
          <View style={{ position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
            <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: '#8e8e93' }}>
              Pinch to zoom, drag to pan. Tap + to add a note.
            </Text>
          </View>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}
