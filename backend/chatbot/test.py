from document_loader import load_document
file_path = input("Enter the full path of your document: ").strip().strip('"')
try:
    documents = load_document(file_path)

    print("\nExtraction successful!")
    print("Number of extracted sections:", len(documents))

    for document in documents:
        print("\nMetadata:", document["metadata"])
        print("Extracted text:")
        print(document["page_content"][:500])

except Exception as error:
    print("Extraction failed:", error)