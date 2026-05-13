import type { Metadata } from "next";
import { Jost } from "next/font/google";
import "./globals.css";

// Ajout de display: "swap" pour un rendu optimal sans erreur
const jost = Jost({
  subsets: ["latin"],
  display: "swap",
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
      {/* La balise <head> manuelle a été supprimée, Next.js s'occupe du favicon grâce à "metadata" */}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}