import { toPlainText } from '../../utils/tiptapContent';

interface RichTextEditorStubProps {
  value: string;
  onChange: (value: string) => void;
  variant?: 'note' | 'comment';
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

// Mirrors the real editor's serialization: a tiptap doc with one
// paragraph per line — the same shape `JSON.stringify(getJSON())`
// emits for plain typed input.
const textToDocJson = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line
        ? [{ type: 'text', text: line }]
        : undefined,
    })),
  });

/**
 * Test double for RichTextEditor — ProseMirror needs DOM APIs that
 * happy-dom doesn't fully provide, so form tests substitute a plain
 * textarea carrying the same value/onChange contract: `value` may
 * be doc-JSON or legacy plain text (the plain-text form is shown),
 * and `onChange` receives JSON.stringify(getJSON())-shaped doc-JSON,
 * not the raw typed text.
 */
const RichTextEditorStub = ({
  value,
  onChange,
  autoFocus,
  placeholder,
  label,
  disabled,
}: RichTextEditorStubProps) => (
  <textarea
    aria-label={label ?? placeholder}
    placeholder={placeholder}
    autoFocus={autoFocus}
    disabled={disabled}
    value={toPlainText(value)}
    onChange={(e) => onChange(textToDocJson(e.currentTarget.value))}
  />
);

export default RichTextEditorStub;
