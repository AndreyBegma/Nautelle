import { describe, expect, it } from 'bun:test';
import { DEMOFLOW_PACKAGE, DEMOFLOW_VERSION, demoflowCommand } from './pin';

describe('DemoFlow pin', () => {
  it('is 0.7.0, the first with fragments and off-camera setup (C-410)', () => {
    expect(DEMOFLOW_VERSION).toBe('0.7.0');
    expect(DEMOFLOW_PACKAGE).toBe('demoflow@0.7.0');
    expect(demoflowCommand('run').args).toEqual([
      '--yes',
      'demoflow@0.7.0',
      'run',
    ]);
  });
});
