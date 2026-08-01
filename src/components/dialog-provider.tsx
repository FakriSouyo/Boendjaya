"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type DialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  showError: (message: string) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within <DialogProvider>");
  return ctx;
}

type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };
type ToastItem = { id: number; message: string };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => setConfirmState({ ...options, resolve }));
  }, []);

  const showError = useCallback((message: string) => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, message }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  const closeConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, showError }}>
      {children}

      {confirmState && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/30 sm:place-items-center sm:p-5">
          <div className="w-full max-w-md bg-white sm:border-2 sm:border-[#ef4130]">
            <div className="flex items-center justify-between bg-[#ef4130] px-4 py-3 text-white">
              <h2 className="font-black">{confirmState.title}</h2>
              <Button sound="overlay.close" variant="ghost" size="icon" onClick={() => closeConfirm(false)} className="rounded-none text-white hover:bg-white/10"><X/></Button>
            </div>
            <div className="p-5">
              <p className="text-sm leading-relaxed text-zinc-600">{confirmState.message}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button sound="overlay.close" variant="outline" onClick={() => closeConfirm(false)} className="rounded-none">{confirmState.cancelLabel ?? "BATAL"}</Button>
                <Button sound="interaction.confirm" onClick={() => closeConfirm(true)} className="rounded-none">{confirmState.confirmLabel ?? "HAPUS"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 border-2 border-[#ef4130] bg-white p-3 shadow-lg">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#ef4130] text-white"><AlertTriangle className="size-3.5"/></span>
            <p className="flex-1 text-xs leading-relaxed">{t.message}</p>
            <button type="button" onClick={() => setToasts(x => x.filter(y => y.id !== t.id))} className="text-zinc-400 hover:text-[#e73b28]" aria-label="Tutup"><X className="size-4"/></button>
          </div>
        ))}
      </div>
    </DialogContext.Provider>
  );
}
