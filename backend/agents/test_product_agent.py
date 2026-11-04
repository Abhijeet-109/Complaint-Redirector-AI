import unittest

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session

from backend.Database.connection import Base
from backend.Database.models import Product, ProductVariant, User
from backend.Database.seed_commerce import seed_catalog
from backend.agents.product_tools import build_product_tools


class ProductToolsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(dbapi_connection, _record):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.user = User(name="Test Customer", email="customer@example.com", password="hash", role="user")
        self.session.add(self.user)
        self.session.flush()
        seed_catalog(self.session)
        self.session.commit()

        self.tools = build_product_tools()
        self.tool_by_name = {t.name: t for t in self.tools}

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def _run_tool(self, name, **kwargs):
        return self.tool_by_name[name].invoke(kwargs)

    def test_search_products_by_name(self):
        result = self._run_tool("search_products", query="Roadster")
        self.assertTrue(result["success"], result.get("message"))
        self.assertGreaterEqual(result["count"], 1)
        self.assertTrue(
            any("Roadster" in (p["name"] or "") or "Roadster" in (p["brand"] or "")
                for p in result["products"])
        )

    def test_search_products_by_brand(self):
        result = self._run_tool("search_products", query="Puma")
        self.assertTrue(result["success"], result.get("message"))
        self.assertGreaterEqual(result["count"], 1)

    def test_search_products_empty_query(self):
        result = self._run_tool("search_products", query="")
        self.assertFalse(result["success"])
        self.assertIn("required", result["message"].lower())

    def test_search_products_by_category(self):
        result = self._run_tool("search_products_by_category", category="men")
        self.assertTrue(result["success"], result.get("message"))
        self.assertGreaterEqual(result["count"], 1)
        for product in result["products"]:
            self.assertEqual(product["category_id"], self._men_category_id())

    def test_search_products_by_category_slug(self):
        result = self._run_tool("search_products_by_category", category="footwear")
        self.assertTrue(result["success"], result.get("message"))
        self.assertGreaterEqual(result["count"], 1)

    def test_search_products_unknown_category(self):
        result = self._run_tool("search_products_by_category", category="nonexistent-category")
        self.assertFalse(result["success"])
        self.assertIn("not found", result["message"].lower())

    def test_retrieve_product_details(self):
        product = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        self.assertIsNotNone(product)
        result = self._run_tool("get_product_details", product_id=product.id)
        self.assertTrue(result["success"], result.get("message"))
        self.assertEqual(result["product"]["product_id"], product.id)
        self.assertGreaterEqual(len(result["product"]["variants"]), 1)
        variant = result["product"]["variants"][0]
        self.assertIn("sku", variant)
        self.assertIn("price", variant)
        self.assertIn("stock_status", variant)

    def test_retrieve_product_details_invalid_id(self):
        result = self._run_tool("get_product_details", product_id=0)
        self.assertFalse(result["success"])
        self.assertIn("required", result["message"].lower())

    def test_retrieve_product_details_not_found(self):
        result = self._run_tool("get_product_details", product_id=99999)
        self.assertFalse(result["success"])
        self.assertIn("not found", result["message"].lower())

    def test_check_availability_in_stock(self):
        product = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        result = self._run_tool("get_product_details", product_id=product.id)
        self.assertTrue(result["success"])
        for variant in result["product"]["variants"]:
            self.assertIsNotNone(variant["stock_status"])
            self.assertIsNotNone(variant["available_stock"])

    def test_retrieve_variants_and_prices(self):
        product = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        result = self._run_tool("get_product_details", product_id=product.id)
        self.assertTrue(result["success"])
        for variant in result["product"]["variants"]:
            self.assertIsInstance(variant["price"], str)
            self.assertGreater(float(variant["price"]), 0)

    def test_compare_products(self):
        product_ids = [
            p.id for p in self.session.scalars(select(Product).limit(3))
        ]
        ids_str = ",".join(str(pid) for pid in product_ids)
        result = self._run_tool("compare_products", product_ids=ids_str)
        self.assertTrue(result["success"], result.get("message"))
        self.assertEqual(result["count"], len(product_ids))
        self.assertEqual(result["not_found"], [])

    def test_compare_products_with_missing(self):
        product = self.session.scalar(select(Product).limit(1))
        result = self._run_tool("compare_products", product_ids=f"{product.id},-999")
        self.assertTrue(result["success"], result.get("message"))
        self.assertEqual(result["count"], 1)
        self.assertIn(-999, result["not_found"])

    def test_compare_products_empty(self):
        result = self._run_tool("compare_products", product_ids="")
        self.assertFalse(result["success"])
        self.assertIn("required", result["message"].lower())

    def test_compare_products_too_many(self):
        ids = ",".join(str(i) for i in range(1, 12))
        result = self._run_tool("compare_products", product_ids=ids)
        self.assertFalse(result["success"])
        self.assertIn("10", result["message"])

    def test_ambiguous_query_returns_multiple(self):
        result = self._run_tool("search_products", query="shirt")
        self.assertTrue(result["success"], result.get("message"))
        self.assertGreater(result["count"], 1)

    def _men_category_id(self):
        from backend.Database.models import ProductCategory
        return self.session.scalar(
            select(ProductCategory).where(ProductCategory.slug == "men")
        ).id


if __name__ == "__main__":
    unittest.main()
