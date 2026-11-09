import io
import logging
import os
import re
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.Database.models import (
    CartItem, CommerceOrderItem, Inventory, Product, ProductCategory,
    ProductImage, ProductVariant,
)
from backend.Database.services import get_category_tree, set_category_parent
from backend.api.catalog_schemas import (
    AdminProductRead, CategoryInput, CategoryNode, CategoryUpdate, ProductInput, ProductUpdate,
)
from backend.auth.dependencies import get_db, require_role

router = APIRouter(prefix="/api/admin/catalog", tags=["Admin Product Catalogue"])
logger = logging.getLogger(__name__)
admin_access = require_role("admin", "super_admin")
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_GALLERY_IMAGES = 8


class ImageOrderInput(BaseModel):
    image_ids: list[int] = Field(default_factory=list)
    variant_id: int | None = None


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def _is_valid_imagekit_folder(folder: str) -> bool:
    if not folder.startswith("/") or not folder.endswith("/"):
        return False
    segments = folder[1:-1].split("/")
    return bool(segments) and all(
        segment and re.fullmatch(r"[A-Za-z0-9_-]+", segment) is not None
        for segment in segments
    )


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
    variant_inputs = list(variant_inputs)
    variants_by_id = {variant.id: variant for variant in product.variants}
    sku_changes = []
    for item in variant_inputs:
        variant = variants_by_id.get(item.id) if item.id is not None else None
        if variant is not None and variant.sku != item.sku:
            sku_changes.append(variant)
    for variant in sku_changes:
        variant.sku = f"_pending_{uuid4().hex}"
    if sku_changes:
        db.flush()

    retained = set()
    for item in variant_inputs:
        variant = variants_by_id.get(item.id) if item.id is not None else None
        if item.id is not None and variant is None:
            raise HTTPException(422, "Variant does not belong to this product")
        if variant is None:
            variant = ProductVariant(product_id=product.id, sku=item.sku, name=item.name, price=item.price,
                                     mrp=item.mrp if item.mrp is not None else item.price,
                                     is_available=item.is_available)
            db.add(variant)
            db.flush()
            product.variants.append(variant)
        else:
            variant.sku, variant.name, variant.price = item.sku, item.name, item.price
            variant.mrp = item.mrp if item.mrp is not None else item.price
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


def _validate_variant_update(db: Session, product: Product, variant_inputs) -> None:
    if variant_inputs is None:
        return
    variant_inputs = list(variant_inputs)
    submitted_ids = [item.id for item in variant_inputs if item.id is not None]
    if len(submitted_ids) != len(set(submitted_ids)):
        raise HTTPException(422, "Each existing variant may appear only once in an update")

    product_variant_ids = {variant.id for variant in product.variants}
    if any(variant_id not in product_variant_ids for variant_id in submitted_ids):
        raise HTTPException(422, "Variant does not belong to this product")

    submitted_skus = [item.sku for item in variant_inputs]
    if len(submitted_skus) != len(set(submitted_skus)):
        raise HTTPException(409, "Each SKU must be unique within this product")

    owners = db.scalars(select(ProductVariant).where(ProductVariant.sku.in_(set(submitted_skus)))).all()
    submitted_id_set = set(submitted_ids)
    for owner in owners:
        if owner.id not in submitted_id_set:
            raise HTTPException(409, f"SKU '{owner.sku}' is already assigned to another variant")


def _integrity_error_detail(exc: IntegrityError) -> tuple[str, str | None]:
    original = exc.orig
    diagnostic = getattr(original, "diag", None)
    constraint = getattr(diagnostic, "constraint_name", None) or getattr(original, "constraint_name", None)
    normalized = str(constraint or "").casefold()
    if "sku" in normalized:
        return "SKU is already assigned to another variant", constraint
    if "slug" in normalized:
        return "Product slug is already in use", constraint
    return "Product update conflicts with a catalogue constraint", constraint


@router.get("/products", response_model=list[AdminProductRead])
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


@router.get("/products/{product_id}", response_model=AdminProductRead)
def get_admin_product(product_id: int, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    return _read_product(db, product_id)


@router.post("/products", response_model=AdminProductRead, status_code=201)
def create_product(payload: ProductInput, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    if payload.category_id is not None and db.get(ProductCategory, payload.category_id) is None:
        raise HTTPException(404, "Category not found")
    product = Product(name=payload.name, brand=payload.brand, description=payload.description,
                      short_description=payload.short_description, highlights=payload.highlights,
                      specifications=payload.specifications, is_returnable=payload.is_returnable,
                      return_window_days=payload.return_window_days if payload.is_returnable else None,
                      is_refundable=payload.is_refundable, payment_methods=payload.payment_methods,
                      category_id=payload.category_id,
                      slug=_unique_slug(db, Product, payload.slug or payload.name),
                      is_active=payload.is_active,
                      attributes={"variant_image_mode": payload.variant_image_mode})
    db.add(product)
    try:
        db.flush()
        _set_variants(db, product, payload.variants)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Product slug or SKU already exists") from exc
    return _read_product(db, product.id)


@router.put("/products/{product_id}", response_model=AdminProductRead)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    product = _read_product(db, product_id)
    changes = payload.model_dump(exclude_unset=True)
    variant_image_mode = changes.pop("variant_image_mode", None)
    variants = changes.pop("variants", None)
    if changes.get("is_returnable") is False:
        changes["return_window_days"] = None
    if "category_id" in changes and changes["category_id"] is not None and db.get(ProductCategory, changes["category_id"]) is None:
        raise HTTPException(404, "Category not found")
    if "slug" in changes:
        changes["slug"] = _unique_slug(db, Product, changes["slug"] or changes.get("name", product.name), product.id)
    _validate_variant_update(db, product, payload.variants if variants is not None else None)
    for key, value in changes.items():
        setattr(product, key, value)
    if variant_image_mode is not None:
        product.attributes = {
            **(product.attributes if isinstance(product.attributes, dict) else {}),
            "variant_image_mode": variant_image_mode,
        }
    try:
        if variants is not None:
            _set_variants(db, product, payload.variants)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        detail, constraint = _integrity_error_detail(exc)
        logger.warning("Product update integrity conflict product_id=%s constraint=%s", product_id, constraint or "unknown")
        raise HTTPException(409, detail) from exc
    return _read_product(db, product_id)


@router.patch("/products/{product_id}/archive", response_model=AdminProductRead)
def archive_product(product_id: int, db: Session = Depends(get_db), _actor=Depends(admin_access)):
    product = _read_product(db, product_id)
    product.is_active = False
    db.commit()
    return _read_product(db, product_id)


@router.patch("/products/{product_id}/restore", response_model=AdminProductRead)
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
    variant_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    _actor=Depends(admin_access),
):
    product = db.scalar(select(Product).where(Product.id == product_id).with_for_update())
    if product is None:
        raise HTTPException(404, "Product not found")
    if variant_id is not None:
        variant = db.get(ProductVariant, variant_id)
        if variant is None or variant.product_id != product_id:
            raise HTTPException(422, "Variant does not belong to this product")
    image_count = db.scalar(select(func.count(ProductImage.id)).where(
        ProductImage.product_id == product_id,
        ProductImage.variant_id == variant_id,
    )) or 0
    if image_count >= MAX_GALLERY_IMAGES:
        raise HTTPException(409, "A gallery can contain no more than 8 images")
    existing_images = list(db.scalars(select(ProductImage).where(ProductImage.product_id == product_id)
                                      .where(ProductImage.variant_id == variant_id)
                                      .order_by(ProductImage.display_order, ProductImage.id)))
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
    ext = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[actual_format]
    folder_variant = variant if variant_id is not None else db.scalar(
        select(ProductVariant).where(ProductVariant.product_id == product_id).order_by(ProductVariant.id).limit(1)
    )
    if folder_variant is None:
        raise HTTPException(409, "A product must have a variant before images can be uploaded")
    category = product.category
    if category is None:
        raise HTTPException(409, "A product must have a category before images can be uploaded")
    safe_category = category.slug
    safe_sku = re.sub(r"[^A-Za-z0-9_-]", "-", folder_variant.sku).strip("-_ .")
    upload_folder = f"/Flatkart/Products/Categories/{safe_category}/{safe_sku}/"
    if not _is_valid_imagekit_folder(upload_folder):
        raise HTTPException(409, "Product category or variant SKU cannot form a safe upload folder")
    filename = f"image-{len(existing_images) + 1:02d}-{uuid4().hex}.{ext}"
    try:
        client = _imagekit_client()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "ImageKit upload service is unavailable") from exc
    try:
        result = client.files.upload(file=content, file_name=filename, folder=upload_folder)
        file_id = result.file_id
        url = result.url
        if not file_id or not url:
            raise ValueError("ImageKit response omitted file ID or URL")
    except Exception as exc:
        response = getattr(exc, "response", None)
        response_headers = getattr(response, "headers", None)
        request_id = response_headers.get("x-ik-requestId") if response_headers else None
        provider_message = None
        if response is not None:
            try:
                error_body = response.json()
            except (TypeError, ValueError):
                error_body = None
            if isinstance(error_body, dict):
                message = error_body.get("message")
                if isinstance(message, str):
                    provider_message = message
        logger.error(
            "ImageKit product image upload failed exception_type=%s status_code=%s request_id=%s provider_message=%s",
            type(exc).__name__,
            getattr(exc, "status_code", None),
            request_id,
            provider_message or "No ImageKit response message available",
        )
        raise HTTPException(502, "ImageKit could not store the image") from exc
    for order, existing in enumerate(existing_images):
        existing.display_order = order
    reference = ProductImage(product_id=product_id, variant_id=variant_id, storage_key=url, provider="imagekit",
                             provider_file_id=file_id, alt_text=f"{product.brand or ''} {product.name}".strip(),
                             display_order=len(existing_images))
    db.add(reference)
    try:
        db.commit()
        db.refresh(reference)
    except Exception as exc:
        db.rollback()
        logger.error("Orphaned ImageKit product upload file_id=%s product_id=%s", file_id, product_id)
        raise HTTPException(500, "Image uploaded, but its catalogue reference could not be saved") from exc
    return {"url": url, "file_id": file_id, "image_id": reference.id, "display_order": reference.display_order}


@router.put("/products/{product_id}/images/order")
def order_product_images(
    product_id: int,
    payload: ImageOrderInput,
    db: Session = Depends(get_db),
    _actor=Depends(admin_access),
):
    if db.get(Product, product_id) is None:
        raise HTTPException(404, "Product not found")
    if payload.variant_id is not None:
        variant = db.get(ProductVariant, payload.variant_id)
        if variant is None or variant.product_id != product_id:
            raise HTTPException(422, "Variant does not belong to this product")
    images = list(db.scalars(select(ProductImage).where(ProductImage.product_id == product_id)
                             .where(ProductImage.variant_id == payload.variant_id)
                             .order_by(ProductImage.display_order, ProductImage.id)))
    current_ids = {image.id for image in images}
    if len(payload.image_ids) != len(set(payload.image_ids)) or set(payload.image_ids) != current_ids:
        raise HTTPException(422, "Image order must include every product image exactly once")
    by_id = {image.id: image for image in images}
    try:
        for order, image_id in enumerate(payload.image_ids):
            by_id[image_id].display_order = order
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, "Image order could not be saved") from exc
    return {"image_ids": payload.image_ids}


@router.delete("/products/{product_id}/images/{image_id}", status_code=204)
def delete_product_image(
    product_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    _actor=Depends(admin_access),
):
    image = db.scalar(select(ProductImage).where(
        ProductImage.id == image_id, ProductImage.product_id == product_id
    ))
    if image is None:
        raise HTTPException(404, "Product image not found")
    provider, file_id, variant_id = image.provider, image.provider_file_id, image.variant_id
    db.delete(image)
    remaining = list(db.scalars(select(ProductImage).where(ProductImage.product_id == product_id)
                                .where(ProductImage.variant_id == variant_id)
                                .order_by(ProductImage.display_order, ProductImage.id)))
    for order, item in enumerate(remaining):
        item.display_order = order
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, "Product image could not be deleted") from exc
    if provider == "imagekit" and file_id and db.scalar(select(ProductImage.id).where(
        ProductImage.provider == "imagekit", ProductImage.provider_file_id == file_id
    ).limit(1)) is None:
        try:
            _imagekit_client().files.delete(file_id)
        except Exception:
            logger.warning("ImageKit cleanup failed for deleted product image file_id=%s", file_id)


@router.delete("/products/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _actor=Depends(admin_access),
):
    product = _read_product(db, product_id)
    variant_ids = [v.id for v in product.variants]
    if variant_ids:
        cart_ref = db.scalar(select(CartItem.id).where(CartItem.variant_id.in_(variant_ids)).limit(1))
        order_ref = db.scalar(select(CommerceOrderItem.id).where(CommerceOrderItem.variant_id.in_(variant_ids)).limit(1))
        if cart_ref or order_ref:
            raise HTTPException(
                409,
                "This product is referenced by cart or order history and cannot be permanently deleted. Archive it instead.",
            )
    file_ids = list({
        img.provider_file_id
        for img in product.images
        if img.provider == "imagekit" and img.provider_file_id
    })
    try:
        db.delete(product)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Product cannot be deleted due to a catalogue constraint. Archive it instead.") from exc
    for file_id in file_ids:
        still_used = db.scalar(
            select(ProductImage.id).where(
                ProductImage.provider == "imagekit",
                ProductImage.provider_file_id == file_id,
            ).limit(1)
        )
        if not still_used:
            try:
                _imagekit_client().files.delete(file_id)
            except Exception:
                logger.warning("ImageKit cleanup failed after product deletion file_id=%s product_id=%s", file_id, product_id)
    return Response(status_code=204)


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    _actor=Depends(admin_access),
):
    category = db.get(ProductCategory, category_id)
    if category is None:
        raise HTTPException(404, "Category not found")
    used = db.scalar(select(Product.id).where(Product.category_id == category_id).limit(1))
    if used:
        raise HTTPException(409, "This category has assigned products and cannot be deleted. Reassign or delete its products first.")
    child = db.scalar(select(ProductCategory.id).where(ProductCategory.parent_id == category_id).limit(1))
    if child:
        raise HTTPException(409, "This category has child categories and cannot be deleted. Remove or reassign them first.")
    try:
        db.delete(category)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Category cannot be deleted due to a constraint conflict.") from exc
    return Response(status_code=204)
