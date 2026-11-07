import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from wirebook import models  # noqa: E402
from wirebook.client import RESOURCES  # noqa: E402


class ModelsTest(unittest.TestCase):
    def test_every_resource_has_models(self) -> None:
        self.assertEqual(sorted(models.MODELS), sorted(RESOURCES.values()))
        for seg, m in models.MODELS.items():
            self.assertTrue(hasattr(models, m["type"]), seg)
            self.assertTrue(hasattr(models, m["type"] + "Create"), seg)
            self.assertEqual(hasattr(models, m["type"] + "Update"), m["updatable"], seg)

    def test_required_keys_come_from_the_specs(self) -> None:
        self.assertEqual(models.CustomerCreate.__required_keys__, frozenset({"name"}))
        self.assertIn("email", models.CustomerCreate.__optional_keys__)
        self.assertEqual(models.EmployeeCreate.__required_keys__, frozenset({"firstName", "lastName"}))
        self.assertEqual(models.InvoiceCreate.__required_keys__, frozenset({"customerRef"}))

    def test_update_needs_revision_number_and_not_the_id(self) -> None:
        self.assertEqual(models.CustomerUpdate.__required_keys__, frozenset({"revisionNumber"}))
        self.assertNotIn("listId", models.CustomerUpdate.__annotations__)
        self.assertEqual(models.EstimateUpdate.__required_keys__, frozenset({"revisionNumber"}))
        self.assertNotIn("txnId", models.EstimateUpdate.__annotations__)
        self.assertIn("lines", models.EstimateUpdate.__annotations__)

    def test_payments_cannot_be_updated(self) -> None:
        self.assertFalse(models.MODELS["payments"]["updatable"])
        self.assertFalse(hasattr(models, "PaymentUpdate"))


if __name__ == "__main__":
    unittest.main()
