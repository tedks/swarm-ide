# Market Pulse · small architecture demo

This is a real editable Git repository included with Swarm's container demo.
It has no accounts, running services or artificial agent sessions.

Open the system design and follow Market Pulse → Quote adapter / Spread engine.
Open `src/spread.ts`, edit its comment, and save. The change stays in the Docker
named volume when you stop and restart the demo. The build declarations describe
actual source membership; these filegroups do not compile or run a trading system.

The adapter emits a normalized quote. The engine consumes that interface and
rejects crossed quotes. The design links make this relationship explicit.

For an existing repository, see the explicit mount instructions in
`docs/container-demo.md` in the Swarm source checkout. Host agents, services and
credentials are not automatically available inside this container.
