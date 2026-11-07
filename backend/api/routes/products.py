from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.Database.models import Product, ProductCategory, ProductVariant
from backend.Database.services import get_category_tree
from backend.api.catalog_schemas import CategoryNode, ProductRead
from backend.auth.dependencies import get_db

router = APIRouter(tags=["Product Catalogue"])


def product_query():
    return select(Product).options(
        selectinload(Product.category),
        selectinload(Product.images),
        selectinload(Product.variants).selectinload(ProductVariant.inventory),
    )


def visible_category_ids(db: Session) -> set[int]:
    def collect(nodes):
        return {node["id"] for node in nodes} | set().union(*(collect(node["children"]) for node in nodes)) if nodes else set()
    try:
        return collect(get_category_tree(db, active_only=True))
    except RuntimeError as exc:
        raise HTTPException(409, "Category hierarchy is invalid") from exc


@router.get("/api/products", response_model=list[ProductRead])
def list_public_products(
    search: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=140),
    limit: int = Query(default=48, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = product_query().where(Product.is_active.is_(True))
    allowed_category_ids = visible_category_ids(db)
    query = query.where(Product.category_id.is_(None) | Product.category_id.in_(allowed_category_ids))
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(Product.name.ilike(term) | Product.brand.ilike(term))
    if category:
        query = query.join(ProductCategory).where(ProductCategory.slug == category, ProductCategory.id.in_(allowed_category_ids))
    products = db.scalars(query.order_by(Product.name).limit(limit)).unique().all()
    return products


@router.get("/api/products/{slug}", response_model=ProductRead)
def get_public_product(slug: str, db: Session = Depends(get_db)):
    allowed_category_ids = visible_category_ids(db)
    product = db.scalar(
        product_query().where(
            Product.slug == slug,
            Product.is_active.is_(True),
            Product.category_id.is_(None) | Product.category_id.in_(allowed_category_ids),
        )
    )
    if product is None:
        raise HTTPException(404, "Product not found")
    return product


@router.get("/api/categories", response_model=list[CategoryNode])
def get_public_categories(db: Session = Depends(get_db)):
    try:
        return get_category_tree(db, active_only=True)
    except RuntimeError as exc:
        raise HTTPException(409, "Category hierarchy is invalid") from exc
