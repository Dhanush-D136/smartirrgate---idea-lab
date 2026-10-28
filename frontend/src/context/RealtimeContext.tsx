import React, { createContext, useContext, useEffect, useState } from 'react';

interface RealtimeContextType {
  isConnected: boolean;
  lastMessage: any | null;
}

const RealtimeContext = createContext<RealtimeContextType>({
  isConnected: false,
  lastMessage: null
});

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastMessage, setLastMessage] = useState<any | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live`;
      
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setLastMessage(data);
          } catch (err) {
            console.error('Error parsing WS message', err);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          // Try to reconnect in 4 seconds
          reconnectTimeout = setTimeout(connect, 4000);
        };

        ws.onerror = () => {
          setIsConnected(false);
        };
      } catch (e) {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 5000);
      }
    }

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ isConnected, lastMessage }}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => useContext(RealtimeContext);
