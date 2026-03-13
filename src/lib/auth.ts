import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

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
            "openid profile email offline_access User.ReadWrite.All Group.ReadWrite.All GroupMember.ReadWrite.All Directory.ReadWrite.All Organization.Read.All MailboxSettings.ReadWrite",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account }) {
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

    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile?.email) {
        token.email = profile.email;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
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
