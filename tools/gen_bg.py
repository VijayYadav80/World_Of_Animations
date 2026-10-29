import random
random.seed(7)
W,H=1280,720
o=[]
a=o.append
a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
a('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DBDEB"/><stop offset="0.7" stop-color="#CDE8F5"/><stop offset="1" stop-color="#FCE9C0"/></linearGradient>'
  '<radialGradient id="glow"><stop offset="0" stop-color="#FFF3B0" stop-opacity="0.9"/><stop offset="1" stop-color="#FFF3B0" stop-opacity="0"/></radialGradient>'
  '<linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D6B27C"/><stop offset="1" stop-color="#B98F5A"/></linearGradient></defs>')
a(f'<g id="sky"><rect width="{W}" height="480" fill="url(#sky)"/><circle cx="1040" cy="130" r="150" fill="url(#glow)"/><circle cx="1040" cy="130" r="48" fill="#FFE27A"/>')
for cx,cy,s in [(220,110,1.0),(560,70,0.8),(860,170,0.7)]:
    a(f'<g fill="#fff" opacity="0.92"><ellipse cx="{cx}" cy="{cy}" rx="{70*s}" ry="{22*s}"/><ellipse cx="{cx+40*s}" cy="{cy-14*s}" rx="{44*s}" ry="{22*s}"/><ellipse cx="{cx-36*s}" cy="{cy-8*s}" rx="{38*s}" ry="{18*s}"/></g>')
a('</g>')
a('<g id="far"><path d="M0 400 Q160 320 340 376 T700 360 T1040 380 T1280 350 L1280 480 L0 480 Z" fill="#A9CBA6"/>'
  '<path d="M0 430 Q220 370 460 418 T900 404 T1280 420 L1280 490 L0 490 Z" fill="#86B383"/></g>')
def tree(x,base,s):
    a(f'<g transform="translate({x} {base}) scale({s})"><path d="M-10 0 L-7 -70 L7 -70 L10 0 Z" fill="#6B4A2E" stroke="#3A2418" stroke-width="3"/>'
      '<circle cx="0" cy="-105" r="56" fill="#3E7D3C" stroke="#2B5A2A" stroke-width="3"/><circle cx="-38" cy="-80" r="36" fill="#4F9A4B"/>'
      '<circle cx="40" cy="-84" r="38" fill="#4F9A4B"/><circle cx="6" cy="-132" r="30" fill="#5DAE58"/></g>')
a('<g id="trees">')
tree(470,480,0.9); tree(900,484,1.05); tree(60,490,1.15); tree(1230,488,0.95)
a('</g>')
def house(x,w,h,wall,roof,door,base=482,flag=False):
    top=base-h
    a(f'<g transform="translate({x} 0)"><rect x="0" y="{top}" width="{w}" height="{h}" fill="{wall}" stroke="#3A2418" stroke-width="3"/>'
      f'<path d="M-14 {top} L{w/2} {top-62} L{w+14} {top} Z" fill="{roof}" stroke="#3A2418" stroke-width="3" stroke-linejoin="round"/>')
    for i in range(1,6):
        t=i/6
        a(f'<path d="M{-14+(w/2+14)*t} {top-62*t} L{w+14-(w/2+14)*t} {top-62*t}" stroke="#7E3A1F" stroke-width="2" opacity="0.6"/>')
    a(f'<rect x="{w*0.14}" y="{base-72}" width="38" height="72" rx="4" fill="{door}" stroke="#3A2418" stroke-width="3"/>'
      f'<rect x="{w*0.58}" y="{top+34}" width="34" height="34" fill="#2E4A63" stroke="#3A2418" stroke-width="3"/>'
      f'<path d="M{w*0.58+17} {top+34} V{top+68} M{w*0.58} {top+51} H{w*0.58+34}" stroke="#3A2418" stroke-width="2"/>'
      f'<rect x="0" y="{base-14}" width="{w}" height="14" fill="#00000022"/></g>')
a('<g id="houses">')
house(120,200,118,"#E7C18C","#A94F2D","#7A4A2A")
house(350,170,104,"#6FB1CF","#B5582F","#8A5A2E")
house(840,210,122,"#D9A66B","#A94F2D","#5E3B22")
house(1090,190,108,"#EBD3A0","#B5582F","#2F6B5B")
a('</g>')
a(f'<g id="ground"><rect x="0" y="480" width="{W}" height="{H-480}" fill="url(#road)"/>'
  f'<path d="M0 480 H{W} V500 Q640 512 0 500 Z" fill="#7FA95B"/>'
  f'<path d="M0 560 Q640 548 {W} 560 V580 Q640 568 0 580 Z" fill="#C9A06B" opacity="0.55"/></g>')
a('<g id="ground-details" fill="#A8814F" opacity="0.8">')
for _ in range(34):
    x=random.randint(10,W-10); y=random.randint(520,H-16); r=random.randint(3,8)
    a(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*0.55:.1f}"/>')
a('</g>')
a('<g id="props"><g transform="translate(985 560)"><ellipse cx="0" cy="38" rx="86" ry="16" fill="#00000030"/><path d="M-76 38 V-6 Q0 -34 76 -6 V38 Z" fill="#B7B0A3" stroke="#3A2418" stroke-width="3"/>'
  '<ellipse cx="0" cy="-8" rx="76" ry="22" fill="#6B665D" stroke="#3A2418" stroke-width="3"/><ellipse cx="0" cy="-8" rx="58" ry="14" fill="#2B2F36"/></g>'
  '<g transform="translate(250 590)"><ellipse cx="0" cy="40" rx="40" ry="9" fill="#00000030"/><path d="M-26 -10 Q-40 20 -22 40 H22 Q40 20 26 -10 Z" fill="#B65A32" stroke="#3A2418" stroke-width="3"/>'
  '<ellipse cx="0" cy="-10" rx="26" ry="8" fill="#8C3F20" stroke="#3A2418" stroke-width="3"/></g></g>')
a('</svg>')
open("assets/backgrounds/village-street-01/background.svg","w",encoding="utf-8").write("".join(o))
print("ok", sum(len(x) for x in o), "bytes")
