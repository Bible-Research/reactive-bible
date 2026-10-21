import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
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
  /** Raw token — needed to toggle an error preview closed. */
  token: string;
}

// One popover at a time across the whole app: every hook
// instance listens for this event and closes when another
// instance opened a preview (detail = the opener's id).
const OPEN_EVENT = 'scripture-ref-preview-open';
let nextInstanceId = 0;

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
  const instanceId = useRef(++nextInstanceId);
  // Mirror of `preview` updated synchronously — `open` needs
  // the current value to compute toggle/switch before the
  // state update lands, and rapid successive opens must not
  // read a stale render-time closure.
  const previewRef = useRef<ScriptureRefPreview | null>(null);

  const setBoth = useCallback(
    (next: ScriptureRefPreview | null) => {
      previewRef.current = next;
      setPreview(next);
    },
    []
  );

  const close = useCallback(() => {
    setBoth(null);
    setError(null);
  }, [setBoth]);

  // A preview opening anywhere else dismisses this one.
  useEffect(() => {
    const onOtherOpen = (e: Event) => {
      if ((e as CustomEvent<number>).detail !==
        instanceId.current) {
        close();
      }
    };
    window.addEventListener(OPEN_EVENT, onOtherOpen);
    return () =>
      window.removeEventListener(OPEN_EVENT, onOtherOpen);
  }, [close]);

  const open = useCallback(
    (token: string, anchor: ScriptureRefAnchor) => {
      const result = parseScriptureRef(token);
      const current = previewRef.current;
      let next: ScriptureRefPreview | null;
      if (!result.ok) {
        // The panel still opens, anchored at the token, so
        // the parse error shows where the user tapped; a
        // second click on the same bad token closes it.
        const sameError =
          current?.ref === null && current.token === token;
        next = sameError
          ? null
          : { ref: null, anchor, token };
        setError(next ? result.error : null);
      } else {
        next = isSameScriptureRef(
          current?.ref ?? null,
          result.ref
        )
          ? null
          : { ref: result.ref, anchor, token };
        setError(null);
      }
      setBoth(next);
      if (next) {
        window.dispatchEvent(
          new CustomEvent<number>(OPEN_EVENT, {
            detail: instanceId.current,
          })
        );
      }
    },
    [setBoth]
  );

  return { preview, error, open, close };
};

export default useScriptureRefPreview;
