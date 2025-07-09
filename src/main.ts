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
  Math.PI / 4,
  Math.PI / 4,
  500,
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
  pixelWidth: 1920,
  pixelHeight: 1080,
  size: { width: 24, height: 13.5 },
  position: new Vector3(0, 0, 30),
  rotation: new Vector3(0, 0, 0),
};

// Add a sphere
entities.push(new Sphere(50, new Vector3(0, 0, -500)));

// Add a test lens with realistic BK7 parameters
entities.push(
  new Lens({
    diameter: 50,
    thickness: 1,
    frontSurface: {
      radius: 50, // Convex front surface
      aperture: 45,
    },
    backSurface: {
      radius: 30, // Convex back surface (negative for back surface)
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
  })
);

// Add a sensor
entities.push(new Sensor(sensorConfig));

entities.forEach((e) => e.addToScene(scene));

engine.runRenderLoop(() => {
  const delta = engine.getDeltaTime();
  entities.forEach((e) => e.update && e.update(delta));
  scene.render();
});
