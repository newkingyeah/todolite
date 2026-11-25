// The list of header animations: in layout editing, the slider below the header animation goes through them in this
// order, and the header animation style setting in the settings drawer reads this list too. The choice is stored in
// theme.heroStyle.
// Each header animation is one file carrying its own meta (id, name, one-line hint) and mount(canvas); adding or removing
// one only touches the two places here.
// See README.md in this directory for how to write one and the rules to follow.
import * as argus from "./argus.js";
import * as quietGaze from "./quiet-gaze.js";
import * as orrery from "./orrery.js";
import * as slopeField from "./slope-field.js";
import * as murmuration from "./murmuration.js";

const MODULES = [argus, quietGaze, orrery, slopeField, murmuration];

export const HEROES = MODULES.map((m) => ({ ...m.meta, mount: m.mount }));
export const heroById = (id) => HEROES.find((h) => h.id === id) ?? HEROES[0];
