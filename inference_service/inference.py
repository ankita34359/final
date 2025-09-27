# inference.py
# Simple Flask inference service for DKT model adapted to JEE
# Endpoints:
#   GET  /health                 -> {"status":"ok"}
#   POST /predict                -> score a single candidate question
#   POST /recommend              -> get top-k question recommendations
#   GET  /coldstart?k=10         -> return k cold-start questions (question metadata)

import os, json, logging
from typing import List, Dict
from flask import Flask, request, jsonify
import numpy as np
import pandas as pd
from tensorflow import keras

# -------- CONFIG (edit paths if different) --------
BASE_DIR = os.environ.get("EDNET_BASE_DIR", "/app")   # when dockerized set EDNET_BASE_DIR
MODEL_PATH = os.path.join(BASE_DIR, "models", "dkt_model_jee_adapted_finetuned.keras")
QMAP_JSON  = os.path.join(BASE_DIR, "processed", "kt_numpy", "qid2idx.json")
QBANK_CSV  = os.path.join(BASE_DIR, "processed", "g_jee_questions_merged_650.csv")
MAX_SEQ_LEN = int(os.environ.get("MAX_SEQ_LEN", 200))
PAD_INDEX = 0
# --------------------------------------------------

app = Flask(__name__)
logger = logging.getLogger("inference_service")
logging.basicConfig(level=logging.INFO)

# load resources once at startup
def load_resources():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
    if not os.path.exists(QMAP_JSON):
        raise FileNotFoundError(f"QID map not found: {QMAP_JSON}")
    if not os.path.exists(QBANK_CSV):
        raise FileNotFoundError(f"Question bank not found: {QBANK_CSV}")

    model = keras.models.load_model(MODEL_PATH, compile=False)
    with open(QMAP_JSON, "r") as f:
        qid2idx = json.load(f)
    # ensure ints
    qid2idx = {str(k): int(v) for k,v in qid2idx.items()}
    qdf = pd.read_csv(QBANK_CSV, dtype=str)
    if 'difficulty' in qdf.columns:
        qdf['difficulty'] = pd.to_numeric(qdf['difficulty'], errors='coerce').fillna(0.5)
    else:
        qdf['difficulty'] = 0.5
    qdf = qdf.fillna("")  # avoid None in JSON
    return model, qid2idx, qdf

MODEL, QID2IDX, QDF = load_resources()
logger.info("Resources loaded: model layers=%s, qids=%d, questions=%d",
            [l.name for l in MODEL.layers], len(QID2IDX), len(QDF))

# ---------- helper utilities (same logic as preprocessing/inference) ----------
def encode_history(history_qids: List[str], history_correct: List[int]):
    # returns arrays shape (1, MAX_SEQ_LEN-1) for (items, responses)
    mapped = [QID2IDX.get(str(q), PAD_INDEX) for q in (history_qids or [])]
    resps = [int(x) for x in (history_correct or [])]
    seq_len = len(mapped)
    if seq_len > MAX_SEQ_LEN:
        mapped = mapped[-MAX_SEQ_LEN:]
        resps = resps[-MAX_SEQ_LEN:]
        seq_len = MAX_SEQ_LEN
    pad_len = MAX_SEQ_LEN - seq_len
    q_padded = [PAD_INDEX] * pad_len + mapped
    r_padded = [0] * pad_len + resps
    items_in = np.array(q_padded[:-1], dtype=np.int32).reshape(1, -1)
    resps_in = np.array(r_padded[:-1], dtype=np.float32).reshape(1, -1)
    return items_in, resps_in

def predict_prob_for_candidate(model, items_in, resps_in, candidate_qid: str):
    cand_idx = QID2IDX.get(str(candidate_qid), PAD_INDEX)
    items = items_in.copy()
    resps = resps_in.copy()
    items[0, -1] = cand_idx
    resps[0, -1] = 0.0
    preds = model.predict([items, resps], verbose=0)
    preds = np.array(preds)
    if preds.ndim == 3 and preds.shape[-1] == 1:
        preds = preds.reshape(preds.shape[0], preds.shape[1])
    prob = float(preds[0, -1])
    return prob

def compute_chapter_mastery(history_qids: List[str], history_correct: List[int]):
    df = pd.DataFrame({"question_id": history_qids, "correct": history_correct})
    merged = df.merge(QDF[['question_id','chapter']].drop_duplicates(), on='question_id', how='left')
    merged['chapter'] = merged['chapter'].fillna('unknown')
    if merged.empty:
        return {}
    return merged.groupby('chapter')['correct'].mean().to_dict()

def sample_coldstart(k=10):
    med = QDF[(QDF['difficulty']>=0.35) & (QDF['difficulty']<=0.65)]
    if len(med) >= k:
        return med.sample(n=k, random_state=42).to_dict('records')
    else:
        extra = QDF.sample(n=k, random_state=42)
        return extra.to_dict('records')

# --------------------- Flask endpoints -----------------------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status":"ok"})

@app.route("/predict", methods=["POST"])
def predict():
    """
    POST JSON:
    {
      "history_qids": ["Ph_Mec_11_0", ...],
      "history_correct": [1,0,1],
      "candidate_qid": "Ph_Mec_11_4"
    }
    """
    payload = request.get_json(force=True)
    history_qids = payload.get("history_qids", [])
    history_correct = payload.get("history_correct", [])
    candidate = payload.get("candidate_qid")
    if candidate is None:
        return jsonify({"error":"candidate_qid required"}), 400
    items_in, resps_in = encode_history(history_qids, history_correct)
    prob = predict_prob_for_candidate(MODEL, items_in, resps_in, candidate)
    return jsonify({"candidate_qid": candidate, "predicted_prob": prob})

@app.route("/recommend", methods=["POST"])
def recommend():
    """
    POST JSON:
    {
      "history_qids": [...],
      "history_correct": [...],
      "k": 5,
      "candidates_pool_size": 200
    }
    Returns list of top k candidates with predicted_prob and basic metadata
    """
    payload = request.get_json(force=True)
    history_qids = payload.get("history_qids", [])
    history_correct = payload.get("history_correct", [])
    k = int(payload.get("k", 5))
    pool_size = int(payload.get("candidates_pool_size", 200))

    # candidate pool (not attempted)
    attempted = set(history_qids)
    qpool = QDF[~QDF['question_id'].isin(attempted)].copy()
    if qpool.empty:
        qpool = QDF.copy()
    if len(qpool) > pool_size:
        qpool = qpool.sample(n=pool_size, random_state=42)

    items_in, resps_in = encode_history(history_qids, history_correct)
    scored = []
    for _, row in qpool.iterrows():
        qid = row['question_id']
        prob = predict_prob_for_candidate(MODEL, items_in, resps_in, qid)
        scored.append({
            "question_id": qid,
            "chapter": row.get('chapter',''),
            "difficulty": float(row.get('difficulty',0.5)),
            "predicted_prob": float(prob)
        })
    # compute simple chapter priority (lower mastery -> higher priority)
    mastery = compute_chapter_mastery(history_qids, history_correct)
    ch_priority = {ch: (1.0 - m) for ch,m in mastery.items()}
    for s in scored:
        s['chapter_priority'] = ch_priority.get(s['chapter'], 1.0)
        s['score'] = s['chapter_priority'] - abs(s['predicted_prob'] - 0.6)  # simple heuristic
    scored_sorted = sorted(scored, key=lambda x: x['score'], reverse=True)
    return jsonify({"recommendations": scored_sorted[:k]})

@app.route("/coldstart", methods=["GET"])
def coldstart():
    k = int(request.args.get("k", 10))
    items = sample_coldstart(k=k)
    return jsonify({"coldstart_questions": items})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)