/**
 * Control schemes barrel.
 *
 * Each one registers itself as a system on construction, so creating a
 * controller is all a template has to do.
 */
export { PointerLook, type PointerLookOptions } from './pointer-look';
export { CharacterMovement, type CharacterMovementOptions } from './character-movement';
export { FirstPersonController, type FirstPersonOptions } from './first-person';
export { ThirdPersonController, type ThirdPersonOptions } from './third-person';
export { TopDownController, type TopDownOptions } from './top-down';
export { OrbitController, type OrbitOptions } from './orbit';
