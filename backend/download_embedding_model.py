from sentence_transformers import SentenceTransformer

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

embedding = embedding_model.encode(
    ["Money was deducted but my payment did not complete."]
)

print(embedding.shape)