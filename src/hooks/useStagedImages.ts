import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';

/**
 * Shared staging block for image-attach forms (comments and
 * notes): local File[] state with blob: object-URL thumbs,
 * client-side checks mirroring the server limits (jpeg/png/
 * webp/gif, 10 MiB, per-parent cap), and cleanup that defers
 * object-URL revocation past the commit that removes a
 * thumbnail — revoking while its <img> is still mounted
 * aborts the in-flight load and trips the global
 * resource-error reporter.
 */

/** MIME types the backend accepts (verified via magic bytes). */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

/** Matches the backend's IMAGE_MAX_BYTES setting. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Content identity for dedup — File object identity fails
 * when the user re-selects the same file from disk (a fresh
 * File instance for identical content).
 */
export const imageFileSignature = (file: File): string =>
  `${file.name}:${file.size}:${file.lastModified}`;

/** Fixed square used by attach-form thumbnails. */
export const IMAGE_THUMB_STYLE: CSSProperties = {
  height: 56,
  width: 56,
  objectFit: 'cover',
  borderRadius: 4,
  display: 'block',
};

export interface StagedImage {
  id: number;
  file: File;
  /** blob: object URL backing the thumbnail preview. */
  url: string;
  /** Preview failed to load — swap in the placeholder. */
  failed?: boolean;
}

interface UseStagedImagesOptions {
  /** Cap on attached + staged images. */
  maxImages: number;
  /** Already-attached images counted against the cap. */
  existingCount?: number;
  /** Noun in the cap error message ('comment' | 'note'). */
  parentNoun?: string;
  /** Files re-staged from a restored editor draft. */
  initialFiles?: File[];
  /** Reports the staged File[] after every change. */
  onChange?: (files: File[]) => void;
}

interface UseStagedImagesResult {
  staged: StagedImage[];
  /** Validation message from the last select/report call. */
  fileError: string | null;
  /**
   * Validates files and stages the accepted ones (object-URL
   * thumbs created). Rejected names land in `fileError`.
   */
  addFiles: (files: File[]) => void;
  /**
   * Validates files without staging — returns the accepted
   * File[] for immediate-upload flows; rejected names land in
   * `fileError` exactly like `addFiles`.
   */
  reportFiles: (files: File[]) => File[];
  removeStaged: (id: number) => void;
  markStagedFailed: (id: number) => void;
  /** Drops all staged files (post-submit cleanup). */
  clearStaged: () => void;
}

export const useStagedImages = ({
  maxImages,
  existingCount = 0,
  parentNoun = 'note',
  initialFiles,
  onChange,
}: UseStagedImagesOptions): UseStagedImagesResult => {
  const urlsRef = useRef<string[]>([]);
  const nextStagedId = useRef(0);
  const [staged, setStaged] = useState<StagedImage[]>(() =>
    (initialFiles ?? []).map((file) => {
      const url = URL.createObjectURL(file);
      urlsRef.current.push(url);
      return { id: nextStagedId.current++, file, url };
    })
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const stagedRef = useRef(staged);
  const existingCountRef = useRef(existingCount);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    existingCountRef.current = existingCount;
    onChangeRef.current = onChange;
  });

  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  const sync = (next: StagedImage[]) => {
    stagedRef.current = next;
    setStaged(next);
    onChangeRef.current?.(next.map((s) => s.file));
  };

  const scheduleRevoke = (url: string) => {
    urlsRef.current = urlsRef.current.filter((u) => u !== url);
    setTimeout(() => URL.revokeObjectURL(url));
  };

  const reportFiles = (files: File[]): File[] => {
    const accepted: File[] = [];
    const errors: string[] = [];
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        errors.push(`Unsupported file type: ${file.name}`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        errors.push(
          `File too large (max 10 MiB): ${file.name}`
        );
        continue;
      }
      if (
        existingCountRef.current +
          stagedRef.current.length +
          accepted.length >=
        maxImages
      ) {
        errors.push(
          `Maximum ${maxImages} images per ${parentNoun}.`
        );
        break;
      }
      accepted.push(file);
    }
    setFileError(errors.length > 0 ? errors.join(' ') : null);
    return accepted;
  };

  const addFiles = (files: File[]) => {
    // Skip copies of files already staged — a re-select
    // mints a new File object, so identity checks miss it.
    const accepted = reportFiles(files)
      .filter(
        (file) =>
          !stagedRef.current.some(
            (s) =>
              imageFileSignature(s.file) ===
              imageFileSignature(file)
          )
      )
      .map((file) => {
        const url = URL.createObjectURL(file);
        urlsRef.current.push(url);
        return { id: nextStagedId.current++, file, url };
      });
    if (accepted.length > 0) {
      sync([...stagedRef.current, ...accepted]);
    }
  };

  const removeStaged = (id: number) => {
    const item = stagedRef.current.find((s) => s.id === id);
    if (!item) return;
    sync(stagedRef.current.filter((s) => s.id !== id));
    scheduleRevoke(item.url);
  };

  const markStagedFailed = (id: number) => {
    sync(
      stagedRef.current.map((s) =>
        s.id === id ? { ...s, failed: true } : s
      )
    );
  };

  const clearStaged = () => {
    stagedRef.current.forEach((s) => scheduleRevoke(s.url));
    sync([]);
  };

  return {
    staged,
    fileError,
    addFiles,
    reportFiles,
    removeStaged,
    markStagedFailed,
    clearStaged,
  };
};
