// Diagnostic observers are attached to a World outside its serialized state.
const observers = new WeakMap();

export function setPopulationPhaseObserver(world, observer) {
  if (observer) observers.set(world, observer);
  else observers.delete(world);
}

export function observePopulationPhase(world, phase, detail = null) {
  observers.get(world)?.(phase, detail);
}
