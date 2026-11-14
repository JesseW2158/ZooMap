import type { ComponentType } from "react";

/**
 * Item types for the React-side registries in `src/app/registry.ts`. A module adds a
 * feature by exporting a component and getting one line in that file. Foundation has
 * already added a line for every planned stub, so a stream replaces the component's
 * body and never edits the registry.
 */

/** A component mounted by the shell: a map layer, the top-slot search, or a headless bridge. */
export interface RegistryEntry {
  id: string;
  Component: ComponentType;
}

/** A tab in the bottom sheet. */
export interface PanelEntry extends RegistryEntry {
  /** Tab label. Keep it short. */
  title: string;
}

export interface AppRegistry {
  /** Rendered inside the map. Adds sources and layers through `useMapEffect`; renders null. */
  mapLayers: RegistryEntry[];
  /** Tab order, left to right. */
  panels: PanelEntry[];
  /** Over the top of the map (search). */
  topSlot: RegistryEntry[];
  /** Mounted once, render nothing visible (for example the Android location bridge). */
  headless: RegistryEntry[];
}
