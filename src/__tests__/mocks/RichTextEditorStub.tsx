
interface RichTextEditorStubProps {
  value: string;
  onChange: (value: string) => void;
  variant?: 'note' | 'comment';
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

/**
 * Test double for RichTextEditor — ProseMirror needs DOM APIs that
 * happy-dom doesn't fully provide, so form tests substitute a plain
 * textarea carrying the same value/onChange contract (the real
 * editor emits doc-JSON strings; the stub passes text through).
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
    value={value}
    onChange={(e) => onChange(e.currentTarget.value)}
  />
);

export default RichTextEditorStub;
