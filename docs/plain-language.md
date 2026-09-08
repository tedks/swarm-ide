# Writing for the operator

Swarm should help a person understand and direct work, not make them decode an implementation report. Use the same clear language in the UI, documentation, agent updates, and handoffs.

## Lead with the useful fact

Say what happened, what is happening, and what the person can do next. Keep a technical reference when it helps someone inspect or act on the result; put it after the explanation.

For example:

> The live-agent worker has published the data format the cockpit needs, so the cockpit worker can start connecting its UI. The code that supplies live data is still being built. The running app has not changed yet. The interface is in PR84.

This communicates more than a string of worker IDs, commit hashes, file paths, and review qualifiers. Those identifiers can still appear in linked details.

## Use short, accurate states

| Instead of | Write |
| --- | --- |
| Reconstructed—not causal proof | Summary from linked sources |
| Observed transcript events—not generated summaries | Session activity |
| Queued does not mean consumed or completed | Message queued |
| No eligible messages in the bounded tail | No recent messages to show |
| Retained previews are not attachment authority | Refresh tasks before attaching this task |
| No structured task provenance recorded | No task details saved for this older run |
| Read only the ready file and registration status if needed | The worker has started; check its startup note if something looks wrong |

Choose wording for the actual state. Use **Live activity** only while following a current session; use **Saved report**, **Last updated…**, **Disconnected**, or **Example data** where those apply. A queued message is not **Delivered**, and a stopped process does not imply that its task is complete.

## Keep warnings that change a decision

Keep warnings about unsaved edits, replacing instructions, sending data to a model service, running repository code, an uncertain message outcome, and acting on the wrong session or worktree. Explain the consequence and a useful next step.

Prefer “Delivery could not be confirmed. Check the conversation before sending again” to a paragraph about acknowledgement authority. Prefer “Save and prepare again to include these edits” to “the buffer is outside the prepared evidence boundary.”

Do not hide failures, invent a recovery action, or make a stronger promise to shorten a sentence. Show a useful error first and retain the error code in details when it helps debugging.

## Put detail where it helps

Show the agent, task, file, worktree, time, and result when relevant. Put hashes, request IDs, sampling limits, source references, and diagnostic explanations in expandable details or technical documentation. A **Partial results** label and a concrete count are usually clearer than repeated warnings about bounded observations.

Use ordinary precise nouns: source, task, conversation, saved report, build target, message. Avoid turning internal terms such as authority, projection, admission, provenance, or convergence into routine operator instructions. They remain useful in the technical documentation that defines them.

## Review the meaning, not just the tone

For each wording change, check that the same action, state, limitation, and warning remain true. Keep accessible names and exact-text tests aligned when labels intentionally change; do not weaken behavioral assertions. Do not rewrite protocol keys, command names, paths, historical transcripts, or recorded test evidence as part of a language pass.
