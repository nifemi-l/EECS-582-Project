/*
This file is responsible for retrieving the sensor data from the database and returning it to the client.
*/

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const householdId = url.searchParams.get("householdId");

        if (!householdId) {
            return Response.json(
                { ok: false, error: "householdId query parameter is required" },
                { status: 400 }
            );
        }

        const response = await fetch(`${API_URL}/api/sensor-data/${householdId}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });
        // Data is the response of the fetch request, which is the most recent sensor data from the database for the specific household
        const data = await response.json();
        // Response is formatted as { temperature: number, relative_humidity: number }
        return Response.json(data, { status: response.status });
    // Handle errors accordingly
    } catch (error) {
        return Response.json({ ok: false, error: "Failed to connect to backend" }, { status: 500 });
    }
} 

//export default GET;