# Database candidate scorecard

LP-PROD-002A, 2026-10-02. **No winner. No candidate has executed.** Local harness tests are not a database qualification result. The seven hard keys in `qualifiedDecision()` are required by name, and a preference score cannot override a failed hard requirement.

## Hard requirements — current state for A, B and C

Each of the following is **NOT_VERIFIED for Track A / Track B / Track C**. Evidence must name run ID, exact engine/version, schema hashes, topology, failure domain, actual outcome and reviewer.

1. **rpo — zero lost acknowledged writes:** 10,000 pre-fault ACKs, all recovered exactly once with correct values after each declared failure. Any missing ACK is FAIL, even if retry recreates it later.
2. **consistency — strong authoritative consistency:** correct committed reads and transaction invariants before/during/after faults; no stale serving path passed off as strong reads.
3. **splitBrain — single authority:** minority cannot commit/elect, routing cannot grant authority and rejoin produces one history. PostgreSQL additionally needs eligible remote durable copies and verified writer fencing, not just control quorum.
4. **transactions — transaction correctness:** commit/rollback, actual nested service paths, unique races, row/advisory semantics, concurrent Finance/signature/stop operations, bounded retry and correct unknown outcomes. No unreviewed external effect replay.
5. **schema — LoadPacket feasibility:** all 26 models/enums and complete migration semantics; exact values, constraints/indexes/triggers/view/privileges and tenant boundaries. Candidate-only equivalent baselines require review; removing semantics is FAIL.
6. **recovery — recoverability:** independent snapshot/PITR or reviewed equivalent; complete boundary manifest and later valid ACK reconciliation, backup access and reproducible restore. Object bytes require separate later qualification.
7. **operatingModel — supported production model:** documented vendor/version/topology support, licensing, staffing/on-call, tested upgrades/fencing/backup and production-sized N-1 capacity. A successful self-managed functional POC does not itself satisfy this requirement.

Decision rules: any FAIL => DISQUALIFIED; any missing/unknown evidence => NOT_QUALIFIED; all seven PASS => ELIGIBLE_FOR_REVIEW, never automatic production approval. Missing observations are not zeros. Incomplete unknown reconciliation blocks qualification even with zero counted lost ACKs.

## Preferences — evaluate only after hard gates

Score 1–5 with evidence and rationale for each: lower measured latency; easier Prisma integration; lower migration effort; lower operational complexity; lower complete cost; easier observability; smaller-team operability. All preference scores are currently **NOT_SCORED for A/B/C**. Weights require product/SRE review; no aggregate score is calculated here. Higher preference cannot erase a single hard failure.

## Known issues to investigate

- A: remote synchronous placement, old-writer fencing, eligible promotion and supported ownership must be proven under loss of each region. Do not conflate etcd majority with surviving committed WAL.
- B: current PostgreSQL connector/history cannot simply be relabeled CockroachDB; isolated equivalent schema/connector work and retry policy review are prerequisites. This is a compatibility blocker, not a fabricated runtime test failure.
- C: advisory locks, PL/pgSQL, triggers, indexes and current PrismaPg behavior require live qualification. Functional node sizing is below the later production capacity review.
- All: universal application idempotency, external side effects, legacy tenant relation gaps, immutable DELETE boundaries, independently durable object bytes and provider support are not fixed by this harness.

Production release gates remain unchanged and NOT_VERIFIED. See [release gates](release-gates.md), [BOM](database-poc-bom.md) and [harness scope](database-poc-harness.md).
