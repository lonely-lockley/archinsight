import { coreLanguageSnapshot } from "../build/runtime/index.js";
import { TypeSystem } from "../build/runtime/type-system.js";

let failures = 0;
const typeSystem = new TypeSystem(coreLanguageSnapshot);

const componentConstructor = coreLanguageSnapshot.constructors.find((constructor) =>
  constructor.spelling === "component" && constructor.ownerType === "Component"
);
if (componentConstructor === undefined) {
  failures++;
  console.error("expected core snapshot to include Component constructor 'component'");
}

const componentList = typeSystem.anonymousListAttribute("Service");
const serviceHasComponentList = componentList?.name === "_"
  && componentList.type === "List"
  && componentList.list === true
  && componentList.listElementType === "Component";
if (!serviceHasComponentList) {
  failures++;
  console.error("expected Service to have anonymous List of Component attribute");
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("core snapshot checks passed");
}
