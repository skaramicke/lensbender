import { Scene, MeshBuilder, Mesh, Vector3, Color3, StandardMaterial } from "babylonjs";
import { SceneEntity } from "./SceneObject";

// filepath: /Users/mix/Projects/lensbender/src/objects/Sphere.ts

export class Sphere extends SceneEntity {
  private sphere!: Mesh;

  /**
   * @param diameter The diameter of the sphere (default: 1)
   * @param segments Number of horizontal and vertical segments (default: 32)
   */
  constructor(private diameter = 100, private position = new Vector3(0, 0, 0), private color = new Color3(1, 0, 0)) {
    super();
  }

  /**
   * Creates the sphere mesh and adds it to the given scene
   */
  addToScene(scene: Scene): void {
    this.sphere = MeshBuilder.CreateSphere(
      "sphere",
      { diameter: this.diameter, segments: 32 },
      scene
    );
    this.sphere.position = this.position;
    // Create a basic red material
    const mat = new StandardMaterial("sensorMat", scene);
    mat.diffuseColor = this.color;
    this.sphere.material = mat;
  }

  /**
   * Rotates the sphere every frame
   * @param deltaTime Time elapsed since last frame in ms
   */
  update(deltaTime: number): void {
    if (!this.sphere) return;
    // rotate at 0.001 radians per ms
    this.sphere.rotation.y += deltaTime * 0.001;
  }
}