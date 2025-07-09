import { SceneEntity } from "./SceneObject";
import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh } from "babylonjs";

export type SensorConfig = {
  pixelWidth: number;
  pixelHeight: number;
  size: { width: number; height: number };
  position: Vector3;
  rotation: Vector3; // Euler in radians
};

export class Sensor extends SceneEntity {
  private _config: SensorConfig;
  private _plane!: Mesh;

  constructor(config: SensorConfig) {
    super();
    this._config = config;
  }

  addToScene(scene: Scene): void {
    const { size, position, rotation } = this._config;
    this._plane = MeshBuilder.CreatePlane(
      "sensorPlane",
      { width: size.width, height: size.height },
      scene
    );
    this._plane.position = position;
    this._plane.rotation = rotation;
    // Visual placeholder: emissive gray material
    const mat = new StandardMaterial("sensorMat", scene);
    mat.emissiveColor = new Color3(0.1, 0.1, 0.1);
    this._plane.material = mat;
    // make the plane render both sides
    mat.backFaceCulling = false;
  }

  update(deltaTime: number): void {
    // placeholder: sensor integration logic or UI updates
  }
}