import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

/**
 * `globals.css` already declared `--font-geist-sans` and `--font-geist-mono` in
 * its Tailwind theme, but nothing ever defined them — `next/font` was not
 * imported anywhere, so both resolved to nothing and a hardcoded
 * `font-family: Arial, Helvetica` on `body` was doing the real work. Leftover
 * from the create-next-app scaffold: the theme kept pointing at a font the
 * layout had stopped loading.
 *
 * `cyrillic` is in the subset list because the community language picker offers
 * Русский. Arabic, Hindi and CJK are offered too and Geist covers none of them;
 * those fall back to a system font, which is true of Inter as well and is not
 * something a Latin typeface can fix.
 */
const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin", "latin-ext", "cyrillic"],
    display: "swap",
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin", "latin-ext", "cyrillic"],
    display: "swap",
});

/**
 * Title and description track copy v3's hero. The previous pair predated the
 * rename and still said "swarm", which no longer appears anywhere a reader can
 * see — including, until now, the browser tab and every search result.
 */
export const metadata: Metadata = {
  title: {
    default: "Mindfully — Moderation with memory",
    template: "%s",
  },
  description:
    "A filter sees a message. Mindfully sees the pattern. Five specialized AI agents with shared memory that learn your rules, remember what happened before, and catch patterns a message-by-message filter misses.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`h-full antialiased ${geistSans.variable} ${geistMono.variable}`}
      >
        <body className="min-h-full flex flex-col font-sans">{children}</body>
      </html>
    </ClerkProvider>
  );
}
