// Motion Study Timeline & Motor Simulation for Assemblies.

export function createMotionStudy(assembly, name = "MotionStudy1") {
  if (!assembly.motionStudies) assembly.motionStudies = [];
  const ms = {
    id: "ms_" + Date.now().toString(36),
    name,
    duration: 10, // seconds
    motors: [],
  };
  assembly.motionStudies.push(ms);
  return ms;
}

export function addRotaryMotor(motionStudy, componentId, rpm = 60, axis = { x: 0, y: 1, z: 0 }) {
  const motor = {
    id: "motor_" + Date.now().toString(36),
    type: "rotary",
    componentId,
    rpm,
    axis,
  };
  motionStudy.motors.push(motor);
  return motor;
}

export function evaluateMotionStudy(assembly, motionStudyId, timeInSeconds) {
  const ms = (assembly.motionStudies || []).find((m) => m.id === motionStudyId);
  if (!ms) return;

  for (const motor of ms.motors) {
    const comp = (assembly.components || []).find((c) => c.id === motor.componentId);
    if (!comp) continue;
    comp.transform ||= { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    if (motor.type === "rotary") {
      const degPerSec = motor.rpm * 6;
      comp.transform.ry = (degPerSec * timeInSeconds) % 360;
    }
  }
}

