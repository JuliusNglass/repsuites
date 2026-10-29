// Public explainer for the Google Business Profile connection. Linked from
// the homepage, footer and privacy policy; read by Google's verification team.
import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, textPageClass } from "../components/site/PublicLayout";

export const Route = createFileRoute("/google-business-profile")({
  head: () => ({ meta: [{ title: "How the Google connection works | RepSuites" }] }),
  component: () => (
    <PublicLayout>
      <article className={textPageClass}>
        <h1>How the RepSuites Google connection works</h1>
        <p className="text-muted-foreground">Last updated: 29 October 2026</p>

        <h2>What it does</h2>
        <p>When a business owner connects their Google Business Profile to RepSuites, they can:</p>
        <ul>
          <li>see all their Google reviews in one inbox;</li>
          <li>reply to reviews, writing their own reply or editing a suggested draft;</li>
          <li>publish Google posts with offers and updates;</li>
          <li>update their business description;</li>
          <li>see their profile's performance: calls, website clicks, direction requests and searches.</li>
        </ul>

        <h2>What we ask Google for</h2>
        <p>
          We ask for one permission: <strong>manage your Google Business Profile</strong> (the{" "}
          <code>business.manage</code> scope). We use it only for the features listed above, for the businesses you
          choose to connect. Where an app also needs to know which Google account is connected, it asks for your
          email address.
        </p>

        <h2>What we never do</h2>
        <ul>
          <li>We never sell your Google data or use it for advertising.</li>
          <li>We never use it to train AI or machine learning models.</li>
          <li>We never post a reply, post or profile change you have not written, approved, or switched on yourself.</li>
          <li>We never change your business name, address, hours or photos.</li>
        </ul>

        <h2>Disconnecting</h2>
        <p>
          Click Disconnect in your settings, or remove RepSuites at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>
          . When you disconnect, we stop using your Google access and delete the copies of your Google reviews we hold,
          as set out in our <a href="/privacy">Privacy Policy</a>.
        </p>

        <h2>Where you'll see it</h2>
        <p>
          The Google connection is part of RepSuites. It is also offered inside SparkOps, the operations app for
          cleaning businesses made by Accelur8, the company behind RepSuites. In SparkOps the button reads "Connect
          Google (via RepSuites)", and Google shows RepSuites on its permission screen.
        </p>

        <h2>Questions</h2>
        <p>
          Email <a href="mailto:support@repsuites.com">support@repsuites.com</a>.
        </p>
      </article>
    </PublicLayout>
  ),
});
