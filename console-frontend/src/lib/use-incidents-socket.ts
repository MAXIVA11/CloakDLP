"use client";

import { useEffect, useRef } from "react";

import { incidentsWebSocketUrl } from "@/lib/api";
import type { Incident } from "@/lib/types";

type IncidentEvent =
  | { type: "incident.created"; incident: Incident }
  | { type: "incident.updated"; incident: Incident };

export function useIncidentsSocket(token: string | null, onEvent: (event: IncidentEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!token) return;

    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByCleanup = false;

    const connect = () => {
      socket = new WebSocket(incidentsWebSocketUrl(token));
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as IncidentEvent;
          onEventRef.current(data);
        } catch {
          // ignore malformed frames
        }
      };
      socket.onclose = () => {
        if (!closedByCleanup) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [token]);
}
