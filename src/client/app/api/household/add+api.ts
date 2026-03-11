/* PROLOGUE
File name: add+api.ts
Description: Route containing behavior for /api/household/add endpoint, proxying to Flask backend.
Programmer: Delroy Wright
Creation date: 3/11/26
Preconditions: A client is running and has requested to add a household
Postconditions: A response from the Flask server is returned to the client.
*/

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const backendData = {
        household_name: body.household_name || body.name
    };

    const response = await fetch("http://localhost:8000/api/household", {
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
