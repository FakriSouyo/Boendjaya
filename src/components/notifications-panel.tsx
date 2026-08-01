"use client";

import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";
import type { NotificationItem } from "@/lib/types";

type Props = {
  notifications: NotificationItem[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
};

export function NotificationBell({ notifications, open, onToggle, onClose, onMarkRead, onMarkAllRead }: Props) {
  const unread = notifications.filter(n => !n.isRead).length;

  return <>
    <Button sound="notification.info" variant="outline" size="icon" onClick={onToggle} className="relative rounded-none" aria-expanded={open} aria-label="Notifikasi">
      <Bell className="size-4"/>
      {unread > 0 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-[#ef4130] text-[9px] text-white">{unread}</span>}
    </Button>
    {open && <div className="fixed inset-0 z-40" onClick={onClose} role="presentation">
      <div className="absolute right-4 top-14 w-[min(100vw-2rem,22rem)] border-2 border-[#ef4130] bg-white shadow-xl sm:right-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#e8ddd8] bg-[#ef4130] px-4 py-3 text-white">
          <div><p className="font-mono text-[9px] uppercase tracking-widest opacity-80">Pusat notifikasi</p><h2 className="font-black">NOTIFIKASI</h2></div>
          <div className="flex gap-1">
            {unread > 0 && <Button sound="interaction.subtle" variant="ghost" onClick={onMarkAllRead} className="h-auto rounded-none px-2 py-1 text-[10px] text-white hover:bg-white/15">Tandai dibaca</Button>}
            <Button sound="overlay.close" variant="ghost" size="icon" onClick={onClose} className="rounded-none text-white hover:bg-white/15"><X className="size-4"/></Button>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? <p className="p-6 text-center text-xs text-zinc-400">Tidak ada notifikasi</p>
            : notifications.map(n => <button key={n.id} type="button" onClick={() => onMarkRead(n.id)} className={`w-full border-b border-[#e8ddd8] px-4 py-3 text-left transition-colors hover:bg-[#fff0ec] ${n.isRead ? "opacity-60" : ""}`}>
              <p className="text-xs font-bold">{n.title}</p>
              {n.body && <p className="mt-1 font-mono text-[10px] text-zinc-500">{n.body}</p>}
              {!n.isRead && <span className="mt-2 inline-block bg-[#ef4130] px-1.5 py-0.5 font-mono text-[8px] text-white">BARU</span>}
            </button>)}
        </div>
      </div>
    </div>}
  </>;
}
