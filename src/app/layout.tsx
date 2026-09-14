import type { Metadata, Viewport } from "next";
import { Archivo, Courier_Prime, Instrument_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const courierPrime = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-courier-prime",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rehearse — run your sides out loud",
  description:
    "Upload your sides, pick your part, and run the scene against voiced scene partners. Built for self-tape auditions.",
};

export const viewport: Viewport = {
  themeColor: "#0c0f14",
  width: "device-width",
  initialScale: 1,
};

/** Clerk's chrome, dressed in the app's own materials rather than its defaults. */
const clerkAppearance = {
  variables: {
    colorPrimary: "#f2b705",
    colorBackground: "#11151b",
    colorText: "#f2ead9",
    colorTextSecondary: "#98a5b4",
    colorInputBackground: "#1a222c",
    colorInputText: "#f2ead9",
    colorDanger: "#ff4d42",
    colorNeutral: "#98a5b4",
    fontFamily: "var(--font-instrument), ui-sans-serif, system-ui, sans-serif",
    borderRadius: "2px",
  },
  elements: {
    formButtonPrimary:
      "bg-marker text-ink hover:bg-[#ffc736] normal-case tracking-[0.16em] uppercase text-[0.6875rem] font-semibold",
    card: "bg-stage-800 border border-stage-700 shadow-[0_28px_70px_-34px_rgba(0,0,0,0.85)]",
    headerTitle: "text-paper",
    headerSubtitle: "text-muted",
  },
} as const;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${archivo.variable} ${instrument.variable} ${courierPrime.variable} antialiased`}
      >
        <ClerkProvider appearance={clerkAppearance}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
