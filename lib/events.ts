import "server-only";
import { EventEmitter } from "node:events";
import { LOBBY_ROOM, groupRoom, livekitConfigured, sendRoomData } from "./livekit";
import type { LobbyEvent, RoomEvent } from "./types";

/**
 * Event fan-out. With LiveKit configured, events go out as data packets (works across serverless instances).
 * Without it, an in-process bus feeds the SSE endpoint, which is enough for single-process local dev.
 */
const g = globalThis as unknown as { __socialMapperBus?: EventEmitter };
export const bus = (g.__socialMapperBus ??= new EventEmitter().setMaxListeners(500));

export const lobbyChannel = LOBBY_ROOM;
export const groupChannel = groupRoom;

async function publish(channel: string, event: LobbyEvent | RoomEvent) {
  bus.emit(channel, event);
  if (livekitConfigured()) await sendRoomData(channel, event);
}

export const broadcastLobby = (event: LobbyEvent) => publish(lobbyChannel, event);
export const broadcastRoom = (groupId: number, event: RoomEvent) => publish(groupChannel(groupId), event);
