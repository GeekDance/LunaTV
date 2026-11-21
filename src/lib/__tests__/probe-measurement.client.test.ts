import { measureProbeNetwork } from '../probe-measurement.client';

const stats = { loading: { start: 1000, first: 1100, end: 1500 }, retry: 0 };
const resource = {
  startTime: 1001,
  requestStart: 1002,
  responseStart: 1100,
  responseEnd: 1499,
  transferSize: 1000300,
  encodedBodySize: 1000000,
  decodedBodySize: 1000000,
  workerStart: 0,
};

test('uses each requests full elapsed time and decimal units for a credible network sample', () => {
  expect(measureProbeNetwork(stats, resource)).toEqual({
    loadSpeed: '2.0 MB/s',
    speedStatus: 'measured',
    pingTime: 100,
    loadTimeMs: 500,
  });
});
test('local cache reads do not become bandwidth even when payload arrives in one millisecond', () => {
  expect(
    measureProbeNetwork(
      { loading: { start: 1000, first: 1000.1, end: 1001 } },
      {
        ...resource,
        transferSize: 0,
        startTime: 1000,
        requestStart: 1000,
        responseStart: 1000.1,
        responseEnd: 1001,
      }
    ).speedStatus
  ).toBe('cached');
});
test('cross-origin restricted timing is unknown, not a cache hit or invented throughput', () => {
  const sample = measureProbeNetwork(stats, {
    ...resource,
    transferSize: 0,
    requestStart: 0,
    responseStart: 0,
  });
  expect(sample.loadSpeed).toBe('速度不可测');
  expect(sample.speedStatus).toBe('unavailable');
});
test('rejects short, tiny, revalidated, service-worker and unmatched timing samples', () => {
  expect(
    measureProbeNetwork(
      { loading: { start: 1000, first: 1001, end: 1005 } },
      {
        ...resource,
        startTime: 1000,
        requestStart: 1000.5,
        responseStart: 1001,
        responseEnd: 1005,
      }
    ).speedStatus
  ).toBe('insufficient');
  expect(
    measureProbeNetwork(stats, {
      ...resource,
      encodedBodySize: 1000,
      decodedBodySize: 1000,
    }).speedStatus
  ).toBe('insufficient');
  expect(
    measureProbeNetwork(stats, { ...resource, transferSize: 300 }).speedStatus
  ).toBe('cached');
  expect(
    measureProbeNetwork(stats, { ...resource, workerStart: 900 }).speedStatus
  ).toBe('unavailable');
  expect(
    measureProbeNetwork(stats, { ...resource, startTime: 10, responseEnd: 509 })
      .speedStatus
  ).toBe('unavailable');
  expect(measureProbeNetwork(undefined, resource).loadSpeed).toBe('速度不可测');
});

test('service-worker ambiguity is not labelled as confirmed local cache', () => {
  expect(
    measureProbeNetwork(stats, {
      ...resource,
      transferSize: 0,
      workerStart: 900,
    }).speedStatus
  ).toBe('unavailable');
});
test('nonmonotonic resource timing cannot yield measured bandwidth', () => {
  expect(
    measureProbeNetwork(stats, {
      ...resource,
      requestStart: 1200,
      responseStart: 1100,
    }).speedStatus
  ).toBe('unavailable');
});
