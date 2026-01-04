import { Verse } from '../../types';

export const mockVerse: Verse = {
  book: 'Genesis',
  chapter: 1,
  verse: 1,
  text: 'In the beginning God created the heaven and the earth.',
  id: 'gen-1-1',
};

export const mockVerses: Verse[] = [
  {
    book: 'Genesis',
    chapter: 1,
    verse: 1,
    text: 'In the beginning God created the heaven and the earth.',
    id: 'gen-1-1',
  },
  {
    book: 'Genesis',
    chapter: 1,
    verse: 2,
    text: 'And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.',
    id: 'gen-1-2',
  },
  {
    book: 'Genesis',
    chapter: 1,
    verse: 3,
    text: 'And God said, Let there be light: and there was light.',
    id: 'gen-1-3',
  },
];
