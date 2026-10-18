"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CATEGORIES } from "@/lib/categories";
import { hueVar, preferredHue } from "@/lib/colors";
import { ApiError, api } from "@/lib/client/api";
import { categorySchema, groupNameSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";
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
  const [category, setCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // preview of the bubble's starting hue (the map may shift it to stand apart from its neighbors)
  const color = hueVar(preferredHue(name || "x"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = groupNameSchema.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    const cat = categorySchema.safeParse(category);
    if (!cat.success) return setError("Pick a category tag");
    setBusy(true);
    try {
      const group = await api<Group>("/api/groups", { body: { name: parsed.data, category: cat.data } });
      setName("");
      setCategory(null);
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
      <DialogContent className="sm:max-w-md">
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
              style={{ background: color }}
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
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Category tag</div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  onClick={() => {
                    setCategory(c);
                    setError(null);
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition",
                    category === c
                      ? "border-primary/70 bg-primary/15 text-foreground"
                      : "border-foreground/15 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || !name.trim() || !category} className="h-9">
            {busy && <Loader2 className="animate-spin" />}
            Create and join
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
