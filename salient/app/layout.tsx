import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Salient",
  description: "Cited drug-safety signal response for synthetic FHIR panels"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
