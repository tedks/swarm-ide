import type { LaunchContext } from "../../../protocol/agents";
import { displayAgentText } from "./live-state";

function Sources({ title, sources }: { title: string; sources: LaunchContext["instructionSources"] }) {
  return <details>
    <summary>{title} ({sources.length})</summary>
    <p>These are recorded observations, not a reconstruction of the provider's complete expanded context.</p>
    {sources.length === 0 ? <p>No sources recorded.</p> : sources.map((source, index) => <div key={`${source.path}-${index}`}>
      <p>{displayAgentText(source.path)} · {source.observation}</p>
      <p>Digest: {source.digest ?? "unobserved"}<br />Before: {source.before ?? "unobserved"}<br />After: {source.after ?? "unobserved"}</p>
    </div>)}
  </details>;
}

export function LaunchContextView({ context }: { context: LaunchContext }) {
  const focus = context.focus;
  return <div className="agent-launch-context">
    <p>Disk version; unsaved edits not included. This records the submitted context, not a frozen filesystem.</p>
    <p>Requested access: read-only · tool network disabled · approvals never. Availability and verified policy are reported separately by the core. This is not a host confidentiality sandbox: files readable by the local account may be accessible. Selected content is sent to the configured model service. Use trusted local projects and trusted harness configuration.</p>
    <p className="agent-context-path">Root: {displayAgentText(context.root)}<br />Repository: {displayAgentText(context.repositoryId)}<br />World: {displayAgentText(context.worldId)}<br />HEAD: {context.head ?? "unobserved"}<br />Working fingerprint: {context.workingFingerprint}<br />Context hash: {context.contextHash}</p>
    <p className="agent-context-path">Launch focus: {focus.domain} · {displayAgentText(focus.path ?? focus.key)}<br />Key: {displayAgentText(focus.key)}<br />Revision: {focus.revisionKind} · {displayAgentText(focus.revisionId)}{focus.symbol ? <><br />Symbol: {displayAgentText(focus.symbol)}</> : null}{focus.range ? <><br />Lines: {focus.range.startLine}–{focus.range.endLine}</> : null}</p>
    <p>Requested model: {context.requested.model === null ? "provider default (unresolved)" : displayAgentText(context.requested.model)}<br />Requested reasoning: {context.requested.effort === null ? "provider default (unresolved)" : displayAgentText(context.requested.effort)}. Requested settings are not provider observations.</p>
    <details><summary>Task and links</summary><pre>{displayAgentText(context.taskText)}</pre><p>Parent run: {context.links.parentRunId ?? "none"}<br />Task link: {context.links.task === null ? "none" : displayAgentText(context.links.task)}<br />Spec link: {context.links.spec === null ? "none" : displayAgentText(context.links.spec)}. Links do not add access or attach their contents.</p></details>
    {!("contextVersion" in context) ? <p>Legacy context; no structured task provenance recorded.</p> : context.repositoryTask ? <details>
      <summary>Recorded repository task · immutable</summary>
      <p>Original core materialization, not current Ditz state. Metadata {context.repositoryTask.reference.metadataCommit.algorithm}:{context.repositoryTask.reference.metadataCommit.hex}<br />
        Issue blob {context.repositoryTask.reference.issueBlob.algorithm}:{context.repositoryTask.reference.issueBlob.hex}<br />
        UTF-8 bytes: {context.repositoryTask.bytes} · SHA-256: {context.repositoryTask.digest}</p>
      <pre>{displayAgentText(context.repositoryTask.content)}</pre>
    </details> : <p>No repository task was attached to this recorded context.</p>}
    <details><summary>Disk attachments ({context.attachments.length})</summary>
      {context.attachments.length === 0 ? <p>No file bytes attached.</p> : context.attachments.map((attachment) => <div key={attachment.path}>
        <p>{displayAgentText(attachment.path)} · lines {attachment.startLine}–{attachment.endLine}<br />Digest: {attachment.digest}</p>
        <pre>{displayAgentText(attachment.content)}</pre>
      </div>)}
    </details>
    <Sources title="Instruction source observations" sources={context.instructionSources} />
    <Sources title="Configuration source observations" sources={context.configurationSources} />
    <details><summary>Exact submitted prompt</summary><p>Plain text; invisible control characters are shown as Unicode escapes.</p><pre>{displayAgentText(context.submittedPrompt)}</pre></details>
  </div>;
}
