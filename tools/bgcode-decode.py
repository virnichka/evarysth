#!/usr/bin/env python3
"""Décode un G-code binaire Prusa (.bgcode) : G-code texte + vignettes + métadonnées.

Usage : python3 -I tools/bgcode-decode.py fichier.bgcode dossier_sortie
Écrit dossier_sortie/out.gcode et thumbN_LxH.(png|qoi|jpg) ; affiche les métadonnées.
Un G-code ne contient pas de maillage : la forme se lit sur les trajectoires
(;TYPE:External perimeter par couche) ; la pièce est souvent couchée pour l impression.
Gère heatshrink 11/12,4, deflate et MeatPack. Python pur (~30 s pour 20 Mo).
"""
import struct, sys, zlib
def hs_dec(data, W, L):
    out=bytearray(); bitpos=0; n=len(data)*8
    def bits(k):
        nonlocal bitpos
        if bitpos+k>n: return None
        v=0
        for _ in range(k):
            v=(v<<1)|((data[bitpos>>3]>>(7-(bitpos&7)))&1); bitpos+=1
        return v
    while True:
        t=bits(1)
        if t is None: break
        if t:
            b=bits(8)
            if b is None: break
            out.append(b)
        else:
            i=bits(W); c=bits(L)
            if i is None or c is None: break
            i+=1; c+=1
            for _ in range(c): out.append(out[-i] if i<=len(out) else 0)
    return bytes(out)
TBL=b"0123456789. \nGX"
def meat(data):
    out=bytearray(); active=False; nospace=False; full=0; cbuf=None; ff=0; cmdnext=False
    def tbl(n): return ord('E') if (n==11 and nospace) else TBL[n]
    def inner(c):
        nonlocal full,cbuf
        if not active: out.append(c); return
        if full:
            out.append(c)
            if cbuf is not None: out.append(cbuf); cbuf=None
            full-=1; return
        lo=c&15; hi=c>>4
        if lo==15:
            full+=1
            if hi==15: full+=1
            else: cbuf=tbl(hi)
        else:
            out.append(tbl(lo))
            if tbl(lo)!=10:
                if hi==15: full+=1
                else: out.append(tbl(hi))
    for c in data:
        if c==0xFF:
            if ff: cmdnext=True; ff=0
            else: ff=1
            continue
        if cmdnext:
            cmdnext=False
            if c==0xFB: active=True
            elif c==0xFA: active=False
            elif c==0xF7: nospace=True
            elif c==0xF6: nospace=False
            elif c==0xF9: active=False; nospace=False
            continue
        if ff: inner(0xFF); ff=0
        inner(c)
    return bytes(out)
f=open(sys.argv[1],'rb').read(); outdir=sys.argv[2]
assert f[:4]==b'GCDE'; ver,ck=struct.unpack_from('<IH',f,4); p=10
g=open(outdir+'/out.gcode','wb'); nth=0
while p<len(f):
    typ,comp,us=struct.unpack_from('<HHI',f,p); p+=8
    cs=us
    if comp: cs,=struct.unpack_from('<I',f,p); p+=4
    plen=6 if typ==5 else 2
    params=f[p:p+plen]; p+=plen
    d=f[p:p+cs]; p+=cs+(4 if ck==1 else 0)
    if comp==1: d=zlib.decompress(d)
    elif comp==2: d=hs_dec(d,11,4)
    elif comp==3: d=hs_dec(d,12,4)
    enc=struct.unpack_from('<H',params)[0]
    if typ==1 and enc in(1,2): d=meat(d)
    if typ==5:
        fmt,w,h=struct.unpack('<HHH',params); nth+=1
        open(f'{outdir}/thumb{nth}_{w}x{h}.'+['png','jpg','qoi'][fmt],'wb').write(d)
    elif typ==1: g.write(d)
    else: print('block',typ,'\n',d.decode(errors='replace')[:3000])
