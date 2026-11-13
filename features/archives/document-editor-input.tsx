import { useEffect, useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

type Props = Pick<TextInputProps, 'style' | 'placeholder' | 'placeholderTextColor' | 'textAlignVertical'> & {
  value: string;
  onChangeText: (value: string) => void;
};

/** Keep each keystroke local to the editor instead of rerendering the entire chat. */
export function DocumentEditorInput({ value, onChangeText, ...inputProps }: Props) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  draftRef.current = draft;

  useEffect(() => {
    if (!focusedRef.current && value !== draftRef.current) {
      draftRef.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Commit the latest local edit if the document card is closed/unmounted.
    onChangeText(draftRef.current);
  }, [onChangeText]);

  const flush = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    onChangeText(draftRef.current);
  };

  return (
    <TextInput
      {...inputProps}
      value={draft}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; flush(); }}
      onChangeText={(next) => {
        draftRef.current = next;
        setDraft(next);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flush, 180);
      }}
      multiline
      scrollEnabled
    />
  );
}
