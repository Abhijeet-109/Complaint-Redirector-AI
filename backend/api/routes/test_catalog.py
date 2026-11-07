import io
import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import Inventory, Product, ProductCategory, ProductImage, ProductVariant, User
from backend.Database.seed_commerce import PRODUCTS, seed_catalog
from backend.api.routes.admin_catalog import router as admin_router
from backend.api.routes.products import router as products_router
from backend.auth.dependencies import get_current_user, get_db


class CatalogApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(
            self.engine,
            tables=[table for table in Base.metadata.sorted_tables if table.name != "knowledge_chunks"],
        )
        self.session = Session(self.engine)
        seed_catalog(self.session)
        self.session.commit()
        self.actor = User(id=900, name="Admin", email="admin@example.com", password="hash", role="admin")
        self.app = FastAPI()
        self.app.include_router(products_router)
        self.app.include_router(admin_router)
        def database_session():
            with Session(self.engine) as request_session:
                yield request_session
        self.app.dependency_overrides[get_db] = database_session
        self.app.dependency_overrides[get_current_user] = lambda: self.actor
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.session.close()
        self.engine.dispose()

    def test_public_list_search_category_detail_and_archival_visibility(self):
        products = self.client.get("/api/products?limit=100").json()
        self.assertEqual(len(products), len(PRODUCTS))
        self.assertIn("images", products[0])
        self.assertTrue(products[0]["images"][0]["url"].startswith("/assets/"))
        self.assertIn("inventory", products[0]["variants"][0])
        self.assertTrue(self.client.get("/api/products?search=Roadster").json())
        self.assertTrue(all(item["category"]["slug"] == "men" for item in self.client.get("/api/products?category=men").json()))
        detail = self.client.get("/api/products/men-sold-casual-shirt")
        self.assertEqual(detail.status_code, 200)
        product = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        product.is_active = False
        self.session.commit()
        self.assertEqual(self.client.get("/api/products/men-sold-casual-shirt").status_code, 404)
        self.assertNotIn(product.id, {item["id"] for item in self.client.get("/api/products").json()})

    def test_inactive_category_ancestor_hides_products_and_category_tree(self):
        fashion = self.session.scalar(select(ProductCategory).where(ProductCategory.slug == "fashion"))
        fashion.is_active = False
        self.session.commit()
        products = self.client.get("/api/products").json()
        self.assertNotIn("men-sold-casual-shirt", {item["slug"] for item in products})
        categories = self.client.get("/api/categories").json()
        self.assertNotIn("fashion", {item["slug"] for item in categories})

    def test_admin_and_super_admin_can_manage_catalog_and_user_is_forbidden(self):
        self.actor.role = "user"
        self.assertEqual(self.client.get("/api/admin/catalog/products").status_code, 403)
        for role in ("admin", "super_admin"):
            self.actor.role = role
            payload = {"name": f"Test Product {role}", "brand": "Test", "category_id": None,
                       "variants": [{"sku": f"TEST-{role}", "name": "One size", "price": 10, "total_stock": 4}]}
            response = self.client.post("/api/admin/catalog/products", json=payload)
            self.assertEqual(response.status_code, 201, response.text)
            product_id = response.json()["id"]
            self.assertEqual(self.client.patch(f"/api/admin/catalog/products/{product_id}/archive").status_code, 200)
            self.assertFalse(self.client.get(f"/api/admin/catalog/products/{product_id}").json()["is_active"])
            self.assertTrue(self.client.patch(f"/api/admin/catalog/products/{product_id}/restore").json()["is_active"])
        self.actor.role = "department_handler"
        self.assertEqual(self.client.get("/api/admin/catalog/categories").status_code, 403)

    def test_category_management_rejects_cycles_and_archival_with_references(self):
        response = self.client.post("/api/admin/catalog/categories", json={"name": "New Category"})
        self.assertEqual(response.status_code, 201)
        category_id = response.json()["id"]
        updated = self.client.put(f"/api/admin/catalog/categories/{category_id}", json={"name": "Renamed Category", "display_order": 3})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["name"], "Renamed Category")
        self.assertEqual(self.client.put(f"/api/admin/catalog/categories/{category_id}", json={"parent_id": category_id}).status_code, 409)
        self.assertEqual(self.client.patch(f"/api/admin/catalog/categories/{category_id}/archive").status_code, 200)
        self.assertEqual(self.client.patch(f"/api/admin/catalog/categories/{category_id}/restore").status_code, 200)
        men = self.session.scalar(select(ProductCategory).where(ProductCategory.slug == "men"))
        self.assertEqual(self.client.patch(f"/api/admin/catalog/categories/{men.id}/archive").status_code, 409)

    def test_variant_stock_preserves_reserved_quantity_and_retires_removed_variant(self):
        product = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        variant = product.variants[0]
        inventory = variant.inventory
        inventory.total_stock = 10
        inventory.reserved_stock = 3
        inventory.available_stock = 7
        self.session.commit()
        payload = {"variants": [{"id": variant.id, "sku": variant.sku, "name": variant.name,
                                 "price": 1300, "total_stock": 8, "is_available": True}]}
        updated = self.client.put(f"/api/admin/catalog/products/{product.id}", json=payload)
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(inventory.available_stock, 5)
        self.assertEqual(inventory.reserved_stock, 3)
        payload["variants"][0]["total_stock"] = 2
        self.assertEqual(self.client.put(f"/api/admin/catalog/products/{product.id}", json=payload).status_code, 409)
        self.assertEqual(inventory.total_stock, 8)

    def test_image_upload_validates_content_and_mock_upload_stores_provider_reference(self):
        product = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        image_data = io.BytesIO()
        Image.new("RGB", (2, 2), "white").save(image_data, format="PNG")
        with patch.dict(os.environ, {"IMAGEKIT_PRIVATE_KEY": ""}):
            missing = self.client.post(f"/api/admin/catalog/products/{product.id}/images", files={"file": ("x.png", image_data.getvalue(), "image/png")})
            self.assertEqual(missing.status_code, 503)

        class UploadResult:
            file_id = "imagekit-test-file"
            url = "https://ik.imagekit.io/test/product.png"

        class FileApi:
            def upload(self, **_kwargs):
                return UploadResult()
            def delete(self, _file_id):
                return None
        class Client:
            files = FileApi()
        with patch("backend.api.routes.admin_catalog._imagekit_client", return_value=Client()):
            bad = self.client.post(f"/api/admin/catalog/products/{product.id}/images", files={"file": ("fake.png", b"not an image", "image/png")})
            self.assertEqual(bad.status_code, 415)
            good = self.client.post(f"/api/admin/catalog/products/{product.id}/images", files={"file": ("actual.png", image_data.getvalue(), "text/plain")})
        self.assertEqual(good.status_code, 201, good.text)
        reference = self.session.scalar(select(ProductImage).where(ProductImage.provider_file_id == "imagekit-test-file"))
        self.assertEqual(reference.storage_key, UploadResult.url)
        self.assertEqual(reference.provider, "imagekit")


if __name__ == "__main__":
    unittest.main()
