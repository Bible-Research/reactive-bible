export interface Tag {
  id: string;
  name: string;
  parent_tag: string | null;
  created_at: string;
  updated_at: string;
}

export interface Verse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface Note {
  id: string;
  note_text: string;
  public: boolean;
  is_owner: boolean;
  created_at: string;
  updated_at: string;
  tag: Tag;
  verses: Verse[];
}

export interface VerseTimestamp {
  verse_start: number;
  timestamp: number;
}

export interface FilesetCopyright {
  id: string;
  type: string;
  size: string;
  copyright: string;
  copyright_date: string;
  copyright_description: string;
}
