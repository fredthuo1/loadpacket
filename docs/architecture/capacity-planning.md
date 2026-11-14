# Capacity planning

Status: MODEL, NOT MEASURED PRODUCTION CAPACITY. Organization count is an ordering band, not a load generator. Collect actual 30-day peaks before buying capacity; use synthetic distributions until customers exist.

Variables: N organizations, U active users, D active Drivers, L loads/day, k documents/load, b mean document bytes plus p95/max, Q peak API requests/sec, W peak SQL mutations/sec, F Finance rows/day, J jobs/day, E notification volume/day, C concurrent connections. Include retention years, versions/corrections per document, file upload concurrency, largest tenant and seasonal bursts.

Derived document bytes/day = L*k*b + vault/signature/import bytes; SQL growth = measured bytes per row/index times daily inserts plus audit/outbox; object retained bytes = daily originals * retention * physical copy factor + versions. Worker concurrency >= peak arrival rate * mean execution seconds / target utilization; cap provider quotas. DB sessions = API replicas * pool(5 currently) + workers + migration/admin reserve. Never increase replicas without validating DB pool capacity.

| Band           | Qualification workload                                                      | Initial action and next scaling trigger                                                                                         |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1–100 orgs     | Synthetic launch mix plus one large fleet; measure L/D/Q/W/b                | Two warm app sites; managed minimum qualifying data plane, SQL polling; qualify one-site peak capacity                          |
| 100–1,000      | Measured peak x2, largest tenant x5 burst, mobile reconnect wave            | Add stateless replicas when sustained CPU/pool pressure and latency correlate; tune tenant indexes first                        |
| 1,000–10,000   | Concurrent uploads/imports, DB conflicts, per-tenant hot aggregates         | Separate worker capacity, admission quotas, bounded reporting; qualify any partitioning changes                                 |
| 10,000–100,000 | Regional mix, failover at peak, multi-year restore size                     | Revisit DB/table placement, evidence throughput, region quotas and restore bandwidth; isolate unusually hot tenants if measured |
| 100,000+       | Actual regional traffic and contractual residency, recovery drills at scale | Dedicated capacity/tenant partition strategy only from measurements; revisit architecture ADRs before adding services           |

Proposed triggers: p95 mutation >1.5s or p99 >3s at expected peak; pool wait >100ms sustained; CPU >70% 15m; storage runway <90 days; outbox age >2m; any restore beyond agreed RTO; insufficient single-site spare capacity. Thresholds are tuning assumptions to approve in POC. Correctness violations trigger safety intervention immediately, not autoscaling.

Load tests include transaction conflicts, large Finance imports, parser/scan CPU, object fan-out bytes, slow regional RTT and one-region loss. Soak at representative load for 24h with no correctness failures, bounded memory/connection growth and recoverable queues. Profile SQL before caching. SQL search initially; a future index/warehouse must be derived, tenant-scoped, replayable from outbox/snapshot and separated from primary transactional capacity. Analytics queries have time/range/concurrency budgets; no new warehouse or Elasticsearch is justified today.
