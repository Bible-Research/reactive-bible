import { renderHook, act } from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type Mock,
} from 'vitest';
import { showNotification } from '@mantine/notifications';
import {
  useNoteEditor,
  resetNoteEditorDrafts,
} from './useNoteEditor';
import * as api from '../api';
import { useBibleStore, initialState } from '../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';
import {
  createMockNote,
  createMockTag,
} from '../__tests__/helpers/factories';

vi.mock('../api', () => ({
  addTagNote: vi.fn(),
  editNote: vi.fn(),
  uploadNoteImage: vi.fn(),
  deleteImage: vi.fn(),
  getNotes: vi.fn().mockResolvedValue({
    results: [],
    count: 0,
    next: null,
  }),
  UNTAGGED_TAG_ID: 'untagged',
}));

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const refs = [{ book: 'Genesis', chapter: 1, verse: 1 }];

const renderEditor = (
  options: Parameters<typeof useNoteEditor>[0]
) => renderHook(() => useNoteEditor(options));

describe('useNoteEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNoteEditorDrafts();
    useBibleStore.setState(initialState);
    useAuthStore.setState({ ...authInitialState, token: 'tok' });
    (api.addTagNote as Mock).mockResolvedValue({ id: 'n1' });
    (api.editNote as Mock).mockResolvedValue({});
    (api.uploadNoteImage as Mock).mockResolvedValue({
      id: 'img-1',
    });
    (api.deleteImage as Mock).mockResolvedValue(undefined);
  });

  it('POSTs the first create save and PATCHes later ones',
    async () => {
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });

      await act(async () => {
        await result.current.save('t1', 'hello');
      });
      expect(api.addTagNote).toHaveBeenCalledWith(
        't1',
        'hello',
        refs,
        undefined // `public` omitted — server inherits tag.public
      );

      await act(async () => {
        await result.current.save('t1', 'hello again');
      });
      expect(api.editNote).toHaveBeenCalledWith(
        'n1',
        't1',
        'hello again',
        refs,
        undefined
      );
      // Never a second POST for the same draft.
      expect(api.addTagNote).toHaveBeenCalledTimes(1);
      expect(result.current.hasSaved()).toBe(true);
    });

  it('skips saves without a tag or any content', async () => {
    const { result } = renderEditor({
      mode: 'create',
      draftKey: 'k',
      verseReferences: [],
    });

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save('', 'hello');
    });
    expect(saved).toBe(false);
    // No text AND no linked verses — nothing to persist.
    await act(async () => {
      saved = await result.current.save('t1', '   ');
    });
    expect(saved).toBe(false);
    expect(api.addTagNote).not.toHaveBeenCalled();
    expect(api.editNote).not.toHaveBeenCalled();
    expect(result.current.hasSaved()).toBe(false);
  });

  it('saves a textless note that links verses', async () => {
    const onSubmitted = vi.fn();
    const { result } = renderEditor({
      mode: 'create',
      draftKey: 'k',
      verseReferences: refs,
      onSubmitted,
    });

    // A verse-only note is valid content — autosave persists
    // it even with an empty editor.
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save('t1', '');
    });
    expect(saved).toBe(true);
    expect(api.addTagNote).toHaveBeenCalledWith(
      't1',
      '',
      refs,
      undefined
    );

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.submit('t1', '   ');
    });
    expect(ok).toBe(true);
    // The autosaved note is PATCHed, never re-POSTed.
    expect(api.editNote).toHaveBeenCalledWith(
      'n1',
      't1',
      '   ',
      refs,
      undefined
    );
    expect(onSubmitted).toHaveBeenCalledWith('t1');
  });

  it('serializes concurrent saves — one POST, then PATCH',
    async () => {
      let resolvePost: (value: { id: string }) => void =
        () => undefined;
      (api.addTagNote as Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          })
      );
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });

      let first: Promise<boolean> | undefined;
      let second: Promise<boolean> | undefined;
      await act(async () => {
        first = result.current.save('t1', 'a');
        second = result.current.save('t1', 'b');
      });

      // The POST runs inside the draft queue's then-chain —
      // let it start before resolving it.
      await vi.waitFor(() => {
        expect(api.addTagNote).toHaveBeenCalled();
      });

      await act(async () => {
        resolvePost({ id: 'n1' });
        await first;
        await second;
      });

      expect(api.addTagNote).toHaveBeenCalledTimes(1);
      // The second save waited for the POST's note id.
      expect(api.editNote).toHaveBeenCalledWith(
        'n1',
        't1',
        'b',
        refs,
        undefined
      );
    });

  it('resumes the autosaved draft across a remount', async () => {
    const first = renderEditor({
      mode: 'create',
      draftKey: 'k',
      verseReferences: refs,
    });
    await act(async () => {
      await first.result.current.save('t1', 'draft text');
    });
    first.unmount();

    const second = renderEditor({
      mode: 'create',
      draftKey: 'k',
      verseReferences: refs,
    });
    // The remounted editor restores the draft contents.
    expect(second.result.current.draft).toEqual({
      savedNoteId: 'n1',
      tagId: 't1',
      text: 'draft text',
      pendingFiles: [],
      stagedFiles: [],
    });

    await act(async () => {
      await second.result.current.save('t1', 'more');
    });
    expect(api.addTagNote).toHaveBeenCalledTimes(1);
    expect(api.editNote).toHaveBeenCalledWith(
      'n1',
      't1',
      'more',
      refs,
      undefined
    );
  });

  it('keeps drafts separate per draftKey and per user',
    async () => {
      const one = renderEditor({
        mode: 'create',
        draftKey: 'a',
        verseReferences: refs,
      });
      await act(async () => {
        await one.result.current.save('t1', 'a-draft');
      });
      one.unmount();

      // Same draftKey but a different user — no resume.
      useAuthStore.setState({ token: 'other-token' });
      const other = renderEditor({
        mode: 'create',
        draftKey: 'a',
        verseReferences: refs,
      });
      expect(other.result.current.draft).toBeNull();

      // A different draftKey for the same user — no resume.
      useAuthStore.setState({ token: 'tok' });
      const two = renderEditor({
        mode: 'create',
        draftKey: 'b',
        verseReferences: refs,
      });
      expect(two.result.current.draft).toBeNull();
    });

  it('submit validates empty input and notifies', async () => {
    const onSubmitted = vi.fn();
    const { result } = renderEditor({
      mode: 'create',
      draftKey: 'k',
      // No linked verses — text is the only content, so an
      // empty submit is rejected.
      verseReferences: [],
      onSubmitted,
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.submit('', 'hello');
    });
    expect(ok).toBe(false);
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red' })
    );
    await act(async () => {
      ok = await result.current.submit('t1', '  ');
    });
    expect(ok).toBe(false);
    expect(api.addTagNote).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('submit saves, ends the draft, and runs onSubmitted',
    async () => {
      const onSubmitted = vi.fn();
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
        onSubmitted,
      });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.submit('t1', 'final');
      });
      expect(ok).toBe(true);
      expect(api.addTagNote).toHaveBeenCalledWith(
        't1',
        'final',
        refs,
        undefined
      );
      expect(onSubmitted).toHaveBeenCalledWith('t1');

      // The draft is finished — a remount starts fresh.
      const next = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });
      expect(next.result.current.draft).toBeNull();
    });

  it('submit failure notifies and keeps the draft', async () => {
    (api.addTagNote as Mock).mockRejectedValue(new Error('boom'));
    const onSubmitted = vi.fn();
    const first = renderEditor({
      mode: 'create',
      draftKey: 'k',
      verseReferences: refs,
      onSubmitted,
    });
    // The form reports live contents while typing.
    act(() => {
      first.result.current.trackDraft('t1', 'final');
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await first.result.current.submit('t1', 'final');
    });
    expect(ok).toBe(false);
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Failed to save note. Please try again.',
      })
    );
    expect(onSubmitted).not.toHaveBeenCalled();
    first.unmount();

    // A failed submit does not lose the in-progress draft.
    const second = renderEditor({
      mode: 'create',
      draftKey: 'k',
      verseReferences: refs,
    });
    expect(second.result.current.draft).toEqual({
      savedNoteId: null,
      tagId: 't1',
      text: 'final',
      pendingFiles: [],
      stagedFiles: [],
    });
  });

  it('edit mode PATCHes the note with verse_references',
    async () => {
      const note = createMockNote({
        id: 'n9',
        tag: createMockTag({ id: 't1' }),
      });
      const onSubmitted = vi.fn();
      const { result } = renderEditor({
        mode: 'edit',
        note,
        verseReferences: refs,
        onSubmitted,
      });

      await act(async () => {
        await result.current.save('t1', 'edited');
      });
      expect(api.editNote).toHaveBeenCalledWith(
        'n9',
        't1',
        'edited',
        refs,
        undefined
      );
      expect(api.addTagNote).not.toHaveBeenCalled();
      expect(result.current.hasSaved()).toBe(true);
    });

  it('edit-mode submit refetches the viewed tag page',
    async () => {
      const fetchNotes = vi.fn().mockResolvedValue(undefined);
      useBibleStore.setState({
        fetchNotes,
        notesOrdering: 'created_at',
        notesPage: 3,
      });
      const note = createMockNote({
        id: 'n9',
        tag: createMockTag({ id: 't1' }),
      });
      const onSubmitted = vi.fn();
      const { result } = renderEditor({
        mode: 'edit',
        note,
        verseReferences: refs,
        onSubmitted,
      });

      await act(async () => {
        await result.current.submit('t2', 'edited');
      });
      // Refetches the note's OWN tag at the current page and
      // ordering — not the newly selected 't2' at page 1.
      expect(fetchNotes).toHaveBeenCalledWith('t1', {
        ordering: 'created_at',
        page: 3,
      });
      expect(onSubmitted).toHaveBeenCalledWith('t2');
    });

  it('edit-mode refetch uses the untagged sentinel', async () => {
    const fetchNotes = vi.fn().mockResolvedValue(undefined);
    useBibleStore.setState({ fetchNotes, notesPage: 1 });
    const note = createMockNote({ id: 'n9', tag: null });
    const { result } = renderEditor({
      mode: 'edit',
      note,
      verseReferences: [],
    });

    await act(async () => {
      await result.current.refreshViewedNotes();
    });
    expect(fetchNotes).toHaveBeenCalledWith('untagged', {
      ordering: undefined,
      page: 1,
    });
  });

  it('submit returns false when save declined the write',
    async () => {
      const onSubmitted = vi.fn();
      const { result } = renderEditor({
        mode: 'create',
        // No draftKey — there is no draft slot, so save()
        // resolves false without touching the API.
        verseReferences: refs,
        onSubmitted,
      });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.submit('t1', 'hello');
      });
      expect(ok).toBe(false);
      expect(api.addTagNote).not.toHaveBeenCalled();
      expect(api.editNote).not.toHaveBeenCalled();
      // A declined save is not a submit — no close-out.
      expect(onSubmitted).not.toHaveBeenCalled();
    });

  it('drops drafts when the session token changes',
    async () => {
      const first = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });
      await act(async () => {
        await first.result.current.save('t1', 'draft text');
      });
      first.unmount();

      // Logout and a later login under the same token: every
      // stored draft was made unreachable by the token
      // change, so the store prunes instead of accumulating.
      act(() => {
        useAuthStore.setState({ token: null });
      });
      act(() => {
        useAuthStore.setState({ token: 'tok' });
      });

      const second = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });
      expect(second.result.current.draft).toBeNull();
    });

  it('trackDraft records live contents for a reopen',
    async () => {
      const first = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });
      act(() => {
        first.result.current.trackDraft('t1', 'typing');
      });
      first.unmount();

      const second = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });
      // Restored even though nothing was saved yet.
      expect(second.result.current.draft).toEqual({
        savedNoteId: null,
        tagId: 't1',
        text: 'typing',
        isPublic: undefined,
        pendingFiles: [],
        stagedFiles: [],
      });
    });

  it('forwards isPublic to addTagNote and editNote',
    async () => {
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });

      await act(async () => {
        await result.current.save('t1', 'hello', true);
      });
      expect(api.addTagNote).toHaveBeenCalledWith(
        't1',
        'hello',
        refs,
        true
      );

      await act(async () => {
        await result.current.save('t1', 'v2', false);
      });
      expect(api.editNote).toHaveBeenCalledWith(
        'n1',
        't1',
        'v2',
        refs,
        false
      );
    });

  it('omits `public` when the caller never supplies it',
    async () => {
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });

      await act(async () => {
        await result.current.save('t1', 'hello');
      });
      // The trailing arg stays undefined so the API layer
      // omits the key and the server inherits tag.public.
      expect(api.addTagNote).toHaveBeenCalledWith(
        't1',
        'hello',
        refs,
        undefined
      );
    });

  it('stores isPublic in the draft and restores it on ' +
    'remount', async () => {
      const first = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });
      await act(async () => {
        await first.result.current.save('t1', 'draft', true);
      });
      first.unmount();

      const second = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });
      expect(second.result.current.draft).toEqual({
        savedNoteId: 'n1',
        tagId: 't1',
        text: 'draft',
        isPublic: true,
        pendingFiles: [],
        stagedFiles: [],
      });
    });

  it('uploads staged files only after the POST returns ' +
    'an id', async () => {
      const fileA = new File(['a'], 'a.png', {
        type: 'image/png',
      });
      const fileB = new File(['b'], 'b.png', {
        type: 'image/png',
      });
      const calls: string[] = [];
      (api.addTagNote as Mock).mockImplementation(async () => {
        calls.push('addTagNote');
        return { id: 'n1' };
      });
      (api.uploadNoteImage as Mock).mockImplementation(
        async () => {
          calls.push('uploadNoteImage');
          return { id: 'img-1' };
        }
      );
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });

      act(() => {
        result.current.trackFiles([fileA, fileB]);
      });
      await act(async () => {
        await result.current.save('t1', 'hello');
      });

      // The note POST resolves before any upload — the
      // endpoint needs note_pk in the URL.
      expect(calls).toEqual([
        'addTagNote',
        'uploadNoteImage',
        'uploadNoteImage',
      ]);
      expect(api.uploadNoteImage).toHaveBeenNthCalledWith(
        1,
        'n1',
        fileA
      );
      expect(api.uploadNoteImage).toHaveBeenNthCalledWith(
        2,
        'n1',
        fileB
      );
    });

  it('does not re-upload files the form still reports ' +
    'staged', async () => {
      const fileA = new File(['a'], 'a.png', {
        type: 'image/png',
      });
      const fileB = new File(['b'], 'b.png', {
        type: 'image/png',
      });
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });

      act(() => {
        result.current.trackFiles([fileA]);
      });
      await act(async () => {
        await result.current.save('t1', 'hello');
      });
      expect(api.uploadNoteImage).toHaveBeenCalledTimes(1);

      // The form still shows fileA's thumb and reports both
      // files — the already-uploaded one must be skipped.
      act(() => {
        result.current.trackFiles([fileA, fileB]);
      });
      await act(async () => {
        await result.current.save('t1', 'hello again');
      });
      expect(api.uploadNoteImage).toHaveBeenCalledTimes(2);
      expect(api.uploadNoteImage).toHaveBeenLastCalledWith(
        'n1',
        fileB
      );
    });

  it('keeps a failed upload pending and notifies, while ' +
    'later files still attempt', async () => {
      const fileA = new File(['a'], 'a.png', {
        type: 'image/png',
      });
      const fileB = new File(['b'], 'b.png', {
        type: 'image/png',
      });
      (api.uploadNoteImage as Mock)
        .mockRejectedValueOnce(new Error('too big'))
        .mockResolvedValueOnce({ id: 'img-2' });
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });

      act(() => {
        result.current.trackFiles([fileA, fileB]);
      });
      await act(async () => {
        await result.current.save('t1', 'hello');
      });

      expect(api.uploadNoteImage).toHaveBeenCalledTimes(2);
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Upload failed',
          message: 'too big',
        })
      );

      // fileA stayed pending — a retry on the next save
      // uploads only it (fileB already attached).
      await act(async () => {
        await result.current.save('t1', 'hello again');
      });
      expect(api.uploadNoteImage).toHaveBeenCalledTimes(3);
      expect(api.uploadNoteImage).toHaveBeenLastCalledWith(
        'n1',
        fileA
      );
    });

  it('submit uploads staged files against the created ' +
    'note', async () => {
      const file = new File(['x'], 'x.png', {
        type: 'image/png',
      });
      const onSubmitted = vi.fn();
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
        onSubmitted,
      });

      act(() => {
        result.current.trackFiles([file]);
      });
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.submit('t1', 'final');
      });

      expect(ok).toBe(true);
      expect(api.uploadNoteImage).toHaveBeenCalledWith(
        'n1',
        file
      );
      expect(onSubmitted).toHaveBeenCalledWith('t1');
      // The draft is finished — staged files go with it.
      const next = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });
      expect(next.result.current.draft).toBeNull();
    });

  it('staged files count as content for an image-only ' +
    'note', async () => {
      const file = new File(['x'], 'x.png', {
        type: 'image/png',
      });
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        // No linked verses and no text — the staged file is
        // the note's only content (blank note_text is valid).
        verseReferences: [],
      });

      act(() => {
        result.current.trackFiles([file]);
      });
      let saved: boolean | undefined;
      await act(async () => {
        saved = await result.current.save('t1', '');
      });

      expect(saved).toBe(true);
      expect(api.addTagNote).toHaveBeenCalledWith(
        't1', '', [], undefined
      );
      expect(api.uploadNoteImage).toHaveBeenCalledWith(
        'n1',
        file
      );
    });

  it('re-stages pending files on reopen', async () => {
    const file = new File(['x'], 'x.png', {
      type: 'image/png',
    });
    const first = renderEditor({
      mode: 'create',
      draftKey: 'k',
      verseReferences: refs,
    });
    act(() => {
      first.result.current.trackFiles([file]);
    });
    first.unmount();

    const second = renderEditor({
      mode: 'create',
      draftKey: 'k',
      verseReferences: refs,
    });
    // The un-uploaded file survives for the form to re-stage.
    expect(second.result.current.draft?.pendingFiles).toEqual(
      [file]
    );
    expect(second.result.current.draft?.stagedFiles).toEqual(
      [file]
    );
  });

  it('re-stages the file behind an uploaded image on ' +
    'reopen', async () => {
      const file = new File(['x'], 'x.png', {
        type: 'image/png',
      });
      const first = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });
      act(() => {
        first.result.current.trackFiles([file]);
      });
      await act(async () => {
        await first.result.current.save('t1', 'hello');
      });
      first.unmount();

      const second = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });
      // Nothing is left to upload, but the attached image
      // must stay visible in the form — the File behind it
      // is re-staged so its thumb (and remove button)
      // renders.
      expect(
        second.result.current.draft?.pendingFiles
      ).toEqual([]);
      expect(
        second.result.current.draft?.stagedFiles
      ).toEqual([file]);
    });

  it('deletes the server-side image when an uploaded ' +
    'thumb is removed', async () => {
      const file = new File(['x'], 'x.png', {
        type: 'image/png',
      });
      (api.uploadNoteImage as Mock).mockResolvedValue({
        id: 'img-7',
      });
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });

      act(() => {
        result.current.trackFiles([file]);
      });
      await act(async () => {
        await result.current.save('t1', 'hello');
      });
      expect(api.uploadNoteImage).toHaveBeenCalledTimes(1);

      // The form drops the thumb and reports the remaining
      // staged list — the image must detach server-side
      // too, not just leave pendingFiles.
      act(() => {
        result.current.trackFiles([]);
      });
      expect(api.deleteImage).toHaveBeenCalledWith('img-7');
    });

  it('detaches an image whose thumb was removed while ' +
    'the upload was in flight', async () => {
      const file = new File(['x'], 'x.png', {
        type: 'image/png',
      });
      let resolveUpload: (value: { id: string }) => void =
        () => undefined;
      (api.uploadNoteImage as Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          })
      );
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });

      act(() => {
        result.current.trackFiles([file]);
      });
      let savePromise: Promise<boolean> | undefined;
      await act(async () => {
        savePromise = result.current.save('t1', 'hello');
      });
      await vi.waitFor(() => {
        expect(api.uploadNoteImage).toHaveBeenCalled();
      });

      // Remove the thumb while the upload is pending.
      act(() => {
        result.current.trackFiles([]);
      });
      await act(async () => {
        resolveUpload({ id: 'img-9' });
        await savePromise;
      });

      // The just-attached image is detached again — it
      // would otherwise linger with no UI trace.
      expect(api.deleteImage).toHaveBeenCalledWith('img-9');
    });

  it('does not re-upload a re-selected copy of an ' +
    'attached file', async () => {
      const file = new File(['x'], 'x.png', {
        type: 'image/png',
        lastModified: 100,
      });
      // Re-selecting the same file mints a new File object —
      // identity dedup misses it, so dedup runs on the
      // content signature instead.
      const reselected = new File(['x'], 'x.png', {
        type: 'image/png',
        lastModified: 100,
      });
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        verseReferences: refs,
      });

      act(() => {
        result.current.trackFiles([file]);
      });
      await act(async () => {
        await result.current.save('t1', 'hello');
      });
      expect(api.uploadNoteImage).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.trackFiles([file, reselected]);
      });
      await act(async () => {
        await result.current.save('t1', 'hello again');
      });
      expect(api.uploadNoteImage).toHaveBeenCalledTimes(1);
    });

  it('stays saveable once the only staged file has ' +
    'uploaded', async () => {
      const file = new File(['x'], 'x.png', {
        type: 'image/png',
      });
      const { result } = renderEditor({
        mode: 'create',
        draftKey: 'k',
        // No linked verses — the uploaded image is the
        // note's only content after the first save.
        verseReferences: [],
      });

      act(() => {
        result.current.trackFiles([file]);
      });
      await act(async () => {
        await result.current.save('t1', '');
      });
      expect(api.uploadNoteImage).toHaveBeenCalledTimes(1);

      // A follow-up write on the image-only draft note is
      // still content — the uploaded file left pendingFiles
      // but stays attached.
      let saved: boolean | undefined;
      await act(async () => {
        saved = await result.current.save('t1', '');
      });
      expect(saved).toBe(true);
      expect(api.editNote).toHaveBeenCalledWith(
        'n1',
        't1',
        '',
        [],
        undefined
      );
    });

  it('edit mode saves an image-only note via ' +
    'attachedImageCount', async () => {
      const note = createMockNote({
        id: 'n9',
        tag: createMockTag({ id: 't1' }),
        verses: [],
      });
      const { result } = renderEditor({
        mode: 'edit',
        note,
        verseReferences: [],
        attachedImageCount: 1,
      });

      // No text and no linked verses — the attached image
      // alone makes the note worth saving (e.g. a tag
      // change on an image-only note).
      let saved: boolean | undefined;
      await act(async () => {
        saved = await result.current.save('t1', '');
      });
      expect(saved).toBe(true);
      expect(api.editNote).toHaveBeenCalledWith(
        'n9',
        't1',
        '',
        [],
        undefined
      );

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.submit('t1', '');
      });
      expect(ok).toBe(true);
    });
});
