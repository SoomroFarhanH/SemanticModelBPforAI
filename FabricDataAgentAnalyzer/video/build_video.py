"""Build the narrated walkthrough video for FabricDataAgentAnalyzer.ipynb.

Pipeline: executed notebook (run_notebook.py) -> HTML viewer -> Playwright screen recording (Edge) ->
Windows offline TTS narration (System.Speech) -> ffmpeg (imageio-ffmpeg) -> MP4.
Run run_notebook.py first.
"""
import glob
import html
import json
import os
import re
import subprocess
import time
import wave

import markdown
import nbformat
from playwright.sync_api import sync_playwright
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import PythonLexer
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "_work")
AUDIO = os.path.join(WORK, "audio")
OUT_MP4 = os.path.join(HERE, "FabricDataAgentAnalyzer_Walkthrough.mp4")
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H = 1280, 720
os.makedirs(AUDIO, exist_ok=True)

nb = nbformat.read(os.path.join(WORK, "executed.ipynb"), 4)
REPORT_HTML = glob.glob(os.path.join(WORK, "report", "*", "*", "*_report.html"))[0]

# ---------------------------------------------------------------------------
# Scenes: (title, cells, code_mode, narration sentences)   code_mode: full | head | hide
# cells may also be a dict {"card": html} or {"report": True}
# ---------------------------------------------------------------------------
SCENES = [
    ("Introduction", {"card": """
        <div class=card><h1>🤖 Fabric Data Agent Analyzer</h1><h2>Version 3.0.0 · Notebook walkthrough</h2>
        <ul><li>Assesses a Fabric data agent <b>and every connected source</b></li>
        <li>Read-only by default · rule-based findings · release gates</li>
        <li>Demo: sample retail agent with a Lakehouse and an Eventhouse (no tenant data)</li></ul></div>"""}, "hide", [
        "Welcome. This is a walkthrough of the Fabric Data Agent Analyzer, version three.",
        "The notebook checks a Fabric data agent, and every source connected to it, without changing anything.",
        "In this video we run the real notebook, end to end, and read its scorecard.",
        "To keep tenant data out of the recording, we run it locally in manifest mode against a sample retail agent.",
    ]),
    ("What the analyzer does", [0], "hide", [
        "The core principle: AI is only as good as the data behind it.",
        "A data agent can only be as accurate as its sources, metadata, instructions, and examples.",
        "The analyzer assesses the agent's shared configuration, plus each connected source: Lakehouse, Warehouse, SQL database, Mirrored database, Eventhouse, semantic model, and the preview Graph, Ontology, and A I Search sources.",
        "Version three can read the agent three ways: live through the S D K, from a Git export, or from a manual manifest.",
        "Every finding has a stable rule I D and a status: pass, warn, fail, manual, not applicable, not evaluated, or unknown.",
        "Readiness and evaluation coverage are reported separately, and release gates always override the average.",
    ]),
    ("Prerequisites and setup", [1, 2], "full", [
        "For live analysis, run the notebook inside a Fabric notebook. Git export and manifest modes also work in plain Python.",
        "The first cell installs the packages, including the preview Fabric data agent S D K.",
        "Make sure the data agent and Copilot tenant settings are enabled, and that your identity can view the agent and read each source.",
        "The notebook is read-only by default. Live queries run only if you switch them on.",
    ]),
    ("Parameters", [4], "full", [
        "All configuration lives in a single parameters cell.",
        "Set the workspace, the data agent name, the stage, sandbox for the draft or production for the published version, and the collection mode.",
        "Here we use manifest mode, pointing at a sample manifest that describes a retail agent with a Lakehouse and an Eventhouse.",
        "The behavior switches below are all off: live query tests, performance tests, the few-shot evaluator, and the evaluation run. That keeps the analysis read-only.",
        "Thresholds, such as the coverage required for release, are configurable, and are published in the report.",
    ]),
    ("Framework and rule catalog", [5, 7], "hide", [
        "Next, the framework cells define the normalized finding record and the rule catalog.",
        "The catalog output shows how many rules apply to each family: S Q L, semantic model, agent, K Q L, and the rest. In total, one hundred seventy two rules.",
        "If a check cannot run, it is recorded as not evaluated or unknown. It is never silently counted as a pass.",
    ]),
    ("Preflight", [9], "hide", [
        "The preflight validates the environment: versions, packages, collection mode, and whether the Fabric S D K can be imported.",
        "We are running outside Fabric, so the live S D K is unavailable. The analyzer reports that openly instead of failing silently.",
        "The parameters validate, and it confirms read-only mode.",
    ]),
    ("Discovery and source inventory", [11, 13], "hide", [
        "Discovery loads the agent profile. Our sample agent has two sources and three hundred thirty characters of instructions.",
        "The normalized inventory maps each source to a family and a query language: the Lakehouse is S Q L, and the Eventhouse is K Q L.",
        "It also prints a known limitations watch list, such as the five source limit and preview caveats, each linked to the rules it affects.",
    ]),
    ("Scoping and common agent checks", [16, 17], "hide", [
        "Check zero is a scoping assessment. It is manual, because only you know who the agent is for and which questions it should answer.",
        "Then the common agent checks run: description, instructions, routing, object selection, and preview risk.",
        "Notice that D A zero zero nine fails, because the instructions never name which source is authoritative for overlapping topics.",
        "Each row shows its status, severity, and the evidence behind it.",
    ]),
    ("SQL sources: Lakehouse", [20], "hide", [
        "Now the S Q L source checks: schema selection, naming, descriptions, joins, time logic, and example queries.",
        "The sample Lakehouse selects a temporary table, tbl underscore tmp one. The analyzer warns that staging objects are selected, and that its column names are technical and generic.",
        "One example query uses SELECT star, so it is flagged. And S Q L zero one zero fails, because no default date or fiscal calendar is documented.",
    ]),
    ("Eventhouse K Q L checks", [22], "hide", [
        "The Eventhouse gets its own K Q L checks: event time types, early filters, string predicates, and bounded results.",
        "Here, a refund query uses contains, so K Q L zero zero eight recommends has or equals for better performance.",
        "Retention and data freshness are called out, because they affect real-time answers.",
    ]),
    ("Other adapters: semantic model, Graph, Ontology, AI Search", [29, 78, 80, 82, 84], "hide", [
        "The semantic model, Graph, Ontology, and A I Search adapters run next.",
        "None of those sources are connected to this agent, so their checks report not applicable.",
        "Unsupported or absent features never count against the agent.",
        "If you connect a semantic model, its twenty seven checks, such as star schema, descriptions, and Prep for A I, are scored too.",
    ]),
    ("Cross-source routing and example queries", [86, 88], "hide", [
        "Cross-source checks look at routing, metric and time consistency, and key mapping between sources.",
        "Several warn here: time zones, shared keys, and routing real-time questions to the Eventhouse are not documented.",
        "The example query validation summary shows two examples per source, five lint issues in total, and no read-only violations.",
    ]),
    ("Evaluation, security and ALM", [90, 94, 96], "hide", [
        "End to end evaluation comes next. No ground truth dataset was supplied, so D A zero two two fails, and D A zero two three stays manual.",
        "Then security and permissions: have you tested access as representative consumers? Those stay manual until you attest them.",
        "Finally, A L M and operations: Git integration, deployment pipelines, ownership, and review cadence.",
    ]),
    ("Scorecard and release gates", [100], "hide", [
        "Now the scorecard. Readiness is seventy four percent, but evaluation coverage is only sixty one percent, below the seventy percent threshold.",
        "The rating is not ready, because release gates failed. Averages never override gates.",
        "Passing gates: no blockers, known source types, and a valid source count. Failing: cross-source routing and coverage.",
        "The unknown gates need live smoke tests, permission tests, or ground truth questions.",
        "The critical failures are listed at the bottom, each with its rule I D and evidence.",
    ]),
    ("Exports", {"report": True}, "hide", [
        "Finally, the exports. One normalized findings set produces an HTML report, a Markdown report, a C S V, and a J SON evidence bundle.",
        "This is the real H T M L report from our run: release gates, scores by scope, the source inventory, and a prioritized remediation backlog.",
        "Share the report with stakeholders, track fixes from the C S V, and keep the J SON bundle as audit evidence.",
    ]),
    ("Run it on your own agent", {"card": """
        <div class=card><h1>▶ Run it on your own data agent</h1>
        <ol><li>Import <code>FabricDataAgentAnalyzer.ipynb</code> into a Fabric notebook</li>
        <li>Set <code>WORKSPACE_ID_OR_NAME</code>, <code>DATA_AGENT_NAME_OR_ID</code> and <code>DATA_AGENT_STAGE</code></li>
        <li>Keep <code>COLLECTION_MODE = "LIVE_SDK"</code> (or use <code>GIT_EXPORT</code> / <code>MANUAL_MANIFEST</code>)</li>
        <li>Run all cells and read the scorecard and release gates</li>
        <li>Fix the remediation backlog, then re-run to compare</li>
        <li>Opt in to live query tests and evaluation when you are ready</li></ol></div>"""}, "hide", [
        "To run it on your own agent, import the notebook into a Fabric notebook.",
        "Set the workspace, the data agent name, and the stage, and keep the collection mode on live S D K.",
        "Run all cells, then read the scorecard and release gates.",
        "Work through the remediation backlog, and re-run to see what changed.",
        "When you are ready, opt in to live query tests and the S D K evaluation. Thanks for watching.",
    ]),
]

CAPTION_FIXES = [
    ("D A zero zero nine", "DA-009"), ("D A zero two two", "DA-022"), ("D A zero two three", "DA-023"),
    ("S Q L zero one zero", "SQL-010"), ("K Q L zero zero eight", "KQL-008"),
    ("tbl underscore tmp one", "tbl_tmp1"), ("SELECT star", "SELECT *"),
    ("S D K", "SDK"), ("S Q L", "SQL"), ("K Q L", "KQL"), ("A I", "AI"), ("J SON", "JSON"),
    ("H T M L", "HTML"), ("C S V", "CSV"), ("rule I D", "rule ID"), ("A L M", "ALM"),
]


def caption(text):
    for a, b in CAPTION_FIXES:
        text = text.replace(a, b)
    return text


ANSI = re.compile(r"\x1b\[[0-9;]*m")
FMT = HtmlFormatter(noclasses=True, style="default")


def render_cell(i, code_mode):
    c = nb.cells[i]
    if c.cell_type == "markdown":
        md = markdown.markdown(c.source, extensions=["tables", "fenced_code"])
        return f"<div class='cell md'>{md}</div>"
    src = c.source
    lines = src.split("\n")
    if code_mode == "hide":
        code_html = ""
    else:
        shown = "\n".join(lines) if code_mode == "full" else "\n".join(lines[:14])
        more = "" if code_mode == "full" or len(lines) <= 14 else f"\n# … {len(lines) - 14} more lines"
        code_html = f"<div class='code'>{highlight(shown + more, PythonLexer(), FMT)}</div>"
    outs = []
    for o in c.get("outputs", []):
        if o.output_type == "stream":
            outs.append(f"<pre class='stream'>{html.escape(ANSI.sub('', o.text))}</pre>")
        elif o.output_type in ("display_data", "execute_result"):
            if "text/html" in o.data:
                outs.append(f"<div class='ohtml'>{o.data['text/html']}</div>")
            else:
                outs.append(f"<pre class='stream'>{html.escape(ANSI.sub('', o.data.get('text/plain', '')))}</pre>")
    n = c.get("execution_count")
    return (f"<div class='cell code-cell'><div class='lbl'>In [{n}]</div>{code_html}"
            f"<div class='outs'>{''.join(outs)}</div></div>")


def build_viewer():
    parts = []
    for si, (title, cells, mode, _) in enumerate(SCENES):
        if isinstance(cells, dict) and "card" in cells:
            body = cells["card"]
        elif isinstance(cells, dict):
            with open(REPORT_HTML, encoding="utf-8") as fh:
                body = f"<iframe srcdoc=\"{html.escape(fh.read(), quote=True)}\"></iframe>"
        else:
            body = "".join(render_cell(i, mode) for i in cells)
        parts.append(f"<section class='scene' id='s{si}' data-title='{html.escape(title)}'>{body}</section>")
    css = """
    html,body{margin:0;height:100%;font-family:'Segoe UI',Arial,sans-serif;background:#f3f3f3;color:#222}
    #top{height:40px;background:#0b3d6b;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 18px;font-size:15px}
    #top b{font-weight:600} #main{position:absolute;top:40px;bottom:110px;left:0;right:0;overflow:hidden;background:#fff}
    .scene{display:none;padding:14px 26px} .scene.active{display:block}
    .scene:has(iframe){padding:0;height:100%} iframe{width:100%;height:100%;border:0}
    #cap{position:absolute;bottom:0;left:0;right:0;height:110px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;
         padding:0 60px;font-size:23px;line-height:1.35;text-align:center;box-sizing:border-box}
    .cell{margin-bottom:14px;border:1px solid #ddd;border-radius:6px;padding:10px 14px;background:#fff;position:relative}
    .md{font-size:15px;line-height:1.45} .md h2{margin:4px 0 8px} .md table{border-collapse:collapse;font-size:13.5px}
    .md td,.md th{border:1px solid #ccc;padding:3px 8px} .md blockquote{margin:8px 0;padding:4px 12px;border-left:4px solid #0b6bcb;background:#eef5fd}
    .lbl{position:absolute;top:2px;right:8px;font:11px Consolas,monospace;color:#888}
    .code{border-left:3px solid #0b6bcb;background:#f7f7f7;padding:4px 10px;font-size:13px;margin-bottom:8px;overflow:hidden}
    .code pre{margin:0;font:13px/1.4 Consolas,monospace;white-space:pre-wrap}
    pre.stream{margin:0 0 6px;font:13px/1.35 Consolas,'Segoe UI Emoji',monospace;white-space:pre-wrap}
    .ohtml{font-size:13px;overflow:hidden} .ohtml table{border-collapse:collapse;font-size:12.5px;margin:4px 0}
    .ohtml td,.ohtml th{border:1px solid #ccc;padding:2px 7px;text-align:left}
    .card{max-width:900px;margin:70px auto;font-size:22px} .card h1{font-size:44px;color:#0b3d6b;margin:0 0 6px} .card h2{font-weight:400;color:#555;margin:0 0 30px}
    .card li{margin:10px 0} code{background:#eee;padding:1px 6px;border-radius:4px;font-size:.9em}
    """
    js = """
    function showScene(i,total){document.querySelectorAll('.scene').forEach(s=>s.classList.remove('active'));
      const s=document.getElementById('s'+i);s.classList.add('active');
      document.getElementById('step').textContent='Step '+(i+1)+' of '+total+' · '+s.dataset.title;
      document.getElementById('main').scrollTop=0;
      const f=s.querySelector('iframe'); if(f&&f.contentWindow) f.contentWindow.scrollTo(0,0);}
    function setCap(t){document.getElementById('cap').textContent=t;}
    function autoscroll(ms){
      const s=document.querySelector('.scene.active'), f=s.querySelector('iframe');
      let el, max;
      if(f){el=f.contentWindow; max=f.contentDocument.documentElement.scrollHeight-f.clientHeight;}
      else{el=document.getElementById('main'); max=el.scrollHeight-el.clientHeight;}
      const t0=performance.now();
      function step(now){const p=Math.min(1,(now-t0)/ms);
        const q=Math.max(0,Math.min(1,(p-0.06)/0.86)); const y=max*q;
        if(f) el.scrollTo(0,y); else el.scrollTop=y;
        if(p<1) requestAnimationFrame(step);}
      requestAnimationFrame(step);}
    """
    doc = (f"<!doctype html><html><head><meta charset='utf-8'><style>{css}</style></head><body>"
           f"<div id=top><b>FabricDataAgentAnalyzer.ipynb</b><span id=step></span></div>"
           f"<div id=main>{''.join(parts)}</div><div id=cap></div><script>{js}</script></body></html>")
    path = os.path.join(WORK, "viewer.html")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(doc)
    return path


def synthesize():
    jobs = []
    for si, (_, _, _, sents) in enumerate(SCENES):
        for k, s in enumerate(sents):
            jobs.append({"text": s, "path": os.path.join(AUDIO, f"s{si:02d}_{k:02d}.wav")})
    jpath = os.path.join(WORK, "tts_jobs.json")
    with open(jpath, "w", encoding="utf-8") as fh:
        json.dump(jobs, fh)
    ps = (
        "Add-Type -AssemblyName System.Speech;"
        f"$jobs = Get-Content -Raw -Encoding UTF8 '{jpath}' | ConvertFrom-Json;"
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Zira Desktop'); $s.Rate = 0;"
        "foreach($j in $jobs){ if(-not (Test-Path $j.path)){ $s.SetOutputToWaveFile($j.path); $s.Speak($j.text); $s.SetOutputToNull() } }"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)
    for j in jobs:
        with wave.open(j["path"]) as w:
            j["dur"] = w.getnframes() / w.getframerate()
    return jobs


def record(viewer, jobs):
    total = len(SCENES)
    starts = []
    vdir = os.path.join(WORK, "rec")
    os.makedirs(vdir, exist_ok=True)
    for f in glob.glob(os.path.join(vdir, "*.webm")):
        os.remove(f)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        ctx = browser.new_context(viewport={"width": W, "height": H}, record_video_dir=vdir,
                                  record_video_size={"width": W, "height": H})
        t0 = time.monotonic()
        page = ctx.new_page()
        page.goto("file:///" + viewer.replace("\\", "/"))
        page.wait_for_timeout(600)
        ji = 0
        for si, (_, _, _, sents) in enumerate(SCENES):
            page.evaluate(f"showScene({si},{total})")
            page.wait_for_timeout(500)
            scene_ms = sum(jobs[ji + k]["dur"] for k in range(len(sents))) * 1000 + 450 * len(sents)
            page.evaluate(f"autoscroll({scene_ms})")
            for k, sent in enumerate(sents):
                j = jobs[ji + k]
                page.evaluate("t=>setCap(t)", caption(sent))
                starts.append(time.monotonic() - t0)
                page.wait_for_timeout(int(j["dur"] * 1000 + 450))
            ji += len(sents)
        page.wait_for_timeout(800)
        ctx.close()
        browser.close()
    return glob.glob(os.path.join(vdir, "*.webm"))[0], starts


def mux(webm, jobs, starts):
    inputs, filters = [], []
    for n, (j, st) in enumerate(zip(jobs, starts)):
        inputs += ["-i", j["path"]]
        ms = int(st * 1000) + 120
        filters.append(f"[{n}:a]adelay={ms}|{ms}[a{n}]")
    mix = "".join(f"[a{n}]" for n in range(len(jobs))) + f"amix=inputs={len(jobs)}:normalize=0[aout]"
    script = os.path.join(WORK, "filter.txt")
    with open(script, "w") as fh:
        fh.write(";".join(filters + [mix]))
    audio = os.path.join(WORK, "narration.wav")
    subprocess.run([FFMPEG, "-y", *inputs, "-filter_complex_script", script, "-map", "[aout]", audio],
                   check=True, capture_output=True)
    subprocess.run([FFMPEG, "-y", "-i", webm, "-i", audio, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", "-preset", "slow",
                    "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", OUT_MP4],
                   check=True, capture_output=True)


if __name__ == "__main__":
    viewer = build_viewer()
    jobs = synthesize()
    print("narration seconds:", round(sum(j["dur"] for j in jobs), 1))
    webm, starts = record(viewer, jobs)
    mux(webm, jobs, starts)
    print("video:", OUT_MP4, round(os.path.getsize(OUT_MP4) / 1e6, 1), "MB")
