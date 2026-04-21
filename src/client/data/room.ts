/* PROLOGUE
File name: room.ts
Description: Types for household rooms (list-view grouping), aligned with Flask JSON.
Programmer: Nifemi Lawal
Creation date: 4/13/26
*/

/** Row from GET /api/household/:id/rooms */
export type HouseholdRoom = {
  room_id: number;
  household_id: number;
  room_name: string;
  accent_color: string | null;
};
