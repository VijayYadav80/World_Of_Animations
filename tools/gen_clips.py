"""Generates Raju's animation clips + posture poses into rig.json (data only; the engine is generic).
Run from 2DAnimation.UI/public:  python3 ../../../tools/gen_clips.py
Conventions: rotations in degrees, +clockwise on screen. A downward limb rotated +deg swings BACK; -deg swings FORWARD.
Ground contact: for every grounded frame the hip height is solved by forward kinematics so the lowest foot point touches y=0."""
import json, math
P = "assets/characters/raju/rig.json"
rig = json.load(open(P, encoding="utf-8"))
D = rig["defaultPose"]["rotations"]
HIP_Y, UL, LL = -178, 80, 84
FOOT_CORNERS = [(-14, 14), (42, 14), (-14, -4), (42, -4)]

def R(a, x, y):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    return x * c - y * s, x * s + y * c

def lowest_local(rot):
    """Largest y (lowest point) of both feet relative to the hip origin (hip rotation 0)."""
    m = -1e9
    for side, hx in (("F", 8), ("B", -8)):
        u, l, f = rot["upperLeg" + side], rot["lowerLeg" + side], rot["foot" + side]
        kx, ky = R(u, 0, UL)
        ax, ay = R(u + l, 0, LL)
        ax, ay = hx + kx + ax, ky + ay
        for cx, cy in FOOT_CORNERS:
            _, wy = R(u + l + f, cx, cy)
            m = max(m, ay + wy)
    return m

def ground_offset(rot):
    return round(-lowest_local(rot) - HIP_Y, 1)   # hip y offset that puts the lowest foot point on y = 0

def ss(x):
    x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)

def lerp(a, b, t): return a + (b - a) * t
def lerp_pose(a, b, t):
    return {k: lerp(a.get(k, D.get(k, 0)), b.get(k, D.get(k, 0)), t) for k in set(a) | set(b)}

def full(rot):
    r = dict(D); r.update(rot); return r

def build(cid, name, dur, n, loop, frame, additive=False, start="stand", end="stand", speed=None, variants=None, note=None):
    rotations, hx, hy = {}, [], []
    for i in range(n + 1):
        p = (i / n) if not (loop and i == n) else 0.0
        t = round(dur * i / n)
        rot, extra = frame(p)
        if not additive:
            base = full(rot)
            y = ground_offset(base) - extra.get("lift", 0)
            hy.append([t, round(y, 1)])
            if extra.get("hipx") is not None: hx.append([t, round(extra["hipx"], 1)])
        for b, v in rot.items():
            rotations.setdefault(b, []).append([t, round(v, 1)])
    clip = {"id": cid, "displayName": name, "duration": dur, "loop": loop, "additive": additive,
            "startPosture": start, "endPosture": end, "status": "complete",
            "rotations": rotations, "offsets": {}}
    if hy: clip["offsets"]["hip"] = {"y": hy, **({"x": hx} if hx else {})}
    if variants: clip["variants"] = variants
    if speed: clip["groundSpeed"] = speed
    if note: clip["note"] = note
    return clip

S = math.sin; C = math.cos; TAU = 2 * math.pi
def legs(u, l, rot, side, flat=0.85):
    rot["upperLeg" + side] = u; rot["lowerLeg" + side] = l; rot["foot" + side] = -(u + l) * flat

def walk(p):
    s, c, r = S(TAU * p), C(TAU * p), {}
    legs(-26 * s, 42 * max(0, c), r, "F"); legs(26 * s, 42 * max(0, -c), r, "B")
    r.update(torso=3, head=-2, upperArmF=-6 + 24 * s, upperArmB=5 - 24 * s, forearmF=-14 - 6 * c, forearmB=-10 + 6 * c)
    return r, {}

def run(p):
    s, c, r = S(TAU * p), C(TAU * p), {}
    legs(-52 * s, 12 + 85 * max(0, c), r, "F", 0.7); legs(52 * s, 12 + 85 * max(0, -c), r, "B", 0.7)
    r.update(torso=12, head=-8, upperArmF=-10 + 45 * s, upperArmB=-10 - 45 * s, forearmF=-85 - 8 * c, forearmB=-85 + 8 * c)
    return r, {"lift": 12 * 0.5 * (1 - C(2 * TAU * p))}

def idle(p):
    s = S(TAU * p)
    return {"torso": 1.2 * s, "head": 1.8 * S(TAU * p + 0.8), "upperArmF": -6 + 1.5 * s, "upperArmB": 5 - 1.5 * s,
            "forearmF": -10 + 1.0 * s, "forearmB": -6 - 1.0 * s}, {}

SIT = {"torso": 2, "head": 0, "upperArmF": -18, "forearmF": -70, "upperArmB": -10, "forearmB": -60, "handF": 0, "handB": 0}
legs(-90, 88, SIT, "F", 1.0); legs(-86, 90, SIT, "B", 1.0)
SIT_HIPX = -16
STAND = dict(D)

def sit(p):
    s = ss(p); r = lerp_pose(STAND, SIT, s)
    r["torso"] += 14 * S(math.pi * p); r["head"] -= 6 * S(math.pi * p)
    return r, {"hipx": SIT_HIPX * s}

def getup(p):
    s = ss(p); r = lerp_pose(SIT, STAND, s)
    r["torso"] += 24 * S(math.pi * p); r["head"] -= 10 * S(math.pi * p)
    r["upperArmF"] -= 20 * S(math.pi * p)
    return r, {"hipx": SIT_HIPX * (1 - s)}

def pose_k(**kw): return kw
J = [
 (0.00, dict(STAND)),
 (0.20, {**{"torso": 14, "head": -6, "upperArmF": 35, "upperArmB": 38, "forearmF": -20, "forearmB": -20}, **(lambda r: (legs(-50, 95, r, "F", 1), legs(-46, 92, r, "B", 1), r)[2])({})}),
 (0.32, {**{"torso": 4, "head": 0, "upperArmF": -150, "upperArmB": -140, "forearmF": -10, "forearmB": -10}, **(lambda r: (legs(-6, 3, r, "F", 0), legs(6, 5, r, "B", 0), r.update(footF=25, footB=25), r)[3])({})}),
 (0.55, {**{"torso": 0, "head": 2, "upperArmF": -165, "upperArmB": -155, "forearmF": -8, "forearmB": -8}, **(lambda r: (legs(-30, 50, r, "F", 0), legs(-10, 30, r, "B", 0), r.update(footF=10, footB=10), r)[3])({})}),
 (0.78, {**{"torso": 2, "head": 0, "upperArmF": -90, "upperArmB": -80, "forearmF": -10, "forearmB": -10}, **(lambda r: (legs(-15, 10, r, "F", 0), legs(-5, 5, r, "B", 0), r.update(footF=10, footB=10), r)[3])({})}),
 (0.88, {**{"torso": 10, "head": -4, "upperArmF": -20, "upperArmB": -10, "forearmF": -20, "forearmB": -20}, **(lambda r: (legs(-40, 80, r, "F", 1), legs(-38, 78, r, "B", 1), r)[2])({})}),
 (1.00, dict(STAND)),
]
def jump(p):
    for (p0, a), (p1, b) in zip(J, J[1:]):
        if p0 <= p <= p1:
            r = lerp_pose(a, b, ss((p - p0) / (p1 - p0))); break
    lift = 0.0
    if 0.32 < p < 0.78:
        u = (p - 0.32) / 0.46; lift = 150 * 4 * u * (1 - u)
    return r, {"lift": lift}

def envelope(p, up, down):
    return ss(p / up) if p < 0.5 else ss((1 - p) / down)

def wave(p):
    e = envelope(p, 0.2, 0.18); w = S(TAU * 4 * max(0, (p - 0.2) / 0.62)) * (1 if 0.2 <= p <= 0.82 else 0)
    return {"upperArmF": -6 + -80 * e, "forearmF": -10 * (1 - e) + e * (-85 + 32 * w), "handF": 10 * w * e, "head": 4 * e}, {}

def point(p):
    e = envelope(p, 0.25, 0.2)
    return {"upperArmF": -6 + -82 * e, "forearmF": -10 + 6 * e, "handF": 0, "head": 3 * e, "torso": 2 * e}, {}

def talk(p):
    s = S(TAU * p)
    return {"head": 2.5 * S(2 * TAU * p), "torso": 0.8 * s, "forearmF": -10 - 12 * max(0, s), "upperArmF": -6 - 8 * max(0, S(TAU * p + 1))}, {}

talk_v = [[0, "closed"]]
t = 90
for o, c in [(150, 90), (110, 70), (190, 110), (130, 80), (160, 120), (120, 70), (170, 90), (140, 100)]:
    talk_v += [[t, "open"], [t + o, "closed"]]; t += o + c
talk_v += [[1800, "closed"]]

clips = [
 build("idle", "Idle", 3200, 16, True, idle, variants={"eyes": [[0, "open"], [2900, "closed"], [3020, "open"]]}),
 build("stand", "Stand", 500, 2, False, lambda p: ({}, {})),
 build("walk", "Walk", 1000, 12, True, walk, speed=270),
 build("run", "Run", 640, 16, True, run, speed=760),
 build("sit", "Sit", 800, 16, False, sit, end="sit"),
 build("get-up", "Get Up", 900, 18, False, getup, start="sit"),
 build("jump", "Jump", 1000, 40, False, jump),
 build("wave", "Wave", 1600, 32, False, wave, additive=True, start="inherit", end="inherit",
       variants={"mouth": [[0, "closed"], [150, "smile"], [1300, "closed"]]}),
 build("talk", "Talk", 1800, 18, True, talk, additive=True, start="inherit", end="inherit", variants={"mouth": talk_v},
       note="Mouth uses open/closed states; no phoneme-accurate lip-sync."),
 build("point", "Point", 1400, 14, False, point, additive=True, start="inherit", end="inherit",
       note="Points forward (facing direction). Use flip to point the other way."),
]
sit_rot = full(SIT)
rig["animations"] = clips
rig["poses"] = {
  "stand": {"rotations": dict(D), "offsets": {"hip": {"x": 0, "y": ground_offset(full({}))}}},
  "sit": {"rotations": sit_rot, "offsets": {"hip": {"x": SIT_HIPX, "y": ground_offset(sit_rot)}}},
}
json.dump(rig, open(P, "w", encoding="utf-8"), indent=1)
print("clips:", [c["id"] for c in clips], "| stand y", rig["poses"]["stand"]["offsets"], "| sit", rig["poses"]["sit"]["offsets"])
