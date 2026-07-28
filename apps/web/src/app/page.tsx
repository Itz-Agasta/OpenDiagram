import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import {
  assetUrl,
  GITHUB_URL,
  HOME_DESCRIPTION,
  HOME_TITLE,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";

const organizationId = new URL("/#organization", SITE_URL).href;
const websiteId = new URL("/#website", SITE_URL).href;
const applicationId = new URL("/#software-application", SITE_URL).href;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: SITE_NAME,
      url: SITE_URL.href,
      logo: assetUrl("/brand/mascot.png"),
      sameAs: [GITHUB_URL],
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: SITE_NAME,
      url: SITE_URL.href,
      description: HOME_DESCRIPTION,
      publisher: { "@id": organizationId },
    },
    {
      "@type": "WebApplication",
      "@id": applicationId,
      name: SITE_NAME,
      url: SITE_URL.href,
      description: HOME_DESCRIPTION,
      applicationCategory: "DesignApplication",
      operatingSystem: "Web browser",
      image: assetUrl("/marketing/slideshow/diagram_sample.png"),
      isAccessibleForFree: true,
      license: `${GITHUB_URL}/blob/main/LICENSE`,
      author: { "@id": organizationId },
      sameAs: GITHUB_URL,
    },
  ],
};

export const metadata: Metadata = {
  title: {
    absolute: HOME_TITLE,
  },
  description: HOME_DESCRIPTION,
  keywords: [
    "AI diagram generator",
    "AI diagram maker from text",
    "text to diagram",
    "AI flowchart generator",
    "AI architecture diagram generator",
    "editable diagrams",
    "vibe diagrams",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [
      {
        url: assetUrl("/marketing/social/preview.jpeg"),
        width: 1200,
        height: 630,
        alt: "Create your Vibe Diagram with OpenDiagram",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [assetUrl("/marketing/social/preview.jpeg")],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <LandingPage />
    </>
  );
}
