import { useEffect, useState } from "react";
import { queryAgent } from "./api";
import { unwrap } from "./model.mjs";
import { streamAgent } from "./stream";
export type AgentPage<T> = {
  items: T[];
  page_size?: number;
  page?: number;
  next_cursor?: string | null;
  has_more?: boolean;
  availability?: string;
  reason?: string;
};
export function useAgentPage<T>(
  device: string,
  type: string,
  params: Record<string, unknown>,
  streaming: boolean,
  enabled = true,
  refresh = 0,
) {
  const [data, setData] = useState<AgentPage<T>>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(params);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    setData(undefined);
    setError(undefined);
    setLoading(enabled);
    if (enabled) {
      const run = async () => {
        if (streaming) {
          let items: T[] = [];
          await streamAgent<AgentPage<T>>(
            device,
            type,
            JSON.parse(key),
            abort.signal,
            (frame) => {
              if (!active || abort.signal.aborted) return;
              const page = frame.payload!;
              if (
                !Array.isArray(page.items) ||
                items.length + page.items.length > 100
              )
                throw new Error("Sahifa chegarasi buzildi.");
              items = [...items, ...page.items];
              setData({ ...page, items });
            },
          );
        } else {
          const page = unwrap(
            await queryAgent(device, type, JSON.parse(key), abort.signal),
          ) as AgentPage<T>;
          if (!Array.isArray(page.items) || page.items.length > 200)
            throw new Error("Sahifa chegarasi buzildi.");
          if (active) setData(page);
        }
      };
      void run()
        .catch((reason: unknown) => {
          if (active && !abort.signal.aborted)
            setError(
              reason instanceof Error
                ? reason
                : new Error("Soʻrov bajarilmadi."),
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
      abort.abort();
    };
  }, [device, type, key, streaming, enabled, refresh]);
  return { data, error, loading };
}
