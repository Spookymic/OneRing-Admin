import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "OneRing Admin",
  description: "Outil d'administration Microsoft 365",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${plusJakartaSans.variable} ${plusJakartaSans.className}`}>
        {/* SVG masqué — filtres daltonisme pour l'accessibilité */}
        <svg className="hidden" aria-hidden="true" focusable="false">
          <defs>
            <filter id="a11y-protanopia">
              <feColorMatrix
                type="matrix"
                values="0.152 1.053 -0.205 0 0
                        0.115 0.786  0.099 0 0
                       -0.004 -0.048 1.052 0 0
                        0     0      0     1 0"
              />
            </filter>
            <filter id="a11y-deuteranopia">
              <feColorMatrix
                type="matrix"
                values="0.367 0.861 -0.228 0 0
                        0.280 0.673  0.047 0 0
                       -0.012 0.043  0.969 0 0
                        0     0      0     1 0"
              />
            </filter>
            <filter id="a11y-tritanopia">
              <feColorMatrix
                type="matrix"
                values="1.256 -0.077 -0.179 0 0
                       -0.078  0.931  0.148 0 0
                        0.005  0.692  0.303 0 0
                        0      0      0     1 0"
              />
            </filter>
          </defs>
        </svg>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
