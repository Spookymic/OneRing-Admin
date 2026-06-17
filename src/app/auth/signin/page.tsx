"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#01031B]">
      {/* Gradient radial en bas de page (footer gradient brand) */}
      <div
        className="fixed bottom-0 left-0 right-0 h-64 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at bottom center, rgba(216,52,110,0.35) 0%, rgba(216,52,110,0.12) 40%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-6 py-10 flex flex-col items-center gap-8">
        {/* Logo + nom */}
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src="/logo.png"
            alt="OneRing Admin"
            width={72}
            height={72}
            className="rounded-2xl"
            priority
          />
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              OneRing Admin
            </h1>
            <p className="text-sm text-white/50 mt-1">
              Administration Microsoft 365
            </p>
          </div>
        </div>

        {/* Card connexion */}
        <div className="w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">Connexion</p>
            <p className="text-xs text-white/50">
              Utilisez votre compte Microsoft administrateur pour accéder au portail.
            </p>
          </div>

          <Button
            className="w-full bg-[#D8346E] hover:bg-[#c22860] text-white border-0"
            onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
          >
            <svg className="h-4 w-4 mr-2 shrink-0" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#F35325" />
              <rect x="11" y="1" width="9" height="9" fill="#81BC06" />
              <rect x="1" y="11" width="9" height="9" fill="#05A6F0" />
              <rect x="11" y="11" width="9" height="9" fill="#FFBA08" />
            </svg>
            Se connecter avec Microsoft
          </Button>

          <p className="text-xs text-center text-white/25">
            Accès réservé aux administrateurs M365
          </p>
        </div>

        <p className="text-xs text-white/20">OneRing Admin v1.11.0</p>
      </div>
    </div>
  );
}
