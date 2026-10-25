import { describe, expect, test } from 'bun:test';
import { curlExample, expiresAtFor, expiryLabel } from './format';

describe('expiresAtFor', () => {
  const now = new Date('2026-10-25T12:00:00.000Z');

  test('a preset is that many days after now', () => {
    expect(expiresAtFor('30', now)).toBe('2026-11-24T12:00:00.000Z');
  });

  test('never sends no expiry', () => {
    expect(expiresAtFor('never', now)).toBeNull();
  });
});

describe('expiryLabel', () => {
  test('names a year and plain day counts', () => {
    expect(expiryLabel('365')).toBe('1 year');
    expect(expiryLabel('7')).toBe('7 days');
    expect(expiryLabel('never')).toBe('Never');
  });
});

describe('curlExample', () => {
  test('lists projects with the bearer header', () => {
    expect(curlExample('https://n.example/api/', 'ntl_abc')).toBe(
      "curl -H 'Authorization: Bearer ntl_abc' https://n.example/api/projects",
    );
  });
});
