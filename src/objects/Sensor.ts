// src/objects/Sensor.ts
import {
  ShaderStore,
  Scene,
  MeshBuilder,
  RawTexture,
  Texture,
  Engine,
  RenderTargetTexture,
  ShaderMaterial,
  StandardMaterial,
  Mesh,
  Vector3,
} from "babylonjs";

const raytraceVS = `
in vec3 position;
in vec2 uv;
out vec2 vUV;
uniform mat4 worldViewProjection;

void main() {
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const raytraceFS = `
#ifdef GL_ES
precision highp float;
precision highp sampler2D;
#endif

uniform sampler2D uSceneDataTex;
uniform int      uNumObjects;
uniform float    uLambdaMin;
uniform float    uLambdaMax;

in vec2 vUV;

#define WAVELENGTH_SAMPLES 16
#define PROPS_PER_OBJECT 8  // adjust to your data packing

// Helper to read object data from the data texture
vec4 fetchObjectRow(int objIndex, int row) {
    float u = (float(row) + 0.5) / float(PROPS_PER_OBJECT);
    float v = (float(objIndex) + 0.5) / float(uNumObjects);
    return texture2D(uSceneDataTex, vec2(u, v));
}

struct Ray { vec3 origin; vec3 dir; };
struct Hit { bool hit; float t; vec3 pos; vec3 normal; int type; };

// Reconstruct a ray from the sensor through pixel uv at wavelength lambda
Ray makeRayFromSensor(vec2 uv, float lambda) {
    // TODO: pass sensor plane transform and size via uniforms
    vec3 origin = vec3(uv.xy * 2.0 - 1.0, 0.0);
    vec3 dir = vec3(0.0, 0.0, -1.0);
    return Ray(origin, normalize(dir));
}

// Simple sphere intersection example
Hit intersectSphere(Ray ray, vec3 center, float radius) {
    vec3 oc = ray.origin - center;
    float a = dot(ray.dir, ray.dir);
    float b = 2.0 * dot(oc, ray.dir);
    float c = dot(oc, oc) - radius * radius;
    float disc = b*b - 4.0*a*c;
    if(disc < 0.0) return Hit(false, 0.0, vec3(0), vec3(0), 0);
    float t = (-b - sqrt(disc)) / (2.0*a);
    if(t < 0.0) return Hit(false, 0.0, vec3(0), vec3(0), 0);
    vec3 p = ray.origin + ray.dir * t;
    vec3 n = normalize(p - center);
    return Hit(true, t, p, n, 1);
}

// Sellmeier refractive index
float sellmeier(float lambda, vec3 B, vec3 C) {
    float l2 = (lambda*lambda);
    float n2 = 1.0 + (B.x*l2)/(l2 - C.x) + (B.y*l2)/(l2 - C.y) + (B.z*l2)/(l2 - C.z);
    return sqrt(n2);
}

vec3 traceRay(Ray ray, float lambda) {
    vec3 col = vec3(0);
    float currEta = 1.0;
    for(int i=0; i<uNumObjects; ++i) {
        // For simplicity assume object type=1 is sphere, pack center.xyz in row0.rgb, radius in row0.a
        vec4 r0 = fetchObjectRow(i, 0);
        int type = int(r0.a);
        if(type == 1) {
            Hit h = intersectSphere(ray, r0.rgb, r0.a);
            if(h.hit) {
                col = vec3(1.0); // white hit
                break;
            }
        }
        // TODO: handle lenses and refraction
    }
    return col;
}

void main() {
  // If we see any objects, paint bright green; otherwise paint magenta.
  if (uNumObjects > 0) {
    gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
  } else {
    gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
  }
}
`;

import { SceneEntity } from "./SceneObject";
import { Lens } from "./Lens";

export type SensorConfig = {
  pixelWidth: number;
  pixelHeight: number;
  size: { width: number; height: number };
  position: Vector3;
  rotation: Vector3;
};

export class Sensor extends SceneEntity {
  private _config: SensorConfig;
  private _plane!: Mesh;
  private _scene!: Scene;
  private _shaderMat!: ShaderMaterial;
  private _rtt!: RenderTargetTexture;
  private _accumTime = 0;

  constructor(config: SensorConfig) {
    super();
    this._config = config;
  }

  addToScene(scene: Scene): void {
    this._scene = scene; // ShaderStore.ShadersStore["wavelengthRaytraceVertexShader"] = raytraceVS; // ShaderStore.ShadersStore["wavelengthRaytraceFragmentShader"] = raytraceFS; // create sensor plane

    // No longer need to use ShaderStore
    this._plane = MeshBuilder.CreatePlane(
      "sensorPlane",
      { width: this._config.size.width, height: this._config.size.height },
      scene
    );
    this._plane.position = this._config.position;
    this._plane.rotation = this._config.rotation; // create render target texture

    this._rtt = new RenderTargetTexture(
      "sensorRTT",
      { width: this._config.pixelWidth, height: this._config.pixelHeight },
      scene,
      false,
      true,
      Engine.TEXTURETYPE_FLOAT
    );
    scene.customRenderTargets.push(this._rtt); // fullscreen quad under sensor

    const quad = MeshBuilder.CreatePlane("sensorQuad", { size: 2 }, scene);
    quad.parent = this._plane; // shader material setup

    this._shaderMat = new ShaderMaterial(
      "wavelengthRaytrace",
      scene,
      {
        // Use vertexSource and fragmentSource to pass code directly
        vertexSource: raytraceVS,
        fragmentSource: raytraceFS,
      },
      {
        attributes: ["position", "uv"],
        uniforms: [
          "worldViewProjection",
          "uNumObjects",
          "uLambdaMin",
          "uLambdaMax",
        ],
        samplers: ["uSceneDataTex"],
      }
    );
    this._shaderMat.setFloat("uLambdaMin", 450.0);
    this._shaderMat.setFloat("uLambdaMax", 650.0);
    quad.material = this._shaderMat;
    this._rtt.renderList = [quad];

    // apply RTT to plane
    const mat = new StandardMaterial("sensorMat", scene);
    mat.emissiveTexture = this._rtt;
    mat.diffuseTexture = this._rtt;
    mat.backFaceCulling = false; // This makes the material double-sided
    this._plane.material = mat;
  }

  private collectSceneObjects(): Array<{
    position: Vector3;
    type: number;
    radius: number;
  }> {
    const out: Array<{ position: Vector3; type: number; radius: number }> = [];
    this._scene.meshes.forEach((m) => {
      if (m.metadata?.type === "Lens" && m.metadata.lensObject) {
        const lens: Lens = m.metadata.lensObject;
        out.push({
          position: lens.getMesh().position,
          type: 2,
          radius: lens.diameter / 2,
        });
      } else if (m.name.includes("sphere")) {
        const r = m.getBoundingInfo().boundingSphere.radius;
        out.push({ position: m.position, type: 1, radius: r });
      }
    });
    return out;
  }

  update(deltaTime: number): void {
    this._accumTime += deltaTime / 1000; // accumulate time in seconds
    const time = this._accumTime; // apply speed factor
    this._plane.position.x = (this._config.size.width / 4) * Math.cos(time); // Circular motion in X
    this._plane.position.y = (this._config.size.height / 4) * Math.sin(time); // Circular motion in Y
  }
}
