import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type ProgressItem } from "./api";
import { useAuth } from "./auth";

type Key = string; // `${itemType}:${itemId}`
const keyOf = (t: string, id: string): Key => `${t}:${id}`;

type ProgressState = {
  learned: Set<Key>;
  counts: { object: number; command: number };
  isLearned: (t: "object" | "command", id: string) => boolean;
  toggle: (t: "object" | "command", id: string) => Promise<void>;
};

const Ctx = createContext<ProgressState | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [learned, setLearned] = useState<Set<Key>>(new Set());

  useEffect(() => {
    if (!user) { setLearned(new Set()); return; }
    api.get<{ items: ProgressItem[] }>("/progress")
      .then(({ items }) =>
        setLearned(new Set(items.filter((i) => i.status === "learned").map((i) => keyOf(i.itemType, i.itemId)))))
      .catch(() => setLearned(new Set()));
  }, [user]);

  const toggle = useCallback(async (t: "object" | "command", id: string) => {
    const k = keyOf(t, id);
    const on = learned.has(k);
    // Optimistic: flip immediately, roll back if the server disagrees. Marking
    // something as learned should never feel like it needs a round trip.
    setLearned((prev) => {
      const next = new Set(prev);
      on ? next.delete(k) : next.add(k);
      return next;
    });
    try {
      if (on) await api.del(`/progress/${t}/${encodeURIComponent(id)}`);
      else await api.put("/progress", { itemType: t, itemId: id, status: "learned" });
    } catch {
      setLearned((prev) => {
        const next = new Set(prev);
        on ? next.add(k) : next.delete(k);
        return next;
      });
    }
  }, [learned]);

  const value = useMemo<ProgressState>(() => {
    let object = 0, command = 0;
    learned.forEach((k) => (k.startsWith("object:") ? object++ : command++));
    return {
      learned,
      counts: { object, command },
      isLearned: (t, id) => learned.has(keyOf(t, id)),
      toggle,
    };
  }, [learned, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProgress() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProgress must be used inside <ProgressProvider>");
  return ctx;
}
