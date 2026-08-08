import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matt's Deal Screener",
  description: "Matt's private New Jersey and Chester County, Pennsylvania development opportunity screening system.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
