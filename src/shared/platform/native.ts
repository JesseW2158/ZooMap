/** Whether the page runs inside the Android (Capacitor) shell rather than a plain browser. */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

type ExternalAuthHandler = (url: string) => void;

let handler: ExternalAuthHandler = (url) => {
  window.location.assign(url);
};

/**
 * Open an OAuth URL (for example `/api/schedule/google/connect`). In a browser this is a
 * same-window redirect; the Android shell calls `setExternalAuthHandler` to open the system
 * browser instead, because Google refuses OAuth inside a WebView.
 */
export function openExternalAuth(url: string): void {
  handler(url);
}

/** Replace how `openExternalAuth` opens a URL. Returns a function that restores the previous handler. */
export function setExternalAuthHandler(next: ExternalAuthHandler): () => void {
  const previous = handler;
  handler = next;
  return () => {
    handler = previous;
  };
}
