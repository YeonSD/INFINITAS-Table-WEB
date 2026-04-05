interface Window {
  __ITM_RUNTIME_CONFIG__?: {
    supabaseUrl?: string;
    supabasePublishableKey?: string;
  };
  supabase?: {
    createClient: (...args: unknown[]) => any;
  };
  html2canvas?: (...args: unknown[]) => Promise<HTMLCanvasElement>;
}
