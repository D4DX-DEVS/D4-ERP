"use client";

import { useState, useCallback } from "react";
import {
  collection,
  query,
  getDocs,
  getCountFromServer,
  QueryConstraint,
  orderBy,
  limit,
  startAfter,
  DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

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
    pageSize = 25,
    orderByField = "createdAt",
    orderDirection = "desc",
    constraints = [],
  } = options;

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

  const [cursors, setCursors] = useState<(DocumentSnapshot | null)[]>([null]);

  const fetchPage = useCallback(
    async (pageNum: number) => {
      setState((prev) => ({ ...prev, loading: true }));
      try {
        // Build base constraints
        const baseConstraints: QueryConstraint[] = [
          ...constraints,
          orderBy(orderByField, orderDirection),
        ];

        // Get total count
        const countQuery = query(collection(db, collectionName), ...constraints);
        const countSnap = await getCountFromServer(countQuery);
        const totalCount = countSnap.data().count;
        const totalPages = Math.ceil(totalCount / pageSize);

        // Build paginated query
        const pageConstraints = [...baseConstraints, limit(pageSize)];
        if (pageNum > 0 && cursors[pageNum]) {
          pageConstraints.push(startAfter(cursors[pageNum]));
        }

        const q = query(collection(db, collectionName), ...pageConstraints);
        const snapshot = await getDocs(q);

        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as (T & { id: string })[];

        // Store cursor for next page
        if (snapshot.docs.length > 0) {
          const lastDoc = snapshot.docs[snapshot.docs.length - 1];
          setCursors((prev) => {
            const next = [...prev];
            next[pageNum + 1] = lastDoc;
            return next;
          });
        }

        setState({
          data,
          loading: false,
          totalCount,
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
    [collectionName, constraints, orderByField, orderDirection, pageSize, cursors]
  );

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
    setCursors([null]);
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
