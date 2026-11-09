const HEADING = '(?:#{2,4})\\s*';

export function sectionBody(body, names) {
  if (typeof body !== 'string' || body.length === 0) return '';
  const pattern = new RegExp(`${HEADING}(${names.join('|')})\\s*\\n`, 'gi');
  const matches = [...body.matchAll(pattern)];
  if (matches.length === 0) return '';

  const start = matches[0].index + matches[0][0].length;
  const next = body.slice(start).search(new RegExp(`^${HEADING}`, 'm'));
  return (next === -1 ? body.slice(start) : body.slice(start, start + next)).trim();
}

export function parseWriteSet(body) {
  const section = sectionBody(body, ['write[ _]set', 'write set', 'paths']);
  if (section === '') return [];

  const fence = section.match(/```[a-z]*\n([\s\S]*?)```/i);
  const raw = fence ? fence[1] : section;

  return raw
    .split('\n')
    .map((line) =>
      line
        .replace(/^[-*+]\s*/, '')
        .replace(/`/g, '')
        .trim(),
    )
    .filter((line) => line !== '')
    .filter((line) => !line.startsWith('#'))
    .filter((line) => /^[\w./@*-]+$/.test(line));
}

export function parseDependsOn(body) {
  const section = sectionBody(body, ['depends on', 'dependencies', 'blocked by']);
  if (section === '') return [];

  const numbers = section.match(/#(\d+)/g) ?? [];
  return [...new Set(numbers.map((value) => Number(value.slice(1))))];
}

export function parseChecklist(body) {
  const section = sectionBody(body, ['acceptance criteria', 'acceptance']);
  const items = section.match(/^- \[[ xX]\] .+/gm) ?? [];
  return items.map((line) => ({
    text: line.replace(/^- \[[ xX]\] /, '').trim(),
    done: /^- \[[xX]\]/.test(line),
  }));
}

export function issueArea(labels) {
  const area = labels.find((label) => label.startsWith('area:'));
  return area ? area.slice('area:'.length) : null;
}

export function isReady(labels) {
  return labels.includes('status:ready') && !labels.includes('status:blocked');
}

export function normalizeIssue(issue) {
  const labels = (issue.labels ?? []).map((label) =>
    typeof label === 'string' ? label : (label.name ?? ''),
  );

  return {
    number: Number(issue.number),
    title: String(issue.title ?? ''),
    body: String(issue.body ?? ''),
    labels,
    area: issueArea(labels),
    writeSet: parseWriteSet(issue.body),
    dependsOn: parseDependsOn(issue.body),
    ready: isReady(labels),
    critical: labels.includes('risk:critical'),
  };
}
