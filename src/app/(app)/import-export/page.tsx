"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Papa from "papaparse"
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { formatNumber } from "@/lib/format"
import { exportToCSV } from "@/lib/csv"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRODUCT_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "sku", label: "SKU", required: true },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "category", label: "Category" },
  { key: "supplier_name", label: "Supplier Name" },
  { key: "unit_of_measure", label: "Unit of Measure" },
  { key: "cost", label: "Cost" },
  { key: "price", label: "Price" },
  { key: "low_stock_threshold", label: "Low Stock Threshold" },
  { key: "storage_requirement", label: "Storage Requirement" },
  { key: "is_lot_tracked", label: "Lot Tracked" },
  { key: "is_serial_tracked", label: "Serial Tracked" },
  { key: "expiry_alert_days", label: "Expiry Alert Days" },
  { key: "notes", label: "Notes" },
  // UOM columns (not direct product fields, handled separately during import)
  { key: "uom_each_upc", label: "UOM Each UPC" },
  { key: "uom_inner_qty", label: "UOM Inner Qty" },
  { key: "uom_inner_upc", label: "UOM Inner UPC" },
  { key: "uom_case_qty", label: "UOM Case Qty" },
  { key: "uom_case_upc", label: "UOM Case UPC" },
  // Bin assignment columns (handled separately during import)
  { key: "primary_bin_each", label: "Primary Bin Each" },
  { key: "primary_bin_case", label: "Primary Bin Case" },
  { key: "reserve_bin", label: "Reserve Bin" },
]

// Fields that map directly to product table columns (excludes UOM/bin columns)
const PRODUCT_DB_FIELDS = PRODUCT_FIELDS.filter(
  (f) =>
    !f.key.startsWith("uom_") &&
    !f.key.startsWith("primary_bin_") &&
    f.key !== "reserve_bin"
)

const PRODUCT_TEMPLATE_ROWS = [
  {
    name: "Amoxicillin 500mg",
    sku: "AMX-500",
    manufacturer: "PharmaCorp",
    category: "Antibiotics",
    supplier_name: "MedSupply Co",
    unit_of_measure: "bottle",
    cost: "12.50",
    price: "24.99",
    low_stock_threshold: "50",
    storage_requirement: "room_temp",
    is_lot_tracked: "true",
    is_serial_tracked: "false",
    expiry_alert_days: "90",
    notes: "Keep away from moisture",
    uom_each_upc: "012345678901",
    uom_inner_qty: "3",
    uom_inner_upc: "012345678918",
    uom_case_qty: "12",
    uom_case_upc: "012345678925",
    primary_bin_each: "A-01-01",
    primary_bin_case: "B-01-01",
    reserve_bin: "R-01-01",
  },
  {
    name: "Insulin Glargine 100U/mL",
    sku: "INS-GL100",
    manufacturer: "BioGenics",
    category: "Diabetes",
    supplier_name: "ColdChain Pharma",
    unit_of_measure: "vial",
    cost: "45.00",
    price: "89.99",
    low_stock_threshold: "25",
    storage_requirement: "refrigerated",
    is_lot_tracked: "true",
    is_serial_tracked: "true",
    expiry_alert_days: "60",
    notes: "Requires cold chain logistics",
    uom_each_upc: "098765432109",
    uom_inner_qty: "",
    uom_inner_upc: "",
    uom_case_qty: "6",
    uom_case_upc: "098765432116",
    primary_bin_each: "C-02-03",
    primary_bin_case: "",
    reserve_bin: "R-02-01",
  },
]

const SUPPLIER_TEMPLATE_ROWS = [
  {
    name: "MedSupply Co",
    contact_name: "Jane Smith",
    email: "jane@medsupply.com",
    phone: "555-123-4567",
    address: "123 Pharma Blvd, Suite 100, New York, NY 10001",
    notes: "Primary pharmaceutical supplier",
  },
]

const CUSTOMER_TEMPLATE_ROWS = [
  {
    name: "City General Hospital",
    contact_name: "Dr. Robert Chen",
    email: "procurement@citygeneral.org",
    phone: "555-987-6543",
    address: "456 Hospital Dr, Chicago, IL 60601",
    license_type: "DEA",
    license_number: "AB1234567",
    notes: "Large volume buyer, net-30 terms",
  },
]

const STORAGE_OPTIONS = [
  { value: "all", label: "All Storage Types" },
  { value: "room_temp", label: "Room Temperature" },
  { value: "refrigerated", label: "Refrigerated" },
  { value: "frozen", label: "Frozen" },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function downloadTemplate(
  data: Record<string, string>[],
  filename: string
) {
  const csv = Papa.unparse(data)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function similarity(a: string, b: string): number {
  const la = a.toLowerCase().replace(/[_\s-]/g, "")
  const lb = b.toLowerCase().replace(/[_\s-]/g, "")
  if (la === lb) return 1
  if (la.includes(lb) || lb.includes(la)) return 0.7
  // simple overlap score
  let matches = 0
  for (let i = 0; i < Math.min(la.length, lb.length); i++) {
    if (la[i] === lb[i]) matches++
  }
  return matches / Math.max(la.length, lb.length)
}

function autoMapColumns(
  csvColumns: string[],
  targetFields: { key: string; label: string }[]
): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const col of csvColumns) {
    let bestKey = ""
    let bestScore = 0
    for (const field of targetFields) {
      const s1 = similarity(col, field.key)
      const s2 = similarity(col, field.label)
      const score = Math.max(s1, s2)
      if (score > bestScore) {
        bestScore = score
        bestKey = field.key
      }
    }
    mapping[col] = bestScore >= 0.5 ? bestKey : ""
  }
  return mapping
}

type ParsedRow = Record<string, string>
type RowError = { row: number; message: string }

function validateRows(
  rows: ParsedRow[],
  mapping: Record<string, string>
): { validRows: ParsedRow[]; errorRows: RowError[] } {
  const validRows: ParsedRow[] = []
  const errorRows: RowError[] = []

  const nameCol = Object.entries(mapping).find(([, v]) => v === "name")?.[0]
  const skuCol = Object.entries(mapping).find(([, v]) => v === "sku")?.[0]

  rows.forEach((row, i) => {
    const errors: string[] = []
    if (!nameCol || !row[nameCol]?.trim()) errors.push("Missing required field: name")
    if (!skuCol || !row[skuCol]?.trim()) errors.push("Missing required field: sku")
    if (errors.length > 0) {
      errorRows.push({ row: i + 1, message: errors.join("; ") })
    } else {
      validRows.push(row)
    }
  })

  return { validRows, errorRows }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportExportPage() {
  const { tenantId } = useAuth()
  const supabase = createClient()

  // --- Import state ---
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [csvColumns, setCsvColumns] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [validRows, setValidRows] = useState<ParsedRow[]>([])
  const [errorRows, setErrorRows] = useState<RowError[]>([])
  const [updateExisting, setUpdateExisting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    updated: number
    errors: number
  } | null>(null)

  // --- Export state ---
  const [categories, setCategories] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [exportCategory, setExportCategory] = useState("all")
  const [exportStorage, setExportStorage] = useState("all")
  const [exportSupplier, setExportSupplier] = useState("all")
  const [exportArchived, setExportArchived] = useState(false)
  const [includeUOM, setIncludeUOM] = useState(false)
  const [exportCount, setExportCount] = useState(0)
  const [exporting, setExporting] = useState(false)

  // Load filter options
  useEffect(() => {
    if (!tenantId) return
    async function loadFilters() {
      const { data: prods } = await supabase
        .from("products")
        .select("category")
        .eq("tenant_id", tenantId!)
      const cats = Array.from(
        new Set((prods ?? []).map((p) => p.category).filter(Boolean))
      ) as string[]
      setCategories(cats.sort())

      const { data: sups } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name")
      setSuppliers(sups ?? [])
    }
    loadFilters()
  }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute export count when filters change
  useEffect(() => {
    if (!tenantId) return
    async function countExport() {
      let query = supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!)
      if (exportCategory !== "all") query = query.eq("category", exportCategory)
      if (exportStorage !== "all")
        query = query.eq("storage_requirement", exportStorage)
      if (exportSupplier !== "all")
        query = query.eq("supplier_id", exportSupplier)
      if (!exportArchived) query = query.eq("is_active", true)
      const { count } = await query
      setExportCount(count ?? 0)
    }
    countExport()
  }, [tenantId, exportCategory, exportStorage, exportSupplier, exportArchived]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- File handling ---
  const handleFile = useCallback(
    (file: File) => {
      setCsvFile(file)
      setImportResult(null)
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          const data = results.data as ParsedRow[]
          const cols = results.meta.fields ?? []
          setParsedData(data)
          setCsvColumns(cols)
          const mapping = autoMapColumns(cols, PRODUCT_FIELDS)
          setColumnMapping(mapping)
          const { validRows: vr, errorRows: er } = validateRows(data, mapping)
          setValidRows(vr)
          setErrorRows(er)
          toast.success(`Parsed ${formatNumber(data.length)} rows from ${file.name}`)
        },
        error(err) {
          toast.error(`Failed to parse CSV: ${err.message}`)
        },
      })
    },
    []
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file && file.name.endsWith(".csv")) handleFile(file)
      else toast.error("Please upload a .csv file")
    },
    [handleFile]
  )

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  // Re-validate when mapping changes
  const updateMapping = useCallback(
    (csvCol: string, targetField: string) => {
      const newMapping = { ...columnMapping, [csvCol]: targetField }
      setColumnMapping(newMapping)
      const { validRows: vr, errorRows: er } = validateRows(parsedData, newMapping)
      setValidRows(vr)
      setErrorRows(er)
    },
    [columnMapping, parsedData]
  )

  // --- UOM & Bin helper ---
  const processUomAndBins = useCallback(
    async (
      productId: string,
      row: ParsedRow,
      reverseMap: Record<string, string>
    ) => {
      // Helper to get a CSV value from a mapped field
      const getVal = (fieldKey: string) => {
        const csvCol = reverseMap[fieldKey]
        return csvCol ? row[csvCol]?.trim() || "" : ""
      }

      // --- UOM Conversions ---
      const uomEachUpc = getVal("uom_each_upc")
      const uomInnerQty = getVal("uom_inner_qty")
      const uomInnerUpc = getVal("uom_inner_upc")
      const uomCaseQty = getVal("uom_case_qty")
      const uomCaseUpc = getVal("uom_case_upc")

      if (uomEachUpc) {
        await supabase.from("product_uom_conversions").upsert(
          {
            tenant_id: tenantId!,
            product_id: productId,
            uom_name: "each",
            conversion_factor: 1,
            barcode: uomEachUpc,
            is_default: true,
            is_orderable: true,
            is_sellable: true,
          },
          { onConflict: "product_id,uom_name" }
        )
      }

      if (uomInnerQty) {
        const factor = parseFloat(uomInnerQty)
        if (factor > 0) {
          await supabase.from("product_uom_conversions").upsert(
            {
              tenant_id: tenantId!,
              product_id: productId,
              uom_name: "inner",
              conversion_factor: factor,
              barcode: uomInnerUpc || null,
              is_default: false,
              is_orderable: true,
              is_sellable: true,
            },
            { onConflict: "product_id,uom_name" }
          )
        }
      }

      if (uomCaseQty) {
        const factor = parseFloat(uomCaseQty)
        if (factor > 0) {
          await supabase.from("product_uom_conversions").upsert(
            {
              tenant_id: tenantId!,
              product_id: productId,
              uom_name: "case",
              conversion_factor: factor,
              barcode: uomCaseUpc || null,
              is_default: false,
              is_orderable: true,
              is_sellable: true,
            },
            { onConflict: "product_id,uom_name" }
          )
        }
      }

      // --- Bin Assignments ---
      const primaryBinEach = getVal("primary_bin_each")
      const primaryBinCase = getVal("primary_bin_case")
      const reserveBin = getVal("reserve_bin")

      const lookupBin = async (binCode: string) => {
        const { data } = await supabase
          .from("bins")
          .select("id")
          .eq("tenant_id", tenantId!)
          .eq("bin_code", binCode)
          .limit(1)
          .single()
        return data?.id ?? null
      }

      if (primaryBinEach) {
        const binId = await lookupBin(primaryBinEach)
        if (binId) {
          await supabase.from("product_bin_assignments").upsert(
            {
              tenant_id: tenantId!,
              product_id: productId,
              bin_id: binId,
              bin_role: "primary",
              unit_of_measure: "each",
              is_active: true,
            },
            { onConflict: "product_id,bin_id,bin_role" }
          )
        }
      }

      if (primaryBinCase) {
        const binId = await lookupBin(primaryBinCase)
        if (binId) {
          await supabase.from("product_bin_assignments").upsert(
            {
              tenant_id: tenantId!,
              product_id: productId,
              bin_id: binId,
              bin_role: "primary",
              unit_of_measure: "case",
              is_active: true,
            },
            { onConflict: "product_id,bin_id,bin_role" }
          )
        }
      }

      if (reserveBin) {
        const binId = await lookupBin(reserveBin)
        if (binId) {
          await supabase.from("product_bin_assignments").upsert(
            {
              tenant_id: tenantId!,
              product_id: productId,
              bin_id: binId,
              bin_role: "secondary",
              unit_of_measure: "each",
              is_active: true,
            },
            { onConflict: "product_id,bin_id,bin_role" }
          )
        }
      }
    },
    [tenantId, supabase]
  )

  // --- Import ---
  const handleImport = useCallback(async () => {
    if (!tenantId) return
    setImporting(true)
    setImportProgress(0)
    setImportResult(null)

    let imported = 0
    let skipped = 0
    let updated = 0
    let errors = 0

    try {
      // Build reverse mapping: product field -> csv column
      const reverseMap: Record<string, string> = {}
      for (const [csvCol, field] of Object.entries(columnMapping)) {
        if (field) reverseMap[field] = csvCol
      }

      // Resolve supplier names to IDs
      const supplierNameCol = reverseMap["supplier_name"]
      const supplierCache: Record<string, string> = {}
      if (supplierNameCol) {
        const uniqueNames = Array.from(
          new Set(validRows.map((r) => r[supplierNameCol]?.trim()).filter(Boolean))
        )
        for (const sName of uniqueNames) {
          const { data: existing } = await supabase
            .from("suppliers")
            .select("id")
            .eq("tenant_id", tenantId)
            .ilike("name", sName)
            .limit(1)
            .single()
          if (existing) {
            supplierCache[sName.toLowerCase()] = existing.id
          } else {
            const { data: created } = await supabase
              .from("suppliers")
              .insert({ tenant_id: tenantId, name: sName })
              .select("id")
              .single()
            if (created) supplierCache[sName.toLowerCase()] = created.id
          }
        }
      }

      // Process in batches of 50
      const batchSize = 50
      for (let i = 0; i < validRows.length; i += batchSize) {
        const batch = validRows.slice(i, i + batchSize)
        const records = batch.map((row) => {
          const record: Record<string, unknown> = { tenant_id: tenantId }
          for (const field of PRODUCT_DB_FIELDS) {
            const csvCol = reverseMap[field.key]
            if (!csvCol || field.key === "supplier_name") continue
            let val: unknown = row[csvCol]?.trim() ?? null
            if (val === "") val = null
            // Type coercion
            if (field.key === "cost" || field.key === "price") {
              val = val ? parseFloat(val as string) : null
            } else if (
              field.key === "low_stock_threshold" ||
              field.key === "expiry_alert_days"
            ) {
              val = val ? parseInt(val as string, 10) : null
            } else if (
              field.key === "is_lot_tracked" ||
              field.key === "is_serial_tracked"
            ) {
              val =
                val === null
                  ? false
                  : (val as string).toLowerCase() === "true" ||
                    val === "1" ||
                    (val as string).toLowerCase() === "yes"
            }
            record[field.key] = val
          }
          // Supplier resolution
          if (supplierNameCol) {
            const sName = row[supplierNameCol]?.trim()
            if (sName) {
              record["supplier_id"] =
                supplierCache[sName.toLowerCase()] ?? null
            }
          }
          return record
        })

        if (updateExisting) {
          // Upsert: need to handle one-by-one for proper counting
          for (let ri = 0; ri < records.length; ri++) {
            const rec = records[ri]
            const originalRow = batch[ri]
            const { data: existing } = await supabase
              .from("products")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("sku", rec.sku as string)
              .limit(1)
              .single()
            if (existing) {
              const { error } = await supabase
                .from("products")
                .update(rec)
                .eq("id", existing.id)
              if (error) errors++
              else {
                updated++
                await processUomAndBins(existing.id, originalRow, reverseMap)
              }
            } else {
              const { error, data: newProd } = await supabase
                .from("products")
                .insert(rec)
                .select("id")
                .single()
              if (error) errors++
              else {
                imported++
                if (newProd) await processUomAndBins(newProd.id, originalRow, reverseMap)
              }
            }
          }
        } else {
          // Check for duplicates before inserting
          const skus = records.map((r) => r.sku as string)
          const { data: existingProducts } = await supabase
            .from("products")
            .select("sku")
            .eq("tenant_id", tenantId)
            .in("sku", skus)

          const existingSkus = new Set(
            (existingProducts ?? []).map((p) => p.sku)
          )
          // Track which original rows map to new records
          const newRecordsWithRows: { rec: Record<string, unknown>; row: ParsedRow }[] = []
          for (let ri = 0; ri < records.length; ri++) {
            if (existingSkus.has(records[ri].sku as string)) {
              skipped++
            } else {
              newRecordsWithRows.push({ rec: records[ri], row: batch[ri] })
            }
          }

          if (newRecordsWithRows.length > 0) {
            const newRecords = newRecordsWithRows.map((r) => r.rec)
            const { error, data } = await supabase
              .from("products")
              .insert(newRecords)
              .select("id, sku")
            if (error) {
              errors += newRecords.length
            } else {
              imported += data?.length ?? 0
              // Process UOM and bin assignments for each inserted product
              if (data) {
                for (const insertedProd of data) {
                  const matchingEntry = newRecordsWithRows.find(
                    (r) => r.rec.sku === insertedProd.sku
                  )
                  if (matchingEntry) {
                    await processUomAndBins(insertedProd.id, matchingEntry.row, reverseMap)
                  }
                }
              }
            }
          }
        }

        setImportProgress(
          Math.min(100, Math.round(((i + batch.length) / validRows.length) * 100))
        )
      }

      setImportResult({ imported, skipped, updated, errors })
      if (imported > 0 || updated > 0) {
        toast.success(
          `Import complete: ${imported} imported${updated > 0 ? `, ${updated} updated` : ""}${skipped > 0 ? `, ${skipped} skipped` : ""}${errors > 0 ? `, ${errors} errors` : ""}`
        )
      } else if (skipped > 0) {
        toast.info(`All ${skipped} rows skipped (duplicate SKUs)`)
      } else {
        toast.error(`Import failed with ${errors} errors`)
      }
    } catch (err) {
      toast.error("Import failed: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setImporting(false)
    }
  }, [tenantId, validRows, columnMapping, updateExisting, supabase, processUomAndBins])

  // --- Export ---
  const handleExport = useCallback(
    async (applyFilters: boolean) => {
      if (!tenantId) return
      setExporting(true)
      try {
        let query = supabase
          .from("products")
          .select("*, suppliers(name)")
          .eq("tenant_id", tenantId)

        if (applyFilters) {
          if (exportCategory !== "all") query = query.eq("category", exportCategory)
          if (exportStorage !== "all")
            query = query.eq("storage_requirement", exportStorage)
          if (exportSupplier !== "all")
            query = query.eq("supplier_id", exportSupplier)
          if (!exportArchived) query = query.eq("is_active", true)
        }

        const { data: products, error } = await query.order("name")
        if (error) throw error
        if (!products || products.length === 0) {
          toast.info("No products to export")
          setExporting(false)
          return
        }

        const uomData: Record<string, Record<string, unknown>> = {}
        if (includeUOM) {
          const productIds = products.map((p) => p.id)
          const { data: conversions } = await supabase
            .from("product_uom_conversions")
            .select("*")
            .in("product_id", productIds)
          if (conversions) {
            for (const c of conversions) {
              if (!uomData[c.product_id]) uomData[c.product_id] = {}
              uomData[c.product_id][`uom_${c.uom_type}`] = c.conversion_factor
            }
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exportData = products.map((p: any) => {
          const row: Record<string, unknown> = {
            name: p.name,
            sku: p.sku,
            manufacturer: p.manufacturer,
            category: p.category,
            supplier_name: p.suppliers?.name ?? "",
            unit_of_measure: p.unit_of_measure,
            cost: p.cost,
            price: p.price,
            low_stock_threshold: p.low_stock_threshold,
            storage_requirement: p.storage_requirement,
            is_lot_tracked: p.is_lot_tracked,
            is_serial_tracked: p.is_serial_tracked,
            expiry_alert_days: p.expiry_alert_days,
            notes: p.notes,
          }
          if (includeUOM && uomData[p.id]) {
            row.uom_each = uomData[p.id].uom_each ?? ""
            row.uom_inner = uomData[p.id].uom_inner ?? ""
            row.uom_case = uomData[p.id].uom_case ?? ""
          }
          return row
        })

        exportToCSV(
          exportData,
          applyFilters ? "products_filtered" : "products_all"
        )
        toast.success(`Exported ${formatNumber(exportData.length)} products`)
      } catch (err) {
        toast.error("Export failed: " + (err instanceof Error ? err.message : "Unknown error"))
      } finally {
        setExporting(false)
      }
    },
    [
      tenantId,
      exportCategory,
      exportStorage,
      exportSupplier,
      exportArchived,
      includeUOM,
      supabase,
    ]
  )

  // --- Reset import ---
  const resetImport = () => {
    setCsvFile(null)
    setParsedData([])
    setCsvColumns([])
    setColumnMapping({})
    setValidRows([])
    setErrorRows([])
    setImportResult(null)
    setImportProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import / Export"
        description="Import products from CSV or export your inventory data"
      />

      <Tabs defaultValue="import" className="space-y-6">
        <TabsList>
          <TabsTrigger value="import">Import Products</TabsTrigger>
          <TabsTrigger value="export">Export Products</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* IMPORT TAB                                                       */}
        {/* ================================================================ */}
        <TabsContent value="import" className="space-y-6">
          {/* File upload */}
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV</CardTitle>
              <CardDescription>
                Upload a CSV file with product data. Download a template from the
                Templates tab to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                }`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="mb-1 text-sm font-medium">
                  Drag and drop a CSV file here
                </p>
                <p className="mb-4 text-xs text-muted-foreground">
                  or click to browse
                </p>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>
              {csvFile && (
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{csvFile.name}</span>
                    <Badge variant="secondary">
                      {formatNumber(parsedData.length)} rows
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={resetImport}>
                    Clear
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview & Mapping */}
          {csvColumns.length > 0 && (
            <>
              {/* Stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  title="Total Rows"
                  value={formatNumber(parsedData.length)}
                  icon={FileSpreadsheet}
                />
                <StatCard
                  title="Valid Rows"
                  value={formatNumber(validRows.length)}
                  icon={CheckCircle2}
                />
                <StatCard
                  title="Error Rows"
                  value={formatNumber(errorRows.length)}
                  icon={XCircle}
                />
              </div>

              {/* Column mapping */}
              <Card>
                <CardHeader>
                  <CardTitle>Column Mapping</CardTitle>
                  <CardDescription>
                    Map each CSV column to a product field. Required fields are
                    marked with *.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {csvColumns.map((col) => (
                      <div key={col} className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          {col}
                        </Label>
                        <Select
                          value={columnMapping[col] || "unmapped"}
                          onValueChange={(val) =>
                            updateMapping(col, val === "unmapped" ? "" : val)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unmapped">-- Skip --</SelectItem>
                            {PRODUCT_FIELDS.map((f) => (
                              <SelectItem key={f.key} value={f.key}>
                                {f.label}
                                {f.required ? " *" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Preview table */}
              <Card>
                <CardHeader>
                  <CardTitle>Preview (first 10 rows)</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        {csvColumns.map((col) => (
                          <TableHead key={col} className="min-w-[120px]">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.slice(0, 10).map((row, i) => {
                        const hasError = errorRows.some((e) => e.row === i + 1)
                        return (
                          <TableRow
                            key={i}
                            className={hasError ? "bg-destructive/10" : ""}
                          >
                            <TableCell className="font-mono text-xs">
                              {i + 1}
                            </TableCell>
                            {csvColumns.map((col) => (
                              <TableCell key={col} className="text-sm">
                                {row[col] ?? ""}
                              </TableCell>
                            ))}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Errors */}
              {errorRows.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Validation Errors ({errorRows.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {errorRows.map((e, i) => (
                        <p key={i} className="text-sm">
                          <span className="font-mono font-medium">
                            Row {e.row}:
                          </span>{" "}
                          {e.message}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Import controls */}
              <Card>
                <CardContent className="flex flex-wrap items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      className="rounded border-input"
                    />
                    Update existing products (match by SKU)
                  </label>

                  <Separator orientation="vertical" className="h-6" />

                  <Button
                    onClick={handleImport}
                    disabled={importing || validRows.length === 0}
                  >
                    {importing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Import {formatNumber(validRows.length)} Products
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Progress */}
              {importing && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Importing products...</span>
                        <span>{importProgress}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${importProgress}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Results */}
              {importResult && (
                <Card>
                  <CardHeader>
                    <CardTitle>Import Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <div>
                          <p className="text-lg font-bold">
                            {formatNumber(importResult.imported)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Imported
                          </p>
                        </div>
                      </div>
                      {importResult.updated > 0 && (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-blue-500" />
                          <div>
                            <p className="text-lg font-bold">
                              {formatNumber(importResult.updated)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Updated
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        <div>
                          <p className="text-lg font-bold">
                            {formatNumber(importResult.skipped)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Skipped (duplicate)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-destructive" />
                        <div>
                          <p className="text-lg font-bold">
                            {formatNumber(importResult.errors)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Errors
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ================================================================ */}
        {/* EXPORT TAB                                                       */}
        {/* ================================================================ */}
        <TabsContent value="export" className="space-y-6">
          {/* Export All */}
          <Card>
            <CardHeader>
              <CardTitle>Export All Products</CardTitle>
              <CardDescription>
                Download a CSV file containing all active products in your
                inventory.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4">
                <Button onClick={() => handleExport(false)} disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Export All Products
                </Button>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeUOM}
                    onChange={(e) => setIncludeUOM(e.target.checked)}
                    className="rounded border-input"
                  />
                  Include UOM conversions
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Export with Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Export with Filters</CardTitle>
              <CardDescription>
                Apply filters to export a specific subset of products.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={exportCategory}
                    onValueChange={setExportCategory}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Storage Requirement</Label>
                  <Select
                    value={exportStorage}
                    onValueChange={setExportStorage}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORAGE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Supplier</Label>
                  <Select
                    value={exportSupplier}
                    onValueChange={setExportSupplier}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Suppliers</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={exportArchived}
                      onChange={(e) => setExportArchived(e.target.checked)}
                      className="rounded border-input"
                    />
                    Include archived
                  </label>
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap items-center gap-4">
                <Button
                  onClick={() => handleExport(true)}
                  disabled={exporting || exportCount === 0}
                >
                  {exporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Export Selected
                </Button>
                <Badge variant="secondary">
                  {formatNumber(exportCount)} products match filters
                </Badge>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeUOM}
                    onChange={(e) => setIncludeUOM(e.target.checked)}
                    className="rounded border-input"
                  />
                  Include UOM conversions
                </label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* TEMPLATES TAB                                                    */}
        {/* ================================================================ */}
        <TabsContent value="templates" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Product template */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileDown className="h-5 w-5" />
                  Product Import Template
                </CardTitle>
                <CardDescription>
                  CSV template for bulk-importing products into your inventory.
                  Includes 2 example rows.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {Object.keys(PRODUCT_TEMPLATE_ROWS[0]).length} columns
                  </Badge>
                  <Badge variant="outline">2 example rows</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Columns: name, sku, manufacturer, category, supplier_name,
                  unit_of_measure, cost, price, low_stock_threshold,
                  storage_requirement, is_lot_tracked, is_serial_tracked,
                  expiry_alert_days, notes, uom_each_upc, uom_inner_qty,
                  uom_inner_upc, uom_case_qty, uom_case_upc,
                  primary_bin_each, primary_bin_case, reserve_bin
                </p>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() =>
                    downloadTemplate(
                      PRODUCT_TEMPLATE_ROWS,
                      "product_import_template"
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                </Button>
              </CardContent>
            </Card>

            {/* Supplier template */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileDown className="h-5 w-5" />
                  Supplier Import Template
                </CardTitle>
                <CardDescription>
                  CSV template for importing supplier records. Includes 1 example
                  row.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {Object.keys(SUPPLIER_TEMPLATE_ROWS[0]).length} columns
                  </Badge>
                  <Badge variant="outline">1 example row</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Columns: name, contact_name, email, phone, address, notes
                </p>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() =>
                    downloadTemplate(
                      SUPPLIER_TEMPLATE_ROWS,
                      "supplier_import_template"
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                </Button>
              </CardContent>
            </Card>

            {/* Customer template */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileDown className="h-5 w-5" />
                  Customer Import Template
                </CardTitle>
                <CardDescription>
                  CSV template for importing customer records. Includes 1 example
                  row.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {Object.keys(CUSTOMER_TEMPLATE_ROWS[0]).length} columns
                  </Badge>
                  <Badge variant="outline">1 example row</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Columns: name, contact_name, email, phone, address,
                  license_type, license_number, notes
                </p>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() =>
                    downloadTemplate(
                      CUSTOMER_TEMPLATE_ROWS,
                      "customer_import_template"
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
