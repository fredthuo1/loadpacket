# Production cost model

Status: planning formulas only; no verified quotes or exact current prices. Obtain dated regional/vendor quotes after POC, including minimum managed multi-region tier, support, retained backups and egress. Availability architecture creates a fixed floor even for one organization.

Let H be billable hours/month; rX be a verified unit rate; cA/cB compute units; d regions/nodes/storage capacity; Bdoc logical retained evidence bytes; f physical copy factor (minimum two, target three); Bbackup independently retained bytes; Qreq edge requests; Blog log GB; Mmetric telemetry units; Uauth monthly active identities; Eemail messages; Vrc applicable Driver Pro billing volume. Use common byte/GB units and avoid double counting bundled provider charges.

Monthly cost model:

- Compute = H*(cA*rComputeA + cB*rComputeB + worker units*rWorker); include load balancers/NAT/private endpoints and N-1 spare capacity.
- Database = sum(node-hours or capacity units*rate) + allocated storage/IO + managed support + PITR charges.
- Cross-region SQL = replicated change bytes * remote destinations * rTransfer + snapshot/rebalance/recovery traffic. Measure WAL/consensus amplification, not only payload size.
- Objects = Bdoc*f*rStorage + PUT/GET/LIST/checksum operations*rate + scanner/processor compute. Object versions, repairs and signature images add bytes; no automatic unlimited retention.
- Cross-region object transfer = new evidence bytes*remote writes + repair/third-copy bytes, multiplied by source/destination rates. Direct fan-out and CRR must not accidentally duplicate the same budget item.
- Backup = Bbackup*rBackup + recovery-object archives + protected key storage + weekly drill compute/restore-egress/verification costs.
- Edge/CDN = request rate tier + outbound bytes + WAF/global-routing/DDoS tier; private evidence is not a free public-CDN workload.
- Logging/monitoring = ingestion GB + retention + indexed traces + metric series + synthetic checks + paging seats. Apply redaction/sampling, never drop authoritative audit to save money.
- Email/auth/RevenueCat = provider base tiers + measured Eemail/Uauth/Vrc at contract rates; distinguish mobile store fees and organization billing fees. No assumed free-production entitlement.
- Support/security = seats, vulnerability/image scans, key management, penetration review and on-call/managed support labor.

| Band           | Model input to price                                       | Expected dominant drivers / decision                                                             |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1–100          | Low/expected/high launch L,Q,b and fixed regional minimums | Fixed DB/edge/backup floor, support and engineering; do not remove quorum for affordability      |
| 100–1,000      | Actual per-org distribution, reconnect burst, retention    | Compute + evidence copies/egress + auth/email; right-size workers                                |
| 1,000–10,000   | Peak W, index growth, F, upload size tails                 | SQL capacity/IO, storage replication and logs; query optimization before more services           |
| 10,000–100,000 | Region distribution, hot tenants, years retained           | Storage/backup/restore traffic, DB placement, on-call support                                    |
| 100,000+       | Measured workload partitions and residency classes         | Regional capacity, dedicated tenant tiers, security/compliance support; revise ADR with evidence |

For each band compute three scenarios using measured p25/median/p95 activity and max-file policy; vary retention 1x/2x, third-copy fill, failed-region repair and egress 2x. Unit economics = monthly platform total / active paying orgs, plus per-load and per-retained-GB views; no made-up dollar totals. Product decides funding before launch. If cost is unaffordable, reduce scope/customer launch, not acknowledged-write durability. Set spend alerts, deletion-safe lifecycle budgets and restore-drill reserve; budget alarms never silently delete evidence.
