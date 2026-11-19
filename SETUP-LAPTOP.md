# Laptop Setup — Order Rescue Workshop

One-time setup per laptop/station. ~15 minutes. These are Macs (Apple Silicon).
When this is done, the laptop can deploy a seat and run the workshop at `/workshop`.

For the demo flow itself, see [RUNBOOK.md](RUNBOOK.md); to test fast, [QUICKSTART.md](QUICKSTART.md).

---

## 1. Install the command-line tools

```bash
brew install awscli node gh jq      # git, curl, zip ship with macOS / Xcode CLT
```

Verify:
```bash
aws --version      # aws-cli/2.x
node -v            # v20 or newer
gh --version
```

## 2. Sign in to AWS

Use whichever your account supports — the scripts read the active credentials.

```bash
aws configure          # static access keys
#   or
aws sso login          # IAM Identity Center
```

Test (must print your account id):
```bash
aws sts get-caller-identity
```

## 3. Install KiroCrew + log in

KiroCrew is the local AI coding agent that makes the fix in the workshop. It drives
`kiro-cli`, so install KiroCrew, then log kiro-cli in:

```bash
curl -fsSL https://d28nxu9if70cmc.cloudfront.net/cli.sh | sh -s -- --channel nightly
kiro-cli login        # one-time browser login
```

Verify:
```bash
kirocrew doctor       # reports kiro-cli found + logged in
```

(Ollama is optional — only for KiroCrew memory/knowledge. See KiroCrew's own README.)

## 4. Install the Dynatrace app inside KiroCrew

This lets KiroCrew see your observability data (AI Observability, traces, DQL) while
it works on the fix.

1. Open **KiroCrew** → **Discover** (or **Library**) in the left sidebar.
2. Search **Dynatrace** → **Install**.
3. Open the **Dynatrace** app (now in the sidebar) → **connect to your tenant**:
   - **Environment URL**: `https://TENANT.apps.dynatrace.com`
   - **API token**: a Dynatrace token (see token scopes in step 5).
4. Confirm it shows your environment (the sidebar Dynatrace entry goes green/connected).

## 5. Install dtctl + connect to your tenant

`dtctl` is the kubectl-style Dynatrace CLI — handy for querying the trace from the
terminal and for the agent to run DQL.

Install:
```bash
ARCH=$(uname -m | sed 's/x86_64/amd64/; s/arm64/arm64/')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
TAG=$(curl -s -I -L https://github.com/dynatrace-oss/dtctl/releases/latest | tr -d '\r' | awk -F/ '/^location: /{print $NF}' | tail -n1)
TARBALL="dtctl_${TAG#v}_${OS}_${ARCH}.tar.gz"
mkdir -p /tmp/dtctl && cd /tmp/dtctl
curl -L "https://github.com/dynatrace-oss/dtctl/releases/download/${TAG}/${TARBALL}" -o "$TARBALL"
tar -xzf "$TARBALL" && sudo mv dtctl /usr/local/bin/
dtctl version
```
(No sudo? Put the binary in `~/bin/` and add it to your PATH.)

Connect (replace with your tenant + token):
```bash
export DYNATRACE_BASE_URL="https://TENANT.apps.dynatrace.com"
export DYNATRACE_API_TOKEN="dt0c01.XXXX"
dtctl config set-credentials "workshop" --token "$DYNATRACE_API_TOKEN"
dtctl config set-context "workshop" --environment "$DYNATRACE_BASE_URL" --token-ref "workshop"
dtctl config use-context "workshop"
dtctl auth whoami --plain      # should print your identity
```

> **Token scopes.** The workshop *ingest* token needs `openTelemetryTrace.ingest`.
> For dtctl / the KiroCrew Dynatrace app to *read* data, add read scopes
> (storage/query, settings read). See
> https://github.com/dynatrace-oss/dtctl/blob/main/docs/TOKEN_SCOPES.md

## 6. Get the workshop and deploy your seat

```bash
git clone https://github.com/enl1104/Reinvent-order-rescue-workshop-public.git
cd Reinvent-order-rescue-workshop-public
bash scripts/setup.sh      # auto-generates a seat name; paste your Dynatrace tenant id + ingest token
bash scripts/deploy.sh     # builds + deploys; prints your public URL
```

---

## 7. Test it

1. Open the printed URL + `/workshop`, press **Start**, click **Ask the agent** →
   you should see the answer and **backend reads = 3**.
2. Confirm the trace reached Dynatrace, either in the UI (**AI Observability** →
   scope to `OrderRescueAgent`) or from the terminal with dtctl:
   ```bash
   dtctl query 'fetch spans, from:now()-15m | filter service.name=="order-rescue-agent" | summarize count(), by:{span.name}' -o table --plain
   ```
   You should see `orders.lookup` with ~3× the request count.
3. **Reset between visitors** — put the seat back to the broken 3-read state. This
   is a real redeploy of the defect code:
   ```bash
   bash scripts/reset.sh
   ```
   Or, at a booth, **double-click `reset-seat.command`** in Finder — same thing, one click.
4. When finished, tear the seat down:
   ```bash
   bash scripts/teardown.sh            # this laptop's seat
   # end of event, any one laptop: bash scripts/teardown.sh --all --role --yes
   ```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `no AWS credentials` / `ExpiredToken` | `aws sso login` (or `aws configure`), then retry |
| `aws`/`node`/`gh` not found | `brew install awscli node gh` |
| `node -v` below 20 | `brew upgrade node` |
| `kiro-cli` not logged in (`kirocrew doctor`) | `kiro-cli login` |
| KiroCrew Dynatrace app won't connect | wrong environment URL or token lacks read scopes (step 5) |
| Dynatrace ingest token rejected (HTTP 401/403) | token missing `openTelemetryTrace.ingest`, or wrong tenant id |
| `dtctl: command not found` | binary not on PATH — check `/usr/local/bin/dtctl` or `~/bin` |
| `dtctl` 401/403 | `dtctl config set-credentials "workshop" --token "$DYNATRACE_API_TOKEN"` again; check scopes |
| No spans in Dynatrace | tracing only turns on when `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set — re-run `scripts/setup.sh` with your tenant |
| Deploy says no artifact/seat | `aws lambda-web` needs AWS CLI v2.37+; `brew upgrade awscli` |
