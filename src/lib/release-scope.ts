/** Workflows excluded from the sellable release until their posting rules are complete. */
export const unavailableWorkflows: Record<
  string,
  { title: string; message: string }
> = {
  "/wave-picking": {
    title: "Wave picking",
    message:
      "Shared wave planning and fulfillment orchestration are not available yet. Use individual orders and assigned scanner tasks.",
  },
  "/cross-dock": {
    title: "Cross-docking",
    message:
      "Cross-dock orchestration is not available yet. Receive inventory, then fulfill the corresponding order through the shipping workflow.",
  },
  "/controlled-substances": {
    title: "Controlled-substance reconciliation",
    message:
      "Regulated reconciliation is not available. Do not rely on Stokora as a controlled-substance compliance system.",
  },
  "/custom-fields": {
    title: "Custom fields",
    message: "Custom entity fields are not available in this release.",
  },
  "/work-orders": {
    title: "Service work orders",
    message:
      "Service work-order posting is not available in this release. Warehouse sales orders remain available from Operations.",
  },
  "/consignment": {
    title: "Consignment",
    message:
      "Consignment ownership accounting is not available in this release. Confirm inventory ownership before receiving or shipping stock.",
  },
};
export function unavailableWorkflow(path: string) {
  return Object.entries(unavailableWorkflows).find(
    ([route]) => path === route || path.startsWith(route + "/"),
  )?.[1];
}
export function isReleasedRoute(path: string) {
  return !unavailableWorkflow(path);
}
