// Shared render-crash backstop for chat message bubbles. Wraps a rich render (markdown,
// tool-call UI, whatever) and falls back to plain text for just that one message if the
// child throws during render — instead of the crash propagating up to the app's top-level
// error boundary, which is what previously made a single bad reply look like the whole
// chat/app had crashed and needed a reload. See lib/markdown-renderer.tsx and
// features/agent/hooks/use-stable-markdown.tsx for the underlying render bugs this backstops.
import { Component } from 'react';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

interface Props {
  fallbackText: string;
  textStyle?: object;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class MessageRenderBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[MessageRenderBoundary] render failed, falling back to plain text:', error);
  }

  render() {
    if (this.state.hasError) {
      return <Text style={this.props.textStyle}>{this.props.fallbackText}</Text>;
    }
    return this.props.children;
  }
}
