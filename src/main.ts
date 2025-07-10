import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
} from "babylonjs";

import { SceneEntity, Sensor, SensorConfig, Sphere } from "./objects";
import { Lens } from "./objects/Lens";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// camera
const camera = new ArcRotateCamera(
  "camera",
  Math.PI / 2.5,
  Math.PI / 4,
  200,
  Vector3.Zero(),
  scene
);

camera.attachControl(canvas, true);

// light
new HemisphericLight("light", new Vector3(0, 1, 0), scene);

// all scene entities
const entities: SceneEntity[] = [];

// add sensor example
const sensorConfig: SensorConfig = {
  pixelWidth: 320, // Reduced for faster ray tracing during development
  pixelHeight: 240,
  size: { width: 64, height: 48 },
  position: new Vector3(0, 0, 0),
  rotation: new Vector3(0, 0, 0),
};

// Add a sphere at a distance
entities.push(new Sphere(50, new Vector3(0, 0, -160)));

// Add a test lens with realistic BK7 parameters
const lens = new Lens({
  diameter: 50,
  thickness: 10,
  frontSurface: {
    radius: 35, // Convex front surface
    aperture: 45,
  },
  backSurface: {
    radius: -35, // Convex back surface (negative for back surface)
    aperture: 45,
  },
  glass: {
    catalog: "Schott",
    glassCode: "N-BK7",
    nd: 1.5168,
    vd: 64.17,
    dispersion: {
      B1: 1.03961212,
      B2: 0.231792344,
      B3: 1.01046945,
      C1: 0.00600069867,
      C2: 0.0200179144,
      C3: 103.560653,
    },
  },
  position: new Vector3(0, 0, 0),
  rotation: new Vector3(0, 0, 0),
  lensType: {
    type: "biconvex",
    isPrimary: true,
  },
});

entities.push(lens);

// Add a sensor with ray tracing capabilities
const sensor = new Sensor(sensorConfig);
entities.push(sensor);

// Add all entities to the scene
entities.forEach((e) => e.addToScene(scene));

// Store lens reference in mesh metadata for ray tracing
scene.onAfterRenderObservable.addOnce(() => {
  const lensMeshes = scene.meshes.filter((m) => m.metadata?.type === "Lens");
  lensMeshes.forEach((mesh) => {
    mesh.metadata.lensObject = lens;
  });
});

engine.runRenderLoop(() => {
  const delta = engine.getDeltaTime();
  entities.forEach((e) => e.update && e.update(delta));
  scene.render();
});

// Handle window resize
window.addEventListener("resize", () => {
  engine.resize();
});