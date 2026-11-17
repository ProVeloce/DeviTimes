/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  electronAPI?: {
    isDesktop: boolean;
    printThermal: (html: string) => Promise<void>;
    notify: (title: string, body: string) => Promise<void>;
    platform: string;
  };
}
