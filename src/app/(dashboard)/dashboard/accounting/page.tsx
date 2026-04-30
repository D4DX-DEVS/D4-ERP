"use client";

import { useEffect, useState } from "react";
import { Transaction, Category, Company } from "@/types";
import { getDocuments, createDocument, deleteDocument, orderBy, where, Timestamp } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DollarSign, Plus, Trash2, Loader2, TrendingUp, TrendingDown, Search, Settings } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function AccountingPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<(Transaction & { id: string })[]>([]);
  const [categories, setCategories] = useState<(Category & { id: string })[]>([]);
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string } | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const [form, setForm] = useState({
    type: "income" as Transaction["type"],
    categoryId: "",
    companyId: "",
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    description: "",
    paymentMode: "bank" as Transaction["paymentMode"],
    referenceNo: "",
  });

  const [catForm, setCatForm] = useState({
    name: "",
    type: "income" as Category["type"],
    description: "",
    isActive: true,
  });

  const fetchData = async () => {
    try {
      const [txns, cats, comps] = await Promise.all([
        getDocuments<Transaction>("transactions", [orderBy("createdAt", "desc")]),
        getDocuments<Category>("categories", [where("isActive", "==", true)]),
        getDocuments<Company>("companies", [where("isActive", "==", true)]),
      ]);
      setTransactions(txns);
      setCategories(cats);
      setCompanies(comps);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cat = categories.find((c) => c.id === form.categoryId);
      await createDocument("transactions", {
        ...form,
        categoryName: cat?.name || "",
        amount: Number(form.amount),
        date: Timestamp.fromDate(new Date(form.date)),
        createdBy: user?.staffId || "",
      });
      setDialogOpen(false);
      toast("success", "Transaction added successfully");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to add transaction");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createDocument("categories", catForm);
      setCategoryDialogOpen(false);
      setCatForm({ name: "", type: "income", description: "", isActive: true });
      toast("success", "Category added successfully");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to add category");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({ id });
  };

  const executeDelete = async (id: string) => {
    setConfirmDialog(null);
    try {
      await deleteDocument("transactions", id);
      toast("success", "Transaction deleted");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete transaction");
    }
  };

  const filtered = transactions.filter((t) => {
    const matchType = !filterType || t.type === filterType;
    const matchCompany = !filterCompany || t.companyId === filterCompany;
    return matchType && matchCompany;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const getCompanyName = (id: string) => companies.find((c) => c.id === id)?.name || "—";

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
          <p className="text-sm text-gray-500 mt-1">Manage income & expenses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>
            <Settings className="h-4 w-4 mr-2" /> Categories
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Transaction
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Income</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(totalIncome)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
              <TrendingDown className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Expense</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totalExpense)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Net Balance</p>
              <p className={`text-xl font-bold ${totalIncome - totalExpense >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(totalIncome - totalExpense)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          options={[{ value: "", label: "All Types" }, { value: "income", label: "Income" }, { value: "expense", label: "Expense" }]}
          className="w-[180px]" />
        <Select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}
          options={[{ value: "", label: "All Companies" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
          className="w-[200px]" />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent>
          <EmptyState icon={<DollarSign className="h-12 w-12" />} title="No transactions found" />
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.date ? formatDate(new Date(t.date.seconds * 1000)) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={t.type === "income" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {t.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{t.categoryName || "—"}</TableCell>
                  <TableCell>{getCompanyName(t.companyId)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{t.description}</TableCell>
                  <TableCell className="capitalize">{t.paymentMode}</TableCell>
                  <TableCell className={`text-right font-semibold ${t.type === "income" ? "text-green-600" : "text-red-600"}`}>
                    {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} totalCount={filtered.length} hasNext={page < totalPages - 1} hasPrev={page > 0} onNext={() => setPage(page + 1)} onPrev={() => setPage(page - 1)} pageSize={PAGE_SIZE} />
        </CardContent></Card>
      )}

      {/* Add Transaction Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Transaction["type"], categoryId: "" })}
                options={[{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }]} />
            </div>
            <div className="space-y-2">
              <Label>Company *</Label>
              <Select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                options={companies.map((c) => ({ value: c.id, label: c.name }))} placeholder="Select" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                options={categories.filter((c) => c.type === form.type).map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Select" required />
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Payment Mode *</Label>
              <Select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value as Transaction["paymentMode"] })}
                options={[{ value: "cash", label: "Cash" }, { value: "bank", label: "Bank Transfer" }, { value: "upi", label: "UPI" }, { value: "cheque", label: "Cheque" }]} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reference No</Label>
            <Input value={form.referenceNo} onChange={(e) => setForm({ ...form, referenceNo: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Transaction
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onClose={() => setCategoryDialogOpen(false)}>
        <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <div className="space-y-2">
            <Label>Category Name *</Label>
            <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={catForm.type} onChange={(e) => setCatForm({ ...catForm, type: e.target.value as Category["type"] })}
              options={[{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }]} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Category
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDialog}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDialog && executeDelete(confirmDialog.id)}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
