/** The public docs site (Starlight, `apps/docs`). */
export const DOCS_SITE_URL = 'https://andreybegma.github.io/Nautelle';

/** A page of the docs site; `path` starts with `/`, e.g. `/operations/upgrade/`. */
export const docsUrl = (path: string): string => `${DOCS_SITE_URL}${path}`;
