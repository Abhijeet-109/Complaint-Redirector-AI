import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findExistingLocalDocuments,
  hasUnresolvedDocumentChoices,
  partitionDocumentUploads,
} from '../src/utils/documentUpload.js';

test('same-name choices match local documents and keep Drive documents separate', () => {
  const documents = [
    { stored_name: 'local-one.pdf', original_name: 'Policy.pdf', source: 'local_upload' },
    { stored_name: 'local-two.pdf', original_name: 'POLICY.PDF', source: 'local_upload' },
    { stored_name: 'drive.pdf', original_name: 'policy.pdf', source: 'google_drive' },
  ];

  assert.deepEqual(
    findExistingLocalDocuments('policy.pdf', documents).map((document) => document.stored_name),
    ['local-one.pdf', 'local-two.pdf'],
  );
});

test('duplicate uploads require an explicit separate or replacement choice', () => {
  const duplicate = { isValid: true, existingMatches: [{ stored_name: 'local.pdf' }], uploadChoice: '' };
  const separate = { isValid: true, existingMatches: [{ stored_name: 'local.pdf' }], uploadChoice: 'separate' };
  const replacement = { isValid: true, existingMatches: [{ stored_name: 'local.pdf' }], uploadChoice: 'local.pdf' };
  const newDocument = { isValid: true, existingMatches: [], uploadChoice: 'separate' };

  assert.equal(hasUnresolvedDocumentChoices([duplicate]), true);
  assert.equal(hasUnresolvedDocumentChoices([separate, replacement, newDocument]), false);
  assert.deepEqual(partitionDocumentUploads([separate, replacement, newDocument]), {
    separateFiles: [separate, newDocument],
    replacements: [replacement],
  });
});
