"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/icons";
import { LogCareSheet, type LogPlant } from "@/components/log-care-sheet";

/** Today's "Log care": record something done without a reminder, for one or more plants. */
export function LogCareButton({ plants }: { plants: LogPlant[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-leaf font-medium text-leaf"
      >
        <PlusIcon size={20} className="shrink-0" />
        Log care you did
      </button>
      <LogCareSheet open={open} initialType={null} onClose={() => setOpen(false)} plants={plants} />
    </>
  );
}
