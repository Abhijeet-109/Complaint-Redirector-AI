function orderedImages(images) {
  return [...images].sort((a, b) => a.display_order - b.display_order || a.id - b.id);
}

export function getProductGalleryImages(product, selectedVariant, firstVariantId) {
  const images = Array.isArray(product?.images) ? product.images : [];
  const sharedImages = orderedImages(images.filter((image) => image.variant_id == null));

  if (product?.variant_image_mode === 'shared') return sharedImages;

  const variantImages = orderedImages(images.filter((image) => image.variant_id === selectedVariant?.id));
  if (variantImages.length) return variantImages;

  return selectedVariant?.id == null || selectedVariant.id === firstVariantId
    ? sharedImages
    : [];
}

export function getProductCardImage(product) {
  const images = orderedImages(Array.isArray(product?.images) ? product.images : []);
  return images.find((image) => image.variant_id == null)?.url || images[0]?.url || '';
}
