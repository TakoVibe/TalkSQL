import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalkSQL — Ask your data",
  description: "A safe conversational workspace for your databases.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
