"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Ruler,
  Boxes,
  Package,
  Plus,
  Pencil,
  Trash2,
  Zap,
  Check,
  X,
  ArrowRight,
  Download,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { formatNumber } from "@/lib/format"
import { exportToCSV } from "@/lib/csv"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  sku: string
  uom: string
}

interface ProductUomConversion {
  id: string
  tenant_id: string
  product_id: string
  uom_name: string
  conversion_factor: number
  barcode: string | null
  is_default: boolean
  is_orderable: boolean
  is_sellable: boolean
  weight: number | null
  dimensions: string | null
}

interface ProductPart {
  id: string
  tenant_id: string
  product_id: string
  part_number: number
  total_parts: number
  part_description: string
  part_sku: string | null
  barcode: string | null
  weight: number | null
  dimensions: string | null
  notes: string | null
}

type UomFormData = Omit<ProductUomConversion, "id" | "tenant_id" | "product_id">
type PartFormData = Omit<ProductPart, "id" | "tenant_id" | "product_id">

const COMMON_UOMS = ["each", "inner", "case", "box", "pallet", "lb", "kg"]

const QUICK_SETUPS = [
  { label: "Each + Case", uoms: [{ name: "each", factor: 1 }, { name: "case", factor: 12 }] },
  { label: "Each + Inner + Case", uoms: [{ name: "each", factor: 1 }, { name: "inner", factor: 3 }, { name: "case", factor: 12 }] },
  { label: "Weight-based", uoms: [{ name: "lb", factor: 1 }, { name: "kg", factor: 2.205 }] },
]

const defaultUomForm: UomFormData = {
  uom_name: "",
  conversion_factor: 1,
  barcode: null,
  is_default: false,
  is_orderable: true,
  is_sellable: true,
  weight: null,
  dimensions: null,
}

const defaultPartForm: PartFormData = {
  part_number: 1,
  total_parts: 1,
  part_description: "",
  part_sku: null,
  barcode: null,
  weight: null,
  dimensions: null,
  notes: null,
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function UomPage() {
  const supabase = createClient()
  const { tenantId } = useAuth()

  // Shared state
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  // UOM tab state
  const [uomProductId, setUomProductId] = useState<string>("")
  const [conversions, setConversions] = useState<ProductUomConversion[]>([])
  const [uomDialogOpen, setUomDialogOpen] = useState(false)
  const [uomForm, setUomForm] = useState<UomFormData>(defaultUomForm)
  const [editingUomId, setEditingUomId] = useState<string | null>(null)
  const [customUom, setCustomUom] = useState(false)
  const [quickSetupOpen, setQuickSetupOpen] = useState(false)
  const [quickSetupChoice, setQuickSetupChoice] = useState<number | null>(null)
  const [quickFactors, setQuickFactors] = useState<{ name: string; factor: number }[]>([])

  // Parts tab state
  const [partsProductId, setPartsProductId] = useState<string>("")
  const [parts, setParts] = useState<ProductPart[]>([])
  const [partDialogOpen, setPartDialogOpen] = useState(false)
  const [partForm, setPartForm] = useState<PartFormData>(defaultPartForm)
  const [editingPartId, setEditingPartId] = useState<string | null>(null)

  // Summary stats
  const [stats, setStats] = useState({
    productsWithMultipleUoms: 0,
    totalUomDefs: 0,
    multiPartProducts: 0,
    totalParts: 0,
  })

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadProducts = useCallback(async () => {
    if (!tenantId) return
    const { data } = await supabase
      .from("products")
      .select("id, name, sku, uom:unit_of_measure")
      .eq("tenant_id", tenantId)
      .order("name")
    if (data) setProducts(data)
  }, [tenantId, supabase])

  const loadStats = useCallback(async () => {
    if (!tenantId) return

    const { data: uomData } = await supabase
      .from("product_uom_conversions")
      .select("id, product_id")
      .eq("tenant_id", tenantId)

    const { data: partsData } = await supabase
      .from("product_parts")
      .select("id, product_id")
      .eq("tenant_id", tenantId)

    const partsProductIds = new Set((partsData || []).map((p) => p.product_id))

    // Products with multiple UOMs = those with 2+ conversion rows
    const uomCounts: Record<string, number> = {}
    ;(uomData || []).forEach((u) => {
      uomCounts[u.product_id] = (uomCounts[u.product_id] || 0) + 1
    })
    const multiUomCount = Object.values(uomCounts).filter((c) => c >= 2).length

    setStats({
      productsWithMultipleUoms: multiUomCount,
      totalUomDefs: uomData?.length || 0,
      multiPartProducts: partsProductIds.size,
      totalParts: partsData?.length || 0,
    })
  }, [tenantId, supabase])

  const loadConversions = useCallback(async (productId: string) => {
    if (!tenantId || !productId) { setConversions([]); return }
    const { data } = await supabase
      .from("product_uom_conversions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("product_id", productId)
      .order("conversion_factor")
    setConversions(data || [])
  }, [tenantId, supabase])

  const loadParts = useCallback(async (productId: string) => {
    if (!tenantId || !productId) { setParts([]); return }
    const { data } = await supabase
      .from("product_parts")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("product_id", productId)
      .order("part_number")
    setParts(data || [])
  }, [tenantId, supabase])

  useEffect(() => {
    loadProducts().then(() => setLoading(false))
    loadStats()
  }, [loadProducts, loadStats])

  useEffect(() => {
    if (uomProductId) loadConversions(uomProductId)
  }, [uomProductId, loadConversions])

  useEffect(() => {
    if (partsProductId) loadParts(partsProductId)
  }, [partsProductId, loadParts])

  // ─── UOM CRUD ────────────────────────────────────────────────────────────

  const selectedUomProduct = products.find((p) => p.id === uomProductId)

  function openAddUom() {
    setEditingUomId(null)
    setUomForm(defaultUomForm)
    setCustomUom(false)
    setUomDialogOpen(true)
  }

  function openEditUom(conv: ProductUomConversion) {
    setEditingUomId(conv.id)
    setUomForm({
      uom_name: conv.uom_name,
      conversion_factor: conv.conversion_factor,
      barcode: conv.barcode,
      is_default: conv.is_default,
      is_orderable: conv.is_orderable,
      is_sellable: conv.is_sellable,
      weight: conv.weight,
      dimensions: conv.dimensions,
    })
    setCustomUom(!COMMON_UOMS.includes(conv.uom_name))
    setUomDialogOpen(true)
  }

  async function saveUom() {
    if (!tenantId || !uomProductId) return
    if (!uomForm.uom_name) { toast.error("UOM name is required"); return }
    if (uomForm.conversion_factor <= 0) { toast.error("Conversion factor must be positive"); return }

    const payload = {
      tenant_id: tenantId,
      product_id: uomProductId,
      ...uomForm,
    }

    if (editingUomId) {
      const { error } = await supabase
        .from("product_uom_conversions")
        .update(payload)
        .eq("id", editingUomId)
      if (error) { toast.error(error.message); return }
      toast.success("UOM conversion updated")
    } else {
      const { error } = await supabase
        .from("product_uom_conversions")
        .insert(payload)
      if (error) { toast.error(error.message); return }
      toast.success("UOM conversion added")
    }

    setUomDialogOpen(false)
    loadConversions(uomProductId)
    loadStats()
  }

  async function deleteUom(id: string) {
    const { error } = await supabase
      .from("product_uom_conversions")
      .delete()
      .eq("id", id)
    if (error) { toast.error(error.message); return }
    toast.success("UOM conversion deleted")
    loadConversions(uomProductId)
    loadStats()
  }

  // Quick Setup
  function openQuickSetup() {
    setQuickSetupChoice(null)
    setQuickFactors([])
    setQuickSetupOpen(true)
  }

  function selectQuickSetup(idx: number) {
    setQuickSetupChoice(idx)
    setQuickFactors(QUICK_SETUPS[idx].uoms.map((u) => ({ ...u })))
  }

  async function applyQuickSetup() {
    if (!tenantId || !uomProductId || quickSetupChoice === null) return
    const rows = quickFactors.map((u) => ({
      tenant_id: tenantId,
      product_id: uomProductId,
      uom_name: u.name,
      conversion_factor: u.factor,
      barcode: null,
      is_default: u.factor === 1,
      is_orderable: true,
      is_sellable: true,
      weight: null,
      dimensions: null,
    }))

    const { error } = await supabase.from("product_uom_conversions").insert(rows)
    if (error) { toast.error(error.message); return }
    toast.success(`Quick setup applied: ${QUICK_SETUPS[quickSetupChoice!].label}`)
    setQuickSetupOpen(false)
    loadConversions(uomProductId)
    loadStats()
  }

  // ─── Parts CRUD ──────────────────────────────────────────────────────────

  const selectedPartsProduct = products.find((p) => p.id === partsProductId)

  function openAddPart() {
    const nextNum = parts.length > 0 ? Math.max(...parts.map((p) => p.part_number)) + 1 : 1
    const totalParts = parts.length > 0 ? parts[0].total_parts : 1
    setEditingPartId(null)
    setPartForm({
      ...defaultPartForm,
      part_number: nextNum,
      total_parts: Math.max(totalParts, nextNum),
      part_sku: selectedPartsProduct ? `${selectedPartsProduct.sku}-P${nextNum}` : null,
    })
    setPartDialogOpen(true)
  }

  function openEditPart(part: ProductPart) {
    setEditingPartId(part.id)
    setPartForm({
      part_number: part.part_number,
      total_parts: part.total_parts,
      part_description: part.part_description,
      part_sku: part.part_sku,
      barcode: part.barcode,
      weight: part.weight,
      dimensions: part.dimensions,
      notes: part.notes,
    })
    setPartDialogOpen(true)
  }

  async function savePart() {
    if (!tenantId || !partsProductId) return
    if (!partForm.part_description) { toast.error("Part description is required"); return }

    const payload = {
      tenant_id: tenantId,
      product_id: partsProductId,
      ...partForm,
    }

    if (editingPartId) {
      const { error } = await supabase
        .from("product_parts")
        .update(payload)
        .eq("id", editingPartId)
      if (error) { toast.error(error.message); return }
      toast.success("Part updated")
    } else {
      const { error } = await supabase
        .from("product_parts")
        .insert(payload)
      if (error) { toast.error(error.message); return }
      toast.success("Part added")
    }

    // Update total_parts on all parts for this product if changed
    if (partForm.total_parts) {
      await supabase
        .from("product_parts")
        .update({ total_parts: partForm.total_parts })
        .eq("tenant_id", tenantId)
        .eq("product_id", partsProductId)
    }

    setPartDialogOpen(false)
    loadParts(partsProductId)
    loadStats()
  }

  async function deletePart(id: string) {
    const { error } = await supabase.from("product_parts").delete().eq("id", id)
    if (error) { toast.error(error.message); return }
    toast.success("Part deleted")
    loadParts(partsProductId)
    loadStats()
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Units & Parts"
        description="Manage UOM conversions and multi-part product definitions"
      />

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Products with Multiple UOMs"
          value={formatNumber(stats.productsWithMultipleUoms)}
          icon={Ruler}
        />
        <StatCard
          title="Total UOM Definitions"
          value={formatNumber(stats.totalUomDefs)}
          icon={ArrowRight}
        />
        <StatCard
          title="Multi-Part Products"
          value={formatNumber(stats.multiPartProducts)}
          icon={Boxes}
        />
        <StatCard
          title="Total Parts Tracked"
          value={formatNumber(stats.totalParts)}
          icon={Package}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="uom" className="space-y-4">
        <TabsList>
          <TabsTrigger value="uom">UOM Conversions</TabsTrigger>
          <TabsTrigger value="parts">Multi-Part Products</TabsTrigger>
        </TabsList>

        {/* ─── UOM Conversions Tab ──────────────────────────────────────── */}
        <TabsContent value="uom" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Product</CardTitle>
              <CardDescription>Choose a product to manage its unit of measure conversions</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={uomProductId} onValueChange={setUomProductId}>
                <SelectTrigger className="w-full md:w-96">
                  <SelectValue placeholder="Select a product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {!uomProductId && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Ruler className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No product selected</p>
                <p className="text-sm mt-1">
                  {stats.productsWithMultipleUoms > 0
                    ? `${stats.productsWithMultipleUoms} product(s) have multiple UOMs, ${products.length - stats.productsWithMultipleUoms} have only 1 UOM`
                    : "Select a product above to configure UOM conversions"}
                </p>
              </CardContent>
            </Card>
          )}

          {uomProductId && selectedUomProduct && (
            <>
              {/* Base UOM */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Base UOM for {selectedUomProduct.name}</p>
                      <p className="text-lg font-semibold capitalize">{selectedUomProduct.uom || "each"}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={openQuickSetup}>
                        <Zap className="h-4 w-4 mr-1" />
                        Quick Setup
                      </Button>
                      <Button size="sm" onClick={openAddUom}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add UOM
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Conversion Chain Visual */}
              {conversions.length >= 2 && (
                <Card>
                  <CardContent className="py-4">
                    <p className="text-sm text-muted-foreground mb-2">Conversion Chain</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[...conversions]
                        .sort((a, b) => b.conversion_factor - a.conversion_factor)
                        .map((c, i, arr) => (
                          <div key={c.id} className="flex items-center gap-2">
                            <div className="rounded-lg border bg-muted/50 px-4 py-2 text-center">
                              <p className="text-lg font-bold">
                                {i === 0 ? 1 : Math.round((arr[0].conversion_factor / c.conversion_factor) * 100) / 100}
                              </p>
                              <p className="text-xs text-muted-foreground capitalize">{c.uom_name}</p>
                            </div>
                            {i < arr.length - 1 && (
                              <span className="text-muted-foreground font-medium">=</span>
                            )}
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Conversions Table */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">UOM Conversions</CardTitle>
                  {conversions.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        exportToCSV(
                          conversions.map((c) => ({
                            uom_name: c.uom_name,
                            conversion_factor: c.conversion_factor,
                            barcode: c.barcode || "",
                            is_default: c.is_default ? "Yes" : "No",
                            is_orderable: c.is_orderable ? "Yes" : "No",
                            is_sellable: c.is_sellable ? "Yes" : "No",
                            weight: c.weight ?? "",
                            dimensions: c.dimensions || "",
                          })),
                          `uom-${selectedUomProduct.sku}`
                        )
                      }
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {conversions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No UOM conversions defined. Add one or use Quick Setup.
                    </p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>UOM Name</TableHead>
                            <TableHead>Factor</TableHead>
                            <TableHead>Barcode</TableHead>
                            <TableHead>Default</TableHead>
                            <TableHead>Orderable</TableHead>
                            <TableHead>Sellable</TableHead>
                            <TableHead>Weight</TableHead>
                            <TableHead>Dimensions</TableHead>
                            <TableHead className="w-[80px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {conversions.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium capitalize">{c.uom_name}</TableCell>
                              <TableCell>{c.conversion_factor}</TableCell>
                              <TableCell className="text-muted-foreground">{c.barcode || "—"}</TableCell>
                              <TableCell>
                                {c.is_default && <Badge variant="secondary">Default</Badge>}
                              </TableCell>
                              <TableCell>
                                {c.is_orderable ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />}
                              </TableCell>
                              <TableCell>
                                {c.is_sellable ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />}
                              </TableCell>
                              <TableCell>{c.weight ?? "—"}</TableCell>
                              <TableCell className="text-muted-foreground">{c.dimensions || "—"}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditUom(c)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteUom(c.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── Multi-Part Products Tab ──────────────────────────────────── */}
        <TabsContent value="parts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Product</CardTitle>
              <CardDescription>Choose a product to manage its component parts</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={partsProductId} onValueChange={setPartsProductId}>
                <SelectTrigger className="w-full md:w-96">
                  <SelectValue placeholder="Select a product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {!partsProductId && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Boxes className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No product selected</p>
                <p className="text-sm mt-1">
                  {stats.multiPartProducts > 0
                    ? `${stats.multiPartProducts} multi-part product(s) with ${stats.totalParts} total parts`
                    : "Select a product above to manage its parts"}
                </p>
              </CardContent>
            </Card>
          )}

          {partsProductId && selectedPartsProduct && (
            <>
              {/* Summary */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{selectedPartsProduct.name}</p>
                      <p className="text-lg font-semibold">
                        {parts.length === 0
                          ? "No parts defined"
                          : `This product has ${parts.length} part${parts.length !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                    <Button size="sm" onClick={openAddPart}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Part
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Visual Parts Grid */}
              {parts.length > 0 && (
                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {parts.map((part) => (
                    <Card key={part.id} className="relative">
                      <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-start justify-between">
                          <Badge variant="outline" className="mb-2">
                            Part {part.part_number} of {part.total_parts}
                          </Badge>
                          <div className="flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditPart(part)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deletePart(part.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="font-medium text-sm">{part.part_description}</p>
                        {part.part_sku && (
                          <p className="text-xs text-muted-foreground mt-1">SKU: {part.part_sku}</p>
                        )}
                        {part.barcode && (
                          <p className="text-xs text-muted-foreground">Barcode: {part.barcode}</p>
                        )}
                        {part.weight != null && (
                          <p className="text-xs text-muted-foreground">Weight: {part.weight}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Parts Table */}
              {parts.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Parts List</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        exportToCSV(
                          parts.map((p) => ({
                            part_number: `Part ${p.part_number} of ${p.total_parts}`,
                            description: p.part_description,
                            sku: p.part_sku || "",
                            barcode: p.barcode || "",
                            weight: p.weight ?? "",
                            dimensions: p.dimensions || "",
                            notes: p.notes || "",
                          })),
                          `parts-${selectedPartsProduct.sku}`
                        )
                      }
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Part #</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Barcode</TableHead>
                            <TableHead>Weight</TableHead>
                            <TableHead>Dimensions</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead className="w-[80px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parts.map((part) => (
                            <TableRow key={part.id}>
                              <TableCell className="font-medium">
                                Part {part.part_number} of {part.total_parts}
                              </TableCell>
                              <TableCell>{part.part_description}</TableCell>
                              <TableCell className="text-muted-foreground">{part.part_sku || "—"}</TableCell>
                              <TableCell className="text-muted-foreground">{part.barcode || "—"}</TableCell>
                              <TableCell>{part.weight ?? "—"}</TableCell>
                              <TableCell className="text-muted-foreground">{part.dimensions || "—"}</TableCell>
                              <TableCell className="text-muted-foreground max-w-[200px] truncate">{part.notes || "—"}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPart(part)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deletePart(part.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── UOM Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={uomDialogOpen} onOpenChange={setUomDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUomId ? "Edit UOM Conversion" : "Add UOM Conversion"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>UOM Name</Label>
              {customUom ? (
                <div className="flex gap-2">
                  <Input
                    value={uomForm.uom_name}
                    onChange={(e) => setUomForm({ ...uomForm, uom_name: e.target.value })}
                    placeholder="Custom UOM name"
                  />
                  <Button variant="outline" size="sm" onClick={() => setCustomUom(false)}>
                    List
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select
                    value={uomForm.uom_name}
                    onValueChange={(v) => setUomForm({ ...uomForm, uom_name: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select UOM" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_UOMS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u.charAt(0).toUpperCase() + u.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => setCustomUom(true)}>
                    Custom
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Conversion Factor</Label>
              <Input
                type="number"
                min={0.001}
                step="any"
                value={uomForm.conversion_factor}
                onChange={(e) =>
                  setUomForm({ ...uomForm, conversion_factor: parseFloat(e.target.value) || 0 })
                }
                placeholder="e.g., 12 (case = 12 each)"
              />
              <p className="text-xs text-muted-foreground">
                How many base units ({selectedUomProduct?.uom || "each"}) make up 1 of this UOM
              </p>
            </div>

            <div className="space-y-2">
              <Label>Barcode (optional)</Label>
              <Input
                value={uomForm.barcode || ""}
                onChange={(e) => setUomForm({ ...uomForm, barcode: e.target.value || null })}
                placeholder="UPC/EAN for this UOM"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={uomForm.is_default}
                  onCheckedChange={(v) => setUomForm({ ...uomForm, is_default: v })}
                />
                <Label className="text-sm">Default</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={uomForm.is_orderable}
                  onCheckedChange={(v) => setUomForm({ ...uomForm, is_orderable: v })}
                />
                <Label className="text-sm">Orderable</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={uomForm.is_sellable}
                  onCheckedChange={(v) => setUomForm({ ...uomForm, is_sellable: v })}
                />
                <Label className="text-sm">Sellable</Label>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Weight (optional)</Label>
                <Input
                  type="number"
                  step="any"
                  value={uomForm.weight ?? ""}
                  onChange={(e) =>
                    setUomForm({ ...uomForm, weight: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  placeholder="lbs"
                />
              </div>
              <div className="space-y-2">
                <Label>Dimensions (optional)</Label>
                <Input
                  value={uomForm.dimensions || ""}
                  onChange={(e) => setUomForm({ ...uomForm, dimensions: e.target.value || null })}
                  placeholder="L x W x H"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUomDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveUom}>{editingUomId ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Quick Setup Dialog ───────────────────────────────────────────── */}
      <Dialog open={quickSetupOpen} onOpenChange={setQuickSetupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Setup</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose a template and adjust the conversion factors:
            </p>
            <div className="grid gap-2">
              {QUICK_SETUPS.map((setup, idx) => (
                <Button
                  key={idx}
                  variant={quickSetupChoice === idx ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => selectQuickSetup(idx)}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {setup.label}
                </Button>
              ))}
            </div>

            {quickSetupChoice !== null && (
              <>
                <Separator />
                <p className="text-sm font-medium">Set conversion factors:</p>
                <div className="space-y-3">
                  {quickFactors.map((f, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Label className="w-16 capitalize text-sm">{f.name}</Label>
                      <Input
                        type="number"
                        min={0.001}
                        step="any"
                        className="w-28"
                        value={f.factor}
                        onChange={(e) => {
                          const updated = [...quickFactors]
                          updated[i] = { ...updated[i], factor: parseFloat(e.target.value) || 0 }
                          setQuickFactors(updated)
                        }}
                      />
                      <span className="text-xs text-muted-foreground">
                        base units ({selectedUomProduct?.uom || "each"})
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickSetupOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyQuickSetup} disabled={quickSetupChoice === null}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Part Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={partDialogOpen} onOpenChange={setPartDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPartId ? "Edit Part" : "Add Part"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Part Number</Label>
                <Input
                  type="number"
                  min={1}
                  value={partForm.part_number}
                  onChange={(e) =>
                    setPartForm({ ...partForm, part_number: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Total Parts</Label>
                <Input
                  type="number"
                  min={1}
                  value={partForm.total_parts}
                  onChange={(e) =>
                    setPartForm({ ...partForm, total_parts: parseInt(e.target.value) || 1 })
                  }
                />
                <p className="text-xs text-muted-foreground">Updates all parts for this product</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={partForm.part_description}
                onChange={(e) => setPartForm({ ...partForm, part_description: e.target.value })}
                placeholder='e.g., "Table Top", "Legs & Hardware"'
              />
            </div>

            <div className="space-y-2">
              <Label>Part SKU (optional)</Label>
              <Input
                value={partForm.part_sku || ""}
                onChange={(e) => setPartForm({ ...partForm, part_sku: e.target.value || null })}
                placeholder={selectedPartsProduct ? `${selectedPartsProduct.sku}-P${partForm.part_number}` : ""}
              />
            </div>

            <div className="space-y-2">
              <Label>Barcode (optional)</Label>
              <Input
                value={partForm.barcode || ""}
                onChange={(e) => setPartForm({ ...partForm, barcode: e.target.value || null })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Weight (optional)</Label>
                <Input
                  type="number"
                  step="any"
                  value={partForm.weight ?? ""}
                  onChange={(e) =>
                    setPartForm({ ...partForm, weight: e.target.value ? parseFloat(e.target.value) : null })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Dimensions (optional)</Label>
                <Input
                  value={partForm.dimensions || ""}
                  onChange={(e) => setPartForm({ ...partForm, dimensions: e.target.value || null })}
                  placeholder="L x W x H"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={partForm.notes || ""}
                onChange={(e) => setPartForm({ ...partForm, notes: e.target.value || null })}
                placeholder="Additional notes about this part..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePart}>{editingPartId ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
