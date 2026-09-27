import type { Metadata } from "next";
import { LEGAL_CONTACT_EMAIL, LegalPage, LegalSection } from "@/components/legal/legal-page";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What OpenDiagram collects, why, who processes it, and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <LegalSection title="Who we are">
        <p>
          OpenDiagram is an AI diagramming workspace available at opendiagram.ink. This policy
          covers the hosted service. OpenDiagram is also open source; if you run your own copy, you
          are the operator of that copy and this policy does not apply to it.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <ul>
          <li>
            <strong>Account details.</strong> Your name and email address. If you sign up with a
            password, we store only a hash of it. If you sign in with GitHub, we request only your
            public profile and email address (<code>read:user</code>, <code>user:email</code>); we
            never get write access to your repositories.
          </li>
          <li>
            <strong>Your content.</strong> The prompts and chat messages you send, the diagrams and
            projects you create, files you upload, and public GitHub repositories you import.
          </li>
          <li>
            <strong>Your AI provider keys.</strong> If you bring your own key, we store it encrypted
            and use it only to call that provider on your behalf.
          </li>
          <li>
            <strong>Billing status.</strong> Payments are handled by Dodo Payments. We receive your
            plan and subscription status, never your card number.
          </li>
          <li>
            <strong>Usage and technical data.</strong> How many diagrams you create (to apply plan
            limits), IP address and request data for rate limiting and security, and product
            analytics and error reports described below.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use it">
        <p>
          To run the service: generate and store your diagrams, keep you signed in, apply plan
          limits, process payments, send account emails (verification and password reset), prevent
          abuse, and fix bugs. We use aggregated analytics to understand which features work.
        </p>
        <p>
          We do not sell your data. We do not use your content to train our own models, and we do
          not show you ads.
        </p>
      </LegalSection>

      <LegalSection title="AI processing">
        <p>
          To generate a diagram, your prompt, chat history, and relevant project content are sent to
          an AI model provider. By default that is Google (Gemini). If you add your own key,
          requests go to the provider you chose (for example OpenAI, Anthropic, or Google) under
          that provider&apos;s terms.
        </p>
        <p>
          Our monitoring records only metadata about AI calls, such as the model, token counts, and
          latency. The text of your prompts and the model&apos;s responses is not sent to our
          analytics or error tracking tools.
        </p>
      </LegalSection>

      <LegalSection title="Service providers">
        <p>We share data only with the providers that run parts of the service:</p>
        <ul>
          <li>Vercel: website hosting and privacy-friendly traffic analytics</li>
          <li>Google Cloud: API hosting and the Gemini models</li>
          <li>Supabase: database</li>
          <li>Resend: account emails</li>
          <li>Dodo Payments: checkout, billing, and tax as merchant of record</li>
          <li>PostHog: product analytics</li>
          <li>Sentry: error monitoring</li>
        </ul>
        <p>
          These providers may process data in the United States and other countries. We may also
          disclose data if the law requires it.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          We use a session cookie to keep you signed in; the service does not work without it. Our
          analytics tools use their own cookies or local storage to count visits and feature usage.
        </p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>
          We keep your account and content while your account is active. To delete your account and
          everything in it, email{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> from the address on
          the account and we will confirm once it is done. Billing records may be kept longer where
          tax law requires.
        </p>
        <p>You can also ask us for a copy of your data or to correct it, using the same address.</p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Data is encrypted in transit, provider keys are encrypted at rest, and access to
          production systems is limited. No system is perfectly secure, so please use a strong,
          unique password.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          OpenDiagram is not intended for children under 13, or under 16 where local law sets that
          age. We do not knowingly collect their data.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If we change this policy, we will update the date above. For significant changes we will
          also let you know by email or in the app.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> for privacy
          requests. For general questions you can also open an issue on{" "}
          <a href={`${GITHUB_URL}/issues`}>GitHub</a>; please do not post personal data there.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
