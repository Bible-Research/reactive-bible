import { useCallback, useState } from 'react';
import {
  isSameScriptureRef,
  parseScriptureRef,
} from '../utils/scriptureRef';
import type { ScriptureRef } from '../utils/scriptureRef';

/**
 * Anything the popover can anchor to: an element from a read
 * view (`e.currentTarget`) or a ProseMirror `Range` over the
 * '@…' token (editor). Both expose `getBoundingClientRect`;
 * a Range also tracks scroll and text reflow for free.
 */
export interface ScriptureRefAnchor {
  getBoundingClientRect(): DOMRect;
}

export interface ScriptureRefPreview {
  /** Parsed ref — null while `error` is showing. */
  ref: ScriptureRef | null;
  /** The clicked token/element the panel floats under. */
  anchor: ScriptureRefAnchor;
}

/**
 * Shared parse + toggle logic for the '@…' scripture-ref
 * preview, used by the editor and both read views. `open`
 * parses the token: failures surface inside the panel via
 * `error`; successes toggle closed when the same ref is
 * clicked again, else switch the panel to the new anchor.
 */
const useScriptureRefPreview = () => {
  const [preview, setPreview] =
    useState<ScriptureRefPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  const open = useCallback(
    (token: string, anchor: ScriptureRefAnchor) => {
      const result = parseScriptureRef(token);
      if (!result.ok) {
        // The panel still opens, anchored at the token, so
        // the parse error shows where the user tapped.
        setPreview({ ref: null, anchor });
        setError(result.error);
        return;
      }
      setError(null);
      setPreview((current) =>
        isSameScriptureRef(current?.ref ?? null, result.ref)
          ? null
          : { ref: result.ref, anchor }
      );
    },
    []
  );

  return { preview, error, open, close };
};

export default useScriptureRefPreview;
