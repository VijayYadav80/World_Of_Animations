# Generates Raju's original SVG body parts. Run: python3 gen_parts.py
import os
OUT = "assets/characters/raju/parts"
SKIN, SKIN_D, OUTL = "#C98A5B", "#B27648", "#3A2418"
KURTA, KURTA_D = "#E8892B", "#CF7418"
PAJ, PAJ_D = "#F4EFE3", "#DDD5C2"
HAIR = "#1E1A1A"
S = 'stroke="%s" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"' % OUTL

def svg(name, w, h, body):
    with open(os.path.join(OUT, name + ".svg"), "w", encoding="utf-8") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">%s</svg>' % (w, h, w, h, body))

# torso 90x120, pivot (45,120): kurta
svg("torso", 90, 120,
 f'<path d="M20 6 Q45 -2 70 6 Q84 12 84 34 L88 112 Q88 118 80 118 L10 118 Q2 118 2 112 L6 34 Q6 12 20 6 Z" fill="{KURTA}" {S}/>'
 f'<path d="M34 6 Q45 26 56 6" fill="{SKIN}" {S}/>'
 f'<path d="M45 24 L45 80" stroke="{KURTA_D}" stroke-width="3" fill="none"/>'
 f'<circle cx="45" cy="36" r="2.6" fill="{OUTL}"/><circle cx="45" cy="52" r="2.6" fill="{OUTL}"/><circle cx="45" cy="68" r="2.6" fill="{OUTL}"/>'
 f'<path d="M6 104 L84 104" stroke="{KURTA_D}" stroke-width="3" fill="none"/>')

# head 110x130, pivot (55,125): face, ears, neck, nose
svg("head", 110, 130,
 f'<rect x="43" y="98" width="24" height="32" rx="8" fill="{SKIN_D}" {S}/>'
 f'<ellipse cx="12" cy="70" rx="9" ry="14" fill="{SKIN}" {S}/><ellipse cx="98" cy="70" rx="9" ry="14" fill="{SKIN}" {S}/>'
 f'<ellipse cx="55" cy="62" rx="44" ry="52" fill="{SKIN}" {S}/>'
 f'<path d="M68 76 Q76 82 68 86" fill="none" stroke="{SKIN_D}" stroke-width="3" stroke-linecap="round"/>')

# hair 120x62, pivot (60,0)
svg("hair", 120, 62,
 f'<path d="M4 46 C-2 18 28 1 60 1 C92 1 122 18 116 46 C100 30 82 24 60 26 C38 24 20 30 4 46 Z" fill="{HAIR}" {S}/>')

# eyes (open / closed) 56x24 pivot (28,12)
def eye(cx):
    return (f'<ellipse cx="{cx}" cy="12" rx="9" ry="10" fill="#fff" {S}/>'
            f'<circle cx="{cx+2}" cy="13" r="5" fill="#2B1A12"/><circle cx="{cx+4}" cy="10.5" r="1.8" fill="#fff"/>')
svg("eyes-open", 56, 24, eye(14) + eye(42))
svg("eyes-closed", 56, 24,
 f'<path d="M5 13 Q14 19 23 13" fill="none" {S}/><path d="M33 13 Q42 19 51 13" fill="none" {S}/>')
# brows 60x14 pivot (30,7)
svg("brows", 60, 14,
 f'<path d="M6 9 Q16 2 26 7" fill="none" stroke="{HAIR}" stroke-width="4" stroke-linecap="round"/>'
 f'<path d="M34 7 Q44 2 54 9" fill="none" stroke="{HAIR}" stroke-width="4" stroke-linecap="round"/>')
# mouths 30x16 pivot (15,8)
svg("mouth-closed", 30, 16, f'<path d="M5 6 Q15 12 25 6" fill="none" {S}/>')
svg("mouth-open", 30, 16,
 f'<path d="M5 4 Q15 3 25 4 Q24 15 15 15 Q6 15 5 4 Z" fill="#7A1F1F" {S}/>'
 f'<path d="M9 12 Q15 8 21 12 Q15 15 9 12 Z" fill="#E07A7A"/>')
svg("mouth-smile", 30, 16,
 f'<path d="M4 4 Q15 18 26 4 Q15 8 4 4 Z" fill="#7A1F1F" {S}/>')

# arms. upperArm 26x78 pivot (13,10); forearm 22x72 pivot (11,8); hand 24x28 pivot (12,5)
svg("upper-arm", 26, 78,
 f'<rect x="2" y="2" width="22" height="46" rx="11" fill="{KURTA}" {S}/>'
 f'<rect x="4" y="40" width="18" height="36" rx="9" fill="{SKIN}" {S}/>'
 f'<rect x="2" y="38" width="22" height="10" rx="4" fill="{KURTA_D}" {S}/>')
svg("forearm", 22, 72, f'<rect x="2" y="2" width="18" height="68" rx="9" fill="{SKIN}" {S}/>')
svg("hand", 24, 28,
 f'<ellipse cx="12" cy="14" rx="9" ry="12" fill="{SKIN}" {S}/><ellipse cx="20" cy="12" rx="3.5" ry="6" fill="{SKIN}" {S}/>')

# legs. upperLeg 34x98 pivot (17,10); lowerLeg 30x100 pivot (15,8); foot 56x18 pivot (14,4)
svg("upper-leg", 34, 98, f'<rect x="2" y="2" width="30" height="94" rx="14" fill="{PAJ}" {S}/>'
    f'<path d="M6 60 L28 60" stroke="{PAJ_D}" stroke-width="3"/>')
svg("lower-leg", 30, 100,
 f'<rect x="2" y="2" width="26" height="76" rx="12" fill="{PAJ}" {S}/>'
 f'<rect x="6" y="72" width="18" height="26" rx="8" fill="{SKIN}" {S}/>'
 f'<rect x="2" y="68" width="26" height="9" rx="4" fill="{PAJ_D}" {S}/>')
svg("foot", 56, 18,
 f'<path d="M4 2 L22 2 Q46 4 52 12 Q54 16 48 16 L6 16 Q2 16 2 10 Z" fill="{SKIN}" {S}/>'
 f'<path d="M2 12 L52 12" stroke="#6B3E1E" stroke-width="5" stroke-linecap="round"/>')
print("parts written:", sorted(os.listdir(OUT)))
