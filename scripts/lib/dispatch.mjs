import { overlaps } from '../claims.mjs';

export const FALLBACK_CAPACITY = 1;

/**
 * Deterministic, side-effect free assignment planning.
 * The dispatcher is the only writer, so ordering must be stable for audit.
 */
export function planAssignments({ issues, claims, agents, doneIssues = [], now = Date.now() }) {
  const activeClaims = claims.filter((claim) => !isExpired(claim.claim, now));
  const claimedIssues = new Set(activeClaims.map((entry) => entry.issue));
  const done = new Set(doneIssues);

  const load = new Map();
  for (const agent of agents) {
    const held = activeClaims.filter((entry) => entry.claim.agent === agent.id).length;
    load.set(agent.id, held);
  }

  const taken = activeClaims.flatMap((entry) =>
    (entry.claim.write_set ?? []).map((pattern) => ({ issue: entry.issue, pattern })),
  );

  const assignments = [];
  const skipped = [];

  const ordered = [...issues].sort((a, b) => {
    const priority = (issue) => {
      if (issue.labels.includes('priority:p0')) return 0;
      if (issue.labels.includes('priority:p1')) return 1;
      if (issue.labels.includes('priority:p2')) return 2;
      return 3;
    };
    const delta = priority(a) - priority(b);
    return delta !== 0 ? delta : a.number - b.number;
  });

  for (const issue of ordered) {
    if (!issue.ready) {
      skipped.push({ issue: issue.number, reason: 'not ready' });
      continue;
    }
    if (issue.writeSet.length === 0) {
      skipped.push({ issue: issue.number, reason: 'no write_set' });
      continue;
    }
    if (issue.dependsOn.some((dependency) => !done.has(dependency))) {
      const open = issue.dependsOn.filter((dependency) => !done.has(dependency));
      skipped.push({
        issue: issue.number,
        reason: `depends on ${open.map((n) => `#${n}`).join(', ')}`,
      });
      continue;
    }
    if (claimedIssues.has(issue.number)) {
      skipped.push({ issue: issue.number, reason: 'already claimed' });
      continue;
    }

    const conflict = taken.find((entry) =>
      issue.writeSet.some((pattern) => overlaps(pattern, entry.pattern)),
    );
    if (conflict) {
      skipped.push({ issue: issue.number, reason: `write_set overlaps #${conflict.issue}` });
      continue;
    }

    const eligible = agents
      .filter((agent) => agent.active !== false)
      .filter((agent) => !agent.area || agent.area === 'any' || agent.area === issue.area)
      .filter((agent) => (load.get(agent.id) ?? 0) < (agent.capacity ?? FALLBACK_CAPACITY))
      .sort((a, b) => {
        const delta = (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0);
        return delta !== 0 ? delta : a.id.localeCompare(b.id);
      });

    const agent = eligible[0];
    if (!agent) {
      skipped.push({ issue: issue.number, reason: 'no eligible agent' });
      continue;
    }

    assignments.push({
      issue: issue.number,
      agent: agent.id,
      paths: issue.writeSet,
    });

    load.set(agent.id, (load.get(agent.id) ?? 0) + 1);
    for (const pattern of issue.writeSet) {
      taken.push({ issue: issue.number, pattern });
    }
    claimedIssues.add(issue.number);
  }

  return { assignments, skipped };
}

export function isExpired(claim, now = Date.now()) {
  const until = Date.parse(claim?.lease_until);
  return !Number.isFinite(until) || until <= now;
}
