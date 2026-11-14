# Database POC teardown and stop controls

LP-PROD-002A, 2026-10-02. **PLAN ONLY — no resources exist from this ticket.** `cleanup-plan` is an offline manifest exporter, not a deletion command. Every proposed [BOM](database-poc-bom.md) resource group carries dependencies, a deletion process, verification and residual-cost notes in [bom.mts](../../scripts/poc/bom.mts).

## Before any future creation

Expand the 36 groups into individual provider IDs. Record account/subscription, region/AZ, group ID, actual ID, type, owner, run ID, creation UTC, expiry UTC, paid-clock start, verified price/unit, dependencies, delete process, marker evidence, expected residue and deletion status. Tag/lable every resource with `project=loadpacket`, `purpose=lp-prod-002`, `environment=poc`, `run-id=<unique>`. Where tagging is unsupported, record an independently reviewed parent ownership mapping.

No creation may precede verified deletion authority. Keep the inventory and cleanup credentials available outside the faulted region. Never discover deletion targets from a broad account-wide name prefix alone. Exact account + resource ID + all four POC tags/owner mapping must match the reviewed manifest. Database cleanup also requires the database run marker; provider termination during database unavailability requires the already captured run marker and exact tagged resource evidence, not a connection to production to discover a target.

The later cleanup executor must reject unmarked/mismatched resources before every destructive call. None is supplied or executed by this preparation task. The current CLI cannot delete a database, VPC, node, volume or bucket.

## Deletion order and proof for every resource class

1. **Writers, clients, scheduled jobs and fault rules:** stop workload issuance and timers; remove only recorded POC network-fault rules; preserve authoritative access long enough to export ACK journal, reconciliation, topology, schema/test results, restore manifests and cost evidence. Verify no active worker, retry job or resource-recreating controller remains. Local reports retain synthetic data only.
2. **A-data, B-data, C-data and A/B/C-restore:** capture/fence leadership, then terminate each inventoried EC2 instance using the provider terminate-instance operation with exact account/region/ID. Wait until provider state is `terminated`, not merely `shutting-down`. Record each attached volume, ENI and public address. Stop candidate controllers from recreating nodes. Check for marketplace/subscription/license charges separately.
3. **A-dcs:** after PostgreSQL writer shutdown/export, stop controllers and terminate all three exact etcd-instance IDs. Verify no DCS/control process remains. Do not delete the control plane before safe writer fencing.
4. **A/B/C disks and DCS disks:** enumerate exact OS/data EBS IDs recorded at creation; after node termination verify detached, delete by exact ID, and confirm not found. DeleteOnTermination must be checked, not assumed. Track snapshots independently; detached volume charges can outlive compute. Restore disks are additional entries, not the source disk IDs.
5. **Backup bucket/snapshots/PITR:** export the evidence required locally, terminate backup schedules and retain no unpriced restore jobs. Delete every version and delete marker under the recorded synthetic bucket, abort multipart uploads, then delete the bucket. Verify no object version, upload, snapshot, managed backup or recovery schedule survives. Object Lock is forbidden for this bounded POC. Retention charges must be included until confirmed absent.
6. **Runner:** export its fsynced independent ledger and redacted evidence first, then terminate the exact instance, delete its 32 GiB volume and release any allocated address. Verify no chargeable stopped instance volume remains. Keep a local inventory copy after the runner is gone.
7. **Network/mesh:** remove peer routes, delete all six recorded peering IDs and the exact gateway endpoint, remove any temporary addresses/ENIs, then delete the four dedicated route/security-group/subnet/VPC sets after dependencies are gone. Confirm all four regions have no matching POC resources. No NAT Gateway, load balancer or interface endpoint is approved by default; if separately added, it must have an explicit cost/deletion entry before creation.
8. **Monitoring:** export short evidence, remove POC log groups, dashboards, alarms and temporary budget configuration. Verify no collectors, exporters, retention policies or paid query jobs remain. Preserve account-mandated audit logs under their own policy and price residual retention; never delete unrelated security logs.
9. **Identity:** detach/delete only the POC instance profiles, roles and policies after cleanup completes; revoke POC sessions and remove local temporary credential material using its exact path. Default provider keys have no new customer-key deletion lifecycle; any separately approved customer key needs its own scheduled-deletion/residual-cost plan. Never rotate/delete production credentials.

For every class, store the delete request identifier/time, final describe/list evidence, verifier and any retained dependency with expected final billing date. `NOT_FOUND` in the wrong region/account is not proof. A delete request alone is insufficient. Check cost/billing later for delayed usage; that follow-up is not permission to keep billable resources running.

## Checklist

- [ ] Named operator and independent verifier can delete every required component.
- [ ] Exact account/region/IDs and POC marker/tags match; no production resource appears.
- [ ] Creation clock and H54 teardown-start / H60 planned-deletion / H72 hard deadline recorded.
- [ ] Writers stopped; evidence exported and hashed outside tested failure domains.
- [ ] All source/restore/runner/DCS nodes terminated and recreation jobs removed.
- [ ] All OS/data disks, snapshots, archive versions, multipart uploads and PITR schedules removed.
- [ ] All POC addresses, ENIs, endpoints, peerings and dedicated network sets removed.
- [ ] POC log/monitoring/budget jobs removed; unavoidable audit retention/residual charges documented.
- [ ] Temporary provider identities/credentials and license/subscription obligations closed.
- [ ] Independent inventory verification across all four regions; final cost/residue recorded.

## Immediate stop conditions for 002B

Stop creating additional paid resources immediately if expected aggregate spend may exceed **$150**, any component remains unpriced, the **72-hour** boundary may be exceeded, a candidate fails a hard requirement, cleanup authority becomes unavailable, POC identity or environment isolation cannot be proven, or production credentials are detected. Stop/fence the affected workload, preserve evidence, and execute only safe authorized containment/cleanup. A hard candidate failure ends that candidate's paid test expansion; do not provision replacements to hide it.

Review projected committed + remaining + teardown/retention cost at each phase and at least every six hours. Budget alerts are informational and may lag. No extension, quota increase, automatic plan upgrade or additional track is implicit. If cleanup fails, stop further tests, escalate to the named operator, retain exact remaining IDs and charges, and use the reserved time/budget to finish deletion. Do not abandon a running resource because testing is blocked.

Current actual inventory: **EMPTY**. Current resource spend: **$0**. Paid creation and cleanup remain future explicitly authorized work.
