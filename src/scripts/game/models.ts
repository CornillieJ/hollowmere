import * as THREE from 'three';

/**
 * Swaps a stand-in built from boxes for its modelled self.
 *
 * Everything in the valley is first put up as primitives, so the world is
 * complete on the first frame and stays complete if a download fails. `modelled`
 * then loads `static/models/props/<id>.glb` (built by `tools/blender/build_props.py`)
 * and, when it arrives, takes the primitive meshes off the holder and hangs the
 * model's parts there instead. Position, turn, scale, colliders, interactions,
 * lights and labels all belong to the holder and are untouched.
 *
 * Parts named `glow...` are made to shine; a crop's `ripe` part follows the
 * holder's `userData.ripe`.
 */
export function modelled<T extends THREE.Object3D>(game: Game, id: string, holder: T, folder = 'props'): T {
    void game.assets
        .loadModel(`models/${folder}/${id}.glb`)
        .then((model) => {
            // Primitives go; labels, lights and anything marked to keep stay.
            for (const child of [...holder.children]) {
                if ((child as THREE.Mesh).isMesh && !child.userData.billboard && !child.userData.keep) child.removeFromParent();
            }
            for (const part of [...model.children]) {
                part.traverse((node) => finish(node as THREE.Mesh));
                if (part.name === 'ripe') part.visible = holder.userData.ripe === true;
                holder.add(part);
            }
        })
        .catch(() => undefined);
    return holder;
}

/** Hard pixels and no shine, and a glow for the parts that ask for one. */
function finish(mesh: THREE.Mesh): void {
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const source = mesh.material as THREE.MeshStandardMaterial;
    const glows = mesh.name.startsWith('glow');
    // A glowing part gets its own material, so the rest of the model stays unlit by it.
    const material = glows ? source.clone() : source;
    if (material.map) {
        material.map.magFilter = THREE.NearestFilter;
        material.map.minFilter = THREE.NearestFilter;
        material.map.needsUpdate = true;
    }
    material.roughness = 1;
    material.metalness = 0;
    if (glows) {
        material.emissive = new THREE.Color(0xffffff);
        material.emissiveMap = material.map;
        material.emissiveIntensity = 1.6;
        mesh.castShadow = false;
    }
    mesh.material = material;
}

/** An empty holder for a model with no primitive stand-in worth building, e.g. a crop. */
export function modelOnly(game: Game, id: string): THREE.Group {
    return modelled(game, id, new THREE.Group());
}
