import type { RampId } from "./field";

/**
 * The map modes the user can pick between.
 *   ramp   which colour scale the crowd field uses; null means no heat at all
 *   grass  whether the campus grass and parking stay visible under the heat
 *   devOnly offered only when NEXT_PUBLIC_DEV_TOOLS=1 (the dev settings), never to the public
 */
export interface HeatMode {
  id: "green-red" | "gray-red" | "gray-red-grass" | "off";
  label: string;
  hint: string;
  ramp: RampId | null;
  grass: boolean;
  devOnly?: boolean;
}

export const HEAT_MODES: readonly HeatMode[] = [
  { id: "gray-red", label: "Gray–Red", hint: "Whole campus: quiet gray to crowded red", ramp: "gray", grass: false },
  { id: "gray-red-grass", label: "Gray–Red on grass", hint: "Heat laid over the grassy campus map", ramp: "gray", grass: true },
  { id: "off", label: "Off (grass only)", hint: "No heat, the plain campus map", ramp: null, grass: true },
  { id: "green-red", label: "Green–Red (dev)", hint: "Whole campus: quiet green to crowded red", ramp: "green", grass: false, devOnly: true },
];

/** The modes a user may pick: everything in dev settings, the public ones otherwise. */
export const availableModes = (devTools: boolean): readonly HeatMode[] => HEAT_MODES.filter((m) => devTools || !m.devOnly);

export type HeatModeId = HeatMode["id"];
export const DEFAULT_MODE: HeatModeId = "gray-red";
export const modeById = (id: HeatModeId): HeatMode => HEAT_MODES.find((m) => m.id === id) ?? HEAT_MODES[0];
