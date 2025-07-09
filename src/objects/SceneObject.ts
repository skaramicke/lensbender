import { Scene } from "babylonjs";

// Abstract class ensures a real JS export for runtime
export abstract class SceneEntity {
  /** Add meshes or data to the given scene */
  abstract addToScene(scene: Scene): void;
  /** Called each frame or when response needed */
  update?(deltaTime: number): void;
}