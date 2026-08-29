import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GameProvider } from '@/context/GameContext';
import { SocketProvider } from '@/context/SocketContext';
import { AccountProvider } from '@/context/AccountContext';
import { FriendsProvider } from '@/context/FriendsContext';
import ServiceWorker from '@/components/ServiceWorker';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Dames sénégalaises";
const description =
  "Le jeu de dames à la sénégalaise : plateau 5×5, prises obligatoires et rafles. Jouez seul, à deux sur un téléphone, ou relevez le défi du jour.";

/**
 * Sans ces métadonnées, un lien partagé sur une messagerie n'affichait qu'une
 * vignette vide — ce qui divise le taux de clic dans le principal canal de
 * partage du jeu.
 */
export const metadata: Metadata = {
  title,
  description,
  applicationName: title,
  manifest: "/manifest.webmanifest",
  openGraph: {
    title,
    description,
    type: "website",
    locale: "fr_SN",
    siteName: title,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  appleWebApp: {
    capable: true,
    title,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ede6d8" },
    { media: "(prefers-color-scheme: dark)", color: "#131a26" },
  ],
  width: "device-width",
  initialScale: 1,
  // Le plateau tient dans l'écran : le zoom accidentel gêne plus qu'il n'aide.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AccountProvider>
          <FriendsProvider>
            <SocketProvider>
              <GameProvider>
                {children}
                <ServiceWorker />
              </GameProvider>
            </SocketProvider>
          </FriendsProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
