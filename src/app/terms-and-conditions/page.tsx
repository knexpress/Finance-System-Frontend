import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms and Conditions | KNEX',
  description:
    'Terms and Conditions for using the KNEX logistics and finance platform.',
};

export default function TermsAndConditionsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-8 rounded-lg border bg-card p-6 shadow-sm sm:p-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Terms and Conditions
          </h1>
          <p className="text-sm text-muted-foreground">
            Effective date: 29 April 2026
          </p>
          <p className="text-sm text-muted-foreground">
            These Terms and Conditions govern access to and use of the KNEX
            platform and related services.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            By accessing or using KNEX, you confirm that you are authorized to
            act on behalf of your organization and agree to these Terms and our
            Privacy Policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">2. Service Scope</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            KNEX provides tools for logistics workflow management, invoice
            processing, assignment tracking, reporting, and operational
            communication.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">3. Account Responsibilities</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
            <li>You must provide accurate registration and business data.</li>
            <li>You are responsible for safeguarding account credentials.</li>
            <li>
              You must promptly notify KNEX of unauthorized use or suspected
              compromise.
            </li>
            <li>
              You are responsible for activities carried out under your account.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">4. Acceptable Use</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            You may not use the platform for unlawful, fraudulent, abusive, or
            security-threatening activity. Attempts to disrupt service,
            reverse-engineer protected components, or bypass security controls
            are prohibited.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">5. Data and Compliance</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Users must ensure that all personal and business data submitted to
            KNEX is collected and used lawfully. KNEX processes data according
            to applicable UAE law and internal security controls.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Parties shall comply with relevant UAE legal frameworks, including
            Federal Decree-Law No. 45 of 2021 (Personal Data Protection) and
            other mandatory commercial and electronic transaction requirements
            applicable to their business activities.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">
            6. Availability and Changes
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We aim for high availability but do not guarantee uninterrupted
            access at all times. We may update, suspend, or improve platform
            features for security, maintenance, or business needs.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">
            7. Intellectual Property
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            All rights in the KNEX platform, software, branding, and related
            materials remain the property of KNEX or its licensors. No license
            is granted except the limited right to use the service as intended.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">8. Limitation of Liability</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            To the fullest extent permitted by law, KNEX is not liable for
            indirect, incidental, special, or consequential damages arising from
            service use, interruption, or data loss. Direct liability is limited
            to amounts paid for the service in the applicable period, where
            permitted by law.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">9. Termination</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We may suspend or terminate access for breaches of these Terms,
            legal requirements, security threats, or prolonged inactivity,
            subject to applicable law and contractual obligations.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">10. Governing Law</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            These Terms are governed by the laws and regulations in force in the
            United Arab Emirates. Disputes are subject to the competent courts
            of the UAE unless another forum is agreed in writing.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">11. Contact</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Legal and compliance enquiries: legal@knex.ae
          </p>
        </section>

        <footer className="border-t pt-4 text-sm text-muted-foreground">
          <p>
            Related legal page:{' '}
            <Link className="text-primary underline" href="/privacy-policy">
              Privacy Policy
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
