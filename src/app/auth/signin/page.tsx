"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">M365 Administrator</CardTitle>
          <CardDescription>
            Connectez-vous avec votre compte Microsoft administrateur
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
          >
            Se connecter avec Microsoft
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
