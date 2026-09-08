# Market Pulse

The quote adapter defines the normalized `Quote` interface in `src/quote.ts`.
The spread engine in `src/spread.ts` consumes it. Quotes must have finite bid and
ask prices and the ask cannot be below the bid. Prices here are illustrative
numbers; production pricing would need explicit currency and precision rules.

`//:quotes` includes the interface source. `//:spread` includes its implementation
and depends on `//:quotes`. These are source filegroups, not deployed services.
If the implementation or boundary changes, update this document and
`.swarm/plans.json` together. The app should let a reader move from this component
relationship to the corresponding source and build declaration.
