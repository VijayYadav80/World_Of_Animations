INDIAN 2D CHARACTER + BACKGROUND ASSET PACK
==========================================

Complete bundle: characters, individual body-part SVGs, rig JSON files,
background SVGs, background metadata, and a root manifest.

CHARACTERS (10)
---------------
1. Raju
2. Meena
3. Arjun
4. Kavya
5. Chotu
6. Gudiya
7. Farmer Mohan
8. Teacher Anita
9. Police Vikram
10. Doctor Sana

Each character lives under:
  characters/<id>/
    parts/          → brows, eyes-open/closed, mouth-*, hair, head, torso,
                      upper-arm, forearm, hand, upper-leg, lower-leg, foot
    rig.json        → bones, default pose, expressions, animations

BACKGROUNDS (20)
----------------
Every background is a self-contained folder:
  backgrounds/<id>/
    background.svg
    background.json   (id, displayName, width, height, groundY, scale)

Complex / detailed scenes:
  village-street-01, my-forest, jaipur-market, school-yard,
  railway-platform, farm-morning, diwali-lane, city-rooftops,
  river-ghat, monsoon-road

Simple / clean scenes (formerly loose bg_01–bg_10 + Title_Case files):
  indian-village-street, green-farm, desi-market, village-road,
  railway-station, city-road, village-school, simple-river-ghat,
  indian-dhaba, panchayat

FORMAT / USE
------------
- SVG files are scalable vector assets (1280×720 for backgrounds).
- Character parts are in characters/<character>/parts/.
- Character rig files are in characters/<character>/rig.json.
- Background SVGs + metadata are in backgrounds/<id>/.
- Root manifest.json lists every character and background with paths.
- Open SVG files in a browser, Inkscape, Figma, or import into compatible
  animation software.
- Rig JSON files are asset metadata; they are not a complete animation project.
