"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { GeoJSONSource, LngLatLike, Map as MapLibreMap, Marker } from "maplibre-gl";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import destinationsData from "@/data/destinations.json";

type Destination = {
  name: string;
  lat: number;
  lon: number;
  type: string;
};

type IsochroneFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

const GRAZ: LngLatLike = [15.4395, 47.0707];
const DESTINATIONS = destinationsData as Destination[];

function parseLatLon(value: string): { lat: number; lon: number } | null {
  const [latRaw, lonRaw] = value.split(",").map((part) => part.trim());
  const lat = Number(latRaw);
  const lon = Number(lonRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  const [locationInput, setLocationInput] = useState("47.0707, 15.4395");
  const [center, setCenter] = useState({ lat: 47.0707, lon: 15.4395 });
  const [hours, setHours] = useState(2);
  const [polygon, setPolygon] = useState<IsochroneFeature | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: GRAZ,
      zoom: 7,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-right");

    mapRef.current.on("load", () => {
      mapRef.current?.addSource("isochrone", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      mapRef.current?.addLayer({
        id: "isochrone-fill",
        type: "fill",
        source: "isochrone",
        paint: {
          "fill-color": "#2563eb",
          "fill-opacity": 0.25,
        },
      });

      mapRef.current?.addLayer({
        id: "isochrone-line",
        type: "line",
        source: "isochrone",
        paint: {
          "line-color": "#1d4ed8",
          "line-width": 2,
        },
      });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const reachableDestinations = useMemo(() => {
    if (!polygon) {
      return [];
    }

    return DESTINATIONS.filter((destination) =>
      booleanPointInPolygon(point([destination.lon, destination.lat]), polygon),
    );
  }, [polygon]);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) {
      return;
    }

    const source = mapRef.current.getSource("isochrone") as GeoJSONSource | undefined;
    if (!source) {
      return;
    }

    source.setData(
      polygon
        ? { type: "FeatureCollection", features: [polygon] }
        : { type: "FeatureCollection", features: [] },
    );
  }, [polygon]);

  useEffect(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (!mapRef.current) {
      return;
    }

    for (const destination of reachableDestinations) {
      const marker = new maplibregl.Marker({ color: "#dc2626" })
        .setLngLat([destination.lon, destination.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 15 }).setText(`${destination.name} (${destination.type})`),
        )
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    }
  }, [reachableDestinations]);

  async function fetchIsochrone(nextCenter: { lat: number; lon: number }, nextHours: number) {
    setError(null);

    const response = await fetch(
      `/api/isochrone?lat=${nextCenter.lat}&lon=${nextCenter.lon}&hours=${nextHours}`,
    );

    const body = await response.json();

    if (!response.ok) {
      setPolygon(null);
      setError(body.error ?? "Could not fetch isochrone");
      return;
    }

    const feature = body as IsochroneFeature;
    setPolygon(feature);

    if (mapRef.current) {
      mapRef.current.flyTo({ center: [nextCenter.lon, nextCenter.lat], zoom: 7 });
    }
  }

  useEffect(() => {
    fetchIsochrone(center, hours).catch(() => {
      setError("Could not fetch isochrone");
      setPolygon(null);
    });
  }, [center, hours]);

  function applyLocation() {
    const parsed = parseLatLon(locationInput);
    if (!parsed) {
      setError("Location must be in 'lat, lon' format");
      return;
    }

    setCenter(parsed);
  }

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "340px 1fr",
        minHeight: "100vh",
      }}
    >
      <aside style={{ padding: "16px", background: "#fff", borderRight: "1px solid #ddd" }}>
        <h1 style={{ marginTop: 0 }}>Travel Toolbox</h1>
        <p style={{ marginTop: 0 }}>Driving reachability map</p>

        <label htmlFor="location">Location (lat, lon)</label>
        <input
          id="location"
          value={locationInput}
          onChange={(event) => setLocationInput(event.target.value)}
          style={{ width: "100%", marginTop: "6px", marginBottom: "8px", padding: "8px" }}
        />
        <button onClick={applyLocation} style={{ marginBottom: "16px" }}>
          Set location
        </button>

        <label htmlFor="hours">Driving time: {hours}h</label>
        <input
          id="hours"
          type="range"
          min={1}
          max={5}
          step={1}
          value={hours}
          onChange={(event) => setHours(Number(event.target.value))}
          style={{ width: "100%", display: "block", marginTop: "8px", marginBottom: "16px" }}
        />

        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

        <h2>Reachable destinations</h2>
        <ul style={{ paddingLeft: "18px" }}>
          {reachableDestinations.map((destination) => (
            <li key={destination.name}>
              {destination.name} ({destination.type})
            </li>
          ))}
        </ul>
      </aside>

      <div ref={mapContainerRef} style={{ width: "100%", height: "100vh" }} />
    </main>
  );
}
