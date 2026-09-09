import { createRuntime } from './runtime-contract.js';
import { runtimeProfile } from './runtime-profile.js';

// Resolve once before startup, slot boot or vehicle creation. Edition selection
// belongs to build inputs, never a URL parameter or a localStorage entitlement.
export const runtime = createRuntime(runtimeProfile);
