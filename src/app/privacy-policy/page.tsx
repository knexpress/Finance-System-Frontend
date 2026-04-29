import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | KNEX',
  description:
    'Privacy Policy for KNEX logistics and finance operations in the UAE.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-8 rounded-lg border bg-card p-6 shadow-sm sm:p-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">
            Effective date: 29 April 2026
          </p>
          <p className="text-sm text-muted-foreground">
            This Privacy Policy explains how KNEX collects, uses, stores, and
            protects personal data when you use our logistics and finance
            system.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">1. Data Controller</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            KNEX is the data controller for personal data processed through this
            platform. For privacy enquiries, deletion requests, or compliance
            notices, contact us at:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Email: privacy@knex.ae</li>
            <li>Support Email: support@knex.ae</li>
            <li>Service Area: United Arab Emirates</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">2. Data We Collect</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
            <li>Identity data (name, job title, company name).</li>
            <li>Contact data (phone number, email, billing address).</li>
            <li>
              Operational data (shipment requests, invoice data, payment
              references, assignment history).
            </li>
            <li>
              Technical data (IP address, browser information, session logs,
              security logs).
            </li>
            <li>
              Communications data (support tickets, approval notes, and audit
              comments).
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">
            3. Why We Process Personal Data
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
            <li>To provide logistics, invoicing, and account management.</li>
            <li>To authenticate users and secure accounts.</li>
            <li>To generate financial and operational records.</li>
            <li>To detect fraud, abuse, or unauthorized activity.</li>
            <li>To comply with UAE legal and regulatory obligations.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">4. Legal Basis</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We process personal data where necessary for contract performance,
            compliance with legal obligations, legitimate business interests,
            and user consent where required.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Our data practices are aligned with applicable UAE frameworks,
            including Federal Decree-Law No. 45 of 2021 on the Protection of
            Personal Data and related implementing regulations.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">
            5. Data Sharing and Processors
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We share data only with authorized personnel, vetted service
            providers, and trusted infrastructure partners needed to operate the
            platform, including cloud hosting and monitoring services.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            We do not sell personal data. Data transfers are limited to lawful
            operational purposes and protected by contractual and technical
            safeguards.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">
            6. Retention and Deletion
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We retain records for as long as needed for service delivery,
            auditing, accounting, legal defense, and compliance obligations.
            When retention periods end, data is securely deleted or anonymized.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">7. Your Rights</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
            <li>Request access to your personal data.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request erasure where legally applicable.</li>
            <li>Object to or restrict certain processing activities.</li>
            <li>Request a copy of your data where applicable.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">8. Security Controls</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We maintain administrative, technical, and physical controls to
            protect data confidentiality, integrity, and availability. These
            include access control, encryption in transit, logging, and periodic
            security review.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">9. Contact and Complaints</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            If you have any privacy concerns, contact privacy@knex.ae first so
            we can resolve your request quickly. You may also escalate
            unresolved concerns to competent UAE authorities where applicable.
          </p>
        </section>

        <footer className="border-t pt-4 text-sm text-muted-foreground">
          <p>
            Related legal page:{' '}
            <Link className="text-primary underline" href="/terms-and-conditions">
              Terms and Conditions
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
