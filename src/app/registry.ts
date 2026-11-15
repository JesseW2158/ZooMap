/**
 * The plug-in registry for the UI. FROZEN after Foundation: every planned entry already
 * points at a stub file inside its module, so a workstream replaces the body of its own
 * component and never edits this file. Deep imports are allowed here and nowhere else
 * (see eslint.config.mjs).
 *
 * Map layers are drawn inside the map; draw order comes from the slot layers, not from the
 * order here (see `addLayerToSlot`). Panels become tabs in this order.
 */
import type { AppRegistry } from "@/shared/ui/registry-types";
import { ActivitiesLayer } from "@/modules/activities/ui/Layer";
import { ActivitiesPanel } from "@/modules/activities/ui/Panel";
import { AssistantPanel } from "@/modules/assistant/ui/Panel";
import { CampusLayer } from "@/modules/campus/ui/Layer";
import { DensityLayer } from "@/modules/density/ui/Layer";
import { DensityPanel } from "@/modules/density/ui/Panel";
import { FriendsInviteBanner } from "@/modules/friends/ui/InviteBanner";
import { MessagesPanel } from "@/modules/friends/ui/Messages";
import { FriendsPanel } from "@/modules/friends/ui/Panel";
import { MobileBridge } from "@/modules/mobile/ui/Bridge";
import { AlertsBell, AlertsCenter } from "@/modules/notifications/ui/Alerts";
import { PlannedEventsLayer } from "@/modules/planned/ui/Layer";
import { PlannedEventsPanel } from "@/modules/planned/ui/Panel";
import { RecommendPanel } from "@/modules/recommend/ui/Panel";
import { RewardsPanel } from "@/modules/rewards/ui/Panel";
import { RoutingLayer } from "@/modules/routing/ui/Layer";
import { RoutingSearch } from "@/modules/routing/ui/Search";
import { SchedulePanel } from "@/modules/schedule/ui/Panel";

export const registry: AppRegistry = {
  mapLayers: [
    { id: "campus", Component: CampusLayer },
    { id: "density", Component: DensityLayer },
    { id: "routing", Component: RoutingLayer },
    { id: "activities", Component: ActivitiesLayer },
    { id: "planned", Component: PlannedEventsLayer },
  ],
  panels: [
    { id: "density", title: "Crowds", Component: DensityPanel },
    { id: "activities", title: "Activities", Component: ActivitiesPanel },
    { id: "schedule", title: "Schedule", Component: SchedulePanel },
    { id: "events", title: "Events", Component: PlannedEventsPanel },
    { id: "recommend", title: "Study", Component: RecommendPanel },
    { id: "rewards", title: "Points", Component: RewardsPanel },
    { id: "friends", title: "Friends", Component: FriendsPanel },
    { id: "messages", title: "Messages", Component: MessagesPanel },
    { id: "assistant", title: "Ask", Component: AssistantPanel },
  ],
  topSlot: [{ id: "routing-search", Component: RoutingSearch }],
  headless: [
    { id: "mobile-bridge", Component: MobileBridge },
    { id: "friends-invite-banner", Component: FriendsInviteBanner },
    { id: "notifications", Component: AlertsCenter },
  ],
  actions: [{ id: "alerts-bell", Component: AlertsBell }],
};
