import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyTotp } from "@/lib/totp";

/**
 * Template IDs des rôles Azure AD acceptés pour accéder à l'application.
 * Source : https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference
 */
const ADMIN_ROLE_TEMPLATE_IDS = new Set([
  "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
  "fe930be7-5e62-47db-91af-98c3a49a38b1", // User Administrator
  "729827e3-9c14-49f7-bb1b-9608f156bbb8", // Helpdesk Administrator
  "4d6ac14f-3453-41d0-bef9-a3e0c569773a", // License Administrator
  "fdd7a751-b60b-444a-984c-02652fe8fa1c", // Groups Administrator
  "88d8e3e3-8f55-4a1e-953a-9b9898b8876b", // Directory Readers
  "29232cdf-9323-42fd-ade2-1d097af3e4de", // Exchange Administrator
  "194ae4cb-b126-40b2-bd5b-6091b380977d", // Security Administrator
  "c4e39bd9-1100-46d3-8c65-fb160da0071f", // Authentication Administrator
  "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", // Application Administrator
  "69091246-20e8-4a56-aa4d-066075b2a7a8", // Teams Administrator
]);

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope:
            "openid profile email offline_access User.ReadWrite.All Group.ReadWrite.All GroupMember.ReadWrite.All Directory.ReadWrite.All Organization.Read.All MailboxSettings.ReadWrite UserAuthenticationMethod.Read.All AuditLog.Read.All Application.Read.All",
        },
      },
    }),
    // Compte administrateur local — accès de secours, gestion de l'application uniquement (aucun accès Graph).
    CredentialsProvider({
      id: "local",
      name: "Compte local",
      credentials: {
        username: { label: "Identifiant", type: "text" },
        password: { label: "Mot de passe", type: "password" },
        totp: { label: "Code 2FA", type: "text" },
      },
      async authorize(creds) {
        if (!creds?.username || !creds?.password) return null;
        const admin = await prisma.localAdmin.findUnique({ where: { username: creds.username } });
        if (!admin) return null;
        // Verrouillage anti-brute-force
        if (admin.lockedUntil && admin.lockedUntil > new Date()) return null;
        const passwordOk = await bcrypt.compare(creds.password, admin.passwordHash);
        // Si la 2FA est active, le code TOTP doit également être valide
        const totpOk = admin.totpEnabled
          ? verifyTotp(creds.totp ?? "", admin.totpSecret ?? "")
          : true;
        const ok = passwordOk && totpOk;
        if (!ok) {
          const failed = admin.failedAttempts + 1;
          await prisma.localAdmin.update({
            where: { id: admin.id },
            data: {
              failedAttempts: failed,
              // 5 échecs → verrouillage 15 min
              lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
            },
          });
          return null;
        }
        if (admin.failedAttempts > 0 || admin.lockedUntil) {
          await prisma.localAdmin.update({
            where: { id: admin.id },
            data: { failedAttempts: 0, lockedUntil: null },
          });
        }
        return { id: admin.id, name: admin.username, email: admin.username };
      },
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      // Compte local : validé par le provider credentials (authorize)
      if (account?.provider === "local") return true;
      if (!account?.access_token) return false;

      try {
        const resp = await fetch(
          "https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.directoryRole?$select=roleTemplateId",
          { headers: { Authorization: `Bearer ${account.access_token}` } }
        );

        if (!resp.ok) return "/auth/error?error=RoleCheckFailed";

        const data = await resp.json();
        const userRoleIds: string[] = (data.value ?? []).map((r: any) => r.roleTemplateId);
        const hasAdminRole = userRoleIds.some((id) => ADMIN_ROLE_TEMPLATE_IDS.has(id));

        return hasAdminRole ? true : "/auth/error?error=AccessDenied";
      } catch {
        return "/auth/error?error=RoleCheckFailed";
      }
    },

    async jwt({ token, account, profile, user }) {
      if (account?.provider === "local") {
        token.role = "local";
        token.accessToken = undefined;
        if (user?.email) token.email = user.email;
      }
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.role = "graph";
      }
      if (profile?.email) {
        token.email = profile.email;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.role = token.role as "graph" | "local" | undefined;
      if (session.user && token.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8h max absolu — l'inactivité est gérée côté client
  },
};
