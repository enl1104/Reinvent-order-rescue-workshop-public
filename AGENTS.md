# AGENTS.md — Order Rescue Lite (`lambda-web/`)

Instructions for an AI coding agent (KiroCrew, Kiro, Claude Code, Codex, Cursor, …)
walking a person through this demo. Everything needed is in this folder. Human-facing
docs: [README.md](README.md), [QUICKSTART.md](QUICKSTART.md), [RUNBOOK.md](RUNBOOK.md),
[SETUP-LAPTOP.md](SETUP-LAPTOP.md).

## What this is

A small order-support agent: Claude on Amazon Bedrock answers a question about synthetic
order `DEMO-1001` by calling one tool. A planted defect in `app/flow.js` makes that tool
read the order backend **3 times** when **1** read has all the facts. OpenTelemetry spans
go to the person's Dynatrace tenant, where AI Observability shows the waste. The person
fixes `app/flow.js` with an AI agent and watches it drop to 1 read.

The same Node app runs two ways. Both call **real Claude on Bedrock**:

| | Local (default) | AWS seat (optional) |
|---|---|---|
| URL | `http://127.0.0.1:8080/workshop` | `https://<id>.lambda-web.<region>.on.aws/workshop` |
| Reachable from | this laptop only (loopback) | anyone with the URL (public, anonymous) |
| Start / ship a change | `bash scripts/start-local.sh` | `bash scripts/deploy.sh` |
| AWS resources created | none | one Lambda Web Function per seat |

## Rules for the agent

- **Never read, print, or ask for secrets.** `.env` holds a Dynatrace token. Don't `cat`
  it, echo it, or paste it into chat. The person types the token into
  `scripts/setup.sh` in **their own terminal**, not into the AI chat.
- **Local runs stay on `127.0.0.1`.** Never widen the bind or publish the port.
- **Ask before deploying to AWS.** The deployed endpoint is public and anonymous: every
  click spends Bedrock in the person's account. It's bounded (DEMO-1001 only, ≤300
  output tokens, ≤4 model and 4 tool calls, rate limit 100) and meant for a short,
  watched demo. Say so, get a yes, and remind them to tear it down afterwards.
- **Never delete or tear down anything without an explicit request.** That includes
  `scripts/teardown.sh`, branches, and AWS resources.
- **Show the commit message and get approval before committing.** Don't push unless
  asked.
- **During the exercise, edit only `app/flow.js`** (`buildContext`). Keep all four fields,
  the tracing, and `ORDER_DELAY_MS`. Don't touch `agent.js`, `telemetry.js`,
  `orders.js`, `service.js`, `server.js`, or the tests. Don't hand out `solution/` as
  the answer unless the person asks.
- **Never fake evidence.** Report only reads, timings, and traces you actually observed.
  `MODEL_MODE=mock` is a labeled rehearsal stand-in, not Claude. Say which one ran.

## 1. Check prerequisites

```bash
node -v                       # 22 or newer
aws --version                 # AWS CLI v2.37+ (needed for `aws lambda-web`)
aws sts get-caller-identity   # must print an account; Bedrock uses these credentials
```

If credentials are missing or expired, the person signs in (`aws sso login`,
`aws configure`, or their organization's credential tool). The AWS identity needs
`bedrock:InvokeModel` on the Claude model in `.env`. The default is
`us.anthropic.claude-haiku-4-5-20251001-v1:0` in `us-east-1`. **Ask which region to
use** before creating anything. Don't assume it.

Optional: KiroCrew (see [SETUP-LAPTOP.md](SETUP-LAPTOP.md)) and `dtctl` for querying
Dynatrace from the terminal.

## 2. Configure this laptop (the person runs this)

```bash
cd lambda-web
bash scripts/setup.sh
```

It generates a seat name (the `LANE`) and asks for the Dynatrace tenant id and an
ingest token with scope `openTelemetryTrace.ingest`. It checks the token, then writes the
git-ignored `.env`. Without a tenant the app still runs, with tracing off.

## 3a. Run locally (real Bedrock, no AWS deploy)

```bash
bash scripts/start-local.sh   # restarts the app on 127.0.0.1:8080, waits for /health
```

Open `http://127.0.0.1:8080/workshop`, press **Start**, then **Ask the agent**. The
log is at `/tmp/order-rescue-local.log`. Rehearsal without AWS credentials:
`cd app && npm install && MODEL_MODE=mock npm start`. This is mock mode, so label it
as such.

## 3b. Deploy an AWS seat (optional — confirm first, see Rules)

```bash
bash scripts/deploy.sh        # prints the public URL; re-run to ship a code change
```

## 4. Verify (do this, don't assume)

```bash
curl -s -X POST http://127.0.0.1:8080/chat -H 'content-type: application/json' -d '{}'
# expect "mode":"bedrock" and "backend_reads":3 before the fix (1 after), plus a trace_id
```

In Dynatrace: global-search **AI Observability**, scope it to `OrderRescueAgent`, and
set the timeframe to the last 30 minutes. One run shows `invoke_agent` → 2 `chat` →
`execute_tool get_order_status` → **3 `orders.lookup`**. Exact check, using a Notebook
or `dtctl query`:

```
fetch spans, from:now()-30m | filter service.name == "order-rescue-agent" | summarize count(), by:{span.name}
```

## 5. The exercise

The `/workshop` page guides the learner through a baseline, a Claude span review,
a fix, a rerun, and verification. The one-turn prompt authorizes the file edit.
If the learner selects the discussion path, propose a diff and wait for their
apply prompt. Use the file reader and editor for `app/flow.js`. The supervised
local workshop loads the saved file and opens Step 4 for **Ask again**. AWS
seats use the Step 4 deploy command. Step 3 offers a reference fix if Kiro Crew
is unavailable.
The page compares measured
tool time, request time, backend reads, and order facts.

After the fix, two tests ("defect reads the backend three times" and "service.answer
surfaces the defect read count") **fail by design**: they assert the starting defect.
Don't "fix" the tests.

## 6. Reset for the next person

Use any one of these:
- **Reset demo → Restore three-read baseline** in a supervised local workshop.
  Then start a fresh Kiro Crew chat for the next visitor;
- double-click `reset-seat.command` in Finder;
- `bash scripts/reset.sh` (add `--local-only` to skip AWS).

It restores the defect, leaves a `demo/<seat>` branch (kept), checks the tests, and
redeploys the AWS seat **only if one exists**. Then it restarts the local app, asks once
on each URL with real Bedrock, and requires 3 reads. Start a **new** agent chat for the
next person, because the old one knows the fix.

## 7. Clean up (only when asked)

```bash
bash scripts/teardown.sh                    # this laptop's seat
bash scripts/teardown.sh --all --role --yes # every seat + the shared role (end of event)
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `ExpiredToken` / `no AWS credentials` | sign in again, then retry (Bedrock needs it locally too) |
| `AccessDeniedException` from Bedrock | model not enabled in this account/region, or the role lacks `bedrock:InvokeModel` |
| No spans in Dynatrace, app works | OTel export errors are **silent**. Check `.env` has `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, then query spans (step 4). In the UI, check the tenant, the app (AI Observability, not a dashboard), and the timeframe |
| Token rejected (401/403) | token lacks `openTelemetryTrace.ingest`, or wrong tenant; re-run `setup.sh`. The header must be URL-encoded (`Api-Token%20…`) |
| `port 8080 is used by another program` | `start-local.sh` only stops this app; free the port or set `PORT=` |
| Reads still 3 after the fix | the edit wasn't saved, or the app wasn't restarted/redeployed |
| KiroCrew / `kiro-cli` fails with `MONTHLY_REQUEST_COUNT` | the Kiro account hit its monthly limit; `kiro-cli logout` then `kiro-cli login` with another account |
| `aws lambda-web` not found | upgrade AWS CLI to v2.37+ |

## File map

```
app/flow.js            the defect - the one file edited in the exercise
app/orders.js          synthetic backend; one lookup() = one read = one span
app/agent.js           bounded Bedrock Converse tool-use loop (+ mock model)
app/telemetry.js       OpenTelemetry -> OTLP (on only when the endpoint is set)
app/server.js          node:http server; loopback locally, Web Functions in AWS
app/public/workshop.html   the guided workshop page (incl. Reset demo)
solution/flow.js       validated one-read fix
solution/flow.defect.js    the starting defect that reset.sh restores
scripts/setup.sh       write .env (seat + Dynatrace), verify token - run by the person
scripts/start-local.sh (re)start the local app on 127.0.0.1:8080, real Bedrock
scripts/deploy.sh      build + deploy this seat (public URL)
scripts/reset.sh       reset this laptop for the next person
scripts/teardown.sh    delete a seat or the whole fleet
tests/                 node --test; proves 3 reads (defect) vs 1 (solution)
```
