import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductCardImage, getProductGalleryImages } from '../src/utils/productImages.js';

const shared = { id: 10, url: '/shared.jpg', variant_id: null, display_order: 0 };
const firstVariantImage = { id: 11, url: '/first.jpg', variant_id: 1, display_order: 0 };
const secondVariantImage = { id: 12, url: '/second.jpg', variant_id: 2, display_order: 0 };

test('shared gallery is used for every selected variant and ordered consistently', () => {
  const product = {
    variant_image_mode: 'shared',
    images: [
      { ...shared, id: 20, display_order: 2 },
      { ...shared, id: 19, display_order: 1 },
      firstVariantImage,
      secondVariantImage,
    ],
  };
  for (const variant of [{ id: 1 }, { id: 2 }]) {
    assert.deepEqual(getProductGalleryImages(product, variant, 1).map((image) => image.id), [19, 20]);
  }
});

test('per-variant galleries stay isolated and only default variant falls back to shared', () => {
  const product = { variant_image_mode: 'per_variant', images: [shared, firstVariantImage, secondVariantImage] };
  assert.deepEqual(getProductGalleryImages(product, { id: 1 }, 1), [firstVariantImage]);
  assert.deepEqual(getProductGalleryImages(product, { id: 2 }, 1), [secondVariantImage]);
  assert.deepEqual(getProductGalleryImages({ ...product, images: [shared] }, { id: 2 }, 1), []);
  assert.deepEqual(getProductGalleryImages({ ...product, images: [shared] }, { id: 1 }, 1), [shared]);
});

test('legacy products default to per-variant behavior and card prefers a shared image', () => {
  const legacy = { images: [firstVariantImage, shared] };
  assert.deepEqual(getProductGalleryImages(legacy, { id: 2 }, 1), []);
  assert.equal(getProductCardImage(legacy), shared.url);
  assert.equal(getProductCardImage({ images: [firstVariantImage] }), firstVariantImage.url);
  assert.equal(getProductCardImage({ images: [] }), '');
});
