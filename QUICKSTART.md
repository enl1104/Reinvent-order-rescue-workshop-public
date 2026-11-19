# Quick test — Order Rescue Lite (Lambda Web Functions track)

Prove the whole loop in ~5 minutes. Everything lives in this `lambda-web/`
folder — it's self-contained. For the full facilitator + demo guide, see
[RUNBOOK.md](RUNBOOK.md).

## 1. Get the branch

```bash
git fetch && git checkout order-rescue-booth-v2
cd lambda-web
```

## 2. Local smoke — no AWS, no cost (proves the defect instantly)

```bash
cd app && npm install && MODEL_MODE=mock npm start
```

Open http://127.0.0.1:8080 and click **Ask the agent** → **backend reads = 3 (red)**.
That red 3 is the planted defect. Ctrl-C when done.

## 3. Real deploy — into your AWS account, wired to your Dynatrace tenant

```bash
cd ..                      # back to lambda-web/
aws sso login              # or: aws configure
bash scripts/setup.sh      # auto-generates a seat name; paste your Dynatrace tenant id + ingest token
bash scripts/deploy.sh     # prints the public demo URL
```

Open the URL → click **Ask the agent** → still **reads = 3**. Then in Dynatrace,
global-search **AI Observability**, scope to `OrderRescueAgent`, recent timeframe:
one run makes **three `orders.lookup` reads** (the waste).

> The Dynatrace ingest token needs scope `openTelemetryTrace.ingest`. `setup.sh`
> verifies the token before writing `.env`.

## 4. See the fix (3 → 1)

Open `<URL>/workshop` and inspect the baseline trace. Follow the Claude calls
around the order tool, then send **Copy Kiro fix prompt** from Step 3.
On a supervised local seat, the workshop loads the saved edit and opens Step 4.
Select **Ask again** to verify. For an AWS seat, use the deploy
command on Step 4 and click **Ask the agent**.

For a manual rehearsal, you can apply the validated exercise answer:

```bash
cp solution/flow.js app/flow.js
bash scripts/deploy.sh
```

In the same browser tab, ask again and compare the measured request and tool
durations. **Open verification trace** takes you to the matching request in
Distributed Tracing. Expand the tool span to confirm it made one lookup.

## 5. Clean up

```bash
bash scripts/teardown.sh                 # your seat
# end of event, from any one laptop with account creds:
bash scripts/teardown.sh --all --role --yes
```

Seat names are random, so teardown **discovers** them — you never need a list.

---

**Where the pieces are:** planted defect = `app/flow.js`; validated fix =
`solution/flow.js`; per-laptop config = `.env` (written by `setup.sh`, gitignored).
Node is used because AWS Lambda Web Functions run Node.js only — that's what gives
a public, browser-clickable endpoint with no SigV4.
