
from backend.chatbot.answer_pipeline import answer_question


while True:

    question = input("\nAsk a question (or type exit): ")

    if question.strip().lower() == "exit":
        break

    if not question.strip():
        print("Please enter a question.")
        continue

    try:
        result = answer_question(question)

        print("\nAnswer:")
        print(result["answer"])

        print("\nSources:")
        for source in result["sources"]:
            print(source)

    except Exception as error:
        print("Test failed:", error)
