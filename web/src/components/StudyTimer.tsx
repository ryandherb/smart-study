import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function formatStudyTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function StudyTimer({
  setId,
  active,
}: {
  setId: string;
  active: boolean;
}) {
  const [total, setTotal] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    const trackerId = crypto.randomUUID();
    let elapsed = 0;
    let base = 0;
    let last = performance.now();
    let disposed = false;
    let running = false;
    let locked = false;
    let requesting = false;
    let release: (() => void) | undefined;
    const visible = () => active && document.visibilityState === "visible";
    const account = () => {
      const now = performance.now();
      if (running) elapsed += now - last;
      last = now;
    };
    const save = () => {
      const sent = Math.floor(elapsed);
      void api
        .saveStudyTime(setId, trackerId, sent)
        .then((result) => {
          if (disposed) return;
          base = Math.max(base, result.studyTimeMs - sent);
          setTotal(base + elapsed);
          setSaveFailed(false);
        })
        .catch(() => {
          if (!disposed) setSaveFailed(true);
        });
    };
    const update = () => {
      account();
      if (!visible()) {
        running = false;
        release?.();
      } else if (!navigator.locks) {
        running = true;
      } else if (!locked && !requesting) {
        requesting = true;
        // Only one visible tab counts time for this set at once.
        void navigator.locks.request(
          `study-time:${setId}`,
          { ifAvailable: true },
          async (lock) => {
            requesting = false;
            if (!lock || disposed || !visible()) return;
            locked = true;
            running = true;
            last = performance.now();
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            locked = false;
            release = undefined;
          },
        );
      }
      setTotal(base + elapsed);
    };
    const visibility = () => {
      update();
      save();
    };
    const pagehide = () => {
      account();
      running = false;
      save();
      release?.();
    };
    setTotal(0);
    update();
    save();
    const tick = window.setInterval(update, 1000);
    const heartbeat = window.setInterval(save, 10_000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    return () => {
      account();
      disposed = true;
      running = false;
      release?.();
      clearInterval(tick);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      save();
    };
  }, [setId, active]);

  return (
    <span
      className="flex items-center gap-1 text-xs tabular-nums text-study-muted"
      title={
        saveFailed
          ? "Time could not be saved. Retrying…"
          : "Total time studying this set; pauses when this tab is hidden"
      }
    >
      <Clock className="size-4 shrink-0" />
      {formatStudyTime(total)}
      {saveFailed && <span role="status">Unsaved</span>}
    </span>
  );
}
