import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — RouteFlex",
  description: "How RouteFlex collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <div className="bg-rf-surface-base min-h-screen">
      <section className="pt-32 pb-24 px-6 lg:px-10">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-rf-text-muted uppercase tracking-widest mb-4">
            Last updated: March 14, 2026
          </p>
          <h1 className="text-4xl font-extrabold text-rf-text-primary tracking-tight mb-10">
            Privacy Policy
          </h1>

          <div className="prose-custom space-y-10">
            <Section title="1. Introduction">
              <p>
                RouteFlex ("we," "us," or "our") operates the RouteFlex
                platform and website (the "Service"). This Privacy Policy
                explains how we collect, use, disclose, and safeguard your
                information when you use our Service. Please read this policy
                carefully. If you disagree with its terms, please discontinue
                use of the Service.
              </p>
            </Section>

            <Section title="2. Information We Collect">
              <p>We collect information in the following ways:</p>
              <Subsection title="Information you provide directly">
                <ul>
                  <li>
                    <strong>Account information:</strong> name, email address,
                    and password when you register.
                  </li>
                  <li>
                    <strong>Company information:</strong> company name, terminal
                    count, and other operational details you enter.
                  </li>
                  <li>
                    <strong>Applicant data:</strong> names, contact details,
                    employment history, and other information you or your
                    applicants submit through the platform.
                  </li>
                  <li>
                    <strong>Communications:</strong> messages you send us via
                    the contact form or email.
                  </li>
                </ul>
              </Subsection>
              <Subsection title="Information collected automatically">
                <ul>
                  <li>
                    <strong>Usage data:</strong> pages visited, features used,
                    timestamps, and click patterns.
                  </li>
                  <li>
                    <strong>Device data:</strong> IP address, browser type, and
                    operating system.
                  </li>
                  <li>
                    <strong>Cookies:</strong> session tokens and preference
                    cookies necessary for the Service to function. We do not use
                    third-party advertising cookies.
                  </li>
                </ul>
              </Subsection>
              <Subsection title="Information from third parties">
                <ul>
                  <li>
                    <strong>Gmail integration:</strong> if you connect a Gmail
                    account, we access only the scopes you authorize (send and
                    read) to power automation features.
                  </li>
                  <li>
                    <strong>First Advantage:</strong> background check status
                    and results returned by First Advantage are stored on your
                    behalf.
                  </li>
                </ul>
              </Subsection>
            </Section>

            <Section title="3. How We Use Your Information">
              <ul>
                <li>To provide, operate, and improve the Service.</li>
                <li>
                  To process applicant data on your behalf as your data
                  processor.
                </li>
                <li>
                  To send transactional emails (account confirmations, password
                  resets, automation-triggered messages).
                </li>
                <li>
                  To respond to support requests and contact form submissions.
                </li>
                <li>
                  To detect and prevent fraud, abuse, and security incidents.
                </li>
                <li>
                  To comply with applicable law and legal obligations.
                </li>
              </ul>
              <p>
                We do not sell your personal information or applicant data to
                third parties.
              </p>
            </Section>

            <Section title="4. Data Roles">
              <p>
                For data you enter about your applicants and employees,
                RouteFlex acts as a <strong>data processor</strong> — you are
                the data controller responsible for obtaining lawful basis to
                collect and process that information. For data about your own
                account and usage, RouteFlex acts as a data controller.
              </p>
            </Section>

            <Section title="5. Data Retention">
              <p>
                We retain your account data for as long as your account is
                active or as needed to provide the Service. Applicant records
                are retained per your configuration and deleted upon account
                termination or upon your written request. Backup copies may
                persist for up to 90 days.
              </p>
            </Section>

            <Section title="6. Data Sharing and Disclosure">
              <p>
                We share information only in the following circumstances:
              </p>
              <ul>
                <li>
                  <strong>Service providers:</strong> Supabase (database and
                  authentication), Resend (transactional email), Twilio (SMS),
                  and other infrastructure vendors under confidentiality
                  obligations.
                </li>
                <li>
                  <strong>First Advantage:</strong> applicant data you choose
                  to submit for background screening.
                </li>
                <li>
                  <strong>Legal requirements:</strong> when required by law,
                  subpoena, or to protect the rights and safety of RouteFlex or
                  others.
                </li>
                <li>
                  <strong>Business transfers:</strong> in connection with a
                  merger, acquisition, or sale of assets, with advance notice
                  to affected users.
                </li>
              </ul>
            </Section>

            <Section title="7. Security">
              <p>
                We implement industry-standard security measures including
                encryption in transit (TLS), encryption at rest, row-level
                security on all database tables, and access controls. No method
                of transmission over the internet is 100% secure; we cannot
                guarantee absolute security.
              </p>
            </Section>

            <Section title="8. Your Rights">
              <p>
                Depending on your jurisdiction, you may have the right to
                access, correct, delete, or export personal information we hold
                about you. To exercise these rights,{" "}
                <a href="/contact" className="text-rf-blue hover:underline">
                  contact us
                </a>
                . We will respond within 30 days.
              </p>
            </Section>

            <Section title="9. Children's Privacy">
              <p>
                The Service is not directed to individuals under 18. We do not
                knowingly collect personal information from minors. If you
                believe we have inadvertently collected such information, please
                contact us and we will delete it promptly.
              </p>
            </Section>

            <Section title="10. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. We will
                notify you of material changes by email or by posting a notice
                on the Service at least 14 days before the change takes effect.
                Continued use of the Service after the effective date
                constitutes acceptance of the updated policy.
              </p>
            </Section>

            <Section title="11. Contact Us">
              <p>
                Questions about this Privacy Policy?{" "}
                <a href="/contact" className="text-rf-blue hover:underline">
                  Contact us
                </a>{" "}
                and we&apos;ll be happy to help.
              </p>
            </Section>
          </div>
        </div>
      </section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-rf-text-primary">{title}</h2>
      <div className="text-rf-text-secondary leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_strong]:text-rf-text-primary [&_strong]:font-semibold">
        {children}
      </div>
    </div>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-rf-text-primary uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </div>
  );
}
