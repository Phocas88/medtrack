"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { Plus, Archive, ArchiveRestore, Upload } from "lucide-react";
import { ImportDialog } from "./import-dialog";
import { formatCurrency, storageLabel } from "@/lib/format";
import { ProductDialog } from "./product-dialog";
import type { Product } from "@/types/database";

export default function ProductsPage() {
  const { tenantId } = useAuth();
  const [products, setProducts] = useState<
    (Product & { total_on_hand?: number; nearest_expiration?: string | null })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  async function loadProducts() {
    if (!tenantId) return;
    setLoading(true);
    setLoadError("");
    const supabase = createClient();

    // Get products with stock summary
    const { data: prods, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_archived", showArchived)
      .order("name");

    if (productError || !prods) {
      setProducts([]);
      setLoadError("Could not load products. Please retry.");
      setLoading(false);
      return;
    }

    // Get stock summaries
    const { data: stockData, error: stockError } = await supabase
      .from("lots")
      .select("product_id, quantity_on_hand, expiration_date, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    if (stockError) {
      setProducts([]);
      setLoadError("Could not load stock balances. Please retry.");
      setLoading(false);
      return;
    }
    const stockMap: Record<string, { total: number; nearest: string | null }> =
      {};
    (stockData || []).forEach((lot) => {
      if (!stockMap[lot.product_id]) {
        stockMap[lot.product_id] = { total: 0, nearest: null };
      }
      stockMap[lot.product_id].total += lot.quantity_on_hand;
      if (lot.expiration_date) {
        const current = stockMap[lot.product_id].nearest;
        if (!current || lot.expiration_date < current) {
          stockMap[lot.product_id].nearest = lot.expiration_date;
        }
      }
    });

    const enriched = prods.map((p) => ({
      ...p,
      total_on_hand: stockMap[p.id]?.total ?? 0,
      nearest_expiration: stockMap[p.id]?.nearest ?? null,
    }));

    setProducts(enriched);
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, [tenantId, showArchived]);

  async function handleArchive(product: Product) {
    const supabase = createClient();
    await supabase
      .from("products")
      .update({ is_archived: !product.is_archived })
      .eq("id", product.id);
    loadProducts();
  }

  const columns: Column<(typeof products)[0]>[] = [
    { key: "sku", label: "SKU", sortable: true },
    { key: "name", label: "Product Name", sortable: true },
    { key: "category", label: "Category", sortable: true },
    { key: "manufacturer", label: "Manufacturer", sortable: true },
    {
      key: "total_on_hand",
      label: "Stock",
      sortable: true,
      render: (row) => {
        const isLow =
          row.total_on_hand !== undefined &&
          row.total_on_hand <= row.low_stock_threshold;
        return (
          <span className={isLow ? "text-destructive font-medium" : ""}>
            {row.total_on_hand ?? 0} {row.unit_of_measure}
            {isLow && (
              <Badge variant="destructive" className="ml-2 text-xs">
                Low
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      key: "nearest_expiration",
      label: "Nearest Expiry",
      render: (row) => <ExpiryBadge date={row.nearest_expiration ?? null} />,
    },
    {
      key: "storage_requirement",
      label: "Storage",
      render: (row) => storageLabel(row.storage_requirement),
    },
    {
      key: "cost",
      label: "Cost",
      render: (row) => formatCurrency(row.cost),
    },
    {
      key: "price",
      label: "Price",
      render: (row) => formatCurrency(row.price),
    },
    {
      key: "actions",
      label: "",
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleArchive(row);
          }}
          title={row.is_archived ? "Restore" : "Archive"}
        >
          {row.is_archived ? (
            <ArchiveRestore className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage your product catalog"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? "Show Active" : "Show Archived"}
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Import CSV
            </Button>
            <Button
              onClick={() => {
                setEditProduct(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Product
            </Button>
          </div>
        }
      />

      <DataTable
        data={products}
        columns={columns}
        searchKeys={["name", "sku", "category"]}
        loading={loading}
        error={loadError}
        onRetry={loadProducts}
        searchPlaceholder="Search products..."
        onRowClick={(row) => {
          setEditProduct(row);
          setDialogOpen(true);
        }}
        emptyMessage={loading ? "Loading..." : "No products found."}
      />

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editProduct}
        onSaved={loadProducts}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={loadProducts}
      />
    </div>
  );
}
