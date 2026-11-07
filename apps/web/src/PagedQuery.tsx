import { useEffect, useState } from "react";
export type DataViewProps = {
  device: string;
  browser: string;
  profile: string;
  capabilities?: string[];
};
export function usePageControls(filters: Record<string, string>) {
  const [draft, setDraft] = useState(filters);
  const [applied, setApplied] = useState(filters);
  const [size, setSizeValue] = useState(50);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [position, setPosition] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const apply = (next: Record<string, string>) => {
    setCursors([undefined]);
    setPosition(0);
    setApplied(next);
  };
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    if (draftKey === JSON.stringify(applied)) return;
    const timer = setTimeout(() => apply(JSON.parse(draftKey)), 250);
    return () => clearTimeout(timer);
  }, [draftKey]);
  return {
    draft,
    setDraft,
    applied,
    size,
    cursor: cursors[position],
    position,
    refresh,
    ready: draftKey === JSON.stringify(applied),
    apply: () => apply(draft),
    reload: () => {
      apply(draft);
      setRefresh((n) => n + 1);
    },
    setSize: (value: number) => {
      setSizeValue(value);
      apply(draft);
    },
    previous: () => setPosition((n) => Math.max(0, n - 1)),
    next: (cursor?: string | null) => {
      setCursors((old) => [...old.slice(0, position + 1), cursor || undefined]);
      setPosition((n) => n + 1);
    },
  };
}
export function PageControls({
  size,
  onSize,
  position,
  loading,
  hasMore,
  previous,
  next,
}: {
  size: number;
  onSize: (size: number) => void;
  position: number;
  loading: boolean;
  hasMore: boolean;
  previous: () => void;
  next: () => void;
}) {
  return (
    <div className="page-controls">
      <label>
        Sahifadagi yozuvlar
        <select value={size} onChange={(e) => onSize(Number(e.target.value))}>
          {[20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <span>Sahifa {position + 1}</span>
      <div className="actions">
        <button disabled={position === 0 || loading} onClick={previous}>
          Oldingi
        </button>
        <button disabled={!hasMore || loading} onClick={next}>
          Keyingi
        </button>
      </div>
    </div>
  );
}
