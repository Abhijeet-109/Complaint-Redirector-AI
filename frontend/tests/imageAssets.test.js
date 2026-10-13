import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../src/data/categories.js';
import {
  FEATURED_PRODUCTS,
  FRESH_ARRIVALS,
  LIFESTYLE_CATEGORIES,
  TRENDING_PRODUCTS,
} from '../src/data/demoProducts.js';
import { LOGIN_SLIDES } from '../src/data/loginSlides.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetExists = (src) => existsSync(path.join(frontendRoot, 'public', src.replace(/^\//, '')));

test('shopping card assets exist and product imagery is unique across product rows', () => {
  const products = [...FEATURED_PRODUCTS, ...TRENDING_PRODUCTS, ...FRESH_ARRIVALS];
  const productImages = products.map((product) => product.image);
  assert.equal(new Set(productImages).size, productImages.length, 'product cards should not reuse the same image');

  const categoryImages = [
    ...CATEGORIES.map((item) => item.image),
    ...LIFESTYLE_CATEGORIES.map((item) => item.image),
  ];
  for (const src of [...productImages, ...categoryImages]) {
    assert.equal(assetExists(src), true, `missing shopping image ${src}`);
  }
});

test('login carousel assets are local, unique, and separate from the landing hero slides', () => {
  const sources = LOGIN_SLIDES.map((slide) => slide.src);
  assert.equal(new Set(sources).size, sources.length);
  for (const src of sources) assert.equal(assetExists(src), true, `missing login image ${src}`);

  const heroSource = readFileSync(
    path.join(frontendRoot, 'src', 'components', 'home', 'HeroBanner.jsx'),
    'utf8',
  );
  const heroImages = new Set([...heroSource.matchAll(/image:\s*'([^']+)'/g)].map((match) => match[1]));
  assert.equal(sources.some((src) => heroImages.has(src)), false);
  assert.equal(sources.includes('/assets/auth_register_bg.jpg'), false, 'login and editorial sections should use distinct images');

  assert.equal(assetExists('/assets/auth_register_bg.jpg'), true, 'missing editorial collection image');
});
