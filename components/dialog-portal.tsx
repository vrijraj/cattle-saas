"use client";

import { createContext, useContext } from "react";

export const DialogPortalContext = createContext<React.RefObject<HTMLElement | null> | null>(null);

export function useDialogPortal() {
  return useContext(DialogPortalContext);
}
