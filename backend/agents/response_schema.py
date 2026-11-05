"""Validated, JSON-compatible response contracts for Flatkart agents."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator


AgentName = Literal[
    "product", "cart", "order", "shipping", "returns", "knowledge", "support", "guardrail"
]
ResponseType = Literal[
    "product_list", "product_details", "product_comparison", "cart_summary", "cart_update",
    "order_list", "order_details", "order_status", "shipment_list", "shipment_details",
    "return_request_list", "text",
]
STRUCTURED_RESPONSE_KEY = "flatkart_response"


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class VariantData(ContractModel):
    variant_id: int | None = None
    sku: str | None = None
    name: str | None = None
    price: Decimal | None = None
    is_available: bool | None = None
    available_stock: int | None = None
    stock_status: str | None = None


class ProductData(ContractModel):
    product_id: int | None = None
    name: str | None = None
    brand: str | None = None
    description: str | None = None
    variants: list[VariantData] = Field(default_factory=list)


class ProductListData(ContractModel):
    products: list[ProductData]


class ProductDetailsData(ContractModel):
    product: ProductData


class ProductComparisonData(ContractModel):
    products: list[ProductData]


class CartItemData(ContractModel):
    product_name: str | None = None
    variant_name: str | None = None
    quantity: int | None = None
    unit_price: Decimal | None = None
    line_total: Decimal | None = None


class CartData(ContractModel):
    items: list[CartItemData]
    item_count: int
    total: Decimal


class OrderItemData(ContractModel):
    product: str | None = None
    variant: str | None = None
    sku: str | None = None
    quantity: int | None = None
    unit_price: Decimal | None = None
    line_total: Decimal | None = None


class OrderData(ContractModel):
    order_number: str
    status: str | None = None
    order_date: str | None = None
    total_amount: Decimal | None = None
    items: list[OrderItemData] | None = None


class OrderListData(ContractModel):
    orders: list[OrderData]


class OrderDetailsData(ContractModel):
    order: OrderData


class OrderStatusData(ContractModel):
    order_number: str
    status: str


class ShipmentData(ContractModel):
    order_number: str
    shipment_available: bool
    tracking_reference: str | None = None
    status: str | None = None
    shipped_at: str | None = None
    delivered_at: str | None = None


class ShipmentListData(ContractModel):
    shipments: list[ShipmentData]


class ShipmentDetailsData(ContractModel):
    shipment: ShipmentData


class ReturnRequestData(ContractModel):
    return_request_id: int
    order_number: str | None = None
    product_name: str | None = None
    variant_name: str | None = None
    quantity: int
    reason: str | None = None
    status: str | None = None
    requested_at: str | None = None


class ReturnRequestListData(ContractModel):
    return_requests: list[ReturnRequestData]


ResponseData = (
    ProductListData | ProductDetailsData | ProductComparisonData | CartData | OrderListData
    | OrderDetailsData | OrderStatusData | ShipmentListData | ShipmentDetailsData
    | ReturnRequestListData
)


class AgentResponse(ContractModel):
    schema_version: Literal[1] = 1
    agent: AgentName
    response_type: ResponseType
    answer: str
    data: ResponseData | None = None

    @field_validator("data", mode="before")
    @classmethod
    def data_matches_response_type(cls, value, info: ValidationInfo):
        expected = {
            "product_list": ProductListData,
            "product_details": ProductDetailsData,
            "product_comparison": ProductComparisonData,
            "cart_summary": CartData,
            "cart_update": CartData,
            "order_list": OrderListData,
            "order_details": OrderDetailsData,
            "order_status": OrderStatusData,
            "shipment_list": ShipmentListData,
            "shipment_details": ShipmentDetailsData,
            "return_request_list": ReturnRequestListData,
        }.get(info.data.get("response_type"))
        if expected is None:
            if value is not None:
                raise ValueError("Text responses cannot contain structured data")
        elif value is not None:
            return expected.model_validate(value)
        return value

    def as_json(self) -> dict:
        return self.model_dump(mode="json")


def text_response(agent: AgentName, answer: str) -> dict:
    safe_answer = answer.strip() if isinstance(answer, str) else ""
    return AgentResponse(agent=agent, response_type="text", answer=safe_answer or "I couldn't retrieve that information right now.").as_json()
