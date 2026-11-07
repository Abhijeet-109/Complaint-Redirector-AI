from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field


class CategoryBrief(BaseModel):
    id: int
    name: str
    slug: str

    model_config = ConfigDict(from_attributes=True)


class InventoryRead(BaseModel):
    available_stock: int
    total_stock: int
    reserved_stock: int
    stock_status: str

    model_config = ConfigDict(from_attributes=True)


class VariantRead(BaseModel):
    id: int
    sku: str
    name: str
    price: Decimal
    is_available: bool
    inventory: InventoryRead | None = None

    model_config = ConfigDict(from_attributes=True)


class ImageRead(BaseModel):
    id: int
    url: str = Field(validation_alias="storage_key")
    provider: str
    provider_file_id: str | None = None
    alt_text: str | None = None
    display_order: int

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ProductRead(BaseModel):
    id: int
    name: str
    slug: str
    description: str | None
    brand: str | None
    is_active: bool
    category: CategoryBrief | None
    images: list[ImageRead]
    variants: list[VariantRead]

    model_config = ConfigDict(from_attributes=True)


class CategoryNode(BaseModel):
    id: int
    parent_id: int | None = None
    name: str
    slug: str
    is_active: bool
    display_order: int
    children: list["CategoryNode"] = Field(default_factory=list)


class VariantInput(BaseModel):
    id: int | None = None
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    price: Decimal = Field(ge=0)
    is_available: bool = True
    total_stock: int = Field(default=0, ge=0)


class ProductInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=120)
    description: str | None = None
    category_id: int | None = None
    slug: str | None = Field(default=None, max_length=220)
    is_active: bool = True
    variants: list[VariantInput] = Field(min_length=1)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=120)
    description: str | None = None
    category_id: int | None = None
    slug: str | None = Field(default=None, max_length=220)
    is_active: bool | None = None
    variants: list[VariantInput] | None = Field(default=None, min_length=1)


class CategoryInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=140)
    parent_id: int | None = None
    display_order: int = 0
    is_active: bool = True


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=140)
    parent_id: int | None = None
    display_order: int | None = None
    is_active: bool | None = None
