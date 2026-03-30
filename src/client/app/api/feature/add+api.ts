/* PROLOGUE
File name: add+api.ts
Description: Route containing behavior for /api/feature/add endpoint, proxying to Flask backend.
Programmers: Delroy Wright, Nifemi Lawal
Creation date: 3/11/26
Revision date:
  - 3/29/26: Replace hardcoded localhost URL with EXPO_PUBLIC_API_URL env variable
Preconditions: A client is running and has requested to add a feature
Postconditions: A response from the Flask server is returned to the client.
*/

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const backendData = {
        household_id: body.household_id,
        feature_name: body.feature_name || body.name,
        feature_type: body.feature_type || body.type || "",
        x_pos: body.x_pos || 0,
        y_pos: body.y_pos || 0,
        z_pos: body.z_pos || 0
    };

    const response = await fetch(`${API_URL}/api/feature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backendData),
    });

    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ ok: false, error: "Failed to connect to backend" }, { status: 500 });
  }
}