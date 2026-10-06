import os
import pickle
import numpy as np

from tensorflow.keras.models import load_model
from sentence_transformers import SentenceTransformer

from backend.preprocessor import preprocess_text


# ==========================================
# PATHS
# ==========================================

# Project root = Complaint-Redirector
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MODEL_PATH = os.path.join(
    BASE_DIR,
    "new_Models",
    "complaint_lstm.keras"
)



LABEL_ENCODER_PATH = os.path.join(
    BASE_DIR,
    "new_Models",
    "label_encoder.pkl"
)


# ==========================================
# LOAD MODEL
# ==========================================

model = load_model(MODEL_PATH)


with open(LABEL_ENCODER_PATH, "rb") as file:
    label_encoder = pickle.load(file)



# ==========================================
# LOAD EMBEDDING MODEL
# ==========================================

embedding_model = SentenceTransformer(
    "all-MiniLM-L6-v2"
)


# ==========================================
# PREDICTION FUNCTION
# ==========================================

def predict_department(complaint):

    # 1. Preprocess complaint
    cleaned_text = preprocess_text(complaint)

    # 2. Generate embedding
    embedding = embedding_model.encode(
        [cleaned_text]
    )

    # 3. Reshape for LSTM
    embedding = embedding.reshape(
        1,
        1,
        384
    )

    # 4. Predict
    probabilities = model.predict(
        embedding,
        verbose=0
    )[0]

    # 5. Get highest probability
    predicted_index = np.argmax(
        probabilities
    )

    # 6. Convert index to department
    predicted_department = (
        label_encoder.inverse_transform(
            [predicted_index]
        )[0]
    )

    # 7. Confidence
    confidence = float(
        probabilities[predicted_index]
    )

    return predicted_department, confidence

# ==========================================
# TEST
# ==========================================

if __name__ == "__main__":

    test_complaints = [
        "Someone hacked my account and I cannot log in.",
        "I was charged twice for the same order.",
        "My package has not arrived yet.",
        "I want to return the damaged product.",
        "The product I received is defective.",
        "The app crashes whenever I try to place an order."
    ]

    print("\n" + "=" * 60)
    print("FLATKART COMPLAINT REDIRECTOR - MODEL TEST")
    print("=" * 60)

    for complaint in test_complaints:

        department, confidence = predict_department(
            complaint
        )

        print("\nComplaint:")
        print(complaint)

        print("Predicted Department:")
        print(department)

        print("Confidence:")
        print(round(confidence * 100, 2), "%")

        print("-" * 60)
