import io
import logging
import os
import re
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.Database.models import (
    Inventory, Product, ProductCategory,
    ProductImage, ProductVariant,
)
from backend.Database.services import get_category_tree, set_category_parent
from backend.api.catalog_schemas import (
    CategoryInput, CategoryNode, CategoryUpdate, ProductInput, ProductRead, ProductUpdate,
)
from backend.auth.dependencies import get_db, require_role

router = APIRouter(prefix="/api/admin/catalog", tags=["Admin Product Catalogue"])
logger = logging.getLogger(__name__)
admin_access = require_role("admin", "super_admin")
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def _unique_slug(db: Session, model, value: str, current_id: int | None = None) -> str:
    base = _slug(value)
    if not base:
        raise HTTPException(422, "A valid slug could not be generated")
    candidate, suffix = base, 2
    while db.scalar(select(model.id).where(model.slug == candidate, model.id != current_id)) is not None:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def _product_query():
    return select(Product).options(
        selectinload(Product.category), selectinload(Product.images),
        selectinload(Product.variants).selectinload(ProductVariant.inventory),
    )


def _read_product(db: Session, product_id: int) -> Product:
    product = db.scalar(_product_query().where(Product.id == product_id))
    if product is None:
        raise HTTPException(404, "Product not found")
    return product


def _set_variants(db: Session, product: Product, variant_inputs):
    retained = set()
    for item in variant_inputs:
        variant = next((v for v in product.variants if item.id is not None and v.id == item.id), None)
        if item.id is not None and variant is None:
            raise HTTPException(422, "Variant does not belong to this product")
        if variant is None:
            variant = ProductVariant(product_id=product.id, sku=item.sku, name=item.name, price=item.price,
                                     is_available=item.is_available)
            db.add(variant)
            db.flush()
            product.variants.append(variant)
        else:
            variant.sku, variant.name, variant.price = item.sku, item.name, item.price
            variant.is_available = item.is_available
        retained.add(variant.id)
        inventory = variant.inventory
        if inventory is None:
            inventory = Inventory(variant_id=variant.id, available_stock=item.total_stock,
                                  total_stock=item.total_stock, reserved_stock=0,
                                  stock_status="in_stock" if item.total_stock else "out_of_stock")
            db.add(inventory)
        else:
            if item.total_stock < inventory.reserved_stock:
                raise HTTPException(409, f"Total stock for {variant.sku} cannot be below reserved stock")
            inventory.total_stock = item.total_stock
            inventory.available_stock = item.total_stock - inventory.reserved_stock
            inventory.stock_status = "in_stock" if inventory.available_stock else "out_of_stock"
    for variant in product.variants:
        if variant.id not in retained:
            # Preserve cart/order foreign-key history and reservation balances.
            variant.is_available = False


@router.get("/products", response_model=list[ProductRead])
def list_admin_products(
    search: str | None = Query(default=None, max_length=120),
    category_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
    _actor=Depends(admin_access),
):
    query = _product_query()
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(Product.name.ilike(term) | Product.brand.ilike(term))
    if category_id is not None:
        query = query.where(Product.category_id == category_id)
    return db.scalars(query.order_by(Product.name).limit(limit)).unique().all()


@router.get("/products/{product_id}", response_model=ProductRead)
def get_admin_product(product_id: int, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    return _read_product(db, product_id)


@router.post("/products", response_model=ProductRead, status_code=201)
def create_product(payload: ProductInput, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    if payload.category_id is not None and db.get(ProductCategory, payload.category_id) is None:
        raise HTTPException(404, "Category not found")
    product = Product(name=payload.name, brand=payload.brand, description=payload.description,
                      category_id=payload.category_id,
                      slug=_unique_slug(db, Product, payload.slug or payload.name),
                      is_active=payload.is_active, attributes={})
    db.add(product)
    try:
        db.flush()
        _set_variants(db, product, payload.variants)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Product slug or SKU already exists") from exc
    return _read_product(db, product.id)


@router.put("/products/{product_id}", response_model=ProductRead)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    product = _read_product(db, product_id)
    changes = payload.model_dump(exclude_unset=True)
    variants = changes.pop("variants", None)
    if "category_id" in changes and changes["category_id"] is not None and db.get(ProductCategory, changes["category_id"]) is None:
        raise HTTPException(404, "Category not found")
    if "slug" in changes:
        changes["slug"] = _unique_slug(db, Product, changes["slug"] or changes.get("name", product.name), product.id)
    for key, value in changes.items():
        setattr(product, key, value)
    try:
        if variants is not None:
            _set_variants(db, product, payload.variants)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Product slug or SKU already exists") from exc
    return _read_product(db, product_id)


@router.patch("/products/{product_id}/archive", response_model=ProductRead)
def archive_product(product_id: int, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    product = _read_product(db, product_id)
    product.is_active = False
    db.commit()
    return _read_product(db, product_id)


@router.patch("/products/{product_id}/restore", response_model=ProductRead)
def restore_product(product_id: int, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    product = _read_product(db, product_id)
    product.is_active = True
    db.commit()
    return _read_product(db, product_id)


@router.get("/categories", response_model=list[CategoryNode])
def list_admin_categories(db: Session = Depends(get_db), _actor=Depends(admin_access)):
    try:
        return get_category_tree(db, active_only=False)
    except RuntimeError as exc:
        raise HTTPException(409, "Category hierarchy is invalid") from exc


@router.post("/categories", response_model=CategoryNode, status_code=201)
def create_category(payload: CategoryInput, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    category = ProductCategory(name=payload.name, slug=_unique_slug(db, ProductCategory, payload.slug or payload.name),
                               display_order=payload.display_order, is_active=payload.is_active)
    db.add(category)
    try:
        db.flush()
        if payload.parent_id is not None:
            set_category_parent(db, category.id, payload.parent_id)
        db.commit()
    except (ValueError, LookupError, RuntimeError, IntegrityError) as exc:
        db.rollback()
        raise HTTPException(409, str(exc) or "Invalid category parent") from exc
    return {"id": category.id, "parent_id": category.parent_id, "name": category.name, "slug": category.slug,
            "is_active": category.is_active, "display_order": category.display_order, "children": []}


@router.put("/categories/{category_id}", response_model=CategoryNode)
def update_category(category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    category = db.get(ProductCategory, category_id)
    if category is None:
        raise HTTPException(404, "Category not found")
    changes = payload.model_dump(exclude_unset=True)
    parent_id = changes.pop("parent_id", category.parent_id)
    if "slug" in changes:
        changes["slug"] = _unique_slug(db, ProductCategory, changes["slug"] or changes.get("name", category.name), category.id)
    try:
        for key, value in changes.items():
            setattr(category, key, value)
        set_category_parent(db, category.id, parent_id)
        db.commit()
    except (ValueError, LookupError, RuntimeError, IntegrityError) as exc:
        db.rollback()
        raise HTTPException(409, str(exc) or "Invalid category update") from exc
    return {"id": category.id, "parent_id": category.parent_id, "name": category.name, "slug": category.slug,
            "is_active": category.is_active, "display_order": category.display_order, "children": []}


@router.patch("/categories/{category_id}/archive", response_model=CategoryNode)
def archive_category(category_id: int, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    category = db.get(ProductCategory, category_id)
    if category is None:
        raise HTTPException(404, "Category not found")
    used = db.scalar(select(Product.id).where(Product.category_id == category_id).limit(1))
    child = db.scalar(select(ProductCategory.id).where(ProductCategory.parent_id == category_id).limit(1))
    if used or child:
        raise HTTPException(409, "Reassign products and child categories before archiving this category")
    category.is_active = False
    db.commit()
    return {"id": category.id, "parent_id": category.parent_id, "name": category.name, "slug": category.slug,
            "is_active": category.is_active, "display_order": category.display_order, "children": []}


@router.patch("/categories/{category_id}/restore", response_model=CategoryNode)
def restore_category(category_id: int, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    category = db.get(ProductCategory, category_id)
    if category is None:
        raise HTTPException(404, "Category not found")
    category.is_active = True
    db.commit()
    return {"id": category.id, "parent_id": category.parent_id, "name": category.name, "slug": category.slug,
            "is_active": category.is_active, "display_order": category.display_order, "children": []}


def _imagekit_client():
    private_key = os.getenv("IMAGEKIT_PRIVATE_KEY", "").strip()
    if not private_key:
        raise HTTPException(503, "ImageKit is not configured. Set IMAGEKIT_PRIVATE_KEY on the backend.")
    from imagekitio import ImageKit
    return ImageKit(private_key=private_key)


@router.post("/products/{product_id}/images", status_code=201)
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _actor=Depends(admin_access),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found")
    content = await file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image must be 5 MB or smaller")
    try:
        image = Image.open(io.BytesIO(content))
        image.verify()
        actual_format = image.format
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(415, "The uploaded file is not a valid supported image") from exc
    if actual_format not in ALLOWED_IMAGE_FORMATS:
        raise HTTPException(415, "Only JPEG, PNG, and WebP images are supported")
    try:
        client = _imagekit_client()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "ImageKit upload service is unavailable") from exc
    ext = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[actual_format]
    try:
        result = client.files.upload(file=content, file_name=f"{uuid4().hex}.{ext}", folder="/flatkart/products")
        file_id = result.file_id
        url = result.url
        if not file_id or not url:
            raise ValueError("ImageKit response omitted file ID or URL")
    except Exception as exc:
        raise HTTPException(502, "ImageKit could not store the image") from exc
    old_imagekit_images = list(db.scalars(select(ProductImage).where(
        ProductImage.product_id == product_id, ProductImage.provider == "imagekit"
    )))
    existing_images = list(db.scalars(select(ProductImage).where(ProductImage.product_id == product_id)))
    for existing in existing_images:
        existing.display_order += 1
    reference = ProductImage(product_id=product_id, storage_key=url, provider="imagekit",
                             provider_file_id=file_id, alt_text=f"{product.brand or ''} {product.name}".strip(),
                             display_order=0)
    for old in old_imagekit_images:
        db.delete(old)
    db.add(reference)
    try:
        db.commit()
    except Exception:
        db.rollback()
        # The remote upload may be orphaned, but the catalogue transaction stays consistent.
        raise HTTPException(500, "Image uploaded, but its catalogue reference could not be saved")
    for old in old_imagekit_images:
        if old.provider_file_id and db.scalar(select(ProductImage.id).where(
            ProductImage.provider_file_id == old.provider_file_id
        ).limit(1)) is None:
            try:
                client.files.delete(old.provider_file_id)
            except Exception:
                logger.warning("ImageKit cleanup failed for replaced product image %s", old.provider_file_id)
    return {"url": url, "file_id": file_id, "image_id": reference.id}
