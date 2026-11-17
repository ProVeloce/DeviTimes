export type GoogleCodeResponse = { code?: string; error?: string };
export type GoogleCodeClient = { requestCode: () => void };
export type GoogleCodeClientConfig = {
  client_id: string;
  scope: string;
  ux_mode: 'popup';
  select_account: boolean;
  callback: (response: GoogleCodeResponse) => void;
  error_callback: (error: { type: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: GoogleCodeClientConfig) => GoogleCodeClient;
        };
      };
    };
  }
}
