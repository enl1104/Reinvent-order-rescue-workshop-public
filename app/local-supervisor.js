'use strict';

const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

if (process.env.AWS_LAMBDA_HTTP_ENDPOINT || process.env.DEPLOY_PLATFORM === 'aws') {
  throw new Error('The workshop supervisor is for local runs only.');
}

const restartToken = randomUUID();
let stopping = false;
let child;

function start() {
  let restart = false;
  let deadline;
  child = fork(path.join(__dirname, 'server.js'), {
    env: { ...process.env, WORKSHOP_RESTART_TOKEN: restartToken },
  });
  child.on('message', (message) => {
    if (message !== 'workshop:restart' || restart || stopping) return;
    restart = true;
    child.send('workshop:drain', () => {});
    deadline = setTimeout(() => child.kill('SIGTERM'), 5000);
  });
  child.once('exit', (code, signal) => {
    clearTimeout(deadline);
    if (restart && !stopping) start();
    else process.exitCode = stopping ? 0 : code ?? (signal ? 1 : 0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
}

start();
