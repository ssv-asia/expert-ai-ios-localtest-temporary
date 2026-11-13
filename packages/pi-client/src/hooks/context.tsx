import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { PiClient } from "../core/pi-client";
import type { PiClientConfig } from "../types";

const PiClientContext = createContext<PiClient | null>(null);

export interface PiClientProviderProps {
  config: PiClientConfig;
  children: ReactNode;
}

export function PiClientProvider({ config, children }: PiClientProviderProps) {
  const configured = !!config.serverUrl && !!config.accessToken;
  // A PiClient is bound to one server URL. Recreate the client when the active
  // server changes, but keep this Provider component (and its route children)
  // mounted. Keying the Provider itself remounts Expo Router's nested navigator
  // while pairing is saving the newly discovered server.
  const clientRef = useRef<{
    serverUrl: string;
    configured: boolean;
    client: PiClient;
  } | null>(null);
  if (
    !clientRef.current ||
    clientRef.current.serverUrl !== config.serverUrl ||
    clientRef.current.configured !== configured
  ) {
    clientRef.current = {
      serverUrl: config.serverUrl,
      configured,
      client: new PiClient(config),
    };
  }
  const client = clientRef.current.client;

  useEffect(() => {
    if (!configured) return;
    client.connect();
    return () => client.disconnect();
  }, [client, configured]);

  useEffect(() => {
    const tokenChanged = client.api.accessToken !== config.accessToken;
    client.updateToken(config.accessToken);
    // The SSE request captures its bearer token when it opens, so reconnect on
    // every refresh. The stream reads the mutable token for subsequent retries.
    if (tokenChanged && configured) client.reconnect();
  }, [client, config.accessToken, configured]);

  return (
    <PiClientContext.Provider value={client}>
      {children}
    </PiClientContext.Provider>
  );
}

export function usePiClient(): PiClient {
  const client = useContext(PiClientContext);
  if (!client) {
    throw new Error("usePiClient must be used within a <PiClientProvider>");
  }
  return client;
}
