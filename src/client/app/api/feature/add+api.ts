/* PROLOGUE
File name: add+api.ts
Description: Route containing behavior for /api/feature/add endpoint, proxying to Flask backend.
Programmer: Delroy Wright
Creation date: 3/11/26
Preconditions: A client is running and has requested to add a feature
Postconditions: A response from the Flask server is returned to the client.
*/

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

    const response = await fetch("http://localhost:8000/api/feature", {
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
