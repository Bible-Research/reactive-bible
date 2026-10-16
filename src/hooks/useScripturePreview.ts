import { useState } from 'react';
import {
  isSameScriptureRef,
  parseScriptureRef,
  ScriptureRef,
} from '../utils/scriptureRef';

/**
 * @scripture-ref preview state shared by NoteCard and
 * CommentNode: parses the clicked ref, toggles the open
 * passage off when the same ref is clicked again, and
 * surfaces parse errors.
 */
const useScripturePreview = () => {
  const [preview, setPreview] =
    useState<ScriptureRef | null>(null);
  const [error, setError] = useState<string | null>(null);

  const togglePreview = (hashtag: string): void => {
    const result = parseScriptureRef(hashtag);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    setPreview((current) =>
      isSameScriptureRef(current, result.ref)
        ? null
        : result.ref
    );
  };

  return { preview, error, togglePreview };
};

export default useScripturePreview;
