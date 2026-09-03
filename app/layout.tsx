import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Šarados — lietuviškos šarados";
const description =
  "Perduok telefoną, vaidink ir spėk. Lietuviškos šarados draugams.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost")
        ? "http"
        : "https";
  let origin = "http://localhost";
  try {
    origin = new URL(protocol + "://" + host).origin;
  } catch {
    // Keep a valid local fallback if an intermediary supplied a malformed host.
  }

  return {
    title,
    description,
    metadataBase: new URL(origin),
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title,
      description,
      locale: "lt_LT",
      type: "website",
      images: [
        {
          url: origin + "/og.png",
          width: 1536,
          height: 909,
          alt: "Šarados — žodis tavo, scena irgi.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [origin + "/og.png"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f4f0e6",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="lt">
      <body>{children}</body>
    </html>
  );
}
