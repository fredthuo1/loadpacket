# Observability and actionable paging

Status: PROPOSED. Existing logs and health endpoints do not constitute this system.

Use OpenTelemetry-compatible instrumentation from web/mobile request to API, SQL transaction, outbox and worker/provider call. Generate bounded random requestId and traceId, propagate trusted trace context, return requestId on errors. Tenant/actor/resource/operation IDs are restricted correlation fields; avoid high-cardinality tenant IDs in aggregate metric labels. Never trace document bytes, SQL parameter values, tokens, signed URLs, signature images or unrestricted Finance details. Maintain durable audit separately from sampled traces.

Metrics: site CPU/memory/network/instances/restarts; request rate/status/p50/p95/p99/timeouts; DB durable commit/quorum/lock latency, connection saturation, deadlocks, retry rate, replica placement/lag; evidence upload outcomes, verified-copy count, checksum/replication failures and processing latency; load/Driver/POD/signature/Finance error rates; outbox oldest age/attempts/dead letters; backup recoverable age/restore validity; Auth/RevenueCat/email/storage/DB availability. Dimension by region/action/error category/build with bounded cardinality.

Proposed thresholds are starting values for staging calibration, not discovered production baselines:

| Severity | Condition                                                                                     | Response                                                             |
| -------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| PAGE     | Any acknowledged-object checksum mismatch or missing committed evidence                       | Immediate incident and quarantine; storage/customer recovery runbook |
| PAGE     | Quorum/fencing violation or suspected dual writer                                             | Immediate fail-closed; DB and security leads                         |
| PAGE     | Write readiness unavailable >30s, or complete site outage after health debounce               | Failover/read-only investigation; measure customer impact            |
| PAGE     | 5xx >5% for 5m with >=100 requests, or failed core synthetic twice                            | Service incident; sparse traffic relies on synthetic                 |
| PAGE     | POD/signature completion failures >10% for 5m with >=20 attempts                              | Evidence dependency incident                                         |
| PAGE     | Recovery chain broken, backup age beyond approved RPO or weekly drill failed                  | Recovery lead; launch remains blocked until repaired                 |
| PAGE     | Auth unavailable >2m affecting fresh login; severe p99 >5s for 10m                            | Dependency/capacity triage                                           |
| WARNING  | Outbox oldest >2m, rising retries, connection/CPU >70% 15m, restore drill approaching overdue | Ticket/triage; page if safety/deadline breached                      |
| INFO     | Successful deployment, transient retry, expected region drain                                 | Retained event, no page                                              |

Use burn-rate/error-budget alerts once traffic/SLOs are measured; avoid paging on every failed probe. Email/RevenueCat outage severity depends on impact and duration; protect free logistics. Monitor from outside the failing production account, with a synthetic tenant using non-customer dummy evidence and explicit cleanup/retention policy. Synthetic writes must use real durability paths and idempotency, never a bypass. No production synthetic was executed here.

Dashboards: service and site health; authoritative-write contract; evidence integrity; customer operational failure rates; dependencies; backup recoverability. Each alert links exact runbook, safe diagnostic query and dashboard, has owner/secondary and tests delivery/acknowledgement. Target operator acknowledgement <=5m during launch coverage, with a real escalation schedule agreed before launch. Telemetry retention/cost budgets and access are approved; redact at source and collector. Collector outage cannot erase durable business audit.
