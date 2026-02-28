import { useEffect } from 'react';
import { useBibleStore } from '../store';
import Passage from '../components/Passage';

export default function NotesRoute() {
  const setShowNotes = useBibleStore((state) => state.setShowNotes);

  useEffect(() => {
    // Set showNotes to true when on /notes route
    setShowNotes(true);
  }, [setShowNotes]);

  // If user navigates away, we'll handle it in BibleRoute
  return <Passage />;
}
