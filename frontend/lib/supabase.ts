import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        // Set the recruiter session header so the RLS policy passes.
        // The middleware ensures we only render this client on /recruiter routes
        // when the cookie is present.
        headers: { "x-recruiter-session": "true" },
      },
    },
  );
}
