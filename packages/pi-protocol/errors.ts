import type { InvokeErrorCode } from "./types.ts";

/** A deliberate protocol failure that preserves its canonical InvokeErrorCode. */
export class ProtocolInvocationError extends Error {
  constructor(readonly code: InvokeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProtocolInvocationError";
  }
}
