'use strict';

/*
 * One plain Node HTTP server, two places it runs:
 *   - your laptop:          loopback only (127.0.0.1), not reachable from other machines
 *   - AWS Lambda Web Functions: Lambda sets AWS_LAMBDA_HTTP_ENDPOINT (host:port)
 *
 * Routes: GET / (demo page), POST /chat (run the agent), GET /health.
 */

require('./telemetry'); // start tracing before anything else

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const { answer } = require('./service');

const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const WORKSHOP_RAW = fs.readFileSync(path.join(__dirname, 'public', 'workshop.html'), 'utf8');
const ARCH_SVG = fs.readFileSync(path.join(__dirname, 'public', 'architecture.svg'));
const BRAND_ASSETS = new Map([
  'anthropic.svg', 'claude.svg', 'dynatrace.svg', 'dynatrace-mark.svg',
  'kiro-crew.svg', 'powered-by-aws.png',
].map(name => [`/brands/${name}`, fs.readFileSync(path.join(__dirname, 'public', 'brands', name))]));
const _otlp = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || '';
const _tenant = _otlp.match(/^https:\/\/([a-z0-9-]+)\.live\.dynatrace\.com/i);
const DT_APPS_URL = _tenant ? `https://${_tenant[1]}.apps.dynatrace.com/ui/apps/dynatrace.genai.observability` : '';
function modelLabel(id) {
  const m = (id || '').match(/claude-([a-z]+)-(\d+)-(\d+)/i);
  return m ? `Claude ${m[1][0].toUpperCase() + m[1].slice(1)} ${m[2]}.${m[3]}` : 'Claude on Bedrock';
}
const IS_BEDROCK = process.env.MODEL_MODE === 'bedrock';
const MODEL_LABEL = IS_BEDROCK ? modelLabel(process.env.BEDROCK_MODEL_ID) : 'Mock model';
const LEAD_URL = process.env.LEAD_CAPTURE_URL || '';
const SEAT = process.env.SERVICE_NAMESPACE || process.env.LANE || 'local';
const REGION = process.env.AWS_REGION || 'local';
const AWS_ACCOUNT = process.env.AWS_ACCOUNT || 'local';
const DT_TENANT = _tenant ? _tenant[1] : 'tracing off';
// The laptop's lambda-web folder, so the KiroCrew prompt can name full paths.
// In AWS, deploy.sh passes REPO_DIR (there __dirname is the Lambda package).
const REPO_DIR = process.env.REPO_DIR || path.resolve(__dirname, '..');
const PLATFORM = process.env.DEPLOY_PLATFORM || 'local';
const RESTART_TOKEN = PLATFORM === 'local' && !process.env.AWS_LAMBDA_HTTP_ENDPOINT && process.connected
  ? process.env.WORKSHOP_RESTART_TOKEN || ''
  : '';
const FLOW_PATH = path.join(__dirname, 'flow.js');
const REFERENCE_FLOW = path.join(__dirname, '..', 'solution', 'flow.defect.js');
const flowRevision = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let activeFlow = RESTART_TOKEN
  ? { revision: flowRevision(FLOW_PATH), buildContext: require(FLOW_PATH).buildContext }
  : null;
const REFERENCE_REVISION = RESTART_TOKEN && fs.existsSync(REFERENCE_FLOW) ? flowRevision(REFERENCE_FLOW) : '';
const BOOT_ID = RESTART_TOKEN ? randomUUID() : '';
let restarting = false;

const scriptString = value => JSON.stringify(value).replace(/</g, '\\u003c');
const WORKSHOP = Buffer.from(
  WORKSHOP_RAW
    .split('{{DT_APPS_URL}}').join(DT_APPS_URL)
    .split('{{MODEL_LABEL}}').join(MODEL_LABEL)
    .split('{{MODEL_MODE}}').join(IS_BEDROCK ? 'bedrock' : 'mock')
    .split('{{MODEL_HOST}}').join(IS_BEDROCK ? 'Anthropic on Amazon Bedrock' : 'Local rehearsal')
    .split('{{LEAD_URL}}').join(LEAD_URL)
    .split('{{SEAT}}').join(SEAT)
    .split('{{REGION}}').join(REGION)
    .split('{{AWS_ACCOUNT}}').join(AWS_ACCOUNT)
    .split('{{DT_TENANT}}').join(DT_TENANT)
    .split('{{REPO_DIR}}').join(scriptString(REPO_DIR))
    .split('{{LOCAL_AWS_PROFILE}}').join(scriptString(PLATFORM === 'local' ? process.env.AWS_PROFILE || '' : ''))
    .split('{{RESTART_TOKEN}}').join(scriptString(RESTART_TOKEN))
    .split('{{PLATFORM}}').join(PLATFORM)
);
const MAX_BODY = 4096;

let host = '127.0.0.1'; // loopback by default; do not widen for local runs.
let port = Number(process.env.PORT || 8080);
if (process.env.AWS_LAMBDA_HTTP_ENDPOINT) {
  const [h, p] = process.env.AWS_LAMBDA_HTTP_ENDPOINT.split(':');
  host = h;
  port = Number(p);
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function send(res, status, body, type = 'application/json') {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, INDEX, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && (url.pathname === '/workshop' || url.pathname === '/workshop.html')) {
      return send(res, 200, WORKSHOP, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && BRAND_ASSETS.has(url.pathname)) {
      const type = url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
      return send(res, 200, BRAND_ASSETS.get(url.pathname), type);
    }
    if (req.method === 'GET' && url.pathname === '/architecture.svg') {
      return send(res, 200, ARCH_SVG, 'image/svg+xml');
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      const health = { status: 'ok', mode: process.env.MODEL_MODE || 'mock' };
      if (BOOT_ID) health.boot_id = BOOT_ID;
      return send(res, 200, health);
    }
    if (req.method === 'GET' && url.pathname === '/workshop/flow-status' && RESTART_TOKEN) {
      try {
        return send(res, 200, {
          saved_revision: flowRevision(FLOW_PATH),
          loaded_revision: activeFlow.revision,
          reference_revision: REFERENCE_REVISION,
        });
      } catch {
        return send(res, 503, { error: 'Cannot read app/flow.js.' });
      }
    }
    if (req.method === 'POST' && RESTART_TOKEN &&
        ['/workshop/reload', '/workshop/restart', '/workshop/reset'].includes(url.pathname)) {
      const localHosts = ['127.0.0.1', 'localhost'].map(name => `${name}:${server.address().port}`);
      const token = req.headers['x-workshop-restart'];
      if (!localHosts.includes(req.headers.host) ||
          req.headers.origin !== `http://${req.headers.host}` || !token) {
        return send(res, 403, { error: 'Use the controls in the local workshop tab.' });
      }
      if (token !== RESTART_TOKEN) {
        return send(res, 403, {
          code: 'WORKSHOP_SESSION_CHANGED',
          error: 'The app restarted. Reload this workshop tab and retry.',
        });
      }
      if (restarting) return send(res, 409, { error: 'A restart is already in progress.' });
      if (url.pathname === '/workshop/reload') {
        const previous = require.cache[FLOW_PATH];
        try {
          const revision = flowRevision(FLOW_PATH);
          if (revision !== activeFlow.revision) {
            delete require.cache[FLOW_PATH];
            const { buildContext } = require(FLOW_PATH);
            if (typeof buildContext !== 'function') throw new TypeError('Missing buildContext');
            if (flowRevision(FLOW_PATH) !== revision) {
              throw new Error('Flow changed while loading');
            }
            activeFlow = { revision, buildContext };
          }
          return send(res, 200, { loaded_revision: activeFlow.revision });
        } catch (error) {
          if (previous) require.cache[FLOW_PATH] = previous;
          else delete require.cache[FLOW_PATH];
          console.error('workshop reload failed', error);
          return send(res, 422, { error: 'The saved app/flow.js could not load. Check its syntax and buildContext export, then retry.' });
        }
      }
      if (url.pathname === '/workshop/reset') {
        const nextFlow = `${FLOW_PATH}.${randomUUID()}.tmp`;
        try {
          const reference = fs.readFileSync(REFERENCE_FLOW);
          if (createHash('sha256').update(reference).digest('hex') !== REFERENCE_REVISION) {
            return send(res, 409, { error: 'The reference file changed. Restart the workshop from Terminal and retry.' });
          }
          fs.writeFileSync(nextFlow, reference, { flag: 'wx', mode: fs.statSync(FLOW_PATH).mode & 0o777 });
          fs.renameSync(nextFlow, FLOW_PATH);
        } catch (error) {
          console.error('workshop reset failed', error);
          return send(res, 503, { error: 'Could not restore app/flow.js. Use the Terminal reset below.' });
        } finally {
          fs.rmSync(nextFlow, { force: true });
        }
        if (activeFlow.revision === REFERENCE_REVISION) {
          return send(res, 200, { boot_id: BOOT_ID, restarting: false });
        }
      } else {
        restarting = true;
        try {
          await promisify(execFile)(process.execPath, ['--check', FLOW_PATH], { timeout: 3000 });
        } catch {
          restarting = false;
          return send(res, 422, { error: 'Check the syntax of app/flow.js before restarting.' });
        }
      }
      restarting = true;
      res.once('finish', () => process.send('workshop:restart'));
      return send(res, 202, { boot_id: BOOT_ID, restarting: true });
    }
    if (req.method === 'POST' && url.pathname === '/chat') {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) {
        return send(res, 415, { error: 'content-type must be application/json' });
      }
      const raw = await readBody(req);
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return send(res, 400, { error: 'invalid JSON' });
      }
      const question = body && body.message ? body.message : null;
      if (question !== null && !(typeof question === 'string' && question.length >= 1 && question.length <= 1000)) {
        return send(res, 400, { error: 'message must be 1-1000 characters' });
      }
      const flow = activeFlow;
      const result = await answer(question, { flow: flow?.buildContext });
      if (flow) result.flow_revision = flow.revision;
      return send(res, 200, result);
    }
    return send(res, 404, { error: 'not found' });
  } catch (err) {
    if (err.status === 413) return send(res, 413, { error: 'request body too large' });
    console.error('request failed', err);
    return send(res, 502, { error: 'request failed', detail: err.name || 'Error' });
  }
});

if (RESTART_TOKEN) {
  process.on('message', (message) => {
    if (message === 'workshop:drain') server.close(() => process.disconnect());
  });
}

server.listen(port, host, () => {
  console.log(`Order Rescue Lite on http://${host}:${port} (mode=${process.env.MODEL_MODE || 'mock'})`);
});
