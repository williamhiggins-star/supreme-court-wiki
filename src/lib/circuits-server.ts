// Server-only — uses fs, path, d3-geo, topojson-client.
// Never import this from a client component.
import "server-only";
import fs from "fs";
import path from "path";
import type { CircuitMapData, StateFeature } from "./circuits";
import { FIPS_TO_CIRCUIT, FIPS_TO_ABBR } from "./circuits";

export function getCircuitMapData(): CircuitMapData {
  const topoPath = path.join(process.cwd(), "data", "us-states-10m.json");
  const topology = JSON.parse(fs.readFileSync(topoPath, "utf-8"));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const topojson = require("topojson-client") as typeof import("topojson-client");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { geoAlbersUsa, geoPath } = require("d3-geo") as typeof import("d3-geo");

  const projection = geoAlbersUsa().scale(1300).translate([487.5, 305]);
  const pathFn = geoPath(projection);

  const featureCollection = topojson.feature(
    topology,
    topology.objects.states
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

  const states: StateFeature[] = featureCollection.features
    .map((f) => {
      const id = String(f.id ?? "").padStart(2, "0");
      const centroid = pathFn.centroid(f);
      return {
        id,
        abbr: FIPS_TO_ABBR[id] ?? id,
        circuit: FIPS_TO_CIRCUIT[id] ?? 0,
        pathD: pathFn(f) ?? "",
        centroidX: centroid[0] ?? 0,
        centroidY: centroid[1] ?? 0,
      };
    })
    .filter((s) => s.pathD !== "");

  // Borders between states in different circuits
  const circuitMesh = topojson.mesh(
    topology,
    topology.objects.states,
    (a, b) =>
      FIPS_TO_CIRCUIT[String(a.id).padStart(2, "0")] !==
      FIPS_TO_CIRCUIT[String(b.id).padStart(2, "0")]
  );
  const circuitBorderPath = pathFn(circuitMesh) ?? "";

  // Outer / coastal border
  const outerMesh = topojson.mesh(
    topology,
    topology.objects.states,
    (a, b) => a === b
  );
  const outerBorderPath = pathFn(outerMesh) ?? "";

  return {
    states,
    circuitBorderPath,
    outerBorderPath,
    viewBox: "0 0 975 610",
  };
}
