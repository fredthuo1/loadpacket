import assert from "node:assert/strict";
export interface Resource {
  id: string;
  track: string;
  kind: string;
  region: string;
  quantity: number;
  spec: string;
  hours: number;
  depends: string[];
  deleteProcess: string;
  verify: string;
  residual: string;
  priceStatus: string;
  unitMicroUsd?: string;
  units?: number;
}
export const regions = ["us-east-1", "us-west-2", "eu-west-1"];
export function bom(): Resource[] {
  const r: Resource[] = [];
  const add = (
    id: string,
    track: string,
    kind: string,
    region: string,
    quantity: number,
    spec: string,
    hours: number,
    depends: string[],
    deleteProcess: string,
    residual: string,
  ) =>
    r.push({
      id,
      track,
      kind,
      region,
      quantity,
      spec,
      hours,
      depends,
      deleteProcess,
      verify:
        "Enumerate tagged resources in correct account/region; provider reports absent/terminated; retain redacted evidence.",
      residual,
      priceStatus: "PRICE_REQUIRES_VERIFICATION",
    });
  for (const region of [...regions, "ca-central-1"]) {
    add(
      "network-" + region,
      "shared",
      "vpc",
      region,
      1,
      "Dedicated VPC/subnet/security group; private mesh via inter-region VPC peering; no production routes",
      60,
      [],
      "Delete routes/security groups/subnets then VPC after compute/endpoints",
      "Peering, public IP, interface endpoint and traffic charges",
    );
  }
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i],
      network = "network-" + region;
    add(
      "A-data-" + i,
      "A",
      "ec2",
      region,
      1,
      "m6i.xlarge Linux x86_64; PostgreSQL 17.11; 4 vCPU/16 GiB; Patroni 4.1.4; strict sync and fence qualification required",
      12,
      [network],
      "Terminate exact EC2 ID after fencing and evidence export",
      "EBS and snapshots survive if DeleteOnTermination is false",
    );
    add(
      "A-dcs-" + i,
      "A",
      "ec2",
      region,
      1,
      "m6i.large Linux x86_64; 2 vCPU/8 GiB; etcd 3.6.14 voter; compatibility/security review required",
      12,
      [network],
      "Terminate exact EC2 ID after stopping controller",
      "8 GiB gp3 root volume",
    );
    add(
      "A-dcs-disk-" + i,
      "A",
      "ebs",
      region,
      1,
      "8 GiB encrypted gp3 OS/DCS volume, baseline IOPS/throughput",
      12,
      ["A-dcs-" + i],
      "Delete exact detached volume ID after DCS node termination",
      "Snapshots if explicitly added to inventory",
    );
    add(
      "B-data-" + i,
      "B",
      "ec2",
      region,
      i < 2 ? 2 : 1,
      "m6i.xlarge; CockroachDB 26.2.7; region-survival RF5 2/2/1; license verification required",
      12,
      [network],
      "Terminate exact inventoried EC2 IDs after ledger export",
      "Per-node volumes and database backup objects",
    );
    add(
      "C-data-" + i,
      "C",
      "ec2",
      region,
      1,
      "m6i.xlarge; YugabyteDB 2025.2.6.0-b111; master+tserver RF3; functional POC sizing, not production capacity",
      12,
      [network],
      "Terminate exact EC2 ID after cluster evidence export",
      "Per-node volumes, snapshots and PITR retention",
    );
    for (const track of ["A", "B", "C"])
      add(
        track + "-disk-" + i,
        track,
        "ebs",
        region,
        track === "B" && i < 2 ? 2 : 1,
        "Per data node: 16 GiB gp3 OS + 100 GiB gp3 data; baseline 3000 IOPS/125 MiBps, encrypted",
        12,
        [track + "-data-" + i],
        "Delete detached exact volume IDs; enumerate snapshots separately",
        "116 GiB per node plus snapshot storage",
      );
  }
  add(
    "runner",
    "shared",
    "ec2",
    "ca-central-1",
    1,
    "m6i.large 2 vCPU/8 GiB; Node24/pnpm12.3.4; independent fsynced ACK ledger; 32 GiB encrypted gp3 included",
    60,
    ["network-ca-central-1"],
    "Export journal locally, terminate runner and delete volume",
    "Logs/ledger copies, root/data volume, public IP",
  );
  add(
    "mesh",
    "shared",
    "network",
    "multi-region",
    6,
    "Full mesh VPC peerings among four regions; SG allowlisted DB/replication/control ports; no public DB; S3 gateway endpoint in backup region",
    60,
    [
      "network-us-east-1",
      "network-us-west-2",
      "network-eu-west-1",
      "network-ca-central-1",
    ],
    "Remove peer routes then delete peering IDs and endpoint",
    "Inter-region transfer and endpoint charges where applicable",
  );
  add(
    "backup",
    "shared",
    "s3",
    "ca-central-1",
    1,
    "Private encrypted versioned bucket, bounded 50 GiB + 100k requests + 50 GiB transfer per entire run; DB backup/WAL exports only",
    60,
    ["network-ca-central-1"],
    "Delete all versions/delete markers/multipart uploads then exact bucket",
    "Versioned bytes and request/egress charges; no long object lock",
  );
  for (const track of ["A", "B", "C"])
    add(
      track + "-restore",
      track,
      "restore",
      "ca-central-1",
      track === "B" ? 5 : track === "C" ? 3 : 1,
      "Same node classes/storage/engine as source; up to 4h isolated restore; logical snapshot/PITR tooling and vendor licenses must be qualified",
      4,
      ["backup", "network-ca-central-1"],
      "Delete restored cluster/nodes/volumes after manifest validation",
      "Restore temporary storage, snapshot/WAL and transfer charges",
    );
  add(
    "identity",
    "shared",
    "iam",
    "global",
    1,
    "Fresh POC-only roles/instance profiles, narrow EC2/SSM/backup/fencing rights, no production permissions",
    60,
    [],
    "Detach/delete POC-only policies/profiles/roles; revoke session credentials",
    "Provider audit logs retention and optional key costs",
  );
  add(
    "monitoring",
    "shared",
    "logs",
    "ca-central-1",
    1,
    "Runner local metrics + bounded 2 GiB remote logs; optional AWS Budget alerts $75/$100/$125; no unbounded agents",
    60,
    ["runner"],
    "Delete POC log groups/alarms/budget configuration after export",
    "Ingestion/archive costs; account audit policies may retain records",
  );
  return r;
}
export function validateBom(resources: Resource[]) {
  const ids = new Set(resources.map((r) => r.id));
  assert.equal(ids.size, resources.length);
  for (const r of resources) {
    assert(r.quantity > 0 && Number.isInteger(r.quantity));
    assert(r.hours > 0 && r.hours <= 72);
    assert(r.spec && r.deleteProcess && r.verify && r.residual);
    for (const d of r.depends) assert(ids.has(d), "Missing dependency " + d);
  }
  const visited = new Set<string>(),
    visiting = new Set<string>();
  function visit(id: string) {
    assert(!visiting.has(id), "Dependency cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const d of resources.find((r) => r.id === id)!.depends) visit(d);
    visiting.delete(id);
    visited.add(id);
  }
  resources.forEach((r) => visit(r.id));
  return {
    status: "MANIFEST_VALID",
    resources: resources.length,
    tags: {
      project: "loadpacket",
      purpose: "lp-prod-002",
      environment: "poc",
      "run-id": "<unique>",
    },
  };
}
export function cost(resources: Resource[]) {
  if (
    resources.some(
      (r) =>
        r.priceStatus !== "VERIFIED" ||
        !r.unitMicroUsd ||
        r.units === undefined,
    )
  )
    return {
      status: "PRICE_REQUIRES_VERIFICATION",
      maximumUsd: null,
      authorization: "BLOCKED",
    };
  let micro = 0n;
  for (const r of resources) {
    assert(/^\d+$/.test(r.unitMicroUsd!));
    assert(Number.isSafeInteger(r.units) && r.units! >= 0);
    micro += BigInt(r.unitMicroUsd!) * BigInt(r.units!);
  }
  return {
    status: micro <= 150000000n ? "WITHIN_CAP_NOT_AUTHORIZED" : "OVER_BUDGET",
    maximumUsd: `${micro / 1000000n}.${String(micro % 1000000n).padStart(6, "0")}`,
    authorization: "EXPLICIT_APPROVAL_REQUIRED",
  };
}
