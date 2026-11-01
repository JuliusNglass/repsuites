// Server functions for accounting connections (QuickBooks, Xero, FreeAgent).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  accountingConnectUrl,
  checkAccountingNow,
  disconnectAccounting,
  readAccounting,
} from "./accounting.server";

const PROVIDER = z.enum(["quickbooks", "xero", "freeagent"]);

export const getAccountingFn = createServerFn({ method: "POST" }).handler(async () =>
  readAccounting(),
);

export const accountingConnectFn = createServerFn({ method: "POST" })
  .validator((d: { provider: string }) => z.object({ provider: PROVIDER }).parse(d))
  .handler(async ({ data }) => accountingConnectUrl(data.provider));

export const accountingDisconnectFn = createServerFn({ method: "POST" })
  .validator((d: { provider: string }) => z.object({ provider: PROVIDER }).parse(d))
  .handler(async ({ data }) => disconnectAccounting(data.provider));

export const accountingCheckNowFn = createServerFn({ method: "POST" })
  .validator((d: { provider: string }) => z.object({ provider: PROVIDER }).parse(d))
  .handler(async ({ data }) => checkAccountingNow(data.provider));
