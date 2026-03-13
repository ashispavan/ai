import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-fd-muted-foreground">
            Documentation Blog
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            AI engineering notes for systems, tooling, and practical field work.
          </h1>
          <p className="max-w-2xl text-lg text-fd-muted-foreground">
            A Fumadocs site set up for long-form documentation and blog-style writing on
            agent design, evals, retrieval, infrastructure, and shipping AI products.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/docs"
            className="rounded-full bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground"
          >
            Open docs
          </Link>
          <Link
            href="/docs/editorial-calendar"
            className="rounded-full border border-fd-border px-5 py-2.5 text-sm font-medium"
          >
            Start writing
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Foundations', 'Core concepts, terminology, and mental models.'],
            ['Agents', 'Execution loops, tools, memory, and coordination patterns.'],
            ['Evaluation', 'Benchmarks, scorecards, failure analysis, and iteration.'],
            ['Operations', 'Deployment, observability, cost, and reliability practices.'],
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-fd-border p-5">
              <h2 className="font-medium">{title}</h2>
              <p className="mt-2 text-sm text-fd-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
