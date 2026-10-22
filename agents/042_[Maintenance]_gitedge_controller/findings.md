# Findings
- Stardust's primary checkout was clean. The maintenance branch is isolated from it and based on refreshed `origin/main` at `a28d400`.
- GitEdge's multipart commit contract accepts a `manifest` JSON part (`branch`, `expectedOid`, `message`, `changes`) and binary-safe parts for each `put` change. A branch OID from `GET /api/git/repositories/:id/files?ref=main` supplies the compare-and-swap precondition.
- GitEdge Actions dispatch is `POST /api/actions/repositories/:id/runs` with `{ workflowPath, ref, expectedOid }`; successful responses return a string run ID.
- The controller has no dispatch inputs. It uses a fixed public API origin, repository UUID, two workflow paths, embedded fixed payload bytes, and only the existing `GITEDGE_SIGNING_TOKEN` secret. It never calls credential or profile endpoints and does not print authorization headers or response bodies.
- The multipart commit updates both reviewed workflows in one main-branch CAS. Each dispatch is pinned to the resulting commit OID.
- YAML 1.2 parsing passed for the controller and both payload workflows. The fixed payload bytes matched the reviewed source files exactly. A local `node:vm` fetch stub verified API paths, multipart manifest/parts, OID CAS values, fixed workflow paths, dispatches with no inputs, and that the token is absent from output.
- Fetch rejects redirects and aborts after 30 seconds. Non-success output is restricted to fixed operation labels, numeric HTTP status, and a fixed allowlist of service error codes; network exceptions and malformed responses do not expose service messages.
