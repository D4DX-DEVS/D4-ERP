"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  QueryConstraint,
  orderBy,
  getDocumentsPaginated,
} from "@/lib/firestore";

interface PaginationState<T> {
  data: (T & { id: string })[];
  loading: boolean;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface UsePaginationOptions {
  pageSize?: number;
  orderByField?: string;
  orderDirection?: "asc" | "desc";
  constraints?: QueryConstraint[];
}

export function usePagination<T>(
  collectionName: string,
  options: UsePaginationOptions = {}
) {
  const {
    pageSize = 10,
    orderByField = "createdAt",
    orderDirection = "desc",
    constraints = [],
  } = options;

  const constraintKey = JSON.stringify(constraints);
  const stableConstraints = useMemo(() => constraints, [constraintKey]);

  const [state, setState] = useState<PaginationState<T>>({
    data: [],
    loading: true,
    totalCount: 0,
    page: 0,
    pageSize,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });

  const fetchPage = useCallback(
    async (pageNum: number) => {
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const allConstraints: QueryConstraint[] = [
          ...stableConstraints,
          orderBy(orderByField, orderDirection),
        ];

        const result = await getDocumentsPaginated<T>(
          collectionName,
          allConstraints,
          pageSize,
          pageNum
        );

        const totalPages = result.totalPages;

        setState({
          data: result.data,
          loading: false,
          totalCount: result.total,
          page: pageNum,
          pageSize,
          totalPages,
          hasNext: pageNum < totalPages - 1,
          hasPrev: pageNum > 0,
        });
      } catch (error) {
        console.error("Pagination error:", error);
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [collectionName, stableConstraints, orderByField, orderDirection, pageSize]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadInitialPage() {
      setState((prev) => ({ ...prev, loading: true }));

      try {
        const allConstraints: QueryConstraint[] = [
          ...stableConstraints,
          orderBy(orderByField, orderDirection),
        ];

        const result = await getDocumentsPaginated<T>(
          collectionName,
          allConstraints,
          pageSize,
          0
        );

        if (!isMounted) return;

        const totalPages = result.totalPages;

        setState({
          data: result.data,
          loading: false,
          totalCount: result.total,
          page: 0,
          pageSize,
          totalPages,
          hasNext: totalPages > 1,
          hasPrev: false,
        });
      } catch (error) {
        console.error("Pagination error:", error);

        if (isMounted) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      }
    }

    void loadInitialPage();

    return () => {
      isMounted = false;
    };
  }, [collectionName, stableConstraints, orderByField, orderDirection, pageSize]);

  const goToPage = useCallback(
    (p: number) => {
      if (p >= 0 && p < state.totalPages) fetchPage(p);
    },
    [fetchPage, state.totalPages]
  );

  const nextPage = useCallback(() => {
    if (state.hasNext) fetchPage(state.page + 1);
  }, [fetchPage, state.hasNext, state.page]);

  const prevPage = useCallback(() => {
    if (state.hasPrev) fetchPage(state.page - 1);
  }, [fetchPage, state.hasPrev, state.page]);

  const refresh = useCallback(() => {
    fetchPage(0);
  }, [fetchPage]);

  return {
    ...state,
    fetchPage,
    goToPage,
    nextPage,
    prevPage,
    refresh,
  };
}
