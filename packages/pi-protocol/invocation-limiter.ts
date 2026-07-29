export class InvocationLimiter {
  private active = 0;
  private readonly queue: Array<{
    resolve: (release: () => void) => void;
    reject: (error: Error & { code: string }) => void;
    signal?: AbortSignal;
    onAbort?: () => void;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(private readonly maximum: number, private readonly maximumQueue: number) {}

  acquire(signal: AbortSignal | undefined, deadline: number): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(controlError("CANCELLED", "Invocation cancelled while waiting"));
    if (Date.now() >= deadline) return Promise.reject(controlError("DEADLINE_EXCEEDED", "Invocation deadline exceeded while waiting"));
    if (this.active < this.maximum) {
      this.active += 1;
      return Promise.resolve(this.releaseOnce());
    }
    if (this.queue.length >= this.maximumQueue) return Promise.reject(controlError("OVERLOADED", "Invocation queue is full"));
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal } as (typeof this.queue)[number];
      const remove = () => {
        const index = this.queue.indexOf(waiter);
        if (index >= 0) this.queue.splice(index, 1);
      };
      const cleanup = () => {
        remove();
        if (waiter.timer) clearTimeout(waiter.timer);
        signal?.removeEventListener("abort", waiter.onAbort!);
      };
      waiter.onAbort = () => { cleanup(); reject(controlError("CANCELLED", "Invocation cancelled while waiting")); };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      waiter.timer = setTimeout(() => {
        cleanup();
        reject(controlError("DEADLINE_EXCEEDED", "Invocation deadline exceeded while waiting"));
      }, Math.max(1, deadline - Date.now()));
      this.queue.push(waiter);
    });
  }

  diagnostics(): { active: number; queued: number } {
    return { active: this.active, queued: this.queue.length };
  }

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
      this.dispatch();
    };
  }

  private dispatch(): void {
    while (this.active < this.maximum && this.queue.length) {
      const waiter = this.queue.shift()!;
      waiter.signal?.removeEventListener("abort", waiter.onAbort!);
      if (waiter.timer) clearTimeout(waiter.timer);
      if (waiter.signal?.aborted) { waiter.reject(controlError("CANCELLED", "Invocation cancelled while waiting")); continue; }
      this.active += 1;
      waiter.resolve(this.releaseOnce());
    }
  }
}

function controlError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
