import { AGENT_LIMITS } from "../../protocol/agents";

export class ProviderLineLimit extends Error {}

/** A byte-framed stream: never decode a partial UTF-8 character or retain >1 line. */
export class ProviderJsonl {
  private pending = Buffer.alloc(AGENT_LIMITS.providerLineBytes);
  private used = 0;
  private decoder = new TextDecoder("utf-8", { fatal: true });

  push(chunk: Uint8Array, receive: (value: unknown) => void): void {
    let start = 0;
    for (let end = 0; end <= chunk.length; end++) {
      if (end !== chunk.length && chunk[end] !== 10) continue;
      const length = end - start;
      if (this.used + length > this.pending.length) throw new ProviderLineLimit("Provider line limit");
      this.pending.set(chunk.subarray(start, end), this.used);
      this.used += length;
      if (end < chunk.length) {
        const line = this.decoder.decode(this.pending.subarray(0, this.used));
        this.used = 0;
        receive(JSON.parse(line));
      }
      start = end + 1;
    }
  }

  end(): void {
    if (this.used) throw new Error("Truncated provider line");
  }
}
