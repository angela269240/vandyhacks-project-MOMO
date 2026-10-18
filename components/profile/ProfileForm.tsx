"use client";

import { Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useInterests } from "@/hooks/useGraph";
import { identityColor, interestColor } from "@/lib/colors";
import { profileSchema } from "@/lib/schemas";
import type { ProfileInput } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";

export type ProfileFormValues = ProfileInput & { avatarFile: Blob | null };

const MIN_TAGS = 3;
const MAX_TAGS = 6;

/** Square-crops and downsizes an image to a small JPEG before upload. */
async function toAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/jpeg", 0.85),
  );
}

export function ProfileForm({
  initial,
  submitLabel,
  submitClassName,
  onSubmit,
}: {
  initial?: Partial<ProfileInput>;
  submitLabel: string;
  submitClassName?: string;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
}) {
  const interests = useInterests();
  const [name, setName] = useState(initial?.name ?? "");
  const [linkedin, setLinkedin] = useState(initial?.linkedin ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [tags, setTags] = useState<number[]>(initial?.interestIds ?? []);
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(initial?.avatarUrl ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (id: number) =>
    setTags((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= MAX_TAGS ? t : [...t, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = profileSchema.safeParse({ name, linkedin, bio, interestIds: tags });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit({ ...parsed.data, avatarFile });
    } catch (err) {
      setErrors({ form: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const tagColor = identityColor({ interestIds: tags });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label="Upload a photo"
        >
          <Avatar name={name || "?"} url={preview} color={tagColor} size={64} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100">
            <Camera className="size-5 text-white" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const blob = await toAvatarBlob(file);
              setAvatarFile(blob);
              setPreview(URL.createObjectURL(blob));
            } catch {
              setErrors((x) => ({ ...x, avatar: "Couldn't read that image" }));
            }
          }}
        />
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="pf-name">Name *</Label>
          <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>
      </div>
      {errors.avatar && <p className="-mt-2 text-xs text-destructive">{errors.avatar}</p>}

      <div className="space-y-1.5">
        <Label htmlFor="pf-linkedin">LinkedIn</Label>
        <Input
          id="pf-linkedin"
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          placeholder="linkedin.com/in/your-name"
        />
        {errors.linkedin && <p className="text-xs text-destructive">{errors.linkedin}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="pf-bio">Short bio</Label>
          <span className="text-xs text-muted-foreground tabular-nums">{bio.length}/280</span>
        </div>
        <Textarea
          id="pf-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 280))}
          placeholder="What are you learning? What are you into?"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label>Interests *</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {tags.length}/{MAX_TAGS} · pick at least {MIN_TAGS}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {interests.map((i) => {
            const on = tags.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(i.id)}
                disabled={!on && tags.length >= MAX_TAGS}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-40",
                  on ? "tag-active" : "border-foreground/15 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
                style={{ "--tag": interestColor(i.id) } as React.CSSProperties}
              >
                {i.name}
              </button>
            );
          })}
        </div>
        {errors.interestIds && <p className="text-xs text-destructive">{errors.interestIds}</p>}
      </div>

      {errors.form && (
        <p role="alert" className="text-sm text-destructive">
          {errors.form}
        </p>
      )}
      <Button type="submit" size="lg" disabled={submitting} aria-busy={submitting} className={cn("mt-1 h-10", submitClassName)}>
        {submitting && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
