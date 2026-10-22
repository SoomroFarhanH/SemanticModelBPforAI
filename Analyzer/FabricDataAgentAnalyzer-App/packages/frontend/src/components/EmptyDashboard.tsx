import { ClipboardCheck, FileJson, Play, Upload } from 'lucide-react';

const STEPS = [
  {
    icon: Play,
    title: 'Run the analyzer',
    body: 'Open the Fabric Data Agent Analyzer notebook, set your agent, and choose Run all. It is read-only.',
  },
  {
    icon: FileJson,
    title: 'Grab the evidence file',
    body: 'The notebook saves readiness_<agent>_evidence.json under Files/DataAgentReadiness in your lakehouse.',
  },
  {
    icon: ClipboardCheck,
    title: 'Import and act',
    body: 'See the score, release gates and a prioritized fix list. Re-import after each change to track progress.',
  },
];

/** First-run view: no data yet, so explain the flow instead of showing numbers. */
export function EmptyDashboard({ onImport }: { onImport: () => void }) {
  return (
    <div className="mx-auto max-w-3xl py-800 text-center">
      <div className="mx-auto grid size-[104px] place-items-center rounded-full border-[10px] border-muted">
        <span className="font-numeric text-600 font-bold text-muted-foreground">
          ?
        </span>
      </div>
      <h2 className="mt-600 text-hero-800 font-bold leading-hero-800">
        How ready is your data agent?
      </h2>
      <p className="mx-auto mt-300 max-w-xl text-400 leading-400 text-muted-foreground">
        Import an analyzer export to see a readiness score, release gates, and
        a prioritized list of what to fix, in language anyone can act on.
      </p>
      <button
        type="button"
        onClick={onImport}
        className="mt-600 inline-flex items-center gap-200 rounded-xl bg-primary px-500 py-300 text-400 font-semibold leading-400 text-primary-foreground hover:opacity-90"
      >
        <Upload aria-hidden="true" className="icon-size-300" />
        Import analyzer results
      </button>

      <ol className="mt-800 grid gap-400 text-left sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li
            key={title}
            className="rounded-2xl border border-border bg-card p-500"
          >
            <div className="flex items-center gap-300">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-foreground">
                <Icon aria-hidden="true" className="icon-size-200" />
              </span>
              <span className="font-numeric text-300 font-bold text-muted-foreground">
                Step {index + 1}
              </span>
            </div>
            <h3 className="mt-300 text-400 font-semibold leading-400">
              {title}
            </h3>
            <p className="mt-100 break-words text-300 leading-300 text-muted-foreground">
              {body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
