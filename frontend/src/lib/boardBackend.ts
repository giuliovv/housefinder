import { docId, type BoardItem, type Me, type Snap } from "./shortlist";

/** The shared-list service. Optional by design: without /firebase-config.json (or if it fails to
 * load) the app simply has no sharing and everything else works. */
export interface BoardBackend {
  subscribe(boardId: string, onItems: (items: BoardItem[]) => void, onError: (e: Error) => void): () => void;
  setSaved(boardId: string, key: string, snap: Snap, me: Me, saved: boolean): Promise<void>;
}

/** the public web config, or null when sharing isn't set up (a missing file may come back as the
 * site's index page, so check it really is the config) */
export async function fetchConfig(): Promise<Record<string, string> | null> {
  try {
    const res = await fetch("/firebase-config.json");
    if (!res.ok) return null;
    const config = await res.json();
    return config && config.projectId && config.apiKey ? config : null;
  } catch {
    return null;
  }
}

export async function loadBackend(): Promise<BoardBackend | null> {
  const config = await fetchConfig();
  if (!config) return null;

  // loaded on demand so people who never share don't download the Firebase SDK
  const [{ initializeApp }, fs] = await Promise.all([import("firebase/app"), import("firebase/firestore")]);
  const db = fs.getFirestore(initializeApp(config));
  const items = (boardId: string) => fs.collection(db, "boards", boardId, "items");

  return {
    subscribe(boardId, onItems, onError) {
      return fs.onSnapshot(
        items(boardId),
        (snap) => onItems(snap.docs.map((d) => d.data() as BoardItem)),
        (e) => onError(e),
      );
    },
    async setSaved(boardId, key, snap, me, saved) {
      const ref = fs.doc(items(boardId), docId(key));
      const name = me.name ?? "Someone";
      if (saved) {
        await fs.setDoc(ref, { key, snap, savers: { [me.id]: name } }, { merge: true });
      } else {
        // an item nobody has saved any more is simply hidden by the reader
        await fs.updateDoc(ref, { [`savers.${me.id}`]: fs.deleteField() }).catch(() => undefined);
      }
    },
  };
}
