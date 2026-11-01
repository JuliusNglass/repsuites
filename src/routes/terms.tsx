import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, textPageClass } from "../components/site/PublicLayout";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service | RepSuites" }] }),
  component: () => (
    <PublicLayout>
      <article className={textPageClass}>
        <h1>Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: 29 October 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using RepSuites ("the Service"), a product by Accelur8, you agree to be
          bound by these Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          RepSuites provides reputation management, review monitoring, local SEO tools, customer
          feedback collection, loyalty programmes, and related business growth services.
        </p>

        <h2>3. Account Registration</h2>
        <p>
          You must provide accurate information when creating an account. You are responsible for
          maintaining the security of your account credentials and for all activities under your
          account.
        </p>

        <h2>4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose.</li>
          <li>Send spam or unsolicited communications through the platform.</li>
          <li>Attempt to gain unauthorised access to other users' accounts or data.</li>
          <li>Reverse-engineer or attempt to extract the source code of the Service.</li>
        </ul>

        <h2>5. Subscription &amp; Billing</h2>
        <p>
          Monthly plans are billed on the 1st of each month. If you start part way through a
          month, your first payment covers only the days left in that month. Yearly plans are
          billed once a year from the day you start. You may cancel at any time; access continues
          until the end of the billing period. Refunds are handled on a case-by-case basis.
        </p>

        <h2>6. Intellectual Property</h2>
        <p>
          All content, trademarks, and technology within the Service are owned by Accelur8. You
          retain ownership of data you upload or create.
        </p>

        <h2>7. Third-Party Integrations</h2>
        <p>
          The Service integrates with third-party platforms including Google. Your use of these
          integrations is subject to the respective third-party terms of service.
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          The Service is provided "as is". Accelur8 shall not be liable for any indirect,
          incidental, or consequential damages arising from your use of the Service.
        </p>

        <h2>9. Termination</h2>
        <p>
          We reserve the right to suspend or terminate accounts that violate these terms. You may
          terminate your account at any time by contacting support.
        </p>

        <h2>10. Changes to Terms</h2>
        <p>
          We may update these terms from time to time. Continued use of the Service after changes
          constitutes acceptance of the new terms.
        </p>

        <h2>11. Contact</h2>
        <p>
          For questions about these terms, contact us at{" "}
          <a href="mailto:support@repsuites.com">support@repsuites.com</a>.
        </p>
      </article>
    </PublicLayout>
  ),
});
