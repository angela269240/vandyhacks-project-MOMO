"use client";

import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { refreshGraph } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/client/api";
import { uploadAvatar } from "@/lib/client/profile";
import { ProfileForm } from "./ProfileForm";

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
            await Promise.all([refreshMe(), refreshGraph(mutate)]);
            onOpenChange(false);
            toast.success("Profile updated");
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
