import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SubScribr — Find every subscription hiding in your inbox",
  description:
    "AI-native subscription manager. Connects to Gmail (read-only), reads bilingual receipts across multiple currencies, and tells you exactly what to cancel each week — with the original email as proof.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Apply the saved theme class before the page paints to avoid a flash.
            No saved value = follow the OS preference (handled in CSS). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.classList.add(t)}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
