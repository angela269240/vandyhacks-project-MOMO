"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { useRoomConnection } from "@/components/room/RoomConnection";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { refreshGraph } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/client/api";
import { uploadAvatar } from "@/lib/client/profile";
import { ProfileForm } from "./ProfileForm";

export function EditProfileSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { me, identity, refreshMe, signOut } = useMe();
  const { leave } = useRoomConnection();
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
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
        <div className="mt-5 border-t border-border pt-5">
          <Button
            type="button"
            variant="outline"
            disabled={loggingOut}
            aria-busy={loggingOut}
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={async () => {
              setLoggingOut(true);
              try {
                await leave();
              } finally {
                onOpenChange(false);
                signOut();
                router.replace("/");
              }
            }}
          >
            {loggingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
            Log out
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Your profile stays saved on this device.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
