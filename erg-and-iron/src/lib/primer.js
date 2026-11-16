// Six-minute micro-primers for the switch between rowing and lifting.
// Each mode has five slots (60 + 90 + 60 + 90 + 60 s = 6:00). A slot has a
// focus and a pool of drills; `variant` rotates through the pools.

export const PRIMER_MODES = [
  {
    id: 'erg-to-lift',
    label: 'Post-Erg → Pre-Lift',
    from: 'Erg',
    to: 'Lift',
    summary: 'Undo the seat: open the thoracic spine and hip flexors, then switch the glutes back on before you load a bar.',
    focuses: ['Thoracic extension', 'Hip flexor opening', 'Glute activation'],
  },
  {
    id: 'lift-to-erg',
    label: 'Post-Lift → Pre-Erg',
    from: 'Lift',
    to: 'Erg',
    summary: 'Wake the nervous system without adding fatigue, free the ankles, and loosen the catch so the first strokes are long.',
    focuses: ['Nervous system priming', 'Ankle dorsiflexion', 'Loose catch mobility'],
  },
];

const d = (id, name, cue, detail, intense = false) => ({ id, name, cue, detail, intense });

const SLOTS = {
  'erg-to-lift': [
    {
      focus: 'Thoracic extension',
      seconds: 60,
      pool: [
        d('roller-ext', 'Foam Roller Thoracic Extensions', 'Ribs down, extend over the roller', 'Roller under the shoulder blades, hands behind the head. Extend back over it for 3 slow breaths, shift it one segment higher, repeat.'),
        d('bench-prayer', 'Bench T-Spine Prayer Stretch', 'Sink the chest between the arms', 'Kneel, elbows on a bench with a dowel in your hands. Sit the hips back and let the chest drop until the upper back opens.'),
        d('wall-angels', 'Wall Angels', 'Keep the low back on the wall', 'Back to the wall, slide the arms from a W to a Y without the ribs flaring or the wrists leaving the wall.'),
      ],
    },
    {
      focus: 'Hip flexor opening',
      seconds: 90,
      pool: [
        d('half-kneel', 'Half-Kneeling Hip Flexor Stretch + Reach', '45 s each side, squeeze the back glute', 'Tuck the pelvis under, shift forward until the front of the trailing hip opens, then reach that arm overhead and slightly across.'),
        d('couch', 'Couch Stretch', '45 s each side, tall torso', 'Back shin up a wall or bench, front foot planted. Tuck the pelvis first, then bring the torso upright.'),
        d('spiderman', 'Spiderman Lunge with Rotation', 'Alternate sides, long back leg', 'Step into a deep lunge, drop the inside elbow toward the instep, then rotate that arm to the ceiling.'),
      ],
    },
    {
      focus: 'Glute activation',
      seconds: 60,
      pool: [
        d('bridge-march', 'Glute Bridge March', 'Hips stay level as each knee lifts', 'Hold a bridge with the ribs down and lift one knee at a time for a two-second pause. No rocking through the pelvis.'),
        d('band-walk', 'Banded Lateral Walks', 'Knees out, feet never touch', 'Mini-band above the knees, quarter squat. Ten controlled steps each way, pushing off the trailing leg.'),
        d('sl-bridge', 'Single-Leg Glute Bridge', '30 s each side, drive through the heel', 'One knee hugged to the chest so the low back cannot take over. Pause for a second at the top of each rep.'),
      ],
    },
    {
      focus: 'Thoracic + hips',
      seconds: 90,
      pool: [
        d('wgs', "World's Greatest Stretch", 'Lunge, elbow to instep, rotate, hamstring', 'Flow through all four positions for five slow reps each side. Follow the top hand with your eyes on the rotation.'),
        d('9090', '90/90 Hip Switches with Reach', 'Tall chest, rotate from the hips', 'Sit in 90/90, lean over the front shin for two breaths, then switch sides without using your hands if you can.'),
        d('thread', 'Quadruped Thread-the-Needle', '45 s each side, hips stay over knees', 'Thread one arm under the body, then open it to the ceiling. The rotation should come from the upper back only.'),
      ],
    },
    {
      focus: 'Brace + pattern',
      seconds: 60,
      pool: [
        d('goblet-pry', 'Goblet Squat Pry', 'Elbows inside knees, chest proud', 'Light kettlebell at the chest. Sit into the bottom of the squat, pry the knees out and breathe into the belt line.'),
        d('hinge-dowel', 'Dowel Hip Hinge', 'Three points of contact on the dowel', 'Dowel along the spine touching head, upper back and tailbone. Hinge until the hamstrings load, then snap the hips through.'),
        d('dead-bug', 'Dead Bug with Full Exhale', 'Low back heavy on the floor', 'Opposite arm and leg lower slowly while you exhale completely. Reset the brace before each rep.'),
      ],
    },
  ],
  'lift-to-erg': [
    {
      focus: 'Ankle dorsiflexion',
      seconds: 60,
      pool: [
        d('knee-wall', 'Knee-to-Wall Ankle Rocks', '30 s each side, heel stays down', 'Foot a hand-width from the wall. Drive the knee over the little toe to touch the wall, pause, and return.'),
        d('squat-pry', 'Deep Squat Ankle Pry', 'Shift weight over one ankle at a time', 'Hold a rack in a deep squat and rock the knee forward over each foot, keeping the heel planted.'),
        d('band-ankle', 'Banded Ankle Mobilisation', '30 s each side, band low on the ankle', 'Band pulling back across the front of the ankle, half-kneeling. Glide the knee forward over the toes.'),
      ],
    },
    {
      focus: 'Loose catch mobility',
      seconds: 90,
      pool: [
        d('catch-hold', 'Catch-Position Squat Hold with Reach', 'Shins vertical, long arms', 'Sit in your catch position holding a rack or the erg handle. Reach long through the lats and breathe the hips open.'),
        d('ham-floss', 'Seated Hamstring Floss', 'Alternate legs, pivot from the hips', 'Sit tall on the seat or a bench, one leg straight. Hinge forward with a flat back, then ease off. Ten each side.'),
        d('child-lat', "Cat-Camel into Child's Pose Lat Reach", 'Walk the hands to each side', "Five cat-camels, then sink into child's pose and walk both hands left and right to lengthen each lat."),
      ],
    },
    {
      focus: 'Nervous system priming',
      seconds: 60,
      pool: [
        d('pogo', 'Pogo Hops', '3 × 10 s, stiff ankles, quick contacts', 'Small, fast bounces off the balls of the feet with legs nearly straight. Rest about 10 s between sets.'),
        d('legs-only', 'Legs-Only Power Tens', 'Arms straight, 10 hard leg drives', 'On the erg with arms and back locked. Ten sharp leg drives, 20 s easy, then ten more.', true),
        d('snap-jumps', 'Snap-Down to Vertical Jump', '5 crisp reps, full reset between', 'Snap from tall into a quarter squat, hold a beat, then jump. Land soft and reset completely.', true),
      ],
    },
    {
      focus: 'Catch sequencing',
      seconds: 90,
      pool: [
        d('pick', 'Reverse Pick Drill', 'Legs, then body, then arms', '20 s legs only, 20 s legs and body, then full strokes at 18 spm. Feel the handle hang off the lats.'),
        d('pause', 'Pause-at-Body-Over Strokes', 'Two-second pause, then float in', 'Light pressure at 16–18 spm. Pause with arms away and body over, then let the seat roll to a soft catch.'),
        d('half-slide', 'Half-Slide to Full-Slide Build', 'Quick hands, relaxed shoulders', 'Ten strokes at quarter slide, ten at half, ten at full, keeping the catch timing identical throughout.'),
      ],
    },
    {
      focus: 'Rate primer',
      seconds: 60,
      pool: [
        d('rate-ladder', 'Rate Ladder', '10 strokes each at 20 / 24 / 28', 'Build rate without adding length to the recovery. Pressure rises with rate; the last ten should feel sharp, not heavy.'),
        d('starts', 'Two Practice Starts', 'Half, half, three-quarter, full, then 5', 'Two race starts from stationary with a full recovery between. Short and quick, not a piece.', true),
        d('easy-build', 'Twenty-Stroke Easy Build', 'Finish at session pace', 'From paddle pressure, add a little every five strokes until the last five sit on today’s target split.'),
      ],
    },
  ],
};

export const PRIMER_TOTAL = 360;

/**
 * Build the five-drill sequence.
 *  variant  rotates each slot through its pool
 *  easy     when true (tired athlete or an easy session next), skip maximal
 *           drills in favour of sub-maximal options
 */
export function generatePrimer(modeId, variant = 0, { easy = false } = {}) {
  return SLOTS[modeId].map((slot, i) => {
    const pool = easy ? slot.pool.filter((x) => !x.intense) : slot.pool;
    const drill = pool[(variant + i) % pool.length];
    return { ...drill, focus: slot.focus, seconds: slot.seconds };
  });
}
