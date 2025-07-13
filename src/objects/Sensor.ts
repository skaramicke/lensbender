// src/objects/Sensor.ts
import {
  Scene,
  MeshBuilder,
  RawTexture,
  Texture,
  Engine,
  ShaderMaterial,
  Mesh,
  Vector3,
  Vector2,
} from "babylonjs";

import { SceneEntity } from "./SceneObject";
import { Lens } from "./Lens";
import { GlassSpec } from "./Lens"; // Assuming interfaces are exported from Lens.ts

export type SensorConfig = {
  pixelWidth: number;
  pixelHeight: number;
  size: { width: number; height: number };
  position: Vector3;
  rotation: Vector3;
};

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
uniform int       uNumObjects;
uniform vec3      uSensorPosition;
uniform vec2      uSensorSize;
uniform vec3      uSensorForward;
uniform vec2      uPixelCount;
uniform vec3      uLensPosition;
uniform float     uLensRadius;
uniform vec3      uLensNormal;

in vec2 vUV;

#define PROPS_PER_OBJECT 12

struct Ray { vec3 origin; vec3 dir; };

// Helper to read object data from the data texture
vec4 fetchObjectRow(int objIndex, int row) {
    float u = (float(row) + 0.5) / float(PROPS_PER_OBJECT);
    float v = (float(objIndex) + 0.5) / float(uNumObjects);
    return texture2D(uSceneDataTex, vec2(u, v));
}

// --- Optical Physics Functions ---
float sellmeier(float lambda, vec3 B, vec3 C) {
    float l2 = (lambda * lambda) / (1000.0 * 1000.0); // nm^2 to um^2
    float n2 = 1.0 + (B.x*l2)/(l2 - C.x) + (B.y*l2)/(l2 - C.y) + (B.z*l2)/(l2 - C.z);
    return sqrt(n2);
}

vec3 customRefract(vec3 I, vec3 N, float eta) {
    float dotNI = dot(N, I);
    float k = 1.0 - eta * eta * (1.0 - dotNI * dotNI);
    if (k < 0.0) return vec3(0.0); // Total Internal Reflection
    return eta * I - (eta * dotNI + sqrt(k)) * N;
}

// --- Intersection Function ---
vec2 intersectSphere(Ray ray, vec3 center, float radius) {
    vec3 oc = ray.origin - center;
    float a = dot(ray.dir, ray.dir);
    float b = 2.0 * dot(oc, ray.dir);
    float c = dot(oc, oc) - radius * radius;
    float discriminant = b*b - 4.0*a*c;
    if (discriminant < 0.0) return vec2(-1.0, -1.0);
    float sqrt_disc = sqrt(discriminant);
    return vec2((-b - sqrt_disc) / (2.0 * a), (-b + sqrt_disc) / (2.0 * a));
}

// --- Main Ray Tracing Logic ---
vec3 traceRay(vec3 origin, vec3 direction) {
    float lambda = 587.56; // d-line
    Ray ray = Ray(origin, direction);
    
    vec3 finalColor = vec3(0.1, 0.1, 0.15); // Default background

    // 1. Find the first object the ray hits
    float closestT = 100000.0;
    int hitObjIndex = -1;
    bool hitIsLens = false;

    for(int i=0; i<uNumObjects; ++i) {
        vec4 r0 = fetchObjectRow(i, 0);
        int type = int(r0.w);
        
        if (type == 1) { // Simple Sphere
            vec2 t = intersectSphere(ray, r0.xyz, fetchObjectRow(i, 1).x);
            if (t.x > 0.001 && t.x < closestT) {
                closestT = t.x;
                hitObjIndex = i;
                hitIsLens = false;
            }
        } else if (type == 2) { // Lens
            vec3 lensPos = r0.xyz;
            vec4 r1 = fetchObjectRow(i, 1);
            float thickness = r1.y, r_front = r1.z, r_back = r1.w;
            float front_vtx_z = lensPos.z - thickness/2.0, back_vtx_z = lensPos.z + thickness/2.0;
            vec3 center_front = vec3(lensPos.x, lensPos.y, front_vtx_z - r_front);
            vec3 center_back  = vec3(lensPos.x, lensPos.y, back_vtx_z - r_back);
            vec2 t_front = intersectSphere(ray, center_front, abs(r_front));
            vec2 t_back  = intersectSphere(ray, center_back,  abs(r_back));
            float t_enter = max(t_front.x, t_back.x), t_exit_vol = min(t_front.y, t_back.y);

            if (t_enter < t_exit_vol && t_exit_vol > 0.001) {
                float t_hit = (t_enter > 0.001) ? t_enter : t_exit_vol;
                if (t_hit < closestT) {
                    closestT = t_hit;
                    hitObjIndex = i;
                    hitIsLens = true;
                }
            }
        }
    }

    // 2. Process the hit
    if (hitObjIndex != -1) {
        if (!hitIsLens) {
            finalColor = vec3(1.0, 0.2, 0.2); // Direct hit on sphere
        } else {
            // --- NEW, ROBUST REFRACTION LOGIC ---
            vec3 hitPos = ray.origin + ray.dir * closestT;
            
            vec4 r0 = fetchObjectRow(hitObjIndex, 0);
            vec3 lensPos = r0.xyz;
            vec4 r1 = fetchObjectRow(hitObjIndex, 1);
            float lensApertureRadius = r1.x, thickness = r1.y, r_front = r1.z, r_back = r1.w;
            
            if (dot(hitPos.xy - lensPos.xy, hitPos.xy - lensPos.xy) < lensApertureRadius * lensApertureRadius) {
                vec3 B = fetchObjectRow(hitObjIndex, 2).xyz, C = fetchObjectRow(hitObjIndex, 3).xyz;
                float n_glass = sellmeier(lambda, B, C);

                float front_vtx_z = lensPos.z - thickness/2.0, back_vtx_z = lensPos.z + thickness/2.0;
                vec3 center_front = vec3(lensPos.x, lensPos.y, front_vtx_z - r_front);
                vec3 center_back  = vec3(lensPos.x, lensPos.y, back_vtx_z - r_back);

                // a) Determine entry surface and refract
                vec2 t_front = intersectSphere(ray, center_front, abs(r_front));
                vec2 t_back  = intersectSphere(ray, center_back, abs(r_back));
                
                bool isEnteringFront = (t_front.x > t_back.x);
                vec3 center_in = isEnteringFront ? center_front : center_back;
                vec3 center_out = isEnteringFront ? center_back : center_front;
                
                vec3 normal_in = normalize(hitPos - center_in);
                vec3 dir_internal = customRefract(ray.dir, normal_in, 1.0 / n_glass);

                if (dot(dir_internal, dir_internal) > 0.0) { // Check for TIR at entry
                    // b) Find exit point
                    Ray internal_ray = Ray(hitPos, dir_internal);
                    vec2 t_exit_candidates = intersectSphere(internal_ray, center_out, abs(isEnteringFront ? r_back : r_front));
                    float t_exit = t_exit_candidates.y;

                    if (t_exit > 0.001) {
                        vec3 exitPos = internal_ray.origin + internal_ray.dir * t_exit;
                        vec3 normal_out = normalize(exitPos - center_out);

                        // c) Refract on exit
                        vec3 final_dir = customRefract(dir_internal, normal_out, n_glass);

                        if (dot(final_dir, final_dir) > 0.0) { // Check for TIR at exit
                            // d) Trace final ray
                            Ray final_ray = Ray(exitPos + final_dir * 0.01, final_dir);
                            for (int k=0; k<uNumObjects; ++k) {
                                if (k == hitObjIndex) continue;
                                if (int(fetchObjectRow(k, 0).w) == 1) { // Is it a sphere?
                                    vec2 final_hit_t = intersectSphere(final_ray, fetchObjectRow(k, 0).xyz, fetchObjectRow(k, 1).x);
                                    if (final_hit_t.x > 0.001) {
                                        finalColor = vec3(1.0, 0.2, 0.2); // HIT!
                                        break;
                                    }
                                }
                            }
                            // If we missed the sphere, visualize the ray direction
                            if (finalColor.r < 0.5) {
                               finalColor = final_dir * 0.5 + 0.5;
                            }
                        }
                    }
                }
            }
        }
    }
    return finalColor;
}

vec3 traceRays(vec3 origin, vec3 centerDirection) {
    vec3 finalColor = vec3(0.0);
    vec3 direction = normalize(centerDirection);
    
    int directionCount = 500; // Number of rays to trace
    if (uNumObjects == 0) {
        // If no objects, return a default color
        return vec3(0.1, 0.1, 0.15);
    }

    // Trace 100 random rays in a cone around the center direction
    for (int i = 0; i < directionCount; ++i) {
        // Generate a random direction in a cone around the center direction
        float theta = float(i) * 0.062831853; // 2* PI / directionCount
        float phi = float(i) * 0.031415926; // PI / directionCount
        float r = 0.1; // Radius of the cone
        vec3 randomDir = vec3(
            r * cos(theta) * sin(phi),
            r * sin(theta) * sin(phi),
            r * cos(phi)
        );
        // Normalize and adjust the direction
        randomDir = normalize(randomDir + direction);
        finalColor += traceRay(origin, randomDir);
    }
    // Average the color from all rays
    finalColor /= float(directionCount);

    return finalColor;
}

void main(){
    // Get the current pixel coordinate based on uPixelCount (this creates the binning effect)
    vec2 pixelCoord = floor(vUV * uPixelCount);
    
    // Convert back to normalized coordinates [0,1] from the center of the pixel
    vec2 normalizedPixelCoord = (pixelCoord + 0.5) / uPixelCount;
    
    // Calculate ray origin based on the center of the pixel/bin
    vec2 sensorLocal = (normalizedPixelCoord - 0.5) * uSensorSize;
    vec3 origin = uSensorPosition + vec3(sensorLocal.x, sensorLocal.y, 0.0);
    vec3 direction = normalize(uSensorForward);
    
    // Trace one ray from the center of the pixel/bin
    vec3 finalColor = traceRays(origin, direction);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

export class Sensor extends SceneEntity {
  private _config: SensorConfig;
  private _plane!: Mesh;
  private _scene!: Scene;
  private _shaderMat!: ShaderMaterial;
  private _accumTime = 0;
  private _sceneDataTexture!: RawTexture;

  constructor(config: SensorConfig) {
    super();
    this._config = config;
  }

  addToScene(scene: Scene): void {
    this._scene = scene;

    this._plane = MeshBuilder.CreatePlane(
      "sensorPlane",
      {
        width: this._config.size.width,
        height: this._config.size.height,
      },
      scene
    );
    this._plane.position = this._config.position;
    this._plane.rotation = this._config.rotation;

    this._shaderMat = new ShaderMaterial(
      "wavelengthRaytrace",
      scene,
      { vertexSource: raytraceVS, fragmentSource: raytraceFS },
      {
        attributes: ["position", "uv"],
        uniforms: [
          "worldViewProjection",
          "uNumObjects",
          "uSensorPosition",
          "uSensorSize",
          "uSensorForward",
          "uPixelCount",
        ],
        samplers: ["uSceneDataTex"],
      }
    );

    this._shaderMat.setVector2(
      "uSensorSize",
      new Vector2(this._config.size.width, this._config.size.height)
    );
    this._shaderMat.setVector2(
      "uPixelCount",
      new Vector2(this._config.pixelWidth, this._config.pixelHeight)
    );
    this._shaderMat.backFaceCulling = false;
    this._plane.material = this._shaderMat;

    this.updateSceneData();
  }

  private collectSceneObjects(): Array<{
    position: Vector3;
    type: number;
    radius: number;
    thickness?: number;
    frontRadius?: number;
    backRadius?: number;
    glass?: GlassSpec;
  }> {
    const out: any[] = [];
    this._scene.meshes.forEach((m) => {
      if (m.metadata?.type === "Lens" && m.metadata.lensObject) {
        const lens: Lens = m.metadata.lensObject;
        out.push({
          position: lens.getMesh().position,
          type: 2,
          radius: lens.diameter / 2,
          thickness: lens.thickness,
          frontRadius: lens.frontSurface.radius,
          backRadius: lens.backSurface.radius,
          glass: lens.glass,
        });
      } else if (m.name.includes("sphere")) {
        const r = m.getBoundingInfo().boundingSphere.radius;
        out.push({ position: m.position, type: 1, radius: r });
      }
    });
    return out;
  }

  private updateSceneData(): void {
    const objects = this.collectSceneObjects();
    const numObjects = objects.length;
    const propsPerObject = 12;

    if (numObjects === 0) {
      if (this._shaderMat) this._shaderMat.setInt("uNumObjects", 0);
      return;
    }

    const textureData = new Float32Array(numObjects * propsPerObject * 4);
    objects.forEach((obj, i) => {
      const base = i * propsPerObject * 4;
      textureData[base + 0] = obj.position.x;
      textureData[base + 1] = obj.position.y;
      textureData[base + 2] = obj.position.z;
      textureData[base + 3] = obj.type;

      textureData[base + 4] = obj.radius;
      textureData[base + 5] = obj.thickness || 0;
      textureData[base + 6] = obj.frontRadius || 0;
      textureData[base + 7] = obj.backRadius || 0;

      if (obj.type === 2 && obj.glass) {
        const d = obj.glass.dispersion;
        textureData[base + 8] = d.B1;
        textureData[base + 9] = d.B2;
        textureData[base + 10] = d.B3;
        textureData[base + 12] = d.C1;
        textureData[base + 13] = d.C2;
        textureData[base + 14] = d.C3;
      }
    });

    if (this._sceneDataTexture) this._sceneDataTexture.dispose();
    this._sceneDataTexture = new RawTexture(
      textureData,
      propsPerObject,
      numObjects,
      Engine.TEXTUREFORMAT_RGBA,
      this._scene,
      false,
      false,
      Texture.NEAREST_SAMPLINGMODE,
      Engine.TEXTURETYPE_FLOAT
    );

    this._shaderMat.setTexture("uSceneDataTex", this._sceneDataTexture);
    this._shaderMat.setInt("uNumObjects", numObjects);
  }

  update(deltaTime: number): void {
    this._accumTime += deltaTime;
    const t = this._accumTime * 0.0005;
    const minZ = 50,
      maxZ = 60;
    const centerZ = minZ + (maxZ - minZ) / 2;
    this._plane.position.z = centerZ + (maxZ - centerZ) * Math.sin(t);

    const angleY =
      (Math.sin(this._accumTime * (Math.PI / 2000)) * Math.PI) / 18;
    this._plane.rotation.y = angleY;

    this._shaderMat.setVector3(
      "uSensorPosition",
      this._plane.getAbsolutePosition()
    );
    this._shaderMat.setVector3(
      "uSensorForward",
      this._plane.getDirection(Vector3.Backward())
    );

    this.updateSceneData();
  }
}
