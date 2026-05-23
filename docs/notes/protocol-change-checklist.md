# Protocol change checklist

When changing the protocol, check all that apply before considering the change done.

- [ ] SDK types updated in `packages/pi-protocol-sdk/index.ts`
- [ ] spec docs updated in `docs/spec/`
- [ ] practical guides updated in `docs/guides/` if authoring behavior changed
- [ ] generator/template output updated if package shape changed
- [ ] validator logic updated if certification rules changed
- [ ] reference packages still work (`pi-alpha`, `pi-beta`, `pi-pi` if applicable)
- [ ] demo still runs successfully
- [ ] real Pi loading still works if runtime/bootstrap behavior changed
- [ ] new behavior is reflected in operator projections only if intended
- [ ] any new field or rule stays easy to regenerate or patch across packages

A protocol change is not complete if it exists only in one layer.
