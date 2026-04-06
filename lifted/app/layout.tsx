import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lifted | Digital Prototype",
  description: "Two-player asymmetric communication game prototype",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
