import { type ReactNode } from "react";
import { Platform } from "react-native";
import { createPortal } from "react-dom";

interface PortalProps {
  children: ReactNode;
}

export function Portal({ children }: PortalProps) {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    return createPortal(children, document.body);
  }
  return <>{children}</>;
}
