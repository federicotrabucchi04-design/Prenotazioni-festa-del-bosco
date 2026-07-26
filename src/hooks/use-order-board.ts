"use client";

import { useEffect, useState } from "react";
import {
  type OrderBoardState,
  subscribeOrderBoard,
} from "@/lib/order-board";

const EMPTY: OrderBoardState = {
  assignments: {},
  highlight: null,
  cartina: null,
  updatedAt: 0,
};

export function useOrderBoard() {
  const [board, setBoard] = useState<OrderBoardState>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeOrderBoard((next) => {
      setBoard(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { board, loading };
}
