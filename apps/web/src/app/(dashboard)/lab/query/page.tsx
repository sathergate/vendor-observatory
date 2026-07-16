import { Breadcrumb } from "@/components/Breadcrumb";
import {
  getAllVendorNames,
  getCategories,
  getConstraintDemand,
} from "@/lib/db";
import { QueryBuilder } from "./QueryBuilder";

export const dynamic = "force-dynamic";

export default async function LabQueryPage() {
  const [vendors, categories, constraints] = await Promise.all([
    getAllVendorNames(),
    getCategories(),
    getConstraintDemand(),
  ]);

  const vendorIds = vendors.map((v) => v.vendor);
  const constraintNames = constraints.map((c) => c.constraint);

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Lab", href: "/lab" }, { label: "Query Builder" }]} />
        <h2 className="section-header">Query Builder</h2>
        <p className="text-secondary text-[13px] mt-1">
          Composable query engine for custom vendor analysis. Select a query type, configure parameters, and run.
        </p>
      </div>

      <QueryBuilder
        vendors={vendorIds}
        categories={categories}
        constraints={constraintNames}
      />
    </div>
  );
}
