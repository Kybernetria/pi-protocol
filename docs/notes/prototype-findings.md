# Prototype findings

The current prototype validated the following in a real Pi session:

- two separately installable Pi packages can load into one shared protocol fabric
- the fabric singleton can live in a shared SDK dependency rather than being duplicated per package
- node registration works automatically during `session_start`
- cross-node invocation works through the fabric
- provenance entries are recorded in session state
- structured failures work for `NOT_FOUND`, `AMBIGUOUS`, `INVALID_INPUT`, `INVALID_OUTPUT`, and `DEPTH_EXCEEDED`
- operator-facing Pi commands such as `/protocol-registry`, `/protocol-call-alpha`, and `/protocol-errors` are useful projections of protocol state, not the protocol itself

Design implications:

- the protocol should stay capability-first rather than always-agentic
- registration timing in Pi should be described in terms of runtime activation or `session_start`, not raw module load alone
- the shared SDK model satisfies the batteries-included requirement without requiring a separate host package
- TypeScript is not required for the package shape; JavaScript entrypoints are also valid
