"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/loading";
import { CheckCircle2, XCircle, MapPin, User, CalendarDays, Tag, Search, SlidersHorizontal } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { getDocuments, where } from "@/lib/firestore";
import { Asset, AssetCategoryItem } from "@/types";

interface AvailabilityResult {
  id: string;
  name: string;
  category: string;
  productCode?: string;
  available: boolean;
  movement: {
    eventName: string;
    eventLocation: string;
    allocatedPersonName: string;
    outDate: string;
    condition: string;
  } | null;
}

export default function AssetAvailabilityPage() {
  const [categories, setCategories] = useState<(AssetCategoryItem & { id: string })[]>([]);
  const [allAssets, setAllAssets] = useState<(Asset & { id: string })[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [results, setResults] = useState<AvailabilityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [checkedFromDate, setCheckedFromDate] = useState("");
  const [checkedToDate, setCheckedToDate] = useState("");

  useEffect(() => {
    async function loadLookups() {
      try {
        const [cats, assets] = await Promise.all([
          getDocuments<AssetCategoryItem>("asset-categories", [where("isActive", "==", true)]),
          getDocuments<Asset>("assets", [where("isActive", "!=", false)]),
        ]);
        setCategories(cats);
        setAllAssets(assets);
      } catch (e) {
        console.error(e);
      } finally {
        setLookupsLoading(false);
      }
    }
    void loadLookups();
  }, []);

  const filteredAssets = selectedCategory
    ? allAssets.filter((a) => a.category === selectedCategory)
    : allAssets;

  const handleCategoryChange = (catName: string) => {
    setSelectedCategory(catName);
    setSelectedAssetId("");
    setResults([]);
    setChecked(false);
  };

  const checkAvailability = async () => {
    setLoading(true);
    setChecked(false);
    try {
      const res = await fetch("/api/assets/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check-availability",
          assetId: selectedAssetId || undefined,
          categoryName: !selectedAssetId && selectedCategory ? selectedCategory : undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
        setCheckedFromDate(fromDate);
        setCheckedToDate(toDate);
      }
    } catch (error) {
      console.error("Error checking availability:", error);
    }
    setChecked(true);
    setLoading(false);
  };

  if (lookupsLoading) return <PageLoader />;

  const categoryOptions = [
    { value: "", label: "All Categories" },
    ...categories.map((c) => ({ value: c.name, label: c.name })),
  ];

  const assetOptions = [
    { value: "", label: selectedCategory ? `All in "${selectedCategory}"` : "All Assets" },
    ...filteredAssets.map((a) => ({
      value: a.id,
      label: a.name + (a.productCode ? ` (#${a.productCode})` : ""),
    })),
  ];

  const available = results.filter((r) => r.available);
  const unavailable = results.filter((r) => !r.available);
  const isDateBased = !!(checkedFromDate || checkedToDate);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Check Availability</h1>
        <p className="text-sm text-gray-500 mt-1">
          Filter by category or asset. Optionally add a date range to check future availability.
        </p>
      </div>

      {/* Filter card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                options={categoryOptions}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Asset</Label>
              <Select
                value={selectedAssetId}
                onChange={(e) => {
                  setSelectedAssetId(e.target.value);
                  setResults([]);
                  setChecked(false);
                }}
                options={assetOptions}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                From Date{" "}
                <span className="text-gray-400 text-xs font-normal">(optional)</span>
              </Label>
              <DatePicker value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>
                To Date{" "}
                <span className="text-gray-400 text-xs font-normal">(optional)</span>
              </Label>
              <DatePicker value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-400">
              {fromDate || toDate
                ? "Will check if assets are free during the selected date range"
                : "No dates selected — will show current real-time availability"}
            </p>
            <Button onClick={checkAvailability} disabled={loading}>
              <Search className="h-4 w-4 mr-2" />
              {loading ? "Checking..." : "Check Availability"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary chips */}
      {checked && !loading && results.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-full text-xs font-medium text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {available.length} Available
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 rounded-full text-xs font-medium text-orange-700">
            <XCircle className="w-3.5 h-3.5" />
            {unavailable.length} {isDateBased ? "Busy" : "Issued"}
          </div>
          {isDateBased && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-full text-xs font-medium text-blue-700">
              <CalendarDays className="w-3.5 h-3.5" />
              {checkedFromDate && checkedToDate
                ? `${checkedFromDate} → ${checkedToDate}`
                : checkedFromDate
                ? `From ${checkedFromDate}`
                : `Until ${checkedToDate}`}
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="animate-pulse py-6">
                <div className="h-4 w-48 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-32 bg-gray-100 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Initial state */}
      {!loading && !checked && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
            <SlidersHorizontal className="w-8 h-8 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-gray-700">Select filters and check availability</p>
          <p className="text-xs text-gray-400 mt-1">
            Choose a category or specific asset, optionally set a date range, then click Check
          </p>
        </div>
      )}

      {/* No results */}
      {!loading && checked && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-12 h-12 text-gray-300 mb-4" />
          <p className="text-sm font-medium text-gray-700">No assets found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting the filters</p>
        </div>
      )}

      {/* Results */}
      {!loading && checked && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r) => (
            <Card key={r.id} className={r.available ? "border-green-200" : "border-orange-200"}>
              <CardContent className="p-0">
                <div
                  className={`px-4 py-2 flex items-center gap-2 ${
                    r.available ? "bg-green-50" : "bg-orange-50"
                  }`}
                >
                  {r.available ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-orange-600" />
                  )}
                  <span
                    className={`text-xs font-semibold ${
                      r.available ? "text-green-700" : "text-orange-700"
                    }`}
                  >
                    {r.available
                      ? "AVAILABLE"
                      : isDateBased
                      ? "BUSY DURING REQUESTED PERIOD"
                      : "CURRENTLY ISSUED"}
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-semibold text-sm">{r.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Tag className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-500">{r.category}</span>
                        {r.productCode && (
                          <span className="text-xs text-gray-400 font-mono ml-2">
                            #{r.productCode}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={
                        r.available
                          ? "bg-green-100 text-green-800"
                          : "bg-orange-100 text-orange-800"
                      }
                    >
                      {r.available ? "In Store" : "OUT"}
                    </Badge>
                  </div>

                  {!r.available && r.movement && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-500 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3 h-3" />
                        <span>
                          Event:{" "}
                          <strong className="text-gray-700">{r.movement.eventName}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3" />
                        <span>Location: {r.movement.eventLocation || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3" />
                        <span>Person: {r.movement.allocatedPersonName || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3 h-3" />
                        <span>
                          Out:{" "}
                          {r.movement.outDate
                            ? formatDate(new Date(r.movement.outDate))
                            : "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
