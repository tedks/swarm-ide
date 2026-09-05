export class BoundedRequestIds {
  private readonly ids = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("request id cache limit must be a positive integer");
  }

  accept(requestId: string): boolean {
    if (this.ids.has(requestId)) return false;
    this.ids.add(requestId);
    this.order.push(requestId);
    if (this.order.length > this.limit) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.ids.delete(oldest);
    }
    return true;
  }
}
