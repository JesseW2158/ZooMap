import type { StoreItemDoc } from "@/shared/contracts";

/**
 * The mock UMass store. Mock only: there is no agreement with the real store (README risk 7).
 * Costs are set against the caps: 240 points per activity, 600 per day at 1 point/minute.
 * Ids are stable so `seed()` can upsert by id and a repeat run changes nothing.
 */
export const CATALOG: StoreItemDoc[] = [
  { _id: "item-sticker-pack", name: "Minuteman sticker pack", description: "Five vinyl UMass stickers.", cost: 60, active: true },
  { _id: "item-coffee", name: "Coffee at Procrastination Station", description: "One drip coffee or tea, any size.", cost: 90, active: true },
  { _id: "item-dining-5", name: "Dining Dollars: $5", description: "Added to your UCard.", cost: 200, stock: 50, active: true },
  { _id: "item-lanyard", name: "Maroon lanyard", description: "With a UMass Amherst UCard holder.", cost: 150, stock: 40, active: true },
  { _id: "item-water-bottle", name: "UMass water bottle", description: "Insulated, 20 oz, maroon.", cost: 400, stock: 25, active: true },
  { _id: "item-library-room", name: "Du Bois priority room booking", description: "Book a group study room a day earlier than usual.", cost: 300, active: true },
  { _id: "item-hoodie", name: "Campus Store hoodie", description: "Maroon, limited run.", cost: 1200, stock: 10, active: true },
  { _id: "item-mullins-tickets", name: "Two Mullins Center tickets", description: "Pair of tickets to a home hockey game.", cost: 1800, stock: 4, active: true },
];
