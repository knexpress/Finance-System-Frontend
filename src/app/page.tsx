import Link from 'next/link';
export default function HomePage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 rounded-lg border bg-card p-6 shadow-sm sm:p-10">
        <header className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            KNEX Finance and Logistics System
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            KNEX is an internal operations platform that centralizes booking requests,
            delivery assignment, invoice lifecycle, audit logs, and reporting for
            logistics and finance teams. It helps organizations streamline daily
            operations with controlled access, traceability, and data security.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-md border bg-background p-4">
            <h2 className="mb-2 text-lg font-semibold">What the System Does</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Manage booking and delivery workflows end-to-end.</li>
              <li>Track invoices, approval states, and cash flow records.</li>
              <li>Maintain operational transparency with audit and activity logs.</li>
              <li>Enable role-based access for secure team collaboration.</li>
            </ul>
          </article>

          <article className="rounded-md border bg-background p-4">
            <h2 className="mb-2 text-lg font-semibold">Who Uses It</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Operations managers and dispatch teams.</li>
              <li>Finance and invoicing departments.</li>
              <li>Review and compliance staff.</li>
              <li>Authorized administrators and executives.</li>
            </ul>
          </article>
        </section>

        <section className="rounded-md border bg-background p-4">
          <h2 className="mb-2 text-lg font-semibold">Compliance and Trust</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            The platform follows controlled access patterns, security logging, and
            documented legal policies that support service verification and UAE legal
            compliance requirements.
          </p>
        </section>

        <footer className="flex flex-wrap items-center gap-4 border-t pt-4 text-sm">
          <Link
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition hover:opacity-90"
            href="/login"
          >
            Go to Login
          </Link>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Link className="underline transition hover:text-foreground" href="/privacy-policy">
              Privacy Policy
            </Link>
            <Link className="underline transition hover:text-foreground" href="/terms-and-conditions">
              Terms and Conditions
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
