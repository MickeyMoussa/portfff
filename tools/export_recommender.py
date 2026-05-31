#!/usr/bin/env python
# coding: utf-8
"""
Export the SDAIA two-tower actuarial recommender (Keras 3 .h5) into a compact,
dependency-free bundle the portfolio runs *live* in the browser:

  assets/model/recommender.bin   int8-quantized Dense kernels + float32 (scales,
                                 biases, BatchNorm params), concatenated.
  assets/model/recommender.json  network topology as an ordered op-list + a
                                 manifest mapping each tensor to a byte range in
                                 the .bin, plus the policyholder/plan feature
                                 column order and benefit-class names.
  assets/model/plans.json        a random, varied sample of real insurance plans:
                                 each with its 28-dim feature vector, the indices
                                 of the benefits it covers, and a display label.

No TensorFlow required — weights and architecture are read straight out of the
HDF5 file with h5py, so this runs even where TF has no wheel (e.g. Python 3.14).

Run from the repo root:  python tools/export_recommender.py
"""
import os, json, struct
import numpy as np
import h5py
import pandas as pd
import pickle

# ── Paths ─────────────────────────────────────────────────────────────────────
SRC   = os.environ.get("REC_SRC", r"C:\Users\Gaming\Desktop\RecommenderModelStreamLit")
HERE  = os.path.dirname(os.path.abspath(__file__))
OUT   = os.path.join(os.path.dirname(HERE), "assets", "model")
os.makedirs(OUT, exist_ok=True)

H5     = os.path.join(SRC, "model.h5")
PLANS  = os.path.join(SRC, "insurance_plans.csv")
N_PLANS_SAMPLE = 450      # plans shipped for the demo to draw from
SEED   = 7

# ── 1. Read architecture + weights from the HDF5 ───────────────────────────────
f   = h5py.File(H5, "r")
cfg = json.loads(f.attrs["model_config"])
mw  = f["model_weights"]

def w(layer, name):
    return np.array(mw[layer][f"{layer}/{name}"], dtype=np.float32)

# ── Binary writer: append tensors, record (offset,len) ranges; keep float32
#    sections 4-byte aligned so JS can make typed-array views directly. ─────────
blob = bytearray()
def _align():
    while len(blob) % 4: blob.append(0)

def put_i8(arr):
    a = np.ascontiguousarray(arr, dtype=np.int8)
    off = len(blob); blob.extend(a.tobytes()); return [off, a.size]

def put_f32(arr):
    _align()
    a = np.ascontiguousarray(arr, dtype="<f4")
    off = len(blob); blob.extend(a.tobytes()); return [off, a.size]

def quant_kernel(K):
    """Per-output-column symmetric int8 quantization of a Dense kernel [in,out]."""
    scale = np.max(np.abs(K), axis=0) / 127.0          # one scale per output unit
    scale[scale == 0] = 1e-8
    q = np.clip(np.round(K / scale), -127, 127).astype(np.int8)
    return q, scale.astype(np.float32)

# ── 2. Walk the layers in topological (config) order → op list + manifest ──────
ops = []
for L in cfg["config"]["layers"]:
    cls  = L["class_name"]
    name = L["config"]["name"]
    if cls == "InputLayer":
        continue

    # resolve inbound tensor names (the producing layer names)
    def inbound_names(node):
        a = node["args"][0]
        if isinstance(a, list):                         # Concatenate: list of tensors
            return [t["config"]["keras_history"][0] for t in a]
        return [a["config"]["keras_history"][0]]
    ins = inbound_names(L["inbound_nodes"][0])

    if cls == "Dense":
        K = w(name, "kernel"); b = w(name, "bias")
        q, scale = quant_kernel(K)
        ops.append({
            "name": name, "type": "dense", "in": ins,
            "shape": list(K.shape),                     # [in, out]
            "act": L["config"]["activation"],           # linear | relu | softmax
            "kq": put_i8(q), "ks": put_f32(scale), "b": put_f32(b),
        })
    elif cls == "LeakyReLU":
        slope = L["config"].get("negative_slope", L["config"].get("alpha") or 0.3)
        ops.append({"name": name, "type": "leaky", "in": ins, "slope": float(slope)})
    elif cls == "BatchNormalization":
        ops.append({
            "name": name, "type": "bn", "in": ins,
            "eps": float(L["config"]["epsilon"]),
            "gamma": put_f32(w(name, "gamma")), "beta": put_f32(w(name, "beta")),
            "mean":  put_f32(w(name, "moving_mean")),
            "var":   put_f32(w(name, "moving_variance")),
        })
    elif cls == "Dropout":
        ops.append({"name": name, "type": "identity", "in": ins})
    elif cls == "Concatenate":
        ops.append({"name": name, "type": "concat", "in": ins})
    else:
        raise SystemExit(f"Unhandled layer type: {cls}")

# ── 3. Feature columns + benefit names (from the pickles) ──────────────────────
def load_pickle(fn):
    with open(os.path.join(SRC, fn), "rb") as fh:
        return pickle.load(fh)

plan_columns   = list(load_pickle("plan_columns.pk1"))
holder_columns = list(load_pickle("policyholder_columns.pk1"))
label_encoder  = load_pickle("label_encoder.pk1")
benefits       = [str(x) for x in label_encoder.classes_]
name_to_idx    = {n: i for i, n in enumerate(benefits)}
coverage       = load_pickle("coverageDict.pk1")     # (PlanId, Year) -> set(benefit names)

inputs = {}
for L in cfg["config"]["layers"]:
    if L["class_name"] == "InputLayer":
        dim = L["config"]["batch_shape"][1]
        inputs["policyholder" if dim == len(holder_columns) else "plan"] = dim

manifest = {
    "format": "twotower-int8-v1",
    "inputs": inputs,                                  # {"policyholder":46,"plan":28}
    "input_layers": {"policyholder": "policyholder_input", "plan": "plan_input"},
    "output": cfg["config"]["output_layers"][0][0],    # dense_15
    "ops": ops,
    "policyholder_columns": holder_columns,
    "plan_columns": plan_columns,
    "benefits": benefits,
}
with open(os.path.join(OUT, "recommender.json"), "w", encoding="utf-8") as fh:
    json.dump(manifest, fh)
with open(os.path.join(OUT, "recommender.bin"), "wb") as fh:
    fh.write(blob)

# ── 4. Sample real plans for the demo (feature vec + covered benefits + label) ─
df = pd.read_csv(PLANS)

METALS = ["Platinum", "Gold", "Silver", "Bronze", "Catastrophic"]
csr_cols = [c for c in plan_columns if c.startswith("CSR_")]
def metal_of(row, av):
    # Prefer an explicit metal tier named in the active CSR variation…
    for c in csr_cols:
        if row.get(c, 0) == 1:
            for m in METALS:
                if m in c:
                    return m
    # …otherwise fall back to the standard ACA actuarial-value bands.
    if av >= 0.88: return "Platinum"
    if av >= 0.78: return "Gold"
    if av >= 0.68: return "Silver"
    if av >= 0.55: return "Bronze"
    return "Catastrophic"

rng = np.random.default_rng(SEED)
# candidate rows that actually have a coverage entry
cand = []
for i, row in df.iterrows():
    key = (row["PlanId"], int(row["Year"]))
    cov = coverage.get(key)
    if cov:
        cand.append(i)
cand = np.array(cand)
pick = rng.choice(cand, size=min(N_PLANS_SAMPLE, len(cand)), replace=False)

plans = []
for i in pick:
    row = df.loc[i]
    key = (row["PlanId"], int(row["Year"]))
    covered = sorted({name_to_idx[n] for n in coverage[key] if n in name_to_idx})
    if not covered:
        continue
    feat = [float(row[c]) for c in plan_columns]
    pid  = str(row["PlanId"])
    state = pid[5:7] if len(pid) >= 7 else "US"
    av    = float(row.get("AVCalculatorOutputNumber_plan", 0) or 0)
    metal = metal_of(row, av)
    plans.append({
        "id": pid, "year": int(row["Year"]),
        "label": f"{metal} · {state} · AV {round(av*100)}%",
        "metal": metal, "state": state, "av": round(av, 4),
        "feat": feat, "covered": covered,
    })

with open(os.path.join(OUT, "plans.json"), "w", encoding="utf-8") as fh:
    json.dump({"plans": plans}, fh)

# ── Report ─────────────────────────────────────────────────────────────────────
binmb = len(blob) / 1e6
print(f"ops              : {len(ops)}")
print(f"recommender.bin  : {binmb:.2f} MB")
print(f"plans sampled    : {len(plans)} (of {len(cand)} candidates)")
print(f"benefits         : {len(benefits)}")
print(f"covered/plan avg : {np.mean([len(p['covered']) for p in plans]):.1f}")
print(f"wrote -> {OUT}")
