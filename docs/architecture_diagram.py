"""Regenerate the self-contained workshop SVG with the existing brand assets."""
from base64 import b64encode
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1] / "app" / "public"


def logo(name, x, y, width, height):
    subtype = "svg+xml" if name.endswith(".svg") else "png"
    data = b64encode((PUBLIC / "brands" / name).read_bytes()).decode("ascii")
    return (f'<image x="{x}" y="{y}" width="{width}" height="{height}" '
            f'href="data:image/{subtype};base64,{data}"/>')


svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 700" role="img"
  aria-labelledby="title description">
  <title id="title">Order Rescue workshop architecture</title>
  <desc id="description">The browser asks Order Rescue. The app calls Claude Haiku 4.5 on Amazon Bedrock and
    runs the requested get_order_status tool against a synthetic order. It exports spans to Dynatrace.
    The learner shares the trace with Kiro Crew, approves an edit, and restarts and reruns the app.</desc>
  <defs>
    <marker id="call" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0 0 8 4 0 8Z" fill="#2576af"/>
    </marker>
    <marker id="trace" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0 0 8 4 0 8Z" fill="#1b805c"/>
    </marker>
    <marker id="edit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0 0 8 4 0 8Z" fill="#6e4eba"/>
    </marker>
    <style>
      text {{font-family:Inter,Arial,sans-serif;fill:#172535}}
      .title {{font-size:31px;font-weight:700}}
      .heading {{font-size:20px;font-weight:700}}
      .body {{font-size:15px;fill:#394b5b}}
      .small {{font-size:13px;fill:#3f5365}}
      .label {{font-size:14px;font-weight:600;fill:#215a84}}
      .trace-label {{fill:#146747}}
      .edit-label {{fill:#6244a8}}
      .card {{fill:#fff;stroke:#c3d1dc;stroke-width:1.5}}
      .call {{fill:none;stroke:#2576af;stroke-width:2;marker-end:url(#call)}}
      .trace {{fill:none;stroke:#1b805c;stroke-width:2;stroke-dasharray:7 5;marker-end:url(#trace)}}
      .edit {{fill:none;stroke:#6e4eba;stroke-width:2;marker-end:url(#edit)}}
    </style>
  </defs>
  <rect width="1180" height="700" rx="18" fill="#f2f6f8"/>
  <text x="40" y="55" class="title">Order Rescue architecture</text>

  <rect class="card" x="40" y="112" width="220" height="145" rx="12"/>
  <rect x="60" y="133" width="30" height="22" rx="3" fill="none" stroke="#2576af" stroke-width="2"/>
  <path d="M60 139H90" stroke="#2576af" stroke-width="2"/>
  <text x="60" y="186" class="heading">Workshop browser</text>
  <text x="60" y="214" class="body">Ask about DEMO-1001</text>
  <text x="60" y="235" class="body">and read the answer.</text>

  <rect class="card" x="366" y="112" width="297" height="174" rx="12"/>
  <text x="388" y="149" class="heading">Order Rescue app</text>
  <text x="388" y="177" class="body">Node.js agent and tool execution</text>
  <text x="388" y="208" class="body">Local laptop or AWS Lambda</text>
  <text x="388" y="230" class="body">Web Function</text>
  <text x="388" y="261" class="small">POST /chat</text>

  <rect class="card" x="813" y="112" width="327" height="160" rx="12"/>
  <rect x="834" y="134" width="80" height="34" rx="5" fill="#172535"/>
  {logo("powered-by-aws.png", 841, 139, 65, 23)}
  <text x="925" y="157" class="heading">Amazon Bedrock</text>
  {logo("claude.svg", 835, 182, 28, 28)}
  <text x="873" y="202" class="heading">Claude Haiku 4.5</text>
  {logo("anthropic.svg", 873, 215, 106, 18)}
  <text x="835" y="251" class="small">Converse API · tool request and final answer</text>

  <path class="call" d="M260 173H366"/>
  <text x="313" y="163" text-anchor="middle" class="label">Question</text>
  <path class="call" d="M366 220H260"/>
  <text x="313" y="209" text-anchor="middle" class="label">Answer</text>
  <path class="call" d="M663 173H813"/>
  <text x="738" y="162" text-anchor="middle" class="label">Two Converse calls</text>
  <path class="call" d="M813 221H663"/>
  <text x="738" y="209" text-anchor="middle" class="label">Tool request</text>
  <text x="738" y="241" text-anchor="middle" class="small">then final answer</text>

  <rect class="card" x="366" y="358" width="297" height="119" rx="12"/>
  <text x="388" y="392" class="heading">Synthetic order lookup</text>
  <text x="388" y="420" class="body">get_order_status runs in the app.</text>
  <text x="388" y="449" class="body" font-weight="700">3 lookups before · 1 after</text>
  <path class="call" d="M514 286V358"/>
  <text x="530" y="327" class="label">App runs the tool</text>

  <rect class="card" x="813" y="467" width="327" height="123" rx="12"/>
  {logo("dynatrace-mark.svg", 835, 487, 32, 32)}
  <text x="879" y="510" class="heading">Dynatrace</text>
  <text x="835" y="543" class="body">AI Observability and Distributed Tracing</text>
  <text x="835" y="567" class="small">Inspect the baseline and verification traces.</text>
  <path class="trace" d="M663 270H752V508H813"/>
  <text x="769" y="352" class="label trace-label">OpenTelemetry spans</text>
  <text x="769" y="374" class="small">Model calls, tool and lookups</text>

  <rect class="card" x="40" y="467" width="220" height="123" rx="12"/>
  {logo("kiro-crew.svg", 60, 483, 34, 34)}
  <text x="105" y="508" class="heading">Kiro Crew</text>
  <text x="60" y="542" class="body">Diagnose and propose a diff.</text>
  <text x="60" y="566" class="small">Learner reviews and approves.</text>
  <path class="edit" d="M260 500H303V272H366"/>
  <text x="45" y="343" class="label edit-label">Approved edit to app/flow.js</text>
  <text x="45" y="367" class="small">Restart and rerun the same question.</text>
  <path class="trace" d="M813 574H260"/>
  <text x="537" y="563" text-anchor="middle" class="label trace-label">Learner shares trace evidence with Kiro Crew</text>

  <path d="M40 639H1140" stroke="#c3d1dc"/>
  <path class="call" d="M42 669H75"/>
  <text x="86" y="674" class="small">Request and tool activity</text>
  <path class="trace" d="M306 669H339"/>
  <text x="350" y="674" class="small">Telemetry and trace evidence</text>
  <path class="edit" d="M575 669H608"/>
  <text x="619" y="674" class="small">Learner-approved code change</text>
</svg>
'''
(PUBLIC / "architecture.svg").write_text(svg, encoding="utf-8")
