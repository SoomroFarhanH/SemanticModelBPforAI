"""Execute FabricDataAgentAnalyzer.ipynb locally in MANUAL_MANIFEST mode against the bundled sample agent.

Produces _work/executed.ipynb (with real outputs) and _work/report/ (HTML/MD/CSV/JSON exports).
"""
import json
import os
import sys
import nbformat
from nbclient import NotebookClient

HERE = os.path.dirname(os.path.abspath(__file__))
NB = os.path.join(HERE, "..", "FabricDataAgentAnalyzer.ipynb")
WORK = os.path.join(HERE, "_work")
REPORT = os.path.join(WORK, "report")
MANIFEST = os.path.join(HERE, "sample_agent_manifest.json")
os.makedirs(REPORT, exist_ok=True)

nb = nbformat.read(NB, as_version=4)

for cell in nb.cells:
    src = cell.source
    if cell.cell_type != "code":
        continue
    if src.lstrip().startswith("# Install required packages"):
        cell.source = "# (video run) packages were pre-installed in the local environment\nprint('Packages ready: semantic-link-labs, fabric-data-agent-sdk, httpx, pyyaml')"
    elif "PARAMETERS" in src and "WORKSPACE_ID_OR_NAME" in src:
        src = src.replace('DATA_AGENT_NAME_OR_ID = ""', 'DATA_AGENT_NAME_OR_ID = "Contoso Retail Sales Agent (demo)"', 1)
        src = src.replace('COLLECTION_MODE       = "LIVE_SDK"', 'COLLECTION_MODE       = "MANUAL_MANIFEST"', 1)
        src = src.replace('MANUAL_MANIFEST_PATH  = ""', f'MANUAL_MANIFEST_PATH  = {json.dumps(MANIFEST)}', 1)
        src = src.replace('OUTPUT_ROOT            = "/lakehouse/default/Files/DataAgentReadiness"', f'OUTPUT_ROOT            = {json.dumps(REPORT)}', 1)
        cell.source = src

client = NotebookClient(nb, timeout=600, kernel_name="python3", allow_errors=True,
                        resources={"metadata": {"path": HERE}})
client.execute()
nbformat.write(nb, os.path.join(WORK, "executed.ipynb"))

errors = [(i, o.get("ename"), o.get("evalue")) for i, c in enumerate(nb.cells) if c.cell_type == "code"
          for o in c.get("outputs", []) if o.get("output_type") == "error"]
print("cells executed:", sum(c.cell_type == "code" for c in nb.cells), "errors:", len(errors))
for e in errors:
    print(e)
sys.exit(0)
