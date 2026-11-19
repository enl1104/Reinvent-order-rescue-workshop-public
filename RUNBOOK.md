# Order Rescue Lite — Demo Runbook

A self-contained, copy-paste runbook for running the "fix a production defect
with an AI agent, watch it in Dynatrace" demo on one or more laptops. Hand this
file to any AI assistant (ChatGPT, KiroCrew, …) and it can walk you through every
step — there are no internal links or hidden context.

> **Just want to test it fast?** See [QUICKSTART.md](QUICKSTART.md) — the whole
> loop in ~5 minutes.

## What the demo shows

A small Bedrock tool-use agent answers questions about synthetic order
`DEMO-1001`. It carries a planted **defect**: for every question it reads the
order backend **three times** when **one** read has all the facts. The trace shows
three sequential reads under one tool execution in Dynatrace. Claude first
requests the order tool, then uses its result to write the answer. The workshop
shows the model and tool durations, stop reasons, and Bedrock-reported token counts
when available. After the fix, the same tool uses one lookup.

## How any number of laptops share one (or several) AWS account

There are **no seat numbers**. Each laptop gets a unique, auto-generated **seat
name** (e.g. `nimble-yak-6fec`) the first time you run `setup.sh`. That seat —
the `LANE` — namespaces everything, so any number of laptops never collide, in
one account or several:

| Thing | Value |
|---|---|
| Lambda Web Function | `order-rescue-lite-<seat>` |
| Log group | `/aws/lambda/web/order-rescue-lite-<seat>` |
| Demo git branch | `demo/<seat>` |
| Dynatrace tenant | each laptop's own (set in its `.env`) |

Same or different AWS accounts both work — the scripts read the account/region
from your AWS CLI credentials. Add a laptop by running `setup.sh` on it; remove
one by tearing its seat down. Nothing else changes, and no file lists the seats.

## Laptop setup (one-time)

These are Macs (Apple Silicon). Install the tools, then KiroCrew.

**1. Command-line tools** (Homebrew):
```bash
brew install awscli node gh      # zip + curl ship with macOS
```

**2. Sign in to AWS** (either works; the scripts use whatever is active):
```bash
aws configure                    # static keys
# or
aws sso login                    # IAM Identity Center
aws sts get-caller-identity      # confirm: prints your account
```

**3. KiroCrew** — the local AI agent that edits the code and runs the deploy.
KiroCrew drives `kiro-cli`, so install KiroCrew, then log kiro-cli in:
```bash
curl -fsSL https://d28nxu9if70cmc.cloudfront.net/cli.sh | sh -s -- --channel nightly
kiro-cli login                   # one-time browser login
```
Ollama is optional (KiroCrew memory/knowledge only); see KiroCrew's own README
for details. Any other local AI coding agent that can edit files and run shell
commands works too.

Check: `aws sts get-caller-identity` returns your account; `node -v` ≥ 20.

> No account-level bootstrap: `aws lambda-web deploy` creates the function, its
> endpoint, a managed S3 bucket, and (first run) the shared execution role.

---

## Per laptop

### 1. Get the code and set up this seat

```bash
git clone https://github.com/enl1104/Reinvent-order-rescue-workshop-public.git
cd Reinvent-order-rescue-workshop-public
bash scripts/setup.sh
```

`setup.sh` **auto-generates a fun seat name** (press Enter to accept, or type your
own), then asks for this laptop's **Dynatrace tenant id** and an **ingest token**
(scope `openTelemetryTrace.ingest`), verifies the token, and writes a git-ignored
`.env`. The header is stored URL-encoded (`Api-Token%20dt0c01...`) — setup.sh
handles the encoding; don't hand-edit a raw space in.

### 2. Deploy (with the defect)

```bash
bash scripts/deploy.sh
```

Prints the public demo URL: `https://<something>.lambda-web.<region>.on.aws`.

### 3. Rehearse in Dynatrace

Open AI Observability in the seat's tenant. In **Explorer → Model Providers**,
find Amazon Bedrock and the configured Claude model. Scope to the workshop
service and a recent timeframe. Check that the actual model spans open in
Distributed Tracing. Bring a rehearsed baseline and verification trace for a
facilitator-led session.

New seats use a **simulated 1.5 s delay per order lookup**. For an existing seat,
set `ORDER_DELAY_MS=1500` in its local `.env` and restart or redeploy before
capturing the baseline. Keep the same delay for both runs. After warming up,
rehearse at least five requests per version. Aim for a median of 6–8 s end to
end before the fix and at least 2 s less after. Keep the actual traces and report
the measured results.

## Running the demo

1. Open `/workshop` and select **Ask the agent**. The reply and baseline
   waterfall open in Step 2.
2. Open the baseline trace in Dynatrace. Expand `get_order_status` and
   confirm its three `orders.lookup` spans. Return to the workshop and
   confirm the count to continue to Kiro Crew.
3. Use the prompt shown on the page to ask Kiro Crew why the tool is slow
   and how to fix it. Review the edit to `app/flow.js`. On a supervised
   local seat, the workshop detects the saved edit, loads it, and opens
   Step 4. For a deployed seat, click **Continue to Ask again** and use
   the deploy command shown on Step 4.
4. Click **Ask again** to rerun the baseline question. The workshop
   opens Step 5 after it sees one backend read and the same four order facts.
5. Open the verification trace in Dynatrace and confirm its single order
   lookup. Return to the workshop and finish. If a trace is missing, use
   **Trace missing in Dynatrace?** on the current step to retry.

Keep the same browser tab throughout. Progress and comparison data survive
a reload in that tab.

### Reset between visitors (real code change)

For a supervised local seat, select **Reset demo → Restore three-read baseline**.
The workshop restores the exercise in `app/flow.js`, reloads the app as needed,
and clears the current browser tab's comparison. Start a fresh Kiro Crew chat,
then click **Ask the agent** to capture the next visitor's baseline.

For a deployed AWS seat, or if the reset button is unavailable, use the
Terminal reset shown in the workshop. You can also double-click
`reset-seat.command` in Finder or run:

```bash
bash scripts/reset.sh               # local app + the AWS seat, if one is deployed
bash scripts/reset.sh --local-only  # skip AWS even if a seat is deployed
```

It restores the original defect into `app/flow.js`, leaves a `demo/<seat>` branch
if the visitor's fix made one (the branch is kept), and checks the tests see the
defect. If this seat is deployed it redeploys it, and it never creates one, so
the AWS step is optional. Then it restarts the local app at `http://127.0.0.1:8080`,
asks the agent once on each URL for real (Claude on Bedrock), requires
**backend reads = 3**, and opens a fresh `/workshop` page at Step 1. It stops with
an error instead if any check fails. Needs AWS credentials active on the laptop
(Bedrock uses them either way).

Then close the old workshop tabs and start a **new KiroCrew chat**, because the
previous chat already knows the fix.

To (re)start just the local app — after a fix, or after a reboot:
`bash scripts/start-local.sh`.

---

## Teardown / cleanup

The endpoints are public and spend Bedrock per click — tear them down when done.
Because seat names are random, `teardown.sh` **discovers** what to delete, so you
never need a list of seats:

```bash
bash scripts/teardown.sh                  # this laptop's seat (from .env)
bash scripts/teardown.sh nimble-yak-6fec  # one named seat
bash scripts/teardown.sh --all            # EVERY order-rescue-lite seat in the account
bash scripts/teardown.sh --all --role     # ...and remove the shared execution role too
#   add --yes to skip the confirmation prompt
```

Each delete removes the Web Function with all its revisions and endpoints. The
CLI's managed deployment bucket is left in place (shared, harmless). Use `--role`
only once the whole fleet is gone — every seat shares that one role.

**Facilitator, end of event** — from any one laptop with credentials for the
account: `bash scripts/teardown.sh --all --role --yes`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `no AWS credentials` | `aws configure` or `aws sso login`, then retry |
| `LANE is not set` | run `bash scripts/setup.sh`, or add `LANE=...` to `.env` |
| Dynatrace token rejected (HTTP 401/403) | token lacks `openTelemetryTrace.ingest`, or wrong tenant id |
| No spans in Dynatrace | tracing only turns on when `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set; re-run `setup.sh` with a tenant |
| Page works, reads still 3 after "fix" | the deploy didn't pick up the edit — confirm `app/flow.js` changed and `deploy.sh` finished with a new URL/version |
| `'node' / 'zip' not found` | install the missing prerequisite (see above) |

## Security note

The endpoint is intentionally **public and anonymous** (`AuthType:
ApplicationManaged`) so a browser button can call it without SigV4. It is bounded
(DEMO-1001 only, ≤96 output tokens per model call, ≤4 model + 4 tool calls, 4 KB request body,
endpoint rate limit 100, ≤2 environments) and meant for a short, watched demo.
**Tear it down (or set the endpoint `RateLimit` to 0) when finished.** For a
longer-lived deployment, switch to `IamAuth` + CloudFront, or Midway. Never commit
a `.env` or a Dynatrace token.
