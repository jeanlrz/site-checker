import type { Metadata } from "next";
import { Jost } from "next/font/google";
import "./globals.css";

const jost = Jost({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Site Checker — Com d'Artisans",
  description: "Outil interne de vérification de sites avant livraison",
  icons: {
    icon: "/favicon-officiel.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${jost.className} h-full antialiased`}>
      <head>
        <link rel="icon" href="/favicon-officiel.png" type="image/png" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
