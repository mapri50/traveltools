import { NextRequest, NextResponse } from "next/server";

const ORS_URL = "https://api.openrouteservice.org/v2/isochrones/driving-car";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  const hours = Number(request.nextUrl.searchParams.get("hours"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(hours)) {
    return NextResponse.json({ error: "lat, lon and hours are required numbers" }, { status: 400 });
  }

  if (hours < 1 || hours > 5) {
    return NextResponse.json({ error: "hours must be between 1 and 5" }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENROUTESERVICE_API_KEY" }, { status: 500 });
  }

  const response = await fetch(ORS_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locations: [[lon, lat]],
      range: [Math.round(hours * 3600)],
      range_type: "time",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    return NextResponse.json({ error: "OpenRouteService request failed", details: body }, { status: 502 });
  }

  const geojson = await response.json();
  const polygon = geojson?.features?.[0] ?? null;

  if (!polygon) {
    return NextResponse.json({ error: "No isochrone polygon returned" }, { status: 502 });
  }

  return NextResponse.json(polygon);
}
