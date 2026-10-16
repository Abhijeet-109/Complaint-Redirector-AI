export function findExistingLocalDocuments(fileName, documents = []) {
  const normalizedName = String(fileName || '').toLowerCase();
  return documents.filter((document) =>
    document.source === 'local_upload'
    && String(document.original_name || '').toLowerCase() === normalizedName
  );
}

export function hasUnresolvedDocumentChoices(files = []) {
  return files.some((file) =>
    file.isValid && file.existingMatches.length > 0 && !file.uploadChoice
  );
}

export function partitionDocumentUploads(files = []) {
  return {
    separateFiles: files.filter((file) => file.uploadChoice === 'separate'),
    replacements: files.filter((file) =>
      file.existingMatches.length > 0 && file.uploadChoice !== 'separate'
    ),
  };
}
