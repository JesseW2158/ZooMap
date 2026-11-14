import type { RampId } from "./field";

/**
 * The map modes the user can pick between.
 *   ramp   which colour scale the crowd field uses; null means no heat at all
 *   grass  whether the campus grass and parking stay visible under the heat
 */
export interface HeatMode {
  id: "green-red" | "gray-red" | "gray-red-grass" | "off";
  label: string;
  hint: string;
  ramp: RampId | null;
  grass: boolean;
}

export const HEAT_MODES: readonly HeatMode[] = [
  { id: "green-red", label: "Green–Red", hint: "Whole campus: quiet green to crowded red", ramp: "green", grass: false },
  { id: "gray-red", label: "Gray–Red", hint: "Whole campus: quiet gray to crowded red", ramp: "gray", grass: false },
  { id: "gray-red-grass", label: "Gray–Red on grass", hint: "Heat laid over the grassy campus map", ramp: "gray", grass: true },
  { id: "off", label: "Off (grass only)", hint: "No heat, the plain campus map", ramp: null, grass: true },
];

export type HeatModeId = HeatMode["id"];
export const DEFAULT_MODE: HeatModeId = "green-red";
export const modeById = (id: HeatModeId): HeatMode => HEAT_MODES.find((m) => m.id === id) ?? HEAT_MODES[0];
