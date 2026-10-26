import { describe, expect, test } from 'bun:test';
import { DOCS_SITE_URL, docsUrl } from './docs-site';
import { RUNNER_SOURCE_BUILD_URL } from './runners/install';
import { UPGRADE_GUIDE_URL } from './updates/product-update';

describe('docs site links', () => {
  test('docsUrl joins the base and the path', () => {
    expect(docsUrl('/operations/upgrade/')).toBe(
      `${DOCS_SITE_URL}/operations/upgrade/`,
    );
  });

  test('the upgrade and build-from-source links point at the docs site', () => {
    expect(UPGRADE_GUIDE_URL.startsWith(`${DOCS_SITE_URL}/`)).toBe(true);
    expect(RUNNER_SOURCE_BUILD_URL).toBe(
      `${DOCS_SITE_URL}/getting-started/pair-a-runner/#build-from-source`,
    );
  });
});
