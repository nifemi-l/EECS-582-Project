/* PROLOGUE
File name: add+api.ts
Description: Route containing behavior for /api/feature/add endpoint
Programmer: Delroy Wright
Creation date: 3/8/26
Revision date: 
Preconditions: A client is running and has requested to add a feature
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { add_feature } from "../../../../server/db/db_commands";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      household_id?: number;
      name?: string;
      type?: string;
      x?: number;
      y?: number;
      z?: number;
    };

    if (!body.household_id || !body.name) {
      return Response.json(
        { ok: false, error: "Household ID and feature name are required" },
        { status: 400 }
      );
    }

    const featureId = await add_feature(
      body.household_id,
      body.name,
      body.type ?? '',
      body.x ?? 0,
      body.y ?? 0,
      body.z ?? 0
    );

    return Response.json(
      { ok: true, feature_id: featureId },
      { status: 201 }
    );
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to add feature" }, { status: 500 });
  }
}
