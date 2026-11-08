from decimal import Decimal
from pydantic import AliasPath, BaseModel, ConfigDict, Field, field_validator, model_validator


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
    mrp: Decimal
    is_available: bool
    inventory: InventoryRead | None = None

    model_config = ConfigDict(from_attributes=True)


class ImageRead(BaseModel):
    id: int
    url: str = Field(validation_alias="storage_key")
    provider: str
    alt_text: str | None = None
    display_order: int
    variant_id: int | None = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class AdminImageRead(ImageRead):
    provider_file_id: str | None = None


class ProductRead(BaseModel):
    id: int
    name: str
    slug: str
    description: str | None
    short_description: str | None
    highlights: list[str]
    specifications: dict[str, str]
    is_returnable: bool | None
    return_window_days: int | None
    is_refundable: bool | None
    payment_methods: list[str]
    brand: str | None
    is_active: bool
    variant_image_mode: str = Field(
        default="per_variant",
        validation_alias=AliasPath("attributes", "variant_image_mode"),
    )
    category: CategoryBrief | None
    images: list[ImageRead]
    variants: list[VariantRead]

    @field_validator("variant_image_mode", mode="before")
    @classmethod
    def normalize_variant_image_mode(cls, value):
        return value if value in {"shared", "per_variant"} else "per_variant"

    model_config = ConfigDict(from_attributes=True)


class AdminProductRead(ProductRead):
    images: list[AdminImageRead]


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
    mrp: Decimal | None = Field(default=None, ge=0)
    is_available: bool = True
    total_stock: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def mrp_covers_price(self):
        if self.mrp is not None and self.mrp < self.price:
            raise ValueError("MRP must be greater than or equal to selling price")
        return self


def _clean_highlights(value):
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("Highlights must be a list of strings")
    if any(not isinstance(entry, str) for entry in value):
        raise ValueError("Highlights must contain only strings")
    return [entry.strip() for entry in value if entry.strip()]


def _clean_specifications(value):
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("Specifications must be an object of string values")
    result = {}
    seen = set()
    for key, item in value.items():
        if not isinstance(key, str) or not isinstance(item, str):
            raise ValueError("Specification names and values must be strings")
        key, item = key.strip(), item.strip()
        if not key or not item:
            raise ValueError("Specification names and values cannot be empty")
        folded = key.casefold()
        if folded in seen:
            raise ValueError("Specification names must be unique ignoring case")
        seen.add(folded)
        result[key] = item
    return result


def _clean_payment_methods(value):
    allowed = {"cod", "upi", "netbanking"}
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(item, str) or item not in allowed for item in value):
        raise ValueError("Payment methods may only contain cod, upi, and netbanking")
    if len(set(value)) != len(value):
        raise ValueError("Payment methods cannot contain duplicates")
    return value


class ProductInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=120)
    description: str | None = None
    short_description: str | None = Field(default=None, max_length=250)
    highlights: list[str] = Field(default_factory=list)
    specifications: dict[str, str] = Field(default_factory=dict)
    is_returnable: bool | None = False
    return_window_days: int | None = Field(default=None, ge=1)
    is_refundable: bool | None = False
    payment_methods: list[str] = Field(default_factory=list)
    category_id: int | None = None
    slug: str | None = Field(default=None, max_length=220)
    is_active: bool = True
    variants: list[VariantInput] = Field(min_length=1)

    @field_validator("highlights", mode="before")
    @classmethod
    def clean_highlights(cls, value): return _clean_highlights(value)

    @field_validator("specifications", mode="before")
    @classmethod
    def clean_specifications(cls, value): return _clean_specifications(value)

    @field_validator("payment_methods", mode="before")
    @classmethod
    def clean_payment_methods(cls, value): return _clean_payment_methods(value)

    @model_validator(mode="after")
    def validate_policy(self):
        if self.is_returnable is True and not self.return_window_days:
            raise ValueError("A positive return window is required when the product is returnable")
        return self


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=120)
    description: str | None = None
    short_description: str | None = Field(default=None, max_length=250)
    highlights: list[str] | None = None
    specifications: dict[str, str] | None = None
    is_returnable: bool | None = None
    return_window_days: int | None = Field(default=None, ge=1)
    is_refundable: bool | None = None
    payment_methods: list[str] | None = None
    category_id: int | None = None
    slug: str | None = Field(default=None, max_length=220)
    is_active: bool | None = None
    variants: list[VariantInput] | None = Field(default=None, min_length=1)

    @field_validator("highlights", mode="before")
    @classmethod
    def clean_highlights(cls, value): return None if value is None else _clean_highlights(value)

    @field_validator("specifications", mode="before")
    @classmethod
    def clean_specifications(cls, value): return None if value is None else _clean_specifications(value)

    @field_validator("payment_methods", mode="before")
    @classmethod
    def clean_payment_methods(cls, value): return None if value is None else _clean_payment_methods(value)

    @model_validator(mode="after")
    def validate_policy(self):
        if self.is_returnable is True and not self.return_window_days:
            raise ValueError("A positive return window is required when the product is returnable")
        return self


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
