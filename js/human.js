/**
 * 🧬 Advanced Anthropomorphic Generation Engine (AAGE)
 */

import * as THREE from "three";
import { SKIN, SHIRT, PANTS, HAIR } from "./state.js";
import { box, cyl, sph } from "./primitives.js";

const Gender = Object.freeze({ MALE: 'Male', FEMALE: 'Female' });
const LifeStage = Object.freeze({ CHILD: 'Child', ADULT: 'Adult', ELDER: 'Elder' });

class DNA {
    constructor(seed = Math.random()) {
        this.seed = seed;
        this.baseHeight = this._pseudoRandom(seed * 1.1); 
        this.baseBuild = this._pseudoRandom(seed * 2.2); 
        // Slight color variations could be added here
    }
    
    _pseudoRandom(s) {
        let x = Math.sin(s * 9999) * 10000;
        return x - Math.floor(x);
    }
}

class HumanModel {
    constructor(gender, dna) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.gender = gender;
        this.dna = dna;
        this.morphology = {};
        this._age = 30;
    }

    set age(value) {
        if (value < 0 || value > 120) throw new Error("Age must be between 0 and 120");
        this._age = value;
        this._calculateMorphology();
    }

    get age() { return this._age; }
    
    get lifeStage() {
        if (this._age < 13) return LifeStage.CHILD;
        if (this._age < 65) return LifeStage.ADULT;
        return LifeStage.ELDER;
    }

    _calculateMorphology() {
        // implemented by subclass
    }
}

class MaleModel extends HumanModel {
    constructor(dna) { super(Gender.MALE, dna); }

    _calculateMorphology() {
        const growthFactor = this.age < 18 ? Math.max(0.4, this.age / 18) : 1;
        const ageDecline = this.age > 65 ? (this.age - 65) * 0.15 : 0; 
        
        this.morphology = {
            height: (50 + (this.dna.baseHeight * 140)) * growthFactor - ageDecline,
            shoulderWidth: (20 + (this.dna.baseBuild * 25)) * growthFactor,
            muscleMass: this.age > 16 && this.age < 50 ? 0.7 + (this.dna.baseBuild * 0.3) : 0.4,
            postureBend: this.age > 70 ? Math.min((this.age - 70) * 0.5, 15) : 0
        };
    }
}

class FemaleModel extends HumanModel {
    constructor(dna) { super(Gender.FEMALE, dna); }

    _calculateMorphology() {
        const growthFactor = this.age < 16 ? Math.max(0.4, this.age / 16) : 1;
        const ageDecline = this.age > 65 ? (this.age - 65) * 0.12 : 0;

        this.morphology = {
            height: (48 + (this.dna.baseHeight * 125)) * growthFactor - ageDecline,
            shoulderWidth: (16 + (this.dna.baseBuild * 20)) * growthFactor,
            muscleMass: this.age > 14 && this.age < 45 ? 0.5 + (this.dna.baseBuild * 0.2) : 0.3,
            postureBend: this.age > 75 ? Math.min((this.age - 75) * 0.4, 12) : 0
        };
    }
}

export class HumanFactory {
    static createArchetype(type, ageObj) {
        const dna = new DNA(Math.random());
        let model;

        switch (type.toLowerCase()) {
            case 'man':
            case 'boy':
            case 'oldman':
                model = new MaleModel(dna);
                break;
            case 'woman':
            case 'girl':
            case 'oldwoman':
                model = new FemaleModel(dna);
                break;
            default:
                model = new MaleModel(dna);
        }

        if (ageObj && typeof ageObj === 'number') {
            model.age = ageObj;
        } else {
            if (['boy', 'girl'].includes(type.toLowerCase())) model.age = 8;
            else if (['man', 'woman'].includes(type.toLowerCase())) model.age = Math.floor(25 + Math.random() * 20);
            else if (['oldman', 'oldwoman'].includes(type.toLowerCase())) model.age = Math.floor(70 + Math.random() * 15);
        }

        return model;
    }

    static buildMesh(g, type, targetH) {
        const model = this.createArchetype(type);
        const dna = model.dna;
        type = (type || 'man').toLowerCase();

        const SPEC = {
            man:      { H: 176, female: false, child: false, elder: false },
            woman:    { H: 165, female: true,  child: false, elder: false },
            boy:      { H: 128, female: false, child: true,  elder: false },
            girl:     { H: 122, female: true,  child: true,  elder: false },
            oldman:   { H: 168, female: false, child: false, elder: true },
            oldwoman: { H: 157, female: true,  child: false, elder: true }
        };
        const spec = SPEC[type] || SPEC.man;
        const { female, child, elder } = spec;
        const H = spec.H * (0.97 + dna.baseHeight * 0.06);
        const build = 0.92 + dna.baseBuild * 0.16; // slim ↔ broad

        // ---- palette (per-instance variation seeded by DNA) ----
        const vary = (hex, dh, dl) => {
            const c = new THREE.Color(hex);
            c.offsetHSL((dna.seed - 0.5) * dh, 0, (dna.baseBuild - 0.5) * dl);
            return c.getHex();
        };
        const SHIRTS_M = [0x3d6ea5, 0x5d8a4e, 0x8a5d4e, 0x546e7a, 0x7a5d8a];
        const SHIRTS_F = [0xa5527a, 0x7a5d9e, 0xc2704f, 0x4e8a7d, 0xb0574f];
        const skinC  = vary(SKIN, 0.02, 0.10);
        const shirtC = vary((female ? SHIRTS_F : SHIRTS_M)[Math.floor(dna.seed * 5) % 5], 0.03, 0.08);
        const pantsC = vary(elder ? 0x6b6558 : PANTS, 0.02, 0.06);
        const hairC  = elder ? (dna.seed > 0.5 ? 0xd8d4cc : 0xb9b4aa) : vary(HAIR, 0.05, 0.22);
        const shoeC  = 0x2a2320;

        // ---- proportions ----
        const headH = H / (child ? 5.6 : 7.4);
        const headR = headH * 0.5;
        const neckH = headH * (child ? 0.18 : 0.3);
        const shoulderY = H - headH - neckH;
        const hipY = H * (child ? 0.47 : 0.52);
        const shoulderHalf = H * (female ? 0.098 : 0.115) * build;
        const hipHalf = shoulderHalf * (female ? 1.02 : 0.86);
        const flat = 0.62; // depth/width ratio of the body
        const torsoH = shoulderY - hipY;
        const armR = H * 0.024 * build;
        const legR = H * 0.032 * build;
        const kneeY = hipY * 0.52;
        const stoop = elder ? (10 + dna.seed * 6) * Math.PI / 180 : 0;

        // ---- helpers ----
        const mat = (color, rough, metal) => new THREE.MeshStandardMaterial({
            color, roughness: rough != null ? rough : 0.75, metalness: metal || 0.02
        });
        const skinM = mat(skinC, 0.55), shirtM = mat(shirtC, 0.8), pantsM = mat(pantsC, 0.85), hairM = mat(hairC, 0.9);
        function add(parent, geo, m, x, y, z, sx, sy, sz) {
            const me = new THREE.Mesh(geo, m);
            me.position.set(x, y, z);
            if (sx != null) me.scale.set(sx, sy, sz);
            me.castShadow = me.receiveShadow = true;
            parent.add(me);
            return me;
        }
        const SPH = (r, w, h) => new THREE.SphereGeometry(r, w || 20, h || 14);
        // limb: tapered capsule hanging DOWN from the group origin (pivot = joint)
        function limb(parent, rTop, rBot, len, m, x, y, z) {
            const grp = new THREE.Group();
            grp.position.set(x, y, z);
            parent.add(grp);
            add(grp, new THREE.CylinderGeometry(rTop, rBot, len, 14), m, 0, -len / 2, 0);
            add(grp, SPH(rTop, 14, 10), m, 0, 0, 0);
            add(grp, SPH(rBot, 14, 10), m, 0, -len, 0);
            return grp;
        }

        g.userData.isHuman = true;
        g.userData.timeOffset = Math.random() * 100;
        g.userData.humanType = type;
        g.userData.stoop = stoop;

        // ---- legs: thigh + calf + shoe (skirt types get tights) ----
        const legM = female ? mat(0x4a4048, 0.85) : pantsM;
        const legX = hipHalf * 0.52;
        [-1, 1].forEach(side => {
            const hipG = limb(g, legR, legR * 0.8, hipY - kneeY, legM, side * legX, hipY, 0);
            limb(hipG, legR * 0.8, legR * 0.62, kneeY - H * 0.02, legM, 0, -(hipY - kneeY), 0);
            g.userData[side < 0 ? 'leftLeg' : 'rightLeg'] = hipG;
            // shoe: rounded box, toe forward (+Z)
            const shoe = add(g, new THREE.BoxGeometry(legR * 2.2, H * 0.028, legR * 4.2), mat(shoeC, 0.5, 0.1),
                side * legX, H * 0.014, legR * 1.1);
            shoe.geometry.translate(0, 0, 0);
        });

        // ---- torso group (pivots at the hips for stoop/breathing) ----
        const torsoGroup = new THREE.Group();
        torsoGroup.position.set(0, hipY, 0);
        torsoGroup.rotation.x = stoop;
        g.add(torsoGroup);
        g.userData.torsoGroup = torsoGroup;

        // shaped torso: lathe profile hips → waist → chest → shoulders
        const prof = [];
        const waistR = hipHalf * (female ? 0.74 : 0.86);
        const chestR = shoulderHalf * (female ? 0.88 : 0.95);
        [[hipHalf * 0.96, 0], [hipHalf, 0.06], [waistR, 0.42], [chestR, 0.74],
         [shoulderHalf * 0.98, 0.9], [shoulderHalf * 0.62, 1.0]].forEach(p =>
            prof.push(new THREE.Vector2(Math.max(p[0], 0.1), p[1] * torsoH)));
        const torso = add(torsoGroup, new THREE.LatheGeometry(prof, 20), shirtM, 0, 0, 0);
        torso.scale.z = flat;
        // pelvis cap
        add(torsoGroup, SPH(hipHalf * 0.98, 18, 12), female ? legM : pantsM, 0, 0, 0).scale.set(1, 0.62, flat);

        // dress/skirt for female types: flared cone from hips toward the knees
        if (female) {
            const skirtL = child ? (hipY - kneeY) * 0.7 : (hipY - kneeY) * 0.95;
            const sk = add(torsoGroup, new THREE.CylinderGeometry(hipHalf * 1.02, hipHalf * 1.55, skirtL, 20, 1, true),
                shirtM, 0, -skirtL / 2 + 1, 0);
            sk.scale.z = flat + 0.12;
            sk.material.side = THREE.DoubleSide;
        }

        // ---- arms: pivot at shoulder — upper arm (sleeve) + forearm (skin) + hand ----
        const shortSleeve = !elder && !female;
        const upperL = torsoH * 0.52, foreL = torsoH * 0.48;
        [-1, 1].forEach(side => {
            const sh = limb(torsoGroup, armR * 1.15, armR, upperL,
                shirtM, side * (shoulderHalf + armR * 0.4), torsoH - armR * 1.2, 0);
            sh.rotation.z = side * 0.09; // relaxed, slightly out from the body
            const fore = limb(sh, armR * 0.95, armR * 0.75, foreL,
                shortSleeve ? skinM : (elder ? shirtM : skinM), 0, -upperL, 0);
            fore.rotation.x = -0.12; // natural elbow bend
            add(fore, SPH(armR * 1.15, 14, 10), skinM, 0, -foreL - armR * 0.4, 0).scale.set(0.85, 1.15, 0.85);
            g.userData[side < 0 ? 'leftArm' : 'rightArm'] = sh;
        });

        // ---- head group ----
        const headG = new THREE.Group();
        headG.position.set(0, torsoH + neckH + headR * 0.9, 0);
        torsoGroup.add(headG);
        g.userData.headGroup = headG;
        // neck
        add(torsoGroup, new THREE.CylinderGeometry(headR * 0.42, headR * 0.5, neckH + headR * 0.6, 12),
            skinM, 0, torsoH + neckH * 0.4, 0);
        // skull (slightly egg-shaped)
        add(headG, SPH(headR, 24, 18), skinM, 0, 0, 0).scale.set(0.92, 1.12, 0.98);
        // eyes: whites + pupils + brows
        const eyeR = headR * 0.17;
        [-1, 1].forEach(side => {
            add(headG, SPH(eyeR, 12, 10), mat(0xf5f2ec, 0.35), side * headR * 0.36, headR * 0.1, headR * 0.72);
            add(headG, SPH(eyeR * 0.45, 10, 8), mat(0x2c2018, 0.3), side * headR * 0.36, headR * 0.1, headR * 0.86);
            const brow = add(headG, new THREE.BoxGeometry(headR * 0.42, headR * 0.09, headR * 0.1),
                hairM, side * headR * 0.36, headR * 0.36, headR * 0.82);
            brow.rotation.z = side * -0.15;
            // ears
            add(headG, SPH(headR * 0.22, 10, 8), skinM, side * headR * 0.92, 0, 0).scale.set(0.5, 1, 0.7);
        });
        // nose + mouth
        add(headG, SPH(headR * 0.16, 10, 8), skinM, 0, -headR * 0.08, headR * 0.92).scale.set(0.8, 1.1, 1);
        const mouth = add(headG, new THREE.BoxGeometry(headR * 0.42, headR * 0.07, headR * 0.06),
            mat(0xb06a5a, 0.5), 0, -headR * 0.44, headR * 0.84);
        mouth.rotation.x = 0.1;

        // ---- hair ----
        const balding = type === 'oldman';
        if (!balding) {
            // cap covering top + back of the skull
            const cap = add(headG, SPH(headR * 1.06, 24, 16, ), hairM, 0, headR * 0.12, -headR * 0.1);
            cap.scale.set(0.96, 1.05, 1.0);
            cap.geometry = new THREE.SphereGeometry(headR * 1.06, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
        } else {
            // ring of hair around the sides, bare crown
            const ring = add(headG, new THREE.CylinderGeometry(headR * 1.02, headR * 1.02, headR * 0.5, 18, 1, true),
                hairM, 0, -headR * 0.05, -headR * 0.06);
            ring.material.side = THREE.DoubleSide;
        }
        if (female && !child) {
            // long hair falling behind the shoulders
            const back = add(headG, new THREE.CylinderGeometry(headR * 0.85, headR * 0.55, headR * 2.4, 14),
                hairM, 0, -headR * 0.7, -headR * 0.62);
            back.scale.z = 0.55;
        } else if (female && child) {
            // pigtails
            [-1, 1].forEach(side => {
                add(headG, SPH(headR * 0.3, 10, 8), hairM, side * headR * 1.0, headR * 0.35, -headR * 0.15);
                add(headG, new THREE.CylinderGeometry(headR * 0.16, headR * 0.1, headR * 1.0, 8),
                    hairM, side * headR * 1.05, -headR * 0.15, -headR * 0.15);
            });
        }

        // ---- elder extras: glasses + wooden cane ----
        if (elder) {
            const gm = mat(0x504a42, 0.35, 0.6);
            [-1, 1].forEach(side => {
                const rim = add(headG, new THREE.TorusGeometry(eyeR * 1.5, headR * 0.035, 8, 20),
                    gm, side * headR * 0.36, headR * 0.1, headR * 0.8);
                rim.rotation.y = 0; // facing +Z already
            });
            add(headG, new THREE.BoxGeometry(headR * 0.3, headR * 0.05, headR * 0.05), gm, 0, headR * 0.1, headR * 0.82);
            const caneM = mat(0x7a5230, 0.6);
            const caneH = hipY * 1.05;
            const cane = add(g, new THREE.CylinderGeometry(1.4, 1.7, caneH, 10), caneM,
                (female ? -1 : 1) * (shoulderHalf + armR * 3), caneH / 2, H * 0.06);
            add(cane, new THREE.CylinderGeometry(1.5, 1.5, headR * 0.9, 10), caneM, 0, caneH / 2, -headR * 0.3)
                .rotation.x = Math.PI / 2;
            cane.rotation.x = -0.06;
        }

        // scale the whole figure to the catalog height, if given
        if (targetH && targetH > 10) g.children.forEach(() => {});
        if (targetH && targetH > 10) g.scale.multiplyScalar(targetH / H);
    }

    static animateHuman(g, time) {
        const u = g.userData;
        if (!u.isHuman) return;
        const t = time * 0.003 + u.timeOffset;

        // breathing: gentle chest rise on top of the elder stoop
        if (u.torsoGroup) {
            u.torsoGroup.rotation.x = (u.stoop || 0) + Math.sin(t * 0.55) * 0.02;
            u.torsoGroup.rotation.z = Math.sin(t * 0.23) * 0.012; // slow weight shift
        }
        // relaxed anti-phase arm sway from the shoulder
        if (u.leftArm && u.rightArm) {
            u.leftArm.rotation.x = Math.sin(t * 0.55 + Math.PI) * 0.06;
            u.rightArm.rotation.x = Math.sin(t * 0.55) * 0.06;
        }
        // idle head: looking around slowly
        if (u.headGroup) {
            u.headGroup.rotation.y = Math.sin(t * 0.17) * 0.28;
            u.headGroup.rotation.x = Math.sin(t * 0.31) * 0.05;
        }
    }
}
