# Database POC bill of materials and paid-execution gate

LP-PROD-002A, 2026-10-02. **PROPOSED RESOURCES ONLY. NOTHING PROVISIONED.** Resource definitions and dependency validation are executable in [bom.mts](../../scripts/poc/bom.mts); `plan` exports the manifest. This is a bounded self-managed functional POC design, not a supported production service selection. No candidate wins by being cheaper.

## Common placement and operating assumptions

Provider/product: AWS EC2 Linux On-Demand, x86_64, shared tenancy, with encrypted EBS gp3. Sites A/B/C are **us-east-1 / us-west-2 / eu-west-1**, respectively. Independent client/ACK ledger and backups are in **ca-central-1** (D). One data node per region for A/C; Track B has 2/2/1 data nodes. Distinct zones inside a region do not count as separate regional failure domains. Obtain region/AZ-specific capacity and security evidence before authorizing execution.

Base OS proposal: Ubuntu Server 24.04 LTS amd64. **AMI IDs, AMI publisher/architecture validation, package/binary hashes, exact OS patch snapshot and security review remain PIN_REQUIRES_VERIFICATION.** Do not resolve an unreviewed `latest` image during paid execution. Engine pins below identify the release to qualify, not a claim that it has vendor support or is free of vulnerabilities.

No managed DB, load balancer, NAT Gateway, Kubernetes control plane or persistent public database endpoint is included. Four isolated VPCs each have one dedicated subnet/route table/security-group set. Six cross-region peerings connect the four sites. DB/replication/control ports allow only the exact POC peers. POC local tunnel access and bootstrap outbound package download/SSM paths require an approved egress design and quote before execution: direct temporary public IPv4 on each provisioned instance with inbound default-deny is the proposed bounded option, removed at teardown. If organizational policy requires NAT/endpoints instead, reprice first. Do not silently add a NAT Gateway or allow internet SQL access.

Use fresh POC credentials, a POC-only IAM role/instance profile and no route/peering/permissions into production. Tag every resource with project=loadpacket, purpose=lp-prod-002, environment=poc and the unique run-id. The same values must appear in the ledger/target/resource inventory. AWS account, operator, cleanup authority and reviewer have not been supplied.

## Track A — strict synchronous fenced PostgreSQL

- Engine: **PostgreSQL 17.11**, pinned source/binary hash to be recorded. Release existence verified in the [official 17.11 notes](https://www.postgresql.org/docs/17/release-17-11.html).
- Three data nodes, one per A/B/C: **m6i.xlarge**, 4 vCPU / 16 GiB each. Each has 16 GiB gp3 OS and 100 GiB gp3 data, baseline 3,000 IOPS / 125 MiB/s, encrypted. Planned source runtime: **12 hours**; 36 data-node-hours and 4,176 GiB-hours.
- HA controllers: **Patroni 4.1.4** on the data nodes; three separate **etcd 3.6.14** voters, one per region, each **m6i.large**, 2 vCPU / 8 GiB, with 8 GiB encrypted gp3. Planned runtime 12 hours; 36 DCS-node-hours and 288 GiB-hours. These are proposed pinned releases requiring compatibility/security review; see [Patroni releases](https://github.com/patroni/patroni/releases) and [etcd releases](https://github.com/etcd-io/etcd/releases).
- Settings under qualification: fsync on, synchronous commit requiring **remote durable flush**, strict synchronous mode without asynchronous fallback, region-aware eligible synchronous destinations, lease fencing/watchdog or verified external stop-before-promotion interlock. A DCS majority alone cannot authorize a stale standby. Patroni configuration and EC2 fencing IAM/verification must be reviewed and fault-tested before this candidate can qualify.
- Backup tools: PostgreSQL 17.11 native base-backup/WAL archive/restore tooling, encrypted private backup bucket in D. Test contiguous archive, permissions, recovery target and independent reconstruction; a local base backup alone does not qualify independent backup.
- Temporary restore: one m6i.xlarge in D, same 116 GiB storage, maximum **4 hours** (4 node-hours, 464 GiB-hours). A single restored server demonstrates restore correctness only; it is not the production restored HA topology.
- Teardown: fence/stop writer, export ledger/manifests, terminate data and DCS IDs, then delete all attached/detached volumes, archive objects, snapshots and control configuration. Source and restore resources have separate inventory entries.

## Track B — CockroachDB

- Engine: **CockroachDB 26.2.7**, release recorded in the [official v26.2 notes](https://www.cockroachlabs.com/docs/releases/v26.2). Binary digest, license/trial limits and production support are unverified; do not assume unrestricted commercial use or features.
- Five **m6i.xlarge**, 4 vCPU / 16 GiB data nodes, A=2 / B=2 / C=1; replication factor/region-survival policy must actually place five replicas across those regions. One 16 GiB OS plus 100 GiB data gp3 pair per node, baseline IOPS/throughput, encrypted. Planned source runtime **12 hours**: 60 node-hours and 6,960 GiB-hours.
- No separate DCS server. Require strong reads, correct locality metadata, survival settings and evidence of actual voting placement; machine count alone is not proof of region survivability.
- Backup: engine-native full/incremental backup and point-in-time equivalent, private D bucket. Feature/license/retention and supported restore target require verification.
- Temporary restore: five m6i.xlarge nodes in D, each 116 GiB, maximum **4 hours**: 20 node-hours and 2,320 GiB-hours. Single-region restore is a correctness exercise, not region-survival qualification.
- Existing PostgreSQL Prisma provider/migration history is **not qualified** for this track. Complete the isolated connector/equivalent-baseline review before paid runtime starts. Unsupported functions, locks, triggers or semantics cannot be removed for a PASS.
- Teardown: export histories, terminate exact nodes and restore nodes, delete all volume IDs and backup versions; separately cancel any activated trial/subscription/license billing if applicable. No license was activated here.

## Track C — YugabyteDB YSQL

- Engine: **YugabyteDB 2025.2.6.0-b111**, from the [official 2025.2 release notes](https://docs.yugabyte.com/stable/releases/ybdb-releases/v2025.2/). Binary digest and commercial support/license terms require verification.
- Three **m6i.xlarge**, 4 vCPU / 16 GiB, one master and tserver co-located per A/B/C, RF3 for both master/data quorums with explicit regional placement. Per node 16 GiB OS plus 100 GiB data encrypted gp3 at baseline performance. Planned runtime **12 hours**: 36 node-hours and 4,176 GiB-hours.
- This is a **functional POC size**, not production capacity sizing. The [vendor deployment checklist](https://docs.yugabyte.com/stable/deploy/checklist/) must guide the later supported production configuration. No conclusion about production N-1 throughput follows from these machines.
- Backup: matching engine-version snapshot/export tooling and YSQL schema/roles backup, plus supported PITR capability or a reviewed equivalent. Exact schedule/export/restore compatibility and license entitlement must be verified before charging for regional tests.
- Temporary restore: three m6i.xlarge nodes in D, same 116 GiB/node, maximum **4 hours**: 12 node-hours and 1,392 GiB-hours.
- Unchanged Prisma PostgreSQL path must prove advisory-lock behavior, PL/pgSQL/trigger behavior, partial/expression indexes, actual enum/types and transaction semantics. Protocol compatibility is insufficient.
- Teardown: terminate both data/master and restored nodes, delete volumes, snapshot exports, PITR schedules/retained data and backup versions; remove any trial/subscription billing if applicable.

## Shared resources and upper bounds to price

- Independent runner/API worker: one **m6i.large** in D, Node 24 / pnpm 12.3.4 and existing lockfile, **32 GiB encrypted gp3**, maximum planned 60 hours. The runner fsyncs client ACKs and exports evidence locally before deletion. This is 60 node-hours and 1,920 GiB-hours; price volume and IPv4 separately even though grouped in the manifest.
- Four dedicated VPC sets, six peerings and one S3 gateway endpoint in D, planned 60 hours. Quote inter-region transfer in both billed directions, endpoint/API charges where applicable and public IPv4 for every active instance. Proposed hard transfer workload limit: 50 GiB total across data, backup and client traffic; a quota estimate is not enforcement. Stop if metered traffic would exceed the quoted allowance. Do not count the backup allowance as another free 50 GiB.
- One private encrypted S3 bucket in D: at most **50 GiB retained data**, **100,000 total requests**, included within the shared 50 GiB traffic envelope, maximum planned 60 hours. Versioning enabled, no Object Lock/minimum retention. Separate per-track backup prefixes. No customer object bytes. Stop before expanding storage, requests or transfer.
- Monitoring: local runner metrics plus up to **2 GiB remote logs**; short retention, no unbounded agents. Price ingestion/storage/queries/alarms. Configure budget alerts at $75/$100/$125 where supported, understanding they can lag and are not spending enforcement.
- POC identity/profile/policies and ephemeral TLS/SSH material; proposed encryption uses provider-managed default at-rest keys plus restricted POC access, avoiding a new retained customer-managed key unless independently priced/authorized. TLS paths, trust material and rotation/teardown are execution prerequisites.
- No concurrency of source tracks. Restore instances are additional temporary resources. Extra regions, managed backups, commercial support, endpoints, load balancers or object-storage tests require revising the aggregate BOM before approval.

The machine-readable manifest has **36 resource groups** with quantities and dependencies; groups containing several disks/nodes must be expanded to exact provider resource IDs at creation. Across all three trials, proposed compute is **168 m6i.xlarge node-hours** (132 source + 36 restore) and **96 m6i.large node-hours** (36 DCS + 60 runner). Planned total EBS occupancy is **21,696 GiB-hours**. These are quantities, not prices or paid usage; deletion delay/rounding/contingency must be added before a maximum is quoted.

## Pricing and aggregate cap

**PRICE_REQUIRES_VERIFICATION** for all chargeable components. Official public pricing references: [EC2 On-Demand](https://aws.amazon.com/ec2/pricing/on-demand/), [EBS](https://aws.amazon.com/ebs/pricing/), [VPC/public IPv4/transfer](https://aws.amazon.com/vpc/pricing/), [S3](https://aws.amazon.com/s3/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) and [AWS Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/). Public pages were used for price-source discovery; account/region-specific complete quotes were not obtained. No third-party price estimate or zero-cost assumption is substituted.

Before paid authorization attach dated official region/SKU quotes, units/billing granularity, license/trial expiry terms, taxes/fees and residual charges. Compute the aggregate in integer micro-USD/Decimal:

`node-hours × regional rates + GiB-hours × storage rates + IP-hours + backups + requests + all transfer + logs/metrics + licenses/support + taxes/fees + teardown/retention reserve`.

Charge the worst-case deletion window up to the 72-hour boundary where resources can remain billable. A proposed **$30 teardown/variance reserve is inside the $150 cap**. The unpriced maximum is **UNKNOWN**, not $0 or $150. `cost()` refuses a maximum if any input is unverified, and requires explicit approval even when a verified sum fits. Price verification includes completeness of quantities, not just a numeric unit price.

**AGGREGATE_EXPECTED_POC_COST: NOT_CALCULABLE_FROM_VERIFIED_INPUTS.**
**MINIMUM_REQUIRED_BUDGET: UNDETERMINED_PENDING_OFFICIAL_QUOTES.**
**TRACK_REQUIRES_SEPARATE_AUTHORIZATION: A, B, C until a complete aggregate plan fits $150.**

No paid authorization is requested. The previous owner boundary is not spending permission.

## 72-hour execution feasibility

Pre-paid work must resolve connector/schema failures, local bindings, restore procedures, exact image/digest pins, pricing, support/license terms and fault adapters. Proposed paid schedule: H0–6 shared setup; A H6–18 plus restore H18–22; B H22–34 plus restore H34–38; C H38–50 plus restore H50–54; H54–60 teardown; H60–66 independent verification; H66–72 final contingency only. Planned shared resource deletion is H60, hard deadline H72 from the first paid resource.

**Feasibility is NOT_PROVEN.** Repeated 10,000-ACK trials, three regional-loss rotations, safe fault recovery and API benchmarks may consume more than 12 hours per candidate. Measure local setup and sustainable workload throughput first; if all required tests cannot fit the quoted time/cap, stop before affected provisioning and report the required extra budget/runtime or a separately authorized track. Never shorten the ACK workload, skip a hard failure scenario or downgrade synchronous replication to fit the envelope.

## Ready for paid POC authorization

**NO.** Exact proposed node classes/counts/regions/storage and teardown scope are present. Account-specific immutable image IDs, official full quotes, tested fencing/fault adapters, API benchmark bindings, licensing/support, isolated operator/cleanup identity and timing feasibility remain unresolved. See the [teardown controls](database-poc-teardown.md) and [scorecard](database-poc-scorecard.md).
