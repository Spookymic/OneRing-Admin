"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";

function AuthErrorContent() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-red-600">Erreur d&apos;authentification</CardTitle>
          <CardDescription>{error ?? "Une erreur est survenue lors de la connexion."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/auth/signin" className="block w-full">
            <Button className="w-full">Réessayer</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Chargement...</div>}>
      <AuthErrorContent />
    </Suspense>
  );
}
