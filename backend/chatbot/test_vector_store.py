from backend.chatbot.vector_store import add_documents, vectorstore

file_path = input("Enter the full path of your document: ").strip().strip('"')

try:
    chunk_count = add_documents([file_path])

    print("\nStorage successful!")
    print("Chunks stored:", chunk_count)

    results = vectorstore.similarity_search(
        "What information does this document contain?",
        k=3
    )

    print("\nSimilarity search test:")

    for result in results:
        print("\nMetadata:", result.metadata)
        print(result.page_content[:300])

except Exception as error:
    print("Test failed:", error)