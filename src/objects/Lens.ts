import { SceneEntity } from "./SceneObject";
import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  Color3,
  VertexData,
} from "babylonjs";

interface SurfaceSpec {
  radius: number; // Radius of curvature (mm) - positive = convex, negative = concave
  conicConstant?: number; // Conic constant (K) for aspherical surfaces
  aperture?: number; // Clear aperture diameter (can differ from lens diameter)
}

interface AsphericCoefficients {
  A4?: number; // 4th order coefficient
  A6?: number; // 6th order coefficient
  A8?: number; // 8th order coefficient
  A10?: number; // 10th order coefficient
  // Higher orders as needed
}

interface CoatingSpec {
  type: "AR" | "HR" | "BS" | "none"; // Anti-reflective, High-reflective, Beam-splitter
  layers?: {
    material: string;
    thickness: number; // in nanometers
    refractiveIndex: number;
  }[];
  transmissionCurve?: { wavelength: number; transmission: number }[];
}

interface ApertureSpec {
  isApertureStop: boolean; // Is this the aperture stop?
  vignettingDiameter?: number; // Vignetting aperture if different from clear aperture
  mechanicalDiameter?: number; // Physical housing diameter
}

interface GlassSpec {
  catalog: string; // 'Schott', 'Ohara', 'Hoya', etc.
  glassCode: string; // 'N-BK7', 'SF11', etc.
  nd: number; // Refractive index at d-line (587.6nm)
  vd: number; // Abbe number
  dispersion: SellmeierCoefficients;
  thermalCoefficients?: {
    dn_dt: number; // Temperature coefficient of refractive index
    expansion: number; // Thermal expansion coefficient
  };
}

interface LensType {
  type:
    | "singlet"
    | "doublet"
    | "triplet"
    | "meniscus"
    | "biconvex"
    | "biconcave"
    | "plano-convex"
    | "plano-concave";
  isPrimary: boolean; // Primary lens element?
  groupIndex?: number; // Which lens group this belongs to
  elementIndex?: number; // Position within the group
}

/**
 * Optical material dispersion via Sellmeier coefficients.
 */
interface SellmeierCoefficients {
  B1: number;
  B2: number;
  B3: number;
  C1: number;
  C2: number;
  C3: number;
}

interface ToleranceSpec {
  radiusTolerance: number; // ±mm
  thicknessTolerance: number; // ±mm
  decenterTolerance: number; // ±mm
  tiltTolerance: number; // ±radians
  surfaceQuality: string; // '40/20', '60/40', etc.
}

interface LensOptions {
  // Basic geometry
  diameter: number;
  thickness: number;

  // Surface definitions
  frontSurface: SurfaceSpec;
  backSurface: SurfaceSpec;

  // Material properties
  glass: GlassSpec;

  // Coatings
  frontCoating?: CoatingSpec;
  backCoating?: CoatingSpec;

  // Positioning
  position?: Vector3;
  rotation?: Vector3;
  decenter?: Vector3;
  tilt?: Vector3;

  // Aperture properties
  aperture?: ApertureSpec;

  // Classification
  lensType?: LensType;

  // Manufacturing
  tolerances?: ToleranceSpec;

  // Metadata
  partNumber?: string;
  manufacturer?: string;
  notes?: string;
}

/**
 * A simple cylindrical lens mesh with semi-transparent material.
 */
export class Lens extends SceneEntity {
  private mesh!: Mesh;
  private opts: LensOptions;

  constructor(options: LensOptions) {
    super();
    this.opts = {
      position: Vector3.Zero(),
      rotation: Vector3.Zero(),
      decenter: Vector3.Zero(),
      tilt: Vector3.Zero(),
      ...options,
    };
  }

/**
 * Create a proper lens geometry based on surface curvatures
 */
addToScene(scene: Scene): void {
  const { diameter, thickness, position, rotation, decenter, tilt, frontSurface, backSurface } = this.opts;

  // Create the lens mesh using surface curvatures
  this.mesh = this.createLensMesh(scene);

  // Apply transforms
  this.mesh.position = position!.add(decenter!);
  this.mesh.rotation = (rotation || Vector3.Zero()).add(tilt!);

  // Semi-transparent material
  const mat = new StandardMaterial("lensMaterial", scene);
  mat.alpha = 0.3;
  mat.specularPower = 64;
  mat.diffuseColor = new Color3(0.8, 0.9, 1);
  mat.backFaceCulling = false; // Render both sides
  this.mesh.material = mat;

  // Store optical metadata
  this.mesh.metadata = {
    type: "Lens",
    diameter,
    thickness,
    frontSurface,
    backSurface,
    glass: this.opts.glass,
  };
}

/**
 * Create the actual lens mesh geometry based on surface curvatures
 */
private createLensMesh(scene: Scene): Mesh {
  const { diameter, thickness, frontSurface, backSurface } = this.opts;
  const radius = diameter / 2;
  
  // Number of radial and circumferential segments
  const radialSegments = 32;
  const circumferentialSegments = 64;
  
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  
  // Calculate surface positions
  const frontZ = this.calculateSurfaceZ(frontSurface.radius, -thickness / 2);
  const backZ = this.calculateSurfaceZ(backSurface.radius, thickness / 2);
  
  // Generate vertices for front surface
  this.generateSurfaceVertices(
    positions, normals, frontSurface.radius, frontZ, 
    radius, radialSegments, circumferentialSegments, true
  );
  
  // Generate vertices for back surface
  const backVertexOffset = (radialSegments + 1) * circumferentialSegments;
  this.generateSurfaceVertices(
    positions, normals, backSurface.radius, backZ, 
    radius, radialSegments, circumferentialSegments, false
  );
  
  // Generate edge vertices (cylinder connecting front and back)
  this.generateEdgeVertices(positions, normals, radius, frontZ, backZ, circumferentialSegments);
  
  // Generate indices for surfaces
  this.generateSurfaceIndices(indices, radialSegments, circumferentialSegments, 0, false);
  this.generateSurfaceIndices(indices, radialSegments, circumferentialSegments, backVertexOffset, true);
  
  // Generate indices for edge
  const edgeVertexOffset = 2 * (radialSegments + 1) * circumferentialSegments;
  this.generateEdgeIndices(indices, circumferentialSegments, edgeVertexOffset);
  
  // Create the mesh
  const mesh = new Mesh("lens", scene);
  const vertexData = new VertexData();
  
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  
  vertexData.applyToMesh(mesh);
  
  return mesh;
}

/**
 * Calculate the z-offset for a surface at the edge based on radius of curvature
 */
private calculateSurfaceZ(radiusOfCurvature: number, centerZ: number): number {
  if (radiusOfCurvature === 0) return centerZ; // Flat surface
  
  // For spherical surfaces, the sag (z-offset) at the edge is minimal for typical lens parameters
  // We'll use the center Z position as reference
  return centerZ;
}

/**
 * Generate indices for surface triangles
 */
private generateSurfaceIndices(
  indices: number[], radialSegments: number, circumferentialSegments: number, 
  vertexOffset: number, isFrontSurface: boolean
): void {
  
  for (let r = 0; r < radialSegments; r++) {
    for (let c = 0; c < circumferentialSegments; c++) {
      const current = vertexOffset + r * circumferentialSegments + c;
      const next = vertexOffset + r * circumferentialSegments + ((c + 1) % circumferentialSegments);
      const currentNext = vertexOffset + (r + 1) * circumferentialSegments + c;
      const nextNext = vertexOffset + (r + 1) * circumferentialSegments + ((c + 1) % circumferentialSegments);
      
      if (isFrontSurface) {
        // Front surface (normal pointing outward)
        indices.push(current, next, currentNext);
        indices.push(next, nextNext, currentNext);
      } else {
        // Back surface (normal pointing inward)
        indices.push(current, currentNext, next);
        indices.push(next, currentNext, nextNext);
      }
    }
  }
}



/**
 * Generate vertices for the cylindrical edge
 */
private generateEdgeVertices(
  positions: number[], normals: number[], 
  radius: number, frontZ: number, backZ: number, 
  circumferentialSegments: number
): void {
  
  for (let c = 0; c < circumferentialSegments; c++) {
    const angle = (c / circumferentialSegments) * 2 * Math.PI;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    
    // Calculate actual surface intersection Z positions at the edge
    const frontEdgeZ = this.calculateSurfaceZAtRadius(this.opts.frontSurface.radius, frontZ, radius);
    const backEdgeZ = this.calculateSurfaceZAtRadius(this.opts.backSurface.radius, backZ, radius);
    
    // Front edge vertex
    positions.push(x, y, frontEdgeZ);
    normals.push(Math.cos(angle), Math.sin(angle), 0); // Outward normal
    
    // Back edge vertex
    positions.push(x, y, backEdgeZ);
    normals.push(Math.cos(angle), Math.sin(angle), 0); // Outward normal
  }
}

/**
 * Generate vertices for a spherical surface - Updated to use improved sag calculation
 */
private generateSurfaceVertices(
  positions: number[], normals: number[], 
  radiusOfCurvature: number, centerZ: number, 
  maxRadius: number, radialSegments: number, circumferentialSegments: number,
  isFrontSurface: boolean
): void {
  
  for (let r = 0; r <= radialSegments; r++) {
    const currentRadius = (r / radialSegments) * maxRadius;
    
    for (let c = 0; c < circumferentialSegments; c++) {
      const angle = (c / circumferentialSegments) * 2 * Math.PI;
      
      // Calculate position
      const x = currentRadius * Math.cos(angle);
      const y = currentRadius * Math.sin(angle);
      
      // Calculate z using the improved surface calculation
      const z = this.calculateSurfaceZAtRadius(radiusOfCurvature, centerZ, currentRadius);
      
      positions.push(x, y, z);
      
      // Calculate normal
      if (radiusOfCurvature === 0) {
        // Flat surface
        normals.push(0, 0, isFrontSurface ? 1 : -1);
      } else {
        // Spherical surface - normal points toward center of curvature
        const centerX = 0;
        const centerY = 0;
        const centerZ = z + (isFrontSurface ? -radiusOfCurvature : radiusOfCurvature);
        
        const nx = (x - centerX) / Math.abs(radiusOfCurvature);
        const ny = (y - centerY) / Math.abs(radiusOfCurvature);
        const nz = (z - centerZ) / Math.abs(radiusOfCurvature);
        
        // Normalize and flip if needed
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const flip = radiusOfCurvature < 0 ? -1 : 1;
        normals.push(flip * nx / length, flip * ny / length, flip * nz / length);
      }
    }
  }
}

/**
 * Calculate the actual Z position of a surface at a given radius
 */
private calculateSurfaceZAtRadius(radiusOfCurvature: number, centerZ: number, radius: number): number {
  if (radiusOfCurvature === 0) return centerZ; // Flat surface
  
  // Spherical surface sag formula: z = (r²/2R) / (1 + sqrt(1 - r²/R²))
  // For small sag angles, we can use the approximation: z ≈ r²/(2R)
  const r2 = radius * radius;
  const R = Math.abs(radiusOfCurvature);
  
  // Check if we're within the sphere's radius to avoid sqrt of negative number
  if (radius >= R) {
    // At or beyond the sphere radius, use the approximation
    const sag = r2 / (2 * R);
    return centerZ + (radiusOfCurvature > 0 ? sag : -sag);
  } else {
    // Full sag formula for accuracy
    const discriminant = 1 - (r2 / (R * R));
    const sag = r2 / (2 * R * (1 + Math.sqrt(discriminant)));
    return centerZ + (radiusOfCurvature > 0 ? sag : -sag);
  }
}

/**
 * Generate indices for cylindrical edge
 */
private generateEdgeIndices(
  indices: number[], circumferentialSegments: number, 
  vertexOffset: number
): void {
  
  for (let c = 0; c < circumferentialSegments; c++) {
    const currentFront = vertexOffset + c * 2;
    const currentBack = vertexOffset + c * 2 + 1;
    const nextFront = vertexOffset + ((c + 1) % circumferentialSegments) * 2;
    const nextBack = vertexOffset + ((c + 1) % circumferentialSegments) * 2 + 1;
    
    // Two triangles for each edge segment - winding order for outward normals
    indices.push(currentFront, currentBack, nextFront);
    indices.push(nextFront, currentBack, nextBack);
  }
}

update(deltaTime: number): void {
    // No dynamic updates
  }
}
