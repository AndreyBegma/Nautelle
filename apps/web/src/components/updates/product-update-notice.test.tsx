import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BACKUP_GUIDE_URL,
  UPGRADE_GUIDE_URL,
} from '../../lib/updates/product-update';
import { ProductUpdateNotice } from './product-update-notice';

const release = {
  version: '0.16.0',
  url: 'https://github.com/AndreyBegma/Nautelle/releases/tag/v0.16.0',
};

const render = () =>
  renderToStaticMarkup(
    <ProductUpdateNotice
      release={release}
      current="0.15.2"
      onDismiss={() => {}}
    />,
  );

describe('ProductUpdateNotice (C-374, C-526)', () => {
  test('shows the running and the new version, and links the notes and the guide', () => {
    const html = render();
    expect(html).toContain('Nautelle update available');
    expect(html).toContain('Running 0.15.2, latest 0.16.0');
    expect(html).toContain('>0.15.2<');
    expect(html).toContain('>0.16.0<');
    expect(html).toContain(`href="${release.url}"`);
    expect(html).toContain('Release notes');
    expect(html).toContain(`href="${UPGRADE_GUIDE_URL}"`);
    expect(html).toContain('Upgrade guide');
  });

  test('lists the ways to upgrade, each in a code block, with the backup link', () => {
    const html = render();
    expect(html).toContain('How to update');
    expect(html).toContain('Take a backup first.');
    expect(html).toContain(`href="${BACKUP_GUIDE_URL}"`);
    expect(html).toContain('docker compose pull');
    expect(html).toContain('docker compose up -d');
    expect(html).toContain('install.sh | sh');
    expect(html).toContain('directory that holds');
    expect(html).toContain('not inside it.');
    expect(html).toContain('NAUTELLE_VERSION=0.16.0');
    expect(html).toContain('Copy');
  });

  test('never offers to run the upgrade from the web app', () => {
    const html = render();
    expect(html).not.toMatch(/upgrade now|update now/i);
    expect(html).toContain('cannot restart its own stack');
  });

  test('the dismissal is the caller’s', () => {
    let dismissed = 0;
    const banner = ProductUpdateNotice({
      release,
      current: '0.15.2',
      onDismiss: () => {
        dismissed += 1;
      },
    });
    (banner.props as { onDismiss: () => void }).onDismiss();
    expect(dismissed).toBe(1);
  });
});
