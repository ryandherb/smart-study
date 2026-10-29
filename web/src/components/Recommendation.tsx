import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "./ui";

export function Recommendation({ setId, provider, ready = true }: { setId: string; provider: string; ready?: boolean }) {
  const [next, setNext] = useState<Awaited<ReturnType<typeof api.recommendation>>>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { let live = true; setNext(null); setError(""); api.recommendation(setId).then(n => { if (live) setNext(n); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [setId]);
  return <div className="mt-4 text-sm">
    {next && <><p className="font-medium">{next.label}: {next.title}</p><p className="mt-1 text-xs text-zinc-500">{next.reason}</p>
      <Button size="sm" disabled={busy || !ready} onClick={async () => {
        setBusy(true); setError("");
        try { const s = await api.startSession(setId, undefined, "adaptive", provider, next.topicKey); navigate(`/study/${s.id}`); }
        catch (e) { setError((e as Error).message); setBusy(false); }
      }}>{busy ? "Starting…" : "Practice this topic"}</Button></>}
    {error && <p role="alert" className="text-rose-500">{error}</p>}
  </div>;
}
