import { useId, useLayoutEffect, useRef, useState } from "react";
import { utf8Bytes } from "../../protocol/agents";
import type { TrustedSnapshot } from "../../protocol/trusted-local";

export type TrustedForkControlProps = {
  parent: TrustedSnapshot;
  disabled?: boolean;
  onFork: (request: {
    token: string; childToken: string; expectedInstanceId: string;
    expectedThreadId: string; expectedTurnId: string; text: string; model: string | null;
  }) => Promise<void>;
};

const instructionLimit = 16384;
const validId = (value: string) => Boolean(value.trim()) && !value.includes("\0") && utf8Bytes(value) <= 256;
function actionable(parent: TrustedSnapshot) {
  const point = parent.forkPoint;
  return Boolean(parent.runToken && parent.status === "ready" && !parent.archived && point &&
    validId(point.threadId) && validId(point.turnId) && point.threadId === parent.threadId);
}
function parentKey(parent: TrustedSnapshot) {
  return JSON.stringify([parent.instanceId, parent.runToken, parent.workspace,
    parent.forkPoint?.threadId, parent.forkPoint?.turnId]);
}
function invalidInstructions(text: string): string | null {
  if (!text.trim()) return "Enter instructions for the child conversation.";
  if (text.includes("\0")) return "Child instructions cannot contain NUL characters.";
  if (utf8Bytes(text) > instructionLimit) return "Child instructions exceed the 16,384-byte UTF-8 limit.";
  return null;
}

export function TrustedForkControl(props: TrustedForkControlProps) {
  // A changed run, core, workspace or checkpoint is a new intent boundary. Keying
  // the form resets its draft immediately, before the next event can submit it.
  return <ForkForm key={parentKey(props.parent)} {...props} />;
}

function ForkForm({ parent, disabled = false, onFork }: TrustedForkControlProps) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [notice, setNotice] = useState("");
  const mounted = useRef(false), inFlight = useRef(false), intentConsumed = useRef(false);
  const latest = useRef({ parent, disabled, onFork });
  latest.current = { parent, disabled, onFork };
  const descriptionId = useId(), errorId = useId();
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const eligible = actionable(parent);
  const error = invalidInstructions(text);

  const submit = async () => {
    const current = latest.current;
    if (!mounted.current || inFlight.current || intentConsumed.current || current.disabled ||
      !actionable(current.parent) || invalidInstructions(text)) return;
    const point = current.parent.forkPoint!;
    inFlight.current = true; intentConsumed.current = true;
    setPending(true); setConsumed(true); setNotice("");
    try {
      await current.onFork({ token: current.parent.runToken!, childToken: crypto.randomUUID(),
        expectedInstanceId: current.parent.instanceId, expectedThreadId: point.threadId,
        expectedTurnId: point.turnId, text: text.trim(), model: null });
      if (!mounted.current) return;
      setText("");
      setNotice("Fork request acknowledged. Inspect runs for the child's provider-confirmed state.");
    } catch {
      if (!mounted.current) return;
      setNotice("Fork outcome unknown. Inspect runs before creating another child. This request will not be replayed; edit the instructions to express a new intent.");
    } finally {
      if (mounted.current) { inFlight.current = false; setPending(false); }
    }
  };

  return <section className="trusted-fork" aria-label="Fork trusted conversation">
    <strong>Fork child conversation</strong>
    <p className="trusted-workspace">Shared working directory: {parent.workspace}</p>
    <p>Shares this directory; not an isolated worktree.</p>
    {eligible ? <form aria-label="Fork child conversation" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <small>Forks from completed turn {parent.forkPoint!.turnId}. Uses the normal configured model.</small>
      <label>Child instructions<textarea rows={2} value={text} maxLength={instructionLimit}
        disabled={disabled || pending} aria-describedby={`${descriptionId}${text && error ? ` ${errorId}` : ""}`}
        aria-invalid={Boolean(text && error)} onChange={(event) => {
          const current = latest.current;
          if (inFlight.current || current.disabled || !actionable(current.parent) || event.target.value === text) return;
          setText(event.target.value); intentConsumed.current = false; setConsumed(false);
        }} /></label>
      <small id={descriptionId}>{utf8Bytes(text).toLocaleString("en-US")} / 16,384 UTF-8 bytes. Instructions must not be blank or contain NUL characters.</small>
      {text && error ? <p id={errorId}>{error}</p> : null}
      <button type="submit" disabled={disabled || pending || consumed || Boolean(error)}>
        {pending ? "Requesting fork…" : "Fork child conversation"}
      </button>
    </form> : <p>Fork requires a live, ready conversation with a confirmed completed turn.</p>}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
