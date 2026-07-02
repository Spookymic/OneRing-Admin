"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldX, AlertTriangle } from "lucide-react";

const ERROR_MESSAGES: Record<string, { icon: React.ElementType; title: string; body: string; color: string }> = {
  AccessDenied: {
    icon: ShieldX,
    title: "Accès refusé",
    body: "Votre compte Microsoft ne dispose pas des droits d'administration requis pour accéder à OneRing Admin. Un rôle Azure AD est nécessaire (Global Admin, User Admin, Helpdesk Admin…). Contactez votre administrateur.",
    color: "text-red-600",
  },
  RoleCheckFailed: {
    icon: AlertTriangle,
    title: "Vérification impossible",
    body: "La vérification de vos droits d'administration a échoué. Veuillez réessayer. Si le problème persiste, vérifiez que l'application dispose du consentement admin dans Azure AD.",
    color: "text-amber-600",
  },
};

function AuthErrorContent() {
  const params = useSearchParams();
  const error = params.get("error") ?? "";

  const msg = ERROR_MESSAGES[error];
  const Icon = msg?.icon ?? AlertTriangle;
  const title = msg?.title ?? "Erreur d'authentification";
  const body = msg?.body ?? error ?? "Une erreur est survenue lors de la connexion.";
  const color = msg?.color ?? "text-red-600";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#01031B]">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="p-3 rounded-full bg-red-50 dark:bg-red-950/40">
              <Icon className={`h-8 w-8 ${color}`} />
            </div>
          </div>
          <CardTitle className={`text-xl ${color}`}>{title}</CardTitle>
          <CardDescription className="text-sm leading-relaxed mt-2">{body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/auth/signin" className="block w-full">
            <Button className="w-full bg-primary hover:bg-[#c02860]">Réessayer</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#01031B] text-white">Chargement...</div>}>
      <AuthErrorContent />
    </Suspense>
  );
}
