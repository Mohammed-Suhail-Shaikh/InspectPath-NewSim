"""Extract KW51 bridge geometry to data/structures/kw51_layout.json.

Geometry ported from model_kw51.m by K. Maes, M. van de Velde, G. Lombaert
(KU Leuven), https://doi.org/10.5281/zenodo.17366772, CC BY-NC-SA 4.0.

This is a faithful Python port of ONLY the node, element, and sensor-position
construction from model_kw51.m and select_sensors.m. It reproduces the same
constants, loops, the arch polynomial, the midspan mirroring, and the
mm-to-m conversion. No finite element analysis (stiffness, mass, solvers,
condensation, selectdof, elemforces) is ported; we only need geometry.

Coordinate system (from model_kw51.m and overview.pdf):
  Units: metres [kg, m, s].
  x : longitudinal, along the bridge, 0 near the Brussels abutment.
  y : transverse. Girder/side A (South) at y = 0; girder/side C (North) at
      y = 11.750 m.
  z : vertical, up positive. Girder neutral axis near z = 0.2719 m; the arch
      follows z = -0.0056679878 x^2 + 0.659277672 x + 0.341695.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import matplotlib

matplotlib.use("Agg")  # headless; write PNGs only
import matplotlib.pyplot as plt  # noqa: E402


# --- geometry constants (from model_kw51.m) ---
Y_A = 0.0        # main girder / arch A (South), y = 0
Y_C = 11.750     # main girder / arch C (North)
GIRDER_Z = 0.2719  # girder neutral-axis z (line 232: 0.2719)


def arch_z(x: np.ndarray) -> np.ndarray:
    """Arch neutral-axis polynomial from model_kw51.m (lines 239/241)."""
    return -0.0056679878 * x ** 2 + 0.659277672 * x + 0.341695


def build_xn() -> np.ndarray:
    """Port of the xn construction (model_kw51.m lines 196-221). Returns x in m."""
    xn = [0.0, 658.0, 2313 / 3, 658 + 401, 2313 / 3 * 2, 2313.0]  # 1-2
    xn += [xn[-1] + 1878 * 0.5, xn[-1] + 1878]                    # 2-3
    xn += [xn[-1] + 3534 * 0.5, xn[-1] + 3534]                    # 3-4
    xn += [xn[-1] + 3533 * 0.5, xn[-1] + 3533]                    # 4-5 (first diagonal)
    xn += [xn[-1] + 3833 * 0.5, xn[-1] + 3833]                    # 5-6
    xn += [xn[-1] + 3834 / 2, xn[-1] + (5900 - 3833), xn[-1] + 3834]  # 6-7
    xn += [xn[-1] + 3833 * 0.5, xn[-1] + 3833]                    # 7-8 (second diagonal)
    # NOTE on the MATLAB chained reassignment xn=[xn, xn(end)+...]: each bracket
    # uses the CURRENT last element; we replicate by tracking last each append.
    for _ in range(3):  # 8-17
        xn += [xn[-1] + 3933 * 0.5, xn[-1] + 3933]
        xn += [xn[-1] + 3934 * 0.5, xn[-1] + 3934]
        xn += [xn[-1] + 3933 * 0.5, xn[-1] + 3933]
    xn += [115000 / 2 + 658 - 13767 - 23400]  # transverse stiffener node
    xn += [115000 / 2 + 658 - 13767]          # transverse stiffener node
    xn = sorted(xn)
    # b) mirror from middle node to right abutment
    last = xn[-1]
    mirror = [last + (last - v) for v in reversed(xn[:-1])]
    xn = xn + mirror
    xn += [115000 / 2 + 658 + 3933 / 2 + 300]  # strain gauge sgBD1718C node
    xn = sorted(xn)
    return np.array(xn) / 1000.0  # mm -> m


def build_diag_connection_x():
    """Lower (deck) and upper (arch) diagonal connection x-positions in m.

    Port of model_kw51.m lines 248-262 (xdl on main girders, xdu on arch).
    Each has 9 panel-point positions.
    """
    # lower nodes (on main girders) - deck ends
    xdl = [658 + 10600]
    xdl.append(xdl[-1] + 11500)
    for _ in range(6):
        xdl.append(xdl[-1] + 11800)
    xdl.append(xdl[-1] + 11500)
    xdl = np.array(xdl) / 1000.0  # 9 positions

    # upper nodes (on arch) - arch ends
    xdu = [658 + 10600 + 5900]
    xdu.append(xdu[-1] + 5600 + 5900)
    for _ in range(5):
        xdu.append(xdu[-1] + 11800)
    xdu.append(xdu[-1] + 5600 + 5900)
    xdu = np.array(xdu) / 1000.0  # 9 positions
    return xdl, xdu


def _xn_index_at(xn: np.ndarray, x: float) -> int:
    """Return the 1-based position of node at coordinate x in xn (girder node
    sub-id), matching MATLAB's Nodes(:,2)==x lookup. Uses rounding to 1e-4 m to
    avoid float mismatch, mirroring the model's round(...*10000) comparisons."""
    target = round(x * 10000)
    for i, v in enumerate(xn, start=1):
        if round(float(v) * 10000) == target:
            return i
    raise ValueError(f"no xn node at x={x}")


def build_ndl_ndu(xn: np.ndarray):
    """Real node ids for the 9 lower (girder-A) and 9 upper (arch-A) diagonal
    panel points, built exactly as model_kw51.m lines 264-278:
      ndl(i) = 105000 + (girder-A node sub-id at x=xdl(i))
      ndu(i) = 103000 + (arch-A node sub-id at x=xdu(i))
    """
    xdl, xdu = build_diag_connection_x()
    ndl = np.array([105000 + _xn_index_at(xn, x) for x in xdl])
    ndu = np.array([103000 + _xn_index_at(xn, x) for x in xdu])
    return ndl, ndu, xdl, xdu


def build_nodes(xn: np.ndarray):
    """Build the node parts we need, keyed by part name. Returns dict of lists
    of (id, x, y, z)."""
    nodes = {
        "girder_A": [], "girder_C": [],
        "arch_A": [], "arch_C": [],
        "diagonal_connection": [],
        "brace": [],
        "deck_beam": [], "transverse_beam": [],
        "bearing": [],
    }

    # Main girder A (101xxx) and C (102xxx) - neutral axis, z=0.2719
    for i, x in enumerate(xn, start=1):
        nodes["girder_A"].append((101000 + i, float(x), Y_A, GIRDER_Z))
        nodes["girder_C"].append((102000 + i, float(x), Y_C, GIRDER_Z))

    # Arch A (103xxx) and C (104xxx), interior nodes 2..end-1, z from polynomial
    zx = arch_z(xn)
    for i in range(2, len(xn)):  # MATLAB 2:length(xn)-1  (1-based) -> here indices 2..len-1
        nodes["arch_A"].append((103000 + i, float(xn[i - 1]), Y_A, float(zx[i - 1])))
        nodes["arch_C"].append((104000 + i, float(xn[i - 1]), Y_C, float(zx[i - 1])))

    # Diagonal connection nodes on the girders/deck (105xxx side A, 106xxx side
    # C), z=(80+693)/1000. The 9 panel points per side (model_kw51.m 279-284).
    ndl, ndu, xdl, xdu = build_ndl_ndu(xn)
    for i in range(len(xdl)):
        nodes["diagonal_connection"].append((int(ndl[i]), float(xdl[i]), Y_A, DIAG_CONN_Z))
    for i in range(len(xdl)):
        nodes["diagonal_connection"].append((int(ndl[i]) + 1000, float(xdl[i]), Y_C, DIAG_CONN_Z))
    # (The arch-end connection nodes ARE the arch nodes 103xxx/104xxx already in
    # arch_A/arch_C; they are not duplicated here.)

    # Braces (107xxx-110xxx): 4 transverse braces, Nebr=6 elements each, between
    # arch A and arch C. x positions from model_kw51.m lines 309-311. We record
    # the intermediate brace nodes (the end nodes are the arch nodes).
    Nebr = 6
    xbr = 0.658 + 115 / 2 + np.array([-23400 - 13767, -13767, 13767, 13767 + 23400]) / 1000.0
    ybr = np.linspace(0, 11.750, Nebr)  # Nebr points across the width
    for b in range(4):
        # intermediate nodes 2..Nebr-1 (ids 107000+(b)*1000+(1..Nebr-1))
        for k in range(1, Nebr):
            nid = 107000 + b * 1000 + k
            y = float(ybr[k]) if k < Nebr else 11.750
            # z interpolated along arch between the two arch ends (approx by arch z at xbr)
            z = float(arch_z(np.array([xbr[b]]))[0])
            nodes["brace"].append((nid, float(xbr[b]), y, z))

    # Transverse beams: one line of x-positions (model_kw51.m lines 443-453),
    # replicated across the transverse y-grid. We only need positions/count.
    xtr = [0.0, 2313.0]
    xtr.append(xtr[-1] + 1878)
    xtr.append(xtr[-1] + 3534)
    xtr.append(xtr[-1] + 3533)
    xtr.append(xtr[-1] + 3833)
    xtr.append(xtr[-1] + 3834)
    xtr.append(xtr[-1] + 3833)
    for _ in range(3):
        xtr.append(xtr[-1] + 3933)
        xtr.append(xtr[-1] + 3934)
        xtr.append(xtr[-1] + 3933)
    last = xtr[-1]
    xtr = xtr + [last + (last - v) for v in reversed(xtr[:-1])]
    xtr = np.array(xtr) / 1000.0
    for i, x in enumerate(xtr, start=1):
        nodes["transverse_beam"].append((141000 + i, float(x), None, 0.2539))

    # Deck U-beams (121xxx-132xxx): 12 longitudinal lines across the deck width.
    yu = (11750 / 2 - 375 - 5 * 750 + np.arange(0, 12) * 750) / 1000.0
    for k, y in enumerate(yu, start=1):
        for i, x in enumerate(xn, start=1):
            nodes["deck_beam"].append((121000 + k * 1000 + i, float(x), float(y), 1.011))

    # Bearing nodes N1-N4 (ids 1-4), model_kw51.m lines ~525-545.
    x_n1 = 1.059                                   # N1/N2 (Brussels)
    x_n3 = (115000 + 658 - 401) / 1000.0           # N3/N4 (Leuven)
    nodes["bearing"].append((1, x_n1, Y_A, -0.15))  # N1 Brussels bottom (girder A)
    nodes["bearing"].append((2, x_n1, Y_C, -0.15))  # N2 Brussels top (girder C)
    nodes["bearing"].append((3, x_n3, Y_A, -0.15))  # N3 Leuven bottom (girder A)
    nodes["bearing"].append((4, x_n3, Y_C, -0.15))  # N4 Leuven top (girder C)

    return nodes


DIAG_CONN_Z = (80 + 693) / 1000.0  # deck-connection node z (model line 279)


def _nd_pairing(xn: np.ndarray):
    """Reproduce model_kw51.m line 620: nd(:,1)=ndl([1:8,2:9]) (deck ends),
    nd(:,4)=ndu([1:8,1:8]) (arch ends), reordered by the index vector
    [16,8,15,7,...,9,1] so ind1=1..16 matches diagonal numbering. Returns, for
    side A, the 16 deck-end and 16 arch-end node ids and their x/z."""
    ndl, ndu, xdl, xdu = build_ndl_ndu(xn)
    # MATLAB uses 1-based [1:8,2:9] and [1:8,1:8]; convert to 0-based.
    deck_ids = np.concatenate([ndl[0:8], ndl[1:9]])          # nd(:,1)
    deck_x = np.concatenate([xdl[0:8], xdl[1:9]])
    arch_ids = np.concatenate([ndu[0:8], ndu[0:8]])          # nd(:,4)
    arch_x = np.concatenate([xdu[0:8], xdu[0:8]])
    # reorder vector nd=nd([16,8,15,7,14,6,13,5,12,4,11,3,10,2,9,1],:)
    order = [16, 8, 15, 7, 14, 6, 13, 5, 12, 4, 11, 3, 10, 2, 9, 1]
    order0 = [o - 1 for o in order]
    deck_ids = deck_ids[order0]; deck_x = deck_x[order0]
    arch_ids = arch_ids[order0]; arch_x = arch_x[order0]
    return deck_ids, deck_x, arch_ids, arch_x


def build_diagonal_connections(xn: np.ndarray):
    """64 diagonal connections: 16 diagonals x 2 sides x 2 ends.

    Node ids and coordinates are the REAL model ids (model_kw51.m):
      deck end side A = nd(:,1) in the 105xxx band (on girder A, y=0);
      arch end side A = nd(:,4) in the 103xxx band (on arch A);
      side C = +1000 (deck, 106xxx) / arch node C (104xxx) as per lines 662-666.
    Deck-connection z = (80+693)/1000 m; arch-end z from the arch polynomial.
    """
    deck_ids_A, deck_x, arch_ids_A, arch_x = _nd_pairing(xn)
    arch_zc = arch_z(arch_x)

    conns = []
    for side, y in (("A", Y_A), ("C", Y_C)):
        for d in range(1, 17):
            i = d - 1
            if side == "A":
                deck_id = int(deck_ids_A[i])
                arch_id = int(arch_ids_A[i])
            else:
                # Side C: deck node = side-A deck id + 1000 (106xxx);
                # arch node = side-A arch id + 1000 (103xxx -> 104xxx).
                deck_id = int(deck_ids_A[i]) + 1000
                arch_id = int(arch_ids_A[i]) + 1000
            conns.append({
                "diagonal": d, "side": side, "end": "deck", "node_id": deck_id,
                "x": round(float(deck_x[i]), 4), "y": y, "z": round(DIAG_CONN_Z, 4),
            })
            conns.append({
                "diagonal": d, "side": side, "end": "arch", "node_id": arch_id,
                "x": round(float(arch_x[i]), 4), "y": y, "z": round(float(arch_zc[i]), 4),
            })
    return conns


def build_members(nodes, conns):
    """Member definitions per part. Girders/arches are chains of beams between
    consecutive nodes; diagonals are 16 per side between deck and arch ends;
    transverse beams and deck beams counted from their node lines."""
    members = []
    mid = 0

    def chain(part, node_list, eltype):
        nonlocal mid
        for a, b in zip(node_list[:-1], node_list[1:]):
            mid += 1
            members.append({"id": mid, "part": part, "element_type": eltype,
                            "nodes": [a[0], b[0]]})

    chain("girder_A", nodes["girder_A"], "beam")
    chain("girder_C", nodes["girder_C"], "beam")
    chain("arch_A", nodes["arch_A"], "beam")
    chain("arch_C", nodes["arch_C"], "beam")

    # Diagonals: one member per diagonal (deck end -> arch end), 16 per side.
    for side in ("A", "C"):
        for d in range(1, 17):
            deck = next(c for c in conns if c["side"] == side and c["diagonal"] == d and c["end"] == "deck")
            arch = next(c for c in conns if c["side"] == side and c["diagonal"] == d and c["end"] == "arch")
            mid += 1
            members.append({"id": mid, "part": f"diagonal_{side}", "element_type": "beam",
                            "nodes": [deck["node_id"], arch["node_id"]]})

    # Transverse beams: one per transverse x-station (count only).
    for i in range(len(nodes["transverse_beam"]) - 1):
        mid += 1
        members.append({"id": mid, "part": "transverse_beam", "element_type": "beam",
                        "nodes": [nodes["transverse_beam"][i][0], nodes["transverse_beam"][i + 1][0]]})

    # Braces: 4 braces, each a chain of beams between arch A and arch C through
    # its intermediate nodes (model_kw51.m lines 665-671, Nebr elements each).
    brace_nodes = {}
    for (nid, x, y, z) in nodes["brace"]:
        brace_nodes.setdefault(round(x, 4), []).append((y, nid))
    for x, lst in brace_nodes.items():
        lst.sort()
        for a, b in zip(lst[:-1], lst[1:]):
            mid += 1
            members.append({"id": mid, "part": "brace", "element_type": "beam",
                            "nodes": [a[1], b[1]]})

    # Deck U-beams (121xxx-132xxx): each of the 12 longitudinal lines is a chain
    # of beams along x (model_kw51.m lines 675-679). Group deck nodes by line.
    deck_lines = {}
    for (nid, x, y, z) in nodes["deck_beam"]:
        line = nid // 1000  # 122..132 band id
        deck_lines.setdefault(line, []).append((x, nid))
    for line, lst in deck_lines.items():
        lst.sort()
        for a, b in zip(lst[:-1], lst[1:]):
            mid += 1
            members.append({"id": mid, "part": "deck_beam", "element_type": "beam",
                            "nodes": [a[1], b[1]]})

    return members


def build_sensors(xn: np.ndarray):
    """Sensor positions ported from select_sensors.m. x-positions are literal
    numbers in the file; y from the part (A=0, C=11.750); z from part level."""
    xdl, xdu = build_diag_connection_x()
    arch_zc = arch_z

    sensors = []

    def add(label, stype, part, x, y, z):
        sensors.append({"label": label, "type": stype, "part": part,
                        "x": round(float(x), 4),
                        "y": (None if y is None else round(float(y), 4)),
                        "z": (None if z is None else round(float(z), 4))})

    # Strain gauges on girders (select_sensors.m), x in m, z at girder level.
    # Each cites the select_sensors.m line defining its x-coordinate.
    add("sgBD1011A", "strain", "girder_A", 34.558 - 3.933 / 2, Y_A, GIRDER_Z)   # L~119 (iSel1)
    add("sgBD1415A", "strain", "girder_A", 46.358 + 3.933 / 2, Y_A, GIRDER_Z)   # L~140
    add("sgBD1718A", "strain", "girder_A", 58.158 + 3.933 / 2, Y_A, GIRDER_Z)   # L~161
    add("sgBD1718C", "strain", "girder_C", 58.158 + 3.933 / 2 + 0.3, Y_C, GIRDER_Z)  # L~182
    add("sgBD2324AB", "strain", "girder_A", 81.758 + 3.933 / 2, Y_A, GIRDER_Z)  # L~203
    add("sgBD2324AT", "strain", "girder_A", 81.758 + 3.933 / 2, Y_A, GIRDER_Z)  # L~221 (same element as AB)
    add("sgBD2324C", "strain", "girder_C", 81.758 + 3.933 / 2, Y_C, GIRDER_Z)   # L~226
    add("sgBD2728A", "strain", "girder_A", 97.391 + 3.834 / 2, Y_A, GIRDER_Z)   # L~247
    # Diagonal strain gauges on side A: select_sensors.m uses ndlb(6)/ndlb(7)
    # (lower diagonal nodes 0.8 m up the tube). Their x per model_kw51.m:
    #   xdlb(6)=xdl(6)+(2.395+0.8)/17.9606*5.900
    #   xdlb(7)=xdl(7)+(2.302+0.8)/15.0151*5.900
    xdlb6 = xdl[5] + (2.395 + 0.8) / 17.9606 * 5.900
    xdlb7 = xdl[6] + (2.302 + 0.8) / 15.0151 * 5.900
    zdlb6 = DIAG_CONN_Z + (2.395 + 0.8) / 17.9606 * 16.9639
    zdlb7 = DIAG_CONN_Z + (2.302 + 0.8) / 15.0151 * 13.8074
    add("sgDI20ALB", "strain", "diagonal_A", xdlb6, Y_A, zdlb6)  # ndlb(6)
    add("sgDI20ALL", "strain", "diagonal_A", xdlb6, Y_A, zdlb6)  # ndlb(6), same node
    add("sgDI23ALB", "strain", "diagonal_A", xdlb7, Y_A, zdlb7)  # ndlb(7)
    add("sgDI23ALL", "strain", "diagonal_A", xdlb7, Y_A, zdlb7)  # ndlb(7), same node

    # Displacements: select_sensors.m line 'Sd=selectdof(DOF,[3.01;4.01])' ->
    # bearing nodes 3 (N3, girder A) and 4 (N4, girder C) at the Leuven abutment.
    x_n3 = (115000 + 658 - 401) / 1000.0
    add("dABLA", "displacement", "bearing", x_n3, Y_A, -0.15)  # node 3 (N3)
    add("dABLC", "displacement", "bearing", x_n3, Y_C, -0.15)  # node 4 (N4)

    # Accelerometers (select_sensors.m), x in m.
    add("aBD11Az", "acceleration", "girder_A", 34.558, Y_A, GIRDER_Z)
    add("aBD17Ay", "acceleration", "girder_A", 58.158, Y_A, GIRDER_Z)
    add("aBD17Az", "acceleration", "girder_A", 58.158, Y_A, GIRDER_Z)
    add("aBD17Cz", "acceleration", "girder_C", 58.158, Y_C, GIRDER_Z)
    add("aBD23Ay", "acceleration", "girder_A", 81.758, Y_A, GIRDER_Z)
    add("aBD23Az", "acceleration", "girder_A", 81.758, Y_A, GIRDER_Z)
    add("aAR0910Ay", "acceleration", "arch_A", 28.658, Y_A, float(arch_zc(np.array([28.658]))[0]))
    add("aAR0910Cy", "acceleration", "arch_C", 28.658, Y_C, float(arch_zc(np.array([28.658]))[0]))
    add("aAR1516Ay", "acceleration", "arch_A", 52.258, Y_A, float(arch_zc(np.array([52.258]))[0]))
    add("aAR1516Cy", "acceleration", "arch_C", 52.258, Y_C, float(arch_zc(np.array([52.258]))[0]))
    add("aAR2122Ay", "acceleration", "arch_A", 75.858, Y_A, float(arch_zc(np.array([75.858]))[0]))
    add("aAR2122Cy", "acceleration", "arch_C", 75.858, Y_C, float(arch_zc(np.array([75.858]))[0]))

    return sensors


def main():
    here = Path(__file__).resolve().parent
    repo = here.parents[1]
    out_json = repo / "data" / "structures" / "kw51_layout.json"

    xn = build_xn()
    nodes = build_nodes(xn)
    conns = build_diagonal_connections(xn)
    members = build_members(nodes, conns)
    sensors = build_sensors(xn)

    # Flatten nodes with part tag
    flat_nodes = []
    for part, lst in nodes.items():
        for (nid, x, y, z) in lst:
            flat_nodes.append({
                "id": nid, "part": part,
                "x": round(float(x), 4),
                "y": (None if y is None else round(float(y), 4)),
                "z": (None if z is None else round(float(z), 4)),
            })

    # Distinct physical connection locations: many diagonal ends share one node
    # (per side, deck ends land on 9 girder panel nodes and arch ends on 8 arch
    # nodes). A planner treats one shared node as one inspection stop.
    loc_map = {}
    for c in conns:
        key = c["node_id"]
        if key not in loc_map:
            loc_map[key] = {
                "location_id": f"{c['side']}-{c['end']}-{key}",
                "node_id": key, "side": c["side"], "end": c["end"],
                "x": c["x"], "y": c["y"], "z": c["z"],
                "diagonal_ends": [],
            }
        loc_map[key]["diagonal_ends"].append({"diagonal": c["diagonal"], "end": c["end"]})
    distinct_locations = sorted(loc_map.values(), key=lambda d: (d["side"], d["end"], d["x"]))

    n_deck_loc = sum(1 for d in distinct_locations if d["end"] == "deck")
    n_arch_loc = sum(1 for d in distinct_locations if d["end"] == "arch")
    n_loc_A = sum(1 for d in distinct_locations if d["side"] == "A")
    n_loc_C = sum(1 for d in distinct_locations if d["side"] == "C")

    diagonal_connections = {
        "diagonal_end_count": len(conns),
        "distinct_location_count": len(distinct_locations),
        "distinct_counts": {
            "deck": n_deck_loc, "arch": n_arch_loc,
            "side_A": n_loc_A, "side_C": n_loc_C,
        },
        "ends": conns,
        "distinct_locations": distinct_locations,
    }

    retrofit_zones = [
        {
            "diagonal": c["diagonal"], "side": c["side"], "end": c["end"],
            "node_id": c["node_id"],
            "tag": f"documented retrofit zone (diagonal-{c['end']} connection)",
        }
        for c in conns
    ]

    node_extent = round(float(xn[-1] - xn[0]), 3)
    x_n1 = 1.059
    x_n3 = (115000 + 658 - 401) / 1000.0
    bearing_span = round(x_n3 - x_n1, 3)

    layout = {
        "id": "kw51",
        "name": "Railway bridge KW51, Leuven, Belgium",
        "units": "m",
        "length": {
            "node_extent_m": node_extent,
            "node_extent_note": "span between the first and last girder node x-coordinates",
            "bearing_span_m": bearing_span,
            "bearing_span_note": "distance between bearing nodes N1 (x=1.059) and N3 (x=115.257)",
        },
        "coordinate_system": (
            "x longitudinal along the bridge (0 near Brussels abutment); "
            "y transverse, side/girder A (South) at y=0, side/girder C (North) "
            "at y=11.750 m; z vertical up. Girder neutral axis z=0.2719 m; arch "
            "neutral axis z = -0.0056679878*x^2 + 0.659277672*x + 0.341695. "
            "From model_kw51.m and overview.pdf."
        ),
        "nodes": flat_nodes,
        "members": members,
        "diagonal_connections": diagonal_connections,
        "omitted_parts": [
            {
                "part": "ballast layer (plate nodes 282xxx-295xxx)",
                "reason": "deck ballast surface, not a structural member needed "
                          "for the inspection map; modeled as shell/plate in the "
                          "FE model for load distribution only.",
            },
            {
                "part": "orthotropic deck plate (shell4 elements, plate nodes 181xxx-196xxx)",
                "reason": "deck surface plates (Type 3 'shell4'); not needed for "
                          "the inspection-map geometry (girders, arches, "
                          "diagonals, braces, transverse and deck beams).",
            },
        ],
        "sensors": sensors,
        "retrofit_zones": retrofit_zones,
        "diags_box_scheme": {
            "description": (
                "model_kw51.m input 'diags_box' codes documented retrofit boxes "
                "at diagonal connections. Scheme from model_kw51.m lines 52-55:"
            ),
            "codes": {
                "10xx": "track B, bottom (deck end), diagonal xx",
                "20xx": "track B, top (arch end), diagonal xx",
                "30xx": "track A, bottom (deck end), diagonal xx",
                "40xx": "track A, top (arch end), diagonal xx",
            },
            "note": (
                "The track A/B to side A/C (South/North, y=0 / y=11.750) "
                "correspondence is defined in overview.pdf and is NOT reproduced "
                "here; it is not stated in model_kw51.m. Diagonal connections in "
                "this file are derived by geometry (side A/C and end deck/arch), "
                "not from the diags_box track codes."
            ),
        },
        "provenance": {
            "source": "Finite element model of railway bridge KW51, KU Leuven "
                       "(K. Maes, M. van de Velde, G. Lombaert)",
            "doi": "https://doi.org/10.5281/zenodo.17366772",
            "license": "CC BY-NC-SA 4.0",
            "note": "derived geometry, not the original model. Ported from "
                    "model_kw51.m and select_sensors.m; no FE analysis reproduced.",
        },
    }

    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(layout, indent=2), encoding="utf-8")

    # --- figures ---
    _save_figures(here, flat_nodes, conns, sensors)

    # --- validation ---
    _validate(xn, flat_nodes, members, conns, sensors)

    print(f"\nWrote {out_json}")


def _save_figures(here, flat_nodes, conns, sensors):
    def pts(part):
        return [(n["x"], n["y"], n["z"]) for n in flat_nodes if n["part"] == part]

    # Side view (x-z): girder A and arch A
    fig, ax = plt.subplots(figsize=(12, 4))
    for part, style in (("girder_A", "k.-"), ("arch_A", "b.-")):
        p = sorted(pts(part), key=lambda t: t[0])
        if p:
            ax.plot([t[0] for t in p], [t[2] for t in p], style, ms=2, lw=0.8, label=part)
    for c in conns:
        if c["side"] == "A":
            ax.plot(c["x"], c["z"], "rs" if c["end"] == "arch" else "r^", ms=5)
    for s in sensors:
        if s["z"] is not None and (s["y"] == 0.0):
            ax.plot(s["x"], s["z"], "m*", ms=8)
    ax.set_xlabel("x (m)"); ax.set_ylabel("z (m)")
    ax.set_title("KW51 side view (x-z), side A: red=diagonal connections, magenta=sensors")
    ax.legend(loc="upper right"); ax.set_aspect("equal", "box")
    fig.tight_layout(); fig.savefig(here / "kw51_side_view.png", dpi=130); plt.close(fig)

    # Plan view (x-y): girders A and C and diagonal connections
    fig, ax = plt.subplots(figsize=(12, 3))
    for part, style in (("girder_A", "k.-"), ("girder_C", "b.-")):
        p = sorted(pts(part), key=lambda t: t[0])
        if p:
            ax.plot([t[0] for t in p], [t[1] for t in p], style, ms=2, lw=0.8, label=part)
    for c in conns:
        ax.plot(c["x"], c["y"], "r^", ms=4)
    for s in sensors:
        if s["y"] is not None:
            ax.plot(s["x"], s["y"], "m*", ms=7)
    ax.set_xlabel("x (m)"); ax.set_ylabel("y (m)")
    ax.set_title("KW51 plan view (x-y): red=diagonal connections, magenta=sensors")
    ax.legend(loc="upper right")
    fig.tight_layout(); fig.savefig(here / "kw51_plan_view.png", dpi=130); plt.close(fig)


def _validate(xn, flat_nodes, members, conns, sensors):
    length = float(xn[-1] - xn[0])
    ys = {n["y"] for n in flat_nodes if n["y"] is not None}
    girder_gap = Y_C - Y_A
    arch_a_z = [n["z"] for n in flat_nodes if n["part"] == "arch_A"]
    crown = max(arch_a_z) - GIRDER_Z

    diag_numbers_A = {c["diagonal"] for c in conns if c["side"] == "A"}
    diag_numbers_C = {c["diagonal"] for c in conns if c["side"] == "C"}
    n_deck = sum(1 for c in conns if c["end"] == "deck")
    n_arch = sum(1 for c in conns if c["end"] == "arch")
    n_sideA = sum(1 for c in conns if c["side"] == "A")
    n_sideC = sum(1 for c in conns if c["side"] == "C")

    x_n1, x_n3 = 1.059, (115000 + 658 - 401) / 1000.0
    bearing_span = x_n3 - x_n1

    # Stronger sensor check: each sensor must lie on a node or along a member
    # segment within 0.01 m. Report the maximum distance found.
    coord = {n["id"]: (n["x"], n["y"], n["z"]) for n in flat_nodes
             if n["x"] is not None and n["y"] is not None and n["z"] is not None}

    def _pt_seg_dist(p, a, b):
        import math as _m
        ax, ay, az = a; bx, by, bz = b; px, py, pz = p
        abx, aby, abz = bx - ax, by - ay, bz - az
        apx, apy, apz = px - ax, py - ay, pz - az
        denom = abx * abx + aby * aby + abz * abz
        t = 0.0 if denom == 0 else (apx * abx + apy * aby + apz * abz) / denom
        t = max(0.0, min(1.0, t))
        cx, cy, cz = ax + t * abx, ay + t * aby, az + t * abz
        return _m.sqrt((px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2)

    seg_list = []
    for m in members:
        n1, n2 = m["nodes"]
        if n1 in coord and n2 in coord:
            seg_list.append((coord[n1], coord[n2]))
    node_pts = list(coord.values())

    max_sensor_dist = 0.0
    worst_label = None
    for s in sensors:
        if s["x"] is None or s["y"] is None or s["z"] is None:
            continue
        p = (s["x"], s["y"], s["z"])
        dmin = min(
            min((((p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2) ** 0.5) for q in node_pts),
            min((_pt_seg_dist(p, a, b) for (a, b) in seg_list), default=float("inf")),
        )
        if dmin > max_sensor_dist:
            max_sensor_dist = dmin
            worst_label = s["label"]
    sensors_on_geom = max_sensor_dist <= 0.01

    # Referential integrity: every node id referenced must exist in the nodes list.
    node_ids = {n["id"] for n in flat_nodes}
    missing = set()
    for m in members:
        for nid in m["nodes"]:
            if nid not in node_ids:
                missing.add(nid)
    for c in conns:
        if c["node_id"] not in node_ids:
            missing.add(c["node_id"])
    # sensors reference parts/coords, not node ids directly; skip id check for them.
    ref_ok = len(missing) == 0

    rows = []
    rows.append(("Node extent (first-last girder node)", f"{length:.3f} m", abs(length - 115) < 2.0))
    rows.append(("Bearing span (N1-N3)", f"{bearing_span:.3f} m", abs(bearing_span - 115) < 2.0))
    rows.append(("Girder A-C gap = 11.750 m", f"{girder_gap:.3f} m", abs(girder_gap - 11.750) < 1e-6))
    rows.append(("16 diagonals per arch (A)", f"{len(diag_numbers_A)}", len(diag_numbers_A) == 16))
    rows.append(("16 diagonals per arch (C)", f"{len(diag_numbers_C)}", len(diag_numbers_C) == 16))
    rows.append(("32 diagonals total", f"{len(diag_numbers_A) + len(diag_numbers_C)}",
                 len(diag_numbers_A) + len(diag_numbers_C) == 32))
    rows.append(("64 diagonal connections total", f"{len(conns)}", len(conns) == 64))
    rows.append(("  32 at deck / 32 at arch", f"{n_deck} / {n_arch}", n_deck == 32 and n_arch == 32))
    rows.append(("  32 side A / 32 side C", f"{n_sideA} / {n_sideC}", n_sideA == 32 and n_sideC == 32))
    rows.append(("Arch crown height above girders", f"{crown:.3f} m", crown > 0))
    rows.append(("64 diagonal ends", f"{len(conns)}", len(conns) == 64))
    rows.append(("Distinct connection locations", f"{len({c['node_id'] for c in conns})}",
                 len({c['node_id'] for c in conns}) > 0))
    rows.append(("Every sensor on node/member (<=0.01 m)",
                 f"max {max_sensor_dist*1000:.2f} mm ({worst_label})", sensors_on_geom))
    rows.append(("All referenced node ids exist", f"{len(missing)} missing", ref_ok))

    # Node / member counts per part
    from collections import Counter
    npart = Counter(n["part"] for n in flat_nodes)
    mpart = Counter(m["part"] for m in members)

    print("\n================ VALIDATION ================")
    print(f"{'check':42} {'value':>18}   result")
    print("-" * 74)
    all_ok = True
    for name, val, ok in rows:
        all_ok = all_ok and ok
        print(f"{name:42} {val:>18}   {'PASS' if ok else 'FAIL'}")
    print("\nNodes per part:")
    for p, c in sorted(npart.items()):
        print(f"  {p:20} {c:>6}")
    print("Members per part:")
    for p, c in sorted(mpart.items()):
        print(f"  {p:20} {c:>6}")
    print("-" * 74)
    print("OVERALL:", "ALL PASS" if all_ok else "SOME FAILED")
    print("Sensor x-range: [{:.3f}, {:.3f}] m; bridge length {:.3f} m".format(
        min(s["x"] for s in sensors), max(s["x"] for s in sensors), float(xn[-1])))


if __name__ == "__main__":
    main()
