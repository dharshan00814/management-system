// Type definitions for Supabase Edge Functions (Deno runtime)
// Resolves ambient Deno runtime globals and HTTPS URL module imports in IDEs

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  }
  export const env: Env;
}

declare module 'https://deno.land/std@0.177.0/http/server.ts' {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: {
      port?: number;
      signal?: AbortSignal;
      onListen?: (params: { port: number; hostname: string }) => void;
    }
  ): void | Promise<void>;
}

declare module 'https://esm.sh/@supabase/supabase-js@2.39.0' {
  export const createClient: (supabaseUrl: string, supabaseKey: string, options?: any) => any;
  export type SupabaseClient = any;
  const content: any;
  export default content;
}

declare module 'https://*' {
  const content: any;
  export default content;
  export const serve: any;
  export const createClient: any;
}
