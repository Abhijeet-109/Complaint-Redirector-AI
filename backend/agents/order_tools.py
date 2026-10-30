
from langchain.tools import tool


# Temporary demo customer
DEMO_CUSTOMER_ID = "CUST-1001"


# Temporary in-memory order dataset
DUMMY_ORDERS = {
    "ORD-1001": {
        "order_id": "ORD-1001",
        "customer_id": "CUST-1001",
        "order_date": "2026-10-20",
        "status": "Shipped",
        "items": [
            {
                "product": "Wireless Mouse",
                "quantity": 1,
                "price": 799
            },
            {
                "product": "Mechanical Keyboard",
                "quantity": 1,
                "price": 2499
            }
        ],
        "total_amount": 3298,
        "payment_status": "Paid",
        "delivery_status": "In Transit",
        "estimated_delivery": "2026-11-02"
    },

    "ORD-1002": {
        "order_id": "ORD-1002",
        "customer_id": "CUST-1001",
        "order_date": "2026-10-24",
        "status": "Processing",
        "items": [
            {
                "product": "USB-C Hub",
                "quantity": 1,
                "price": 1499
            }
        ],
        "total_amount": 1499,
        "payment_status": "Paid",
        "delivery_status": "Not Shipped",
        "estimated_delivery": "2026-11-05"
    },

    "ORD-1003": {
        "order_id": "ORD-1003",
        "customer_id": "CUST-2001",
        "order_date": "2026-10-25",
        "status": "Delivered",
        "items": [
            {
                "product": "Bluetooth Headphones",
                "quantity": 1,
                "price": 1999
            }
        ],
        "total_amount": 1999,
        "payment_status": "Paid",
        "delivery_status": "Delivered",
        "estimated_delivery": "2026-10-28"
    }
}


@tool
def list_my_orders() -> dict:
    """List all orders belonging to the current demo customer."""

    orders = [
        {
            "order_id": order["order_id"],
            "order_date": order["order_date"],
            "status": order["status"],
            "total_amount": order["total_amount"]
        }
        for order in DUMMY_ORDERS.values()
        if order["customer_id"] == DEMO_CUSTOMER_ID
    ]

    return {
        "data_source": "MOCK_ORDER_DATA",
        "customer_id": DEMO_CUSTOMER_ID,
        "orders": orders
    }


@tool
def get_order_details(order_id: str) -> dict:
    """Get complete details of an order belonging to the demo customer."""

    order = DUMMY_ORDERS.get(order_id)

    if not order or order["customer_id"] != DEMO_CUSTOMER_ID:
        return {
            "success": False,
            "message": "Order not found."
        }

    return {
        "success": True,
        "data_source": "MOCK_ORDER_DATA",
        "order": order
    }


@tool
def get_order_status(order_id: str) -> dict:
    """Get the current status and delivery information of an order."""

    order = DUMMY_ORDERS.get(order_id)

    if not order or order["customer_id"] != DEMO_CUSTOMER_ID:
        return {
            "success": False,
            "message": "Order not found."
        }

    return {
        "success": True,
        "data_source": "MOCK_ORDER_DATA",
        "order_id": order["order_id"],
        "order_status": order["status"],
        "delivery_status": order["delivery_status"],
        "estimated_delivery": order["estimated_delivery"]
    }
