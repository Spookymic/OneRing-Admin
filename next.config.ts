import type { NextConfig } from "next";

// En-têtes de sécurité appliqués à toutes les réponses.
// Note : HSTS n'est pas défini ici — il est géré au niveau du reverse-proxy Caddy
// (couche TLS), et volontairement désactivé tant que le certificat n'est pas
// publiquement reconnu (voir Caddyfile).
const securityHeaders = [
  // Anti-clickjacking : interdit l'affichage de l'app dans une iframe tierce.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Empêche le MIME-sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Limite la fuite du référent vers des origines tierces.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Désactive des API navigateur non utilisées par l'app.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
