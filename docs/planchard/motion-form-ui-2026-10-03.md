# Rotary motor form UI — 2026-10-03

The motion form previously described tooth-ratio motion and displayed gear tooth/driver/follower controls even for a plain rotary motor with no gear relation.

The plain motor form now explains motor speed, axis, time, and existing mate constraints. Its default gear-relation choice says **Motor only** when the study has no gear relations. Driver, follower, tooth counts, gear axes, and mesh controls appear when adding or editing a gear relation. The removal checkbox appears only while editing an existing relation. Existing retained gear relations keep their gear-specific help and **Keep existing relations** choice.

This changes form presentation and bilingual wording. It does not change motion evaluation, saved motor geometry, mate solving, or gear semantics.

Verification: 12 targeted motion and rigid-lock tests passed. The form test covers successful plain-motor application, adding a new relation, retaining saved relations, and editing an existing relation. Browser visual verification requires a reload and remains with the main agent.

```
node --test tests/motion_form_component_ids.test.mjs tests/rigid_lock_motion.test.mjs
npm run check
```
