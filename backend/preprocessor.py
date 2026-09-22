import re


def preprocess_text(text):
    """
    Preprocess a complaint before sending it to the LSTM model.
    """

    # Convert to string and lowercase
    text = str(text).lower()

    # Remove URLs
    text = re.sub(r"http\S+|www\S+|https\S+", "", text)

    # Remove email addresses
    text = re.sub(r"\S+@\S+", "", text)

    # Keep alphabetic characters and spaces
    text = re.sub(r"[^a-z\s]", " ", text)

    # Remove extra spaces
    text = re.sub(r"\s+", " ", text).strip()

    return text



if __name__ == "__main__":
    complaint = "My PAYMENT failed!!! Please contact me at test@gmail.com"
    print(preprocess_text(complaint))