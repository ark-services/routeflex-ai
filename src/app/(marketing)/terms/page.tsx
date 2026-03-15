import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — RouteFlex",
  description: "Terms governing your use of the RouteFlex platform.",
};

export default function TermsPage() {
  return (
    <div className="bg-rf-surface-base min-h-screen">
      <section className="pt-32 pb-24 px-6 lg:px-10">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-rf-text-muted uppercase tracking-widest mb-4">
            Last updated: March 14, 2026
          </p>
          <h1 className="text-4xl font-extrabold text-rf-text-primary tracking-tight mb-10">
            Terms of Service
          </h1>

          <div className="space-y-10">
            <Section title="1. Acceptance of Terms">
              <p>
                By accessing or using the RouteFlex platform and website (the
                "Service"), you agree to be bound by these Terms of Service
                ("Terms"). If you are using the Service on behalf of a company
                or other legal entity, you represent that you have authority to
                bind that entity. If you do not agree to these Terms, do not
                use the Service.
              </p>
            </Section>

            <Section title="2. Description of Service">
              <p>
                RouteFlex is a recruiting and workforce management platform
                designed for FedEx Ground independent service providers. The
                Service includes applicant tracking, automation tools, LMS
                training, background check integration, and related features.
              </p>
            </Section>

            <Section title="3. Accounts">
              <ul>
                <li>
                  You must provide accurate and complete information when
                  creating an account and keep it up to date.
                </li>
                <li>
                  You are responsible for maintaining the confidentiality of
                  your credentials and for all activity that occurs under your
                  account.
                </li>
                <li>
                  You must notify us immediately via our{" "}
                  <a href="/contact" className="text-rf-blue hover:underline">
                    contact page
                  </a>{" "}
                  of any unauthorized use of your account.
                </li>
                <li>
                  You may not share account credentials or allow multiple
                  individuals to use a single seat unless your subscription
                  includes multi-seat access.
                </li>
              </ul>
            </Section>

            <Section title="4. Subscriptions and Payment">
              <ul>
                <li>
                  The Service is offered on a subscription basis. Fees are
                  billed monthly or annually as selected at checkout.
                </li>
                <li>
                  All fees are non-refundable except as required by applicable
                  law or as expressly stated in these Terms.
                </li>
                <li>
                  We reserve the right to change pricing with 30 days' advance
                  notice. Continued use after a price change constitutes
                  acceptance.
                </li>
                <li>
                  Failure to pay may result in suspension or termination of
                  your account.
                </li>
              </ul>
            </Section>

            <Section title="5. Acceptable Use">
              <p>You agree not to:</p>
              <ul>
                <li>
                  Use the Service for any unlawful purpose or in violation of
                  applicable employment, privacy, or anti-discrimination laws.
                </li>
                <li>
                  Upload or transmit viruses, malware, or any harmful code.
                </li>
                <li>
                  Attempt to gain unauthorized access to any part of the
                  Service or its infrastructure.
                </li>
                <li>
                  Reverse-engineer, decompile, or extract source code from the
                  Service.
                </li>
                <li>
                  Resell, sublicense, or otherwise make the Service available
                  to third parties without our written consent.
                </li>
                <li>
                  Use automated scripts or bots to scrape or interact with the
                  Service outside of approved API access.
                </li>
              </ul>
            </Section>

            <Section title="6. Your Data">
              <p>
                You retain ownership of all data you upload to the Service,
                including applicant records ("Your Data"). You grant RouteFlex
                a limited license to store, process, and transmit Your Data
                solely to provide the Service.
              </p>
              <p>
                You are responsible for ensuring you have the legal right to
                collect and process applicant data, including obtaining any
                required consents under applicable law (e.g., FCRA, EEOC
                guidelines, state privacy laws).
              </p>
            </Section>

            <Section title="7. Third-Party Integrations">
              <p>
                The Service integrates with third-party services including
                First Advantage, Gmail, and Twilio. Your use of those services
                is governed by their respective terms. RouteFlex is not
                responsible for the availability, accuracy, or actions of
                third-party services.
              </p>
            </Section>

            <Section title="8. Intellectual Property">
              <p>
                The Service, including all software, design, trademarks, and
                content created by RouteFlex, is owned by RouteFlex and
                protected by intellectual property laws. These Terms do not
                grant you any rights to use RouteFlex's name, logo, or
                trademarks without prior written consent.
              </p>
            </Section>

            <Section title="9. Confidentiality">
              <p>
                Each party agrees to keep confidential any non-public
                information of the other party that is designated as
                confidential or that reasonably should be understood to be
                confidential, and to use such information only as permitted
                under these Terms.
              </p>
            </Section>

            <Section title="10. Disclaimers">
              <p>
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
                WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES
                OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
                NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
                UNINTERRUPTED, ERROR-FREE, OR THAT DEFECTS WILL BE CORRECTED.
              </p>
            </Section>

            <Section title="11. Limitation of Liability">
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, ROUTEFLEX SHALL NOT BE
                LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES, OR LOSS OF PROFITS OR REVENUES, WHETHER
                INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE,
                GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF YOUR USE
                OF THE SERVICE.
              </p>
              <p>
                IN NO EVENT SHALL ROUTEFLEX'S TOTAL LIABILITY TO YOU EXCEED THE
                GREATER OF (A) THE AMOUNT YOU PAID FOR THE SERVICE IN THE 12
                MONTHS PRECEDING THE CLAIM OR (B) $100.
              </p>
            </Section>

            <Section title="12. Indemnification">
              <p>
                You agree to indemnify, defend, and hold harmless RouteFlex and
                its officers, directors, employees, and agents from any claims,
                damages, losses, and expenses (including reasonable attorneys'
                fees) arising out of your use of the Service, Your Data, or
                your violation of these Terms.
              </p>
            </Section>

            <Section title="13. Term and Termination">
              <p>
                These Terms remain in effect while you use the Service. You may
                cancel your subscription at any time; access continues through
                the end of the paid period. We may suspend or terminate your
                account immediately for material breach of these Terms,
                non-payment, or conduct that poses a risk to the Service or
                other users.
              </p>
              <p>
                Upon termination, your right to use the Service ceases. You may
                request an export of Your Data within 30 days of termination.
              </p>
            </Section>

            <Section title="14. Governing Law">
              <p>
                These Terms are governed by the laws of the United States and
                the state in which RouteFlex is incorporated, without regard to
                conflict of law principles. Any disputes shall be resolved in
                the courts of competent jurisdiction in that state, and you
                consent to personal jurisdiction there.
              </p>
            </Section>

            <Section title="15. Changes to These Terms">
              <p>
                We may update these Terms from time to time. We will notify you
                of material changes by email or by posting a notice on the
                Service at least 14 days before the change takes effect.
                Continued use of the Service after the effective date
                constitutes acceptance of the updated Terms.
              </p>
            </Section>

            <Section title="16. Contact Us">
              <p>
                Questions about these Terms?{" "}
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
