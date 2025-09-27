# inference_service README (local)

1. Place required assets (in host or in repo):
   - models/dkt_model_jee_adapted_finetuned.keras
   - processed/kt_numpy/qid2idx.json
   - processed/g_jee_questions_merged_650.csv

2. Install deps:
   pip install -r requirements.txt

3. Run locally:
   python inference.py
   # service listens on 0.0.0.0:8080

4. Run with Docker:
   docker build -t dkt-infer:latest .
   docker run -p 8080:8080 -v /path/to/ednet:/app -e EDNET_BASE_DIR=/app dkt-infer:latest

5. Test endpoints (curl or Postman):
   curl http://localhost:8080/health
   curl -X POST http://localhost:8080/predict -H "Content-Type: application/json" -d '{"history_qids":["Ph_Mec_11_0"],"history_correct":[1],"candidate_qid":"Ph_Mec_11_4"}'