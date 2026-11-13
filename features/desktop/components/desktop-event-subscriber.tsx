import { useEffect } from 'react';
import { usePiClient } from '@expertai/client';
import { useDesktopStore } from '../store';

export function DesktopEventSubscriber() {
  const client = usePiClient();
  const setDesktopInfo = useDesktopStore((s) => s.setDesktopInfo);

  useEffect(() => {
    const sub = client.events$.subscribe((event) => {
      if (event.type === 'desktop_status' && event.data) {
        setDesktopInfo(event.data);
      }
    });
    return () => sub.unsubscribe();
  }, [client, setDesktopInfo]);

  return null;
}

