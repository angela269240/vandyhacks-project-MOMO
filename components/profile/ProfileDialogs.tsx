"use client";

import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GRAPH_KEY } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/client/api";
import { uploadAvatar } from "@/lib/client/profile";
import type { User } from "@/lib/types";
import { ProfileForm } from "./ProfileForm";

export function CreateProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { setIdentity } = useMe();
  const { mutate } = useSWRConfig();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Put yourself on the map</DialogTitle>
          <DialogDescription>
            Make a quick profile to join groups, chat, and connect. No account needed for the demo.
          </DialogDescription>
        </DialogHeader>
        <ProfileForm
          submitLabel="Create profile"
          onSubmit={async ({ avatarFile, ...values }) => {
            const { user, deviceKey } = await api<{ user: User; deviceKey: string }>("/api/users", {
              body: values,
              identity: null,
            });
            const identity = { userId: user.id, deviceKey };
            if (avatarFile) await uploadAvatar(identity, avatarFile).catch(() => toast.error("Couldn't upload your photo"));
            setIdentity(identity);
            mutate(GRAPH_KEY);
            onOpenChange(false);
            toast.success(`Welcome, ${user.name.split(" ")[0]}!`, { description: "Click a group bubble to step inside." });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditProfileSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { me, identity, refreshMe } = useMe();
  const { mutate } = useSWRConfig();
  if (!me || !identity) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto p-5 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle className="font-heading text-lg">Your profile</SheetTitle>
          <SheetDescription>Changes show up on everyone&apos;s map right away.</SheetDescription>
        </SheetHeader>
        <ProfileForm
          key={me.id}
          initial={me}
          submitLabel="Save changes"
          onSubmit={async ({ avatarFile, ...values }) => {
            await api(`/api/users/${me.id}`, { method: "PATCH", body: values });
            if (avatarFile) await uploadAvatar(identity, avatarFile);
            await Promise.all([refreshMe(), mutate(GRAPH_KEY)]);
            onOpenChange(false);
            toast.success("Profile updated");
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
