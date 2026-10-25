import { describe, expect, test } from 'bun:test';
import { singleFlight } from './single-flight';

/** A load the test settles by hand. */
const deferred = () => {
  const loads: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  const run = () =>
    new Promise<void>((resolve, reject) => {
      loads.push({ resolve, reject });
    });
  return { loads, run };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('singleFlight', () => {
  test('a request while a load runs never starts a second one alongside', () => {
    const { loads, run } = deferred();
    const flight = singleFlight(run);
    flight.request();
    flight.request();
    flight.request();
    expect(loads).toHaveLength(1);
  });

  test('requests made while a load runs fold into one after it settles', async () => {
    const { loads, run } = deferred();
    const flight = singleFlight(run);
    flight.request();
    flight.request();
    flight.request();
    loads[0].resolve();
    await tick();
    expect(loads).toHaveLength(2);
    loads[1].resolve();
    await tick();
    expect(loads).toHaveLength(2);
  });

  test('a failed load still starts the one requested after it', async () => {
    const { loads, run } = deferred();
    const flight = singleFlight(run);
    flight.request();
    flight.request();
    loads[0].reject(new Error('offline'));
    await tick();
    expect(loads).toHaveLength(2);
  });

  test('nothing starts once disposed', async () => {
    const { loads, run } = deferred();
    const flight = singleFlight(run);
    flight.request();
    flight.request();
    flight.dispose();
    loads[0].resolve();
    await tick();
    flight.request();
    expect(loads).toHaveLength(1);
  });
});
