import { AuthGate } from "@/components/auth/AuthGate";
import { MapScene } from "@/components/map/MapScene";
import { RoomConnectionProvider } from "@/components/room/RoomConnection";

/**
 * The map stays mounted for every page in this group; rooms render as an overlay on top of it.
 * The live room connection sits above both, so minimizing a room (going back to the map) keeps you in it.
 * Until this tab has entered Orbit, the login screen stands in for all of it.
 */
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <RoomConnectionProvider>
        <MapScene />
        {children}
      </RoomConnectionProvider>
    </AuthGate>
  );
}
