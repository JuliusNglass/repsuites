// Old printed link on review cards ("Powered by RepSuites").
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/cards/order")({
  beforeLoad: () => {
    throw redirect({ to: "/cards" });
  },
});
