/* eslint-disable @typescript-eslint/no-var-requires */
// Jest 27 predates Node's native Fetch API; expose it to route tests.
const NodeEnvironment = require('jest-environment-node');

module.exports = class NodeWebEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const key of [
      'Request',
      'Response',
      'Headers',
      'fetch',
      'AbortController',
    ]) {
      this.global[key] = globalThis[key];
    }
  }
};
