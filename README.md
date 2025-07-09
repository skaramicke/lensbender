# Lens Bender Roadmap (Agile Iterations)

## Iteration 1: Math Core & Primitives
- Implement 2D/3D vector and matrix classes  
- Define basic geometric primitives (sphere, plane)  
- Write unit tests for all primitives  
- Deliverable: Packaged math & geometry library with docs  

## Iteration 2: Ray–Surface Intersection Engine
- Create `Ray` struct and intersection routines  
- Support sphere & plane intersection tests  
- Build minimal scene description format  
- Deliverable: CLI tool that outputs intersection data  

## Iteration 3: Baseline Renderer & Shading
- Implement a simple shading model (Lambertian)  
- Render monochrome images to PNG  
- Add integration tests for ray generation & shading  
- Deliverable: Rendered test images via CLI  

## Iteration 4: Refraction & Transparent Materials
- Integrate Snell’s law for refractive rays  
- Add Fresnel reflection coefficient  
- Create a transparent glass material type  
- Deliverable: Sample render with a refractive sphere  

## Iteration 5: Reflection & Advanced Coatings
- Implement perfect mirror reflection  
- Extend material library for multilayer coatings  
- Update scene format to include material properties  
- Deliverable: Render combining reflection & refraction  

## Iteration 6: Acceleration Structures
- Build BVH or KD-tree for primitives  
- Profile ray traversal and optimize node traversal  
- Write benchmarks comparing brute-force vs. BVH  
- Deliverable: ≥2× speedup on complex scenes  

## Iteration 7: Genetic Lens Evolution Framework
- Define genome encoding for lens surfaces  
- Implement selection, crossover, mutation operators  
- Integrate fitness evaluation (aberration, throughput)  
- Deliverable: Demo evolving a simple bi-convex lens  

## Iteration 8: Scene Loader, Visualization & Docs
- Add 3D scene loader (e.g., OBJ, glTF)  
- Build interactive WebGL/desktop preview  
- Finalize API reference and usage examples  
- Deliverable: Complete README, tutorials, and live demo  