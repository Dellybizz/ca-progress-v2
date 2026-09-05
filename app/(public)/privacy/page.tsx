import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy | CA Progress",
  description: "Privacy policy for CA Progress, including Google and LinkedIn sign-in, guest mode, profile data, and service providers.",
};

const effectiveDate = "6 September 2026";

export default function PrivacyPage() {
  return (
    <article className={styles.policy}>
      <header className={styles.hero}>
        <Badge tone="brand">Privacy</Badge>
        <h1>Privacy Policy</h1>
        <p className={styles.updated}>Effective: {effectiveDate}</p>
        <p>
          This Privacy Policy explains how CA Progress collects, uses, stores, and protects information when you use the CA Progress website and related services.
        </p>
      </header>

      <section>
        <h2>1. Information we collect</h2>
        <p>Depending on how you use CA Progress, we may process the following information:</p>
        <ul>
          <li><strong>Account identity information:</strong> when you sign in with Google or LinkedIn, we may receive your name, email address, profile image, provider account identifier, and other basic identity information made available through the selected sign-in provider.</li>
          <li><strong>Study profile information:</strong> information you choose to provide, such as your CA level, group selection, attempt preference, study targets, display name, and profile image.</li>
          <li><strong>Preferences and progress information:</strong> settings and, as features are enabled, study-related information you choose to save to your account.</li>
          <li><strong>Authentication and security information:</strong> session information and limited technical data required to authenticate users, protect accounts, diagnose errors, and operate the service securely.</li>
        </ul>
      </section>

      <section>
        <h2>2. Google and LinkedIn sign-in</h2>
        <p>
          CA Progress uses Google and LinkedIn as optional identity providers. We request only the identity information needed to create or access your CA Progress account. Your Google or LinkedIn password is never provided to CA Progress.
        </p>
        <p>
          Your use of those services is also subject to the privacy terms and account controls provided by Google or LinkedIn. You may revoke CA Progress&apos;s access from the relevant provider account settings where supported.
        </p>
      </section>

      <section>
        <h2>3. Guest mode</h2>
        <p>
          You may use supported parts of CA Progress as a guest. Guest identity information is created locally in your browser and does not create a CA Progress authentication account. Guest-only information is not synced as private account data unless you later sign in and explicitly use features that save information to your account.
        </p>
      </section>

      <section>
        <h2>4. How we use information</h2>
        <p>We use information only as reasonably necessary to:</p>
        <ul>
          <li>authenticate you and maintain your session;</li>
          <li>provide, personalize, and sync CA Progress features;</li>
          <li>save profile preferences and study information you choose to store;</li>
          <li>protect the service against misuse and security threats;</li>
          <li>maintain reliability, troubleshoot problems, and improve the service; and</li>
          <li>comply with applicable legal obligations.</li>
        </ul>
      </section>

      <section>
        <h2>5. Service providers</h2>
        <p>
          CA Progress uses <strong>Cloudflare</strong> infrastructure for application hosting and delivery, authentication/session processing, application data storage through D1, private file storage through R2, and related security and background services. Google and LinkedIn are used when you choose their respective sign-in options.
        </p>
        <p>These providers may process information on our behalf according to their own contractual and privacy obligations.</p>
      </section>

      <section>
        <h2>6. Sharing and sale of personal information</h2>
        <p>
          CA Progress does not sell your personal information. We do not share personal information with third parties for their independent advertising purposes. Information may be disclosed to service providers that help operate CA Progress, where required by law, or where necessary to protect users, the service, or legal rights.
        </p>
      </section>

      <section>
        <h2>7. Data retention and deletion</h2>
        <p>
          Account information is retained for as long as reasonably necessary to provide the service, maintain security, meet legal requirements, or resolve disputes. You may request access to, correction of, or deletion of personal information associated with your CA Progress account. Requests can be made using the support or contact method made available within CA Progress.
        </p>
      </section>

      <section>
        <h2>8. Security</h2>
        <p>
          We use reasonable technical and organizational safeguards designed to protect account information, including provider-based authentication, access controls, private data policies, and encrypted HTTPS connections. No online service can guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>9. Children and younger users</h2>
        <p>
          Users should only provide personal information where they are legally permitted to do so. Where applicable law requires consent from a parent or guardian for a younger user, that consent should be obtained before creating an account or providing personal information.
        </p>
      </section>

      <section>
        <h2>10. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy as CA Progress develops or legal requirements change. The effective date at the top of this page will be updated when material changes are published.
        </p>
      </section>

      <section>
        <h2>11. Contact and privacy requests</h2>
        <p>
          For questions about this policy or requests relating to your personal information, use the support or contact method provided within CA Progress. Please do not send passwords, authentication tokens, or other sensitive credentials in a privacy request.
        </p>
      </section>

      <footer className={styles.footer}>
        <Link href="/dashboard">Return to CA Progress</Link>
      </footer>
    </article>
  );
}
