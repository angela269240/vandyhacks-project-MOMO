"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { colorForName } from "@/lib/colors";
import { ApiError, api } from "@/lib/client/api";
import { groupNameSchema } from "@/lib/schemas";
import type { Group } from "@/lib/types";

export function NewGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (group: Group) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const color = colorForName(name || "x");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = groupNameSchema.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    try {
      const group = await api<Group>("/api/groups", { body: { name: parsed.data } });
      setName("");
      setError(null);
      onOpenChange(false);
      onCreated(group);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "That name is taken. Try another." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Start an interest group</DialogTitle>
          <DialogDescription>
            Anyone can drop in. It fades away 24 hours after the last person leaves.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="relative">
            <span
              aria-hidden
              className="absolute top-1/2 left-3 size-3 -translate-y-1/2 rounded-full transition-colors"
              style={{ background: color, boxShadow: `0 0 10px ${color}` }}
            />
            <Input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Linear Algebra Night Owls"
              maxLength={60}
              className="pl-8"
              aria-invalid={Boolean(error)}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || !name.trim()} className="h-9">
            {busy && <Loader2 className="animate-spin" />}
            Create and join
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
