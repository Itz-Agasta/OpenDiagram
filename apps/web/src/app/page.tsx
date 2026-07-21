import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { SmoothScrollProvider } from "@/components/smooth-scroll-provider";
import { GITHUB_URL, HOME_DESCRIPTION, HOME_TITLE, SITE_NAME, SITE_URL } from "@/lib/site";

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
      logo: new URL("/favicon.ico", SITE_URL).href,
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
      "@type": "SoftwareApplication",
      "@id": applicationId,
      name: SITE_NAME,
      url: SITE_URL.href,
      description: HOME_DESCRIPTION,
      applicationCategory: "DesignApplication",
      operatingSystem: "Web browser",
      image: new URL("/od_flower1.jpg", SITE_URL).href,
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
        url: "/od_flower1.jpg",
        width: 2380,
        height: 3200,
        alt: "OpenDiagram artwork combining a flower with connected diagram nodes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: ["/od_flower1.jpg"],
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
    <SmoothScrollProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <LandingPage />
    </SmoothScrollProvider>
  );
}
