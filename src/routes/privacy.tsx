// Privacy policy. Google's app verification reviewers read section 4.
import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, textPageClass } from "../components/site/PublicLayout";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy | RepSuites" }] }),
  component: () => (
    <PublicLayout>
      <article className={textPageClass}>
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: 29 October 2026</p>

      <h2>1. Who We Are</h2>
      <p>RepSuites is a product by Accelur8 ("we", "us", "our"). We provide reputation management, local SEO, and customer engagement tools for businesses.</p>

      <h2>2. Information We Collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email address, business name, phone number provided during registration.</li>
        <li><strong>Google Business Profile data:</strong> when you connect your Google account, we access your business reviews, location information, and profile details via Google APIs to provide our services.</li>
        <li><strong>Usage data:</strong> pages visited, features used, and interactions within the platform.</li>
        <li><strong>Customer data you provide:</strong> customer names, emails, and phone numbers you enter for review requests or loyalty programmes.</li>
      </ul>

      <h2>3. How We Use Your Information</h2>
      <ul>
        <li>To provide, maintain, and improve our services.</li>
        <li>To sync and display your Google Business Profile reviews.</li>
        <li>To send review requests and follow-ups on your behalf.</li>
        <li>To generate reports, analytics, and actionable insights.</li>
        <li>To communicate with you about your account and product updates.</li>
      </ul>

      <h2>4. Google user data</h2>
      <p>When you connect your Google Business Profile, through RepSuites or through SparkOps (an Accelur8 app for cleaning businesses that uses the RepSuites connection), we ask Google for permission to manage your Business Profile (the <code>business.manage</code> permission). SparkOps also asks for your Google account email address, so it knows which account is connected.</p>
      <p>We use this access only to:</p>
      <ul>
        <li>read your business locations and your Google reviews, and show them to you;</li>
        <li>post replies to reviews that you write, approve, or choose to send automatically;</li>
        <li>publish Google posts that you write or approve;</li>
        <li>update your business description when you ask us to;</li>
        <li>read your profile's performance figures (calls, website clicks, direction requests and searches) to show you reports.</li>
      </ul>
      <p><strong>What we store:</strong> the review text, star rating, reviewer name and photo link, review dates, the replies and posts sent through us, and your Google access tokens. Tokens are kept on our servers, are never shown in the app, and are used only to make the requests above.</p>
      <p><strong>AI reply drafts:</strong> if you use suggested replies or AI-written posts, the review text and your business details are sent to our AI providers to write a draft. They do not use this data to train their models. You can always edit a draft before it is posted.</p>
      <p>RepSuites' use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. In particular, we do not:</p>
      <ul>
        <li>sell Google user data;</li>
        <li>use or transfer it for advertising;</li>
        <li>use it to train generalised AI or machine learning models;</li>
        <li>let any person read it except you, people you give access to in your account, and our support staff when you ask for help, when needed for security, or when the law requires it.</li>
      </ul>
      <p>You can disconnect at any time from your settings, or at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>. See <a href="/google-business-profile">how the Google connection works</a>.</p>

      <h2>5. Data Sharing</h2>
      <p>We do not sell your personal data. We may share data with:</p>
      <ul>
        <li>Service providers who assist in operating our platform (e.g., email delivery, payment processing).</li>
        <li>Google, as required for API integration.</li>
        <li>Law enforcement, if required by law.</li>
      </ul>

      <h2>6. Data Retention</h2>
      <p>We retain your account data for as long as your account is active. Google data is kept only while your Google account is connected: when you disconnect, we delete your Google access tokens and the copies of your Google reviews we hold. You may ask us to delete your account and all associated data at any time by emailing support@repsuites.com; we do this within 30 days.</p>

      <h2>7. Security</h2>
      <p>We use industry-standard encryption and security measures to protect your data, including encrypted connections (TLS), secure token storage, and role-based access controls.</p>

      <h2>8. Your Rights</h2>
      <p>You have the right to access, correct, or delete your personal data. You can revoke Google access at any time through your Google Account settings or our Settings page.</p>

      <h2>9. Contact Us</h2>
      <p>For questions about this policy, contact us at <a href="mailto:support@repsuites.com">support@repsuites.com</a>.</p>
      </article>
    </PublicLayout>
  ),
});
