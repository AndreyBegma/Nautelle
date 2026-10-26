/** The parts of a project's labels and rules the matcher reads. */
export interface PathLabel {
  id: string;
  combines: readonly string[];
}

export interface PathRule {
  pattern: string;
  labelId: string;
}

/**
 * A rule pattern as a regular expression: `*` and `?` stay inside a path
 * segment, a middle `**` is any number of folders (also none), a last `**`
 * everything below.
 */
const patternRegExp = (pattern: string): RegExp => {
  const segments = pattern.split('/');
  const source = segments
    .map((segment, i) => {
      const last = i === segments.length - 1;
      if (segment === '**') return last ? '.*' : '(?:[^/]+/)*';
      const body = segment
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
      return last ? body : `${body}/`;
    })
    .join('');
  return new RegExp(`^${source}$`);
};

/**
 * C-501 (ADR-0125 D7): the labels the path rules give for the changed paths.
 * A rule gives its label when any path matches it; a label whose `combines`
 * are all given replaces them (fullstack for frontend and backend). Ids come
 * back in the order of `labels`; none when no rule matches.
 */
export const labelsOfPaths = (
  paths: readonly string[],
  rules: readonly PathRule[],
  labels: readonly PathLabel[],
): string[] => {
  const given = new Set<string>();
  for (const rule of rules) {
    if (given.has(rule.labelId)) continue;
    const matches = patternRegExp(rule.pattern);
    if (paths.some((path) => matches.test(path))) given.add(rule.labelId);
  }
  // Each pass adds at least one label or stops, so `labels.length` passes do.
  for (let pass = 0; pass < labels.length; pass += 1) {
    let combined = false;
    for (const label of labels) {
      if (
        label.combines.length === 0 ||
        !label.combines.every((id) => given.has(id))
      ) {
        continue;
      }
      const grew = !given.has(label.id);
      for (const id of label.combines) given.delete(id);
      given.add(label.id);
      combined ||= grew;
    }
    if (!combined) break;
  }
  return labels.filter((l) => given.has(l.id)).map((l) => l.id);
};
