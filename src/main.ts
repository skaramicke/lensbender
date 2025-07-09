import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3
} from "babylonjs";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// Camera
const camera = new ArcRotateCamera("camera", Math.PI / 4, Math.PI / 4, 6, Vector3.Zero(), scene);
camera.attachControl(canvas, true);

// Light
new HemisphericLight("light", new Vector3(0, 1, 0), scene);

// Hello-world box
const box = MeshBuilder.CreateBox("box", { size: 2 }, scene);
const boxMat = new StandardMaterial("boxMat", scene);
boxMat.diffuseColor = new Color3(0.2, 0.6, 0.8);
box.material = boxMat;

// Animation
engine.runRenderLoop(() => {
  box.rotation.y += 0.01;
  box.rotation.x += 0.005;
  scene.render();
});
