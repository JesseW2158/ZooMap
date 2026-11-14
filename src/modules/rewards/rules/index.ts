import type { RewardRule } from "@/shared/contracts";
import { timeAtActivity } from "./time-at-activity";

/**
 * The reward rules registry. Adding a rule is a new file in this folder plus one line here.
 * See README.md in this folder.
 */
export const REWARD_RULES: RewardRule[] = [timeAtActivity as RewardRule];
