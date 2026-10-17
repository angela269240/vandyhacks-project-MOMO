import { MapScene } from "@/components/map/MapScene";

/** The map stays mounted for every page in this group; rooms render as an overlay on top of it. */
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MapScene />
      {children}
    </>
  );
}
